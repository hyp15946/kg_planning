import type { Config } from "tailwindcss";

/**
 * 노션 색값을 그대로 쓴다. 채도가 낮고 따뜻한 회색 계열이라
 * 표가 많은 화면에서 눈이 덜 피로하다.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 배경
        page: "var(--page)",
        surface: "var(--surface)",
        hover: "var(--hover)",
        // 글자
        ink: "var(--ink)", // 노션의 #37352f — 순검정이 아닌 따뜻한 먹색
        dim: "var(--dim)",
        faint: "var(--faint)",
        // 선
        line: "var(--line)",
        "line-soft": "var(--line-soft)",
        // 의미색 — 개발/디자인 두 축을 구분한다
        dev: "var(--dev)",
        des: "var(--des)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        bad: "var(--bad)",
      },
      backgroundColor: {
        "dev-soft": "var(--dev-soft)",
        "des-soft": "var(--des-soft)",
        "ok-soft": "var(--ok-soft)",
        "warn-soft": "var(--warn-soft)",
        "bad-soft": "var(--bad-soft)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Pretendard",
          "Apple SD Gothic Neo",
          "Malgun Gothic",
          "맑은 고딕",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        // 노션 본문은 16px/1.5, 보조는 14px
        base: ["15px", { lineHeight: "1.6" }],
        sm: ["13.5px", { lineHeight: "1.55" }],
        xs: ["12px", { lineHeight: "1.5" }],
      },
      maxWidth: { content: "1180px" },
      borderRadius: { notion: "4px" },
    },
  },
} satisfies Config;
