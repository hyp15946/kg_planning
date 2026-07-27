"use client";

/** 과거 기록 (보조 화면) — 눈금 참고용. */
import { useMemo, useState } from "react";
import type { Project, ProjectsDb } from "@/lib/types";
import { Button, Callout, Check, fmt1, Kpi, Panel, ScrollX, Section, Select, Tag } from "./ui";

const META_LABELS: Record<string, string> = {
  planner: "기획",
  plan_start: "기획 착수",
  designer: "디자인",
  design_start: "디자인 착수",
  developer: "개발",
  dev_start: "개발 착수",
  spine: "SPINE",
  review_target: "심사 목표",
  aos_review: "AOS 심사",
  aos_release: "AOS 배포",
  ios_review: "IOS 심사",
  ios_release: "IOS 배포",
};

interface Issue {
  warn: boolean;
  s: string;
}

function issues(p: Project): Issue[] {
  const out: Issue[] = [];
  for (const k of ["dev", "design"] as const) {
    const t = p.total_check?.[k];
    if (t && t.diff !== null && Math.abs(t.diff) > 0.001)
      out.push({ warn: true, s: `${k === "dev" ? "개발" : "디자인"} 합계행 ${t.diff > 0 ? "+" : ""}${t.diff}` });
  }
  if (p.volume_format === "old") out.push({ warn: false, s: "구 양식 · 미기록" });
  else {
    if (!p.has_dev_volume_column) out.push({ warn: false, s: "개발 볼륨 열 없음" });
    if (!p.has_design_volume_column) out.push({ warn: false, s: "디자인 볼륨 열 없음" });
  }
  if (p.name_collision) out.push({ warn: true, s: "동명 블록 2개 이상" });
  if (p.docs?.confidence === "low") out.push({ warn: true, s: "기획서 매칭 확인 필요" });
  return out;
}

type SortKey = "name" | "status" | "dev_volume" | "design_volume" | "part_n" | "sheet";

