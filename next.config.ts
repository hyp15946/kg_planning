import type { NextConfig } from "next";

/**
 * 정적 내보내기 — 서버 런타임을 만들지 않는다.
 *
 * 이것이 접근 통제의 전제다. 배포물에 데이터가 없고 서버도 없으므로
 * 지켜야 할 것이 배포물에 남지 않는다. 실제 차단은 OAuth 「내부」 대상과
 * 드라이브 공유 권한이 한다 — OAUTH_SETUP.md 「접근 통제가 어디서 일어나는가」.
 *
 * ⚠ output: "export" 를 지우면 서버가 생기고 그 전제가 무너진다.
 *   API 라우트·서버 액션·미들웨어를 추가하려는 순간 REQUIREMENTS 3번이
 *   보류한 문제(클라이언트 시크릿·환경변수 관리)가 그대로 돌아온다.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // 리디렉션 URI 를 https://<도메인>/ 로 고정한다
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
