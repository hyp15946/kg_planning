/**
 * 구글 로그인 — GIS(Google Identity Services) 토큰 모델.
 *
 * ⚠ 왜 PKCE 인증 코드 흐름이 아닌가
 *   구글의 «웹 애플리케이션» 클라이언트는 confidential client 로 취급되어,
 *   PKCE 를 쓰더라도 토큰 교환에서 client_secret 을 요구한다
 *   (`client_secret is missing`). 시크릿을 브라우저에 둘 수는 없고, 서버를 두면
 *   「배포물에 지킬 데이터가 없다」는 접근 통제 전제가 무너진다.
 *   그래서 구글이 브라우저 전용 앱에 제공하는 토큰 모델을 쓴다 —
 *   시크릿도, 리디렉션 URI 도 필요 없고 「승인된 JavaScript 원본」만 본다.
 *
 * ⚠ 클라이언트 ID 를 이 파일에 기본값으로 박지 않는다 → lib/config.ts 참고.
 */
import { ALLOWED_DOMAIN, DEPLOY_CLIENT_ID, GSCOPE } from "./config";
import { KEYS, store } from "./store";

const GIS_SRC = "https://accounts.google.com/gsi/client";

export interface TokenBox {
  access_token: string;
  exp: number;
  email: string;
  domain: string;
}

export interface GUser {
  email: string;
  domain: string;
}

/** GIS 가 콜백으로 주는 것 중 우리가 쓰는 부분. */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  hd?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: () => void;
}
interface GisNamespace {
  accounts?: {
    oauth2?: {
      initTokenClient: (c: Record<string, unknown>) => TokenClient;
      revoke?: (token: string, done?: () => void) => void;
    };
  };
}
const gis = (): GisNamespace["accounts"] | undefined =>
  (window as unknown as { google?: GisNamespace }).google?.accounts;

let scriptPromise: Promise<void> | null = null;
let client: TokenClient | null = null;
let clientKey = "";

