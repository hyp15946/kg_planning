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

/**
 * 배포용 OAuth 클라이언트 ID. 여기 박아 두어서 쓰는 사람이 입력하지 않아도 된다.
 *
 * ⚠⚠ 이 값을 리포에 두는 것이 안전한 조건은 딱 하나다 —
 *     **이 클라이언트에 localhost 리디렉션이 등록되어 있지 않을 것.**
 *
 * 클라이언트 ID 자체는 시크릿이 아니다. 로그인할 때 주소창에 그대로 보이므로
 * 숨길 수도 없다. 위험은 «공개된 ID» + «등록된 localhost» 조합에서만 생긴다.
 * 그 조합이면 남의 PC 로컬 페이지가 우리 ID로 로그인 흐름을 띄워
 * 드라이브 읽기 토큰을 받아낼 수 있다 (OAUTH_SETUP.md 7번).
 *
 * 그래서 클라이언트를 둘로 나눈다.
 *   - 배포용 (이 값)  : 배포 도메인만 등록. localhost 절대 추가하지 않는다
 *   - 로컬 개발용     : localhost 등록. ID 를 리포에 넣지 않고 「개발자 설정」에 입력한다
 *
 * ❌ 이 클라이언트에 localhost 를 추가하지 마세요. 편해지는 대신 위 경로가 열립니다.
 */
export const DEPLOY_CLIENT_ID =
  "1055894506499-4bjojdeb8b016o4sbo7vrcmk8t9294c9.apps.googleusercontent.com";

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