export function PastDb({ db, onBack }: { db: ProjectsDb; onBack: () => void }) {
  const [q, setQ] = useState("");
  const [fmt, setFmt] = useState("");
  const [sheet, setSheet] = useState("");
  const [status, setStatus] = useState("");
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const sheets = useMemo(
    () => [...new Set(db.projects.map((p) => p.source.sheet))].sort(),
    [db],
  );
  const statuses = useMemo(() => [...new Set(db.projects.map((p) => p.status))].sort(), [db]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = db.projects.filter((p) => {
      if (fmt && p.volume_format !== fmt) return false;
      if (sheet && p.source.sheet !== sheet) return false;
      if (status && p.status !== status) return false;
      if (onlyIssue && !issues(p).length) return false;
      if (!needle) return true;
      if (
        (p.name + " " + p.match_key + " " + (p.aliases ?? []).join(" "))
          .toLowerCase()
          .includes(needle)
      )
        return true;
      return p.parts.some((x) =>
        ((x.part_key ?? "") + " " + (x.part_name ?? "")).toLowerCase().includes(needle),
      );
    });
    const get = (p: Project): string | number | null => {
      if (sort === "part_n") return p.parts.length;
      if (sort === "sheet") return p.source.sheet;
      return p[sort] as string | number | null;
    };
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "ko") * dir;
    });
  }, [db, q, fmt, sheet, status, onlyIssue, sort, dir]);

  const open = openId ? db.projects.find((p) => p.id === openId) : null;
  if (open) return <Detail p={open} onBack={() => setOpenId(null)} />;

  const withVolume = list.filter((p) => p.dev_volume !== null || p.design_volume !== null).length;
  const th = (k: SortKey, label: string, right?: boolean) => (
    <th
      className={"cursor-pointer select-none hover:text-ink " + (right ? "text-right" : "")}
      onClick={() => {
        setDir(sort === k ? -dir : 1);
        setSort(k);
      }}
    >
      {label}
      {sort === k && <span className="ml-1 text-faint">{dir > 0 ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <div className="mx-auto max-w-content px-5 py-6">
      <Button className="mb-4" onClick={onBack}>
        ← 볼륨 산출로
      </Button>

      <Section title="과거 기록">
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="nx-input w-auto min-w-[220px] flex-1"
              placeholder="프로젝트 · 파트명 · 파트키 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select value={fmt} onChange={(e) => setFmt(e.target.value)}>
              <option value="">전체 양식</option>
              <option value="new">신 양식 (볼륨 기록 있음)</option>
              <option value="old">구 양식 · 미기록</option>
            </Select>
            <Select value={sheet} onChange={(e) => setSheet(e.target.value)}>
              <option value="">전체 탭</option>
              {sheets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">전체 상태</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Check checked={onlyIssue} onChange={setOnlyIssue}>
              <span className="text-dim">확인 필요한 항목만</span>
            </Check>
          </div>
          <p className="mt-2 text-xs text-faint">
            {list.length}개 프로젝트 (볼륨 기록 {withVolume}) · 파트{" "}
            {list.reduce((s, p) => s + p.parts.length, 0)}
          </p>
        </Panel>

        <Callout tone="warn">
          볼륨은 <b>파트별 볼륨을 직접 합산</b>한 값입니다. 원본 <b>「합 계」 행</b>은 프로젝트마다
          포함 범위가 달라 계산에 쓰지 않고 대조용으로만 표시합니다. <b>예상일</b>은 배수가
          프로젝트마다 달라 쓰지 않으며, <b>투입일</b>은 참고용입니다.
        </Callout>

        <Panel flush>
          <ScrollX>
            <table className="nx-table">
              <thead>
                <tr>
                  {th("name", "프로젝트")}
                  {th("status", "상태")}
                  {th("dev_volume", "개발 볼륨", true)}
                  {th("design_volume", "디자인 볼륨", true)}
                  {th("part_n", "파트", true)}
                  <th>기획서</th>
                  {th("sheet", "출처 탭")}
                  <th>확인</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const iss = issues(p);
                  const d = p.docs ?? {};
                  return (
                    <tr key={p.id}>
                      <td>
                        <button
                          type="button"
                          className="text-left font-semibold text-dev hover:underline"
                          onClick={() => setOpenId(p.id)}
                        >
                          {p.name.replace(/\n/g, " ")}
                        </button>
                        {!!p.aliases?.length && (
                          <div className="text-xs text-faint">{p.aliases.join(" · ")}</div>
                        )}
                      </td>
                      <td>
                        <Tag>{p.status}</Tag>
                      </td>
                      <td className="text-right tnum font-semibold text-dev">{fmt1(p.dev_volume)}</td>
                      <td className="text-right tnum font-semibold text-des">
                        {fmt1(p.design_volume)}
                      </td>
                      <td className="text-right tnum">{p.parts.filter((x) => !x.is_qa).length}</td>
                      <td className="text-xs">
                        {d.rough || d.detail ? (
                          <span className="flex gap-1.5">
                            {d.rough && (
                              <a href={d.rough} target="_blank" rel="noopener" className="text-dev hover:underline">
                                러프
                              </a>
                            )}
                            {d.detail && (
                              <a href={d.detail} target="_blank" rel="noopener" className="text-dev hover:underline">
                                상세
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                      <td className="text-xs text-dim">{p.source.sheet}</td>
                      <td>
                        {iss.length ? (
                          <span className="flex flex-wrap gap-1">
                            {iss.map((i) => (
                              <Tag key={i.s} tone={i.warn ? "warn" : "plain"}>
                                {i.s}
                              </Tag>
                            ))}
                          </span>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        </Panel>
      </Section>
    </div>
  );
}

function Detail({ p, onBack }: { p: Project; onBack: () => void }) {
  const work = p.parts.filter((x) => !x.is_qa);
  const d = p.docs ?? {};
  const metaRows = Object.keys(META_LABELS).filter((k) => p.meta?.[k]);

  const check = (sec: "dev" | "design") => {
    const t = p.total_check?.[sec];
    if (!t || t.sheet_total === null || t.sheet_total === undefined) return null;
    const off = t.diff !== null && Math.abs(t.diff) > 0.001;
    return (
      <Tag tone={off ? "warn" : "plain"}>
        원본 합계행 {t.sheet_total}
        {off ? ` (${t.diff! > 0 ? "+" : ""}${t.diff})` : " 일치"}
      </Tag>
    );
  };

  return (
    <div className="mx-auto max-w-content px-5 py-6">
      <Button className="mb-4" onClick={onBack}>
        ← 목록으로
      </Button>

      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-2xl font-semibold">{p.name.replace(/\n/g, " ")}</h1>
        <Tag>{p.status}</Tag>
        {issues(p)
          .filter((i) => i.warn)
          .map((i) => (
            <Tag key={i.s} tone="warn">
              {i.s}
            </Tag>
          ))}
      </div>
      <p className="mt-1 text-xs text-faint">
        {p.source.sheet} · {p.id}
        {!!p.aliases?.length && ` · 다른 표기: ${p.aliases.join(", ")}`}
      </p>

      <div className="my-4 flex flex-wrap gap-2.5">
        <Kpi label="개발 볼륨" hint="파트 합산" tone="dev" value={fmt1(p.dev_volume)} sub={check("dev")} />
        <Kpi
          label="디자인 볼륨"
          hint="파트 합산"
          tone="des"
          value={fmt1(p.design_volume)}
          sub={check("design")}
        />
        <Kpi label="파트 수" hint="QA 제외" value={work.length} />
        <div className="min-w-[260px] flex-[2] rounded-lg border border-line bg-surface px-3.5 py-3">
          <div className="mb-1 text-xs text-dim">담당 · 일정</div>
          {metaRows.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {metaRows.map((k) => (
                <div key={k} className="contents">
                  <dt className="text-dim">{META_LABELS[k]}</dt>
                  <dd>{p.meta![k]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="text-sm text-faint">미기록</span>
          )}
        </div>
      </div>

      <Panel>
        <b className="text-sm">기획서</b>
        {d.rough || d.detail ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {d.rough && (
                <a href={d.rough} target="_blank" rel="noopener">
                  <Button small>러프 열기{d.rough_round ? ` (${d.rough_round})` : ""}</Button>
                </a>
              )}
              {d.detail && (
                <a href={d.detail} target="_blank" rel="noopener">
                  <Button small>상세 열기</Button>
                </a>
              )}
              {d.confidence === "low" && <Tag tone="warn">폴더명·문서명이 달라 확인 필요</Tag>}
            </div>
            <p className="mt-1.5 text-xs text-faint">
              {d.folder}
              {d.detail_title && ` · ${d.detail_title}`}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-xs text-faint">{d.missing_reason || "링크 미입력"}</p>
        )}
      </Panel>

      <Section title="파트별 볼륨">
        <Panel flush>
          <ScrollX>
            <table className="nx-table">
              <thead>
                <tr>
                  <th>파트 키</th>
                  <th>파트명</th>
                  <th className="text-right">개발 볼륨</th>
                  <th className="text-right">디자인 볼륨</th>
                  <th className="text-right">
                    개발 투입일 <span className="font-normal text-faint">참고</span>
                  </th>
                  <th className="text-right">
                    디자인 투입일 <span className="font-normal text-faint">참고</span>
                  </th>
                  <th>진행</th>
                </tr>
              </thead>
              <tbody>
                {p.parts.map((x, i) => (
                  <tr key={`${x.part_key}-${i}`} className={x.is_qa ? "text-faint" : undefined}>
                    <td className="font-mono text-xs">{x.part_key}</td>
                    <td>{x.part_name ?? ""}</td>
                    <td className="text-right tnum font-semibold text-dev">{fmt1(x.dev_volume)}</td>
                    <td className="text-right tnum font-semibold text-des">{fmt1(x.design_volume)}</td>
                    <td className="text-right tnum text-dim">
                      {x.dev_actual_days ?? <span className="text-faint">–</span>}
                    </td>
                    <td className="text-right tnum text-dim">
                      {x.design_actual_days ?? <span className="text-faint">–</span>}
                    </td>
                    <td className="text-xs text-dim">{x.dev_status ?? x.design_status ?? ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    합계{" "}
                    <span className="text-xs font-normal text-faint">파트 직접 합산 · QA 제외</span>
                  </td>
                  <td className="text-right tnum text-dev">{fmt1(p.dev_volume)}</td>
                  <td className="text-right tnum text-des">{fmt1(p.design_volume)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </ScrollX>
        </Panel>
      </Section>
    </div>
  );
}
