import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "기획 볼륨 산출",
  description: "기획서의 단계 목록에서 파트별 개발·디자인 볼륨을 산출한다",
  robots: { index: false, follow: false }, // 사내 전용 — 검색에 노출하지 않는다
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans text-base antialiased">{children}</body>
    </html>
  );
}
