/**
 * 구글 OAuth — 브라우저 전용, PKCE. 클라이언트 시크릿을 쓰지 않고
 * 외부 SDK 스크립트도 쓰지 않는다.
 *
 * ⚠ 클라이언트 ID 를 이 파일에 기본값으로 박지 않는다. 시크릿은 아니지만,
 *   공개 리포에 올라간 ID + 같은 클라이언트에 등록된 localhost 리디렉션이
 *   맞물리면 남의 PC 로컬 페이지가 우리 ID로 로그인 흐름을 띄워 드라이브
 *   읽기 토큰을 받아낼 수 있다. 각자 「설정」에 한 번 넣는다.
 *   — OAUTH_SETUP.md 7번 「클라이언트 ID 를 리포에 넣지 않는다」
 */
import { ALLOWED_DOMAIN, GSCOPE } from "./config";
import { KEYS, store } from "./store";

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

/**
 * ID 토큰의 payload 를 읽는다. 서명은 검증하지 않는다 —
 * 화면에 이메일을 띄우고 도메인이 다르면 안내하기 위한 용도일 뿐,
 * 이 값으로 권한을 주지 않는다.
 */
export function decodeJwt(t: string | undefined): Record<string, unknown> | null {
  try {
    const b = String(t ?? "").split(".")[1];
    if (!b) return null;
    const raw = atob(b.replace(/-/g, "+").replace(/_/g, "/"));
    const utf8 = decodeURIComponent(
      [...raw].map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    );
    return JSON.parse(utf8);
  } catch {
    return null;
  }
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const GAuth = {
  clientId(): string {
    return store.get(KEYS.clientId) || "";
  },
  setClientId(v: string) {
    store.set(KEYS.clientId, v.trim());
  },

  /** 정적 내보내기 + trailingSlash 라 항상 https://<도메인>/ 형태가 된다. */
  redirectUri(): string {
    if (typeof window === "undefined") return "";
    return location.origin + location.pathname;
  },

  /** file:// 로 열면 origin 이 "null" 이라 등록할 리디렉션 URI 자체가 없다. */
  servedOverHttp(): boolean {
    if (typeof window === "undefined") return false;
    return location.protocol === "http:" || location.protocol === "https:";
  },
  isLocalhost(): boolean {
    if (typeof window === "undefined") return false;
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
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

  async challenge(verifier: string) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64url(d);
  },

  /** 인증 페이지로 보낸다. 돌아오면 ?code= 가 붙는다. */
  async begin() {
    const cid = this.clientId();
    if (!cid) throw new Error("OAuth 클라이언트 ID 를 먼저 저장하세요. (설정)");
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    store.set(KEYS.verifier, verifier, true);
    const p = new URLSearchParams({
      client_id: cid,
      redirect_uri: this.redirectUri(),
      response_type: "code",
      scope: GSCOPE,
      code_challenge: await this.challenge(verifier),
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
      hd: ALLOWED_DOMAIN, // 계정 선택 화면에 이 도메인 계정만 보여준다
    });
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  },

  /** 돌아온 뒤 code 를 토큰으로 교환한다. 시크릿 없이 PKCE 로만. */
  async finish(code: string) {
    const verifier = store.get(KEYS.verifier, true);
    if (!verifier) throw new Error("인증 상태가 없습니다. 다시 연결해 주세요.");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId(),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri(),
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error_description || j.error || "토큰 교환 실패");
    store.del(KEYS.verifier, true);
    const c = decodeJwt(j.id_token) ?? {};
    const email = String(c.email ?? "");
    store.set(
      KEYS.token,
      JSON.stringify({
        access_token: j.access_token,
        exp: Date.now() + (j.expires_in - 60) * 1000,
        email,
        // hd 는 Workspace 계정에만 붙는다. 없으면 이메일에서 도메인을 떼어 쓴다.
        domain: String(c.hd ?? "") || email.split("@")[1] || "",
      } satisfies TokenBox),
      true,
    );
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
