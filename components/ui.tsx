"use client";

/** 화면 조각들. 노션 감각 — 옅은 선, 넉넉한 여백, 그림자 없음. */
import type { ReactNode } from "react";

export const cx = (...v: (string | false | null | undefined)[]) => v.filter(Boolean).join(" ");

/* ── 구획 ──────────────────────────────────────────────── */

export function Section({
  n,
  title,
  hint,
  children,
}: {
  n?: string;
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="mt-9 first:mt-0">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {n && <span className="text-sm font-semibold text-faint tnum">{n}</span>}
        <h2 className="text-[17px]">{title}</h2>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-line bg-surface",
        flush ? "overflow-hidden" : "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 노션 콜아웃 — 왼쪽 아이콘 + 옅은 배경. 주의문에 쓴다. */
export function Callout({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  icon?: string;
  children: ReactNode;
}) {
  const bg = {
    info: "bg-dev-soft",
    warn: "bg-warn-soft",
    bad: "bg-bad-soft",
    ok: "bg-ok-soft",
  }[tone];
  const mark = icon ?? { info: "ℹ️", warn: "⚠️", bad: "🚫", ok: "✅" }[tone];
  return (
    <div className={cx("my-2.5 flex gap-2.5 rounded-notion px-3 py-2.5 text-sm", bg)}>
      <span className="shrink-0 leading-relaxed">{mark}</span>
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function Tag({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "dev" | "des" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  const cls = {
    plain: "bg-hover text-dim",
    dev: "bg-dev-soft text-dev",
    des: "bg-des-soft text-des",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-notion px-1.5 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {children}
    </span>
  );
}

/* ── 입력 ──────────────────────────────────────────────── */

export function Button({
  primary,
  small,
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "nx-btn",
        primary && "nx-btn-primary",
        small && "px-2 py-1 text-xs",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dim">
        {label}
        {hint && <span className="ml-1.5 font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 노션 체크박스 — 작은 사각형, 켜지면 파랑. */
export function Check({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label
      className={cx(
        "inline-flex select-none items-center gap-2",
        disabled ? "cursor-default opacity-40" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-[3px] border
                   border-faint transition-colors checked:border-dev checked:bg-dev
                   checked:bg-[length:11px] checked:bg-center checked:bg-no-repeat
                   disabled:cursor-default
                   checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22white%22><path d=%22M6.2 11.7 3 8.5l1.1-1.1 2.1 2.1 5-5L12.3 5.6z%22/></svg>')]"
      />
      {children != null && <span className="text-sm leading-snug">{children}</span>}
    </label>
  );
}

export function NumInput({
  value,
  onChange,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className={cx(
        "w-16 rounded-notion border border-line bg-transparent px-1.5 py-0.5 text-right text-sm tnum outline-none focus:border-dev",
        className,
      )}
    />
  );
}

export function Select({
  className,
  ...p
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cx(
        "rounded-notion border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-dev",
        className,
      )}
    />
  );
}

/* ── 표시 ──────────────────────────────────────────────── */

export function Kpi({
  label,
  hint,
  value,
  sub,
  tone,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "dev" | "des" | "ok" | "warn";
}) {
  const color = tone ? { dev: "text-dev", des: "text-des", ok: "text-ok", warn: "text-warn" }[tone] : "";
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="text-xs text-dim">
        {label}
        {hint && <span className="ml-1 text-faint">{hint}</span>}
      </div>
      <div className={cx("mt-0.5 text-[26px] font-semibold leading-tight tnum", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

/** 값이 없을 때. 0 과 «미기록»을 구별해서 보여준다. */
export const NoneMark = ({ children = "미기록" }: { children?: ReactNode }) => (
  <span className="text-faint">{children}</span>
);

export const fmt1 = (v: number | null | undefined) =>
  v === null || v === undefined ? <NoneMark /> : v.toFixed(1);

export function ScrollX({ children }: { children: ReactNode }) {
  return <div className="w-full overflow-x-auto">{children}</div>;
}
