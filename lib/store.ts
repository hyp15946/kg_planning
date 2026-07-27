/**
 * 저장소 안전 래퍼.
 *
 * file:// 이나 사생활 보호 모드에서는 localStorage 접근 자체가 예외를 던진다.
 * 그대로 두면 화면 전체가 죽으므로, 실패해도 조용히 넘기고 기능만 비활성화한다.
 * 정적 내보내기라 SSR 단계에서도 window 가 없으므로 함께 막는다.
 */
const area = (session: boolean): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return session ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export const store = {
  get(k: string, session = false): string | null {
    try {
      return area(session)?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string, session = false): boolean {
    try {
      area(session)?.setItem(k, v);
      return true;
    } catch {
      // 용량 초과 등. 조용히 실패한다 — 캐시는 없어도 동작해야 한다.
      return false;
    }
  },
  del(k: string, session = false): void {
    try {
      area(session)?.removeItem(k);
    } catch {
      /* 무시 */
    }
  },
};

export const KEYS = {
  clientId: "kigle-plan-db/gclient",
  token: "kigle-plan-db/gtoken",
  verifier: "kigle-plan-db/gverifier",
  dataFile: "kigle-plan-db/gdatafile",
  projects: "kigle-plan-db/projects@1",
} as const;
