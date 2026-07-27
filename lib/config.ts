/**
 * 이 도메인 계정만 쓸 수 있다.
 *
 * ⚠ 아래 확인은 «안내»이고 보안 장치가 아니다. 실제 차단은 두 군데서 일어난다.
 *   (1) OAuth 「내부(Internal)」 대상 — 구글이 다른 도메인 로그인을 막는다
 *   (2) 드라이브 파일 공유 권한 — 없으면 데이터를 아예 못 받는다
 * 배포물에 데이터가 없으므로 이 코드를 고쳐 통과해도 볼 것이 없다.
 * 자세한 내용은 OAUTH_SETUP.md 「접근 통제가 어디서 일어나는가」.
 */
export const ALLOWED_DOMAIN = "kiglestudio.com";

/** 기준 데이터를 찾을 위치. 파일 ID를 코드에 박지 않고 이름으로 찾는다. */
export const DATA_FOLDER = "개발 볼륨 산출 데이터";
export const DATA_FILE = "projects.json";

/**
 * 스코프 — 모두 읽기 전용이다.
 *  openid·email          로그인 계정의 도메인 확인
 *  presentations.readonly 기획서 슬라이드 읽기
 *  drive.readonly         projects.json 을 이름으로 찾아서 읽기
 */
export const GSCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");