export const GAuth = {
  /**
   * 배포용 ID 를 기본으로 쓰고, 브라우저에 저장된 값이 있으면 그것이 이긴다.
   * 로컬 개발자가 자기 개발용 클라이언트로 갈아타는 경로다 (「개발자 설정」).
   */
  clientId(): string {
    return store.get(KEYS.clientId) || DEPLOY_CLIENT_ID;
  },
  /** 빈 값을 주면 저장된 값을 지우고 배포용 기본값으로 되돌린다. */
  setClientId(v: string) {
    const t = v.trim();
    if (t) store.set(KEYS.clientId, t);
    else store.del(KEYS.clientId);
    client = null; // 다음 로그인에서 새 ID 로 다시 만든다
  },
  /** 이 브라우저가 기본값 대신 직접 넣은 ID를 쓰고 있는지. */
  clientIdOverridden(): boolean {
    return !!store.get(KEYS.clientId);
  },

  /** GIS 는 실제 origin 이 있어야 동작한다. file:// 로는 불가능하다. */
  servedOverHttp(): boolean {
    if (typeof window === "undefined") return false;
    return location.protocol === "http:" || location.protocol === "https:";
  },

  /** 구글 콘솔의 「승인된 JavaScript 원본」에 등록할 값. */
  origin(): string {
    return typeof window === "undefined" ? "" : location.origin;
  },

  token(): TokenBox | null {
    try {
      const t = JSON.parse(store.get(KEYS.token, true) || "null") as TokenBox | null;
      return t && t.exp > Date.now() ? t : null;
    } catch {
      return null;
    }
  },
  clear() {
    store.del(KEYS.token, true);
  },

  user(): GUser | null {
    const t = this.token();
    return t ? { email: t.email || "", domain: t.domain || "" } : null;
  },
  allowed(): boolean {
    const u = this.user();
    return !!u && u.domain.toLowerCase() === ALLOWED_DOMAIN;
  },

  /**
   * GIS 스크립트를 한 번만 붙인다.
   * 팝업 차단을 피하려면 «클릭 전에» 끝나 있어야 하므로 화면 진입 시 부른다.
   */
  loadGis(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (gis()?.oauth2) return Promise.resolve();
    scriptPromise ??= new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = GIS_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인하세요."));
      };
      document.head.appendChild(el);
    });
    return scriptPromise;
  },

  /**
   * 로그인. **클릭 핸들러에서 곧바로** 불러야 한다 —
   * 팝업은 사용자 제스처 안에서만 열린다.
   */
  signIn(done: (err?: string) => void) {
    const oauth2 = gis()?.oauth2;
    if (!oauth2) return done("구글 로그인 스크립트가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.");
    const cid = this.clientId();
    if (!cid) return done("OAuth 클라이언트 ID 가 없습니다. (개발자 설정)");

    if (!client || clientKey !== cid) {
      clientKey = cid;
      client = oauth2.initTokenClient({
        client_id: cid,
        scope: GSCOPE,
        hd: ALLOWED_DOMAIN, // 계정 선택 화면을 이 도메인으로 제한한다
        prompt: "select_account",
        callback: (res: TokenResponse) => {
          void this.accept(res).then(
            () => done(),
            (e: unknown) => done(e instanceof Error ? e.message : String(e)),
          );
        },
        error_callback: (err: { type?: string; message?: string }) => {
          done(
            err?.type === "popup_closed"
              ? "로그인 창이 닫혔습니다."
              : err?.type === "popup_failed_to_open"
                ? "로그인 창이 열리지 않았습니다. 팝업 차단을 해제하세요."
                : err?.message || "로그인에 실패했습니다.",
          );
        },
      });
    }
    client.requestAccessToken();
  },

  /** 받은 토큰으로 계정을 확인하고 세션에 저장한다. */
  async accept(res: TokenResponse) {
    if (res.error) throw new Error(res.error_description || res.error);
    if (!res.access_token) throw new Error("액세스 토큰을 받지 못했습니다.");

    const exp = Date.now() + ((res.expires_in ?? 3600) - 60) * 1000;
    // 아직 저장하지 않은 토큰으로 계정을 조회한다
    const who = await this.userinfo(res.access_token);
    store.set(
      KEYS.token,
      JSON.stringify({
        access_token: res.access_token,
        exp,
        email: who.email,
        // hd 는 Workspace 계정에만 붙는다. 없으면 이메일에서 도메인을 떼어 쓴다.
        domain: who.hd || res.hd || who.email.split("@")[1] || "",
      } satisfies TokenBox),
      true,
    );
  },

  async userinfo(accessToken: string): Promise<{ email: string; hd?: string }> {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!r.ok) throw new Error("계정 정보를 읽지 못했습니다 (HTTP " + r.status + ").");
    const j = await r.json();
    return { email: String(j.email ?? ""), hd: j.hd ? String(j.hd) : undefined };
  },

  /** 구글 쪽 승인도 함께 취소한다. 실패해도 로컬 토큰은 지운다. */
  signOut() {
    const t = this.token();
    try {
      if (t) gis()?.oauth2?.revoke?.(t.access_token);
    } catch {
      /* 무시 */
    }
    this.clear();
  },

  /** 구글 API 공통 호출. 흔한 실패를 사람이 읽을 수 있는 말로 바꾼다. */
  async api(url: string): Promise<Response> {
    const t = this.token();
    if (!t) throw new Error("구글 계정 연결이 필요합니다.");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + t.access_token } });
    if (res.ok) return res;
    let msg = "";
    try {
      msg = (await res.json())?.error?.message ?? "";
    } catch {
      /* 본문이 JSON 이 아닐 수 있다 */
    }
    if (res.status === 401) {
      this.clear();
      throw new Error("인증이 만료되었습니다. 다시 로그인해 주세요.");
    }
    if (res.status === 403 && /has not been used|is disabled/i.test(msg))
      throw new Error(msg + " — 구글 콘솔에서 해당 API를 사용 설정하세요 (Slides API · Drive API).");
    if (res.status === 403 && /insufficient|scope/i.test(msg))
      throw new Error("권한 범위가 부족합니다. 「연결 해제」 후 다시 로그인해 스코프를 새로 승인하세요.");
    throw new Error(msg || `요청 실패 (HTTP ${res.status})`);
  },

  async slides(presentationId: string) {
    const res = await this.api(
      `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`,
    );
    return res.json();
  },
};

export const presentationId = (url: string | null | undefined): string | null =>
  String(url ?? "").match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;

export const driveId = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").trim();
  return (
    s.match(/\/(?:file|d)\/d?\/?([a-zA-Z0-9_-]{20,})/)?.[1] ??
    s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)?.[1] ??
    (/^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null)
  );
};
