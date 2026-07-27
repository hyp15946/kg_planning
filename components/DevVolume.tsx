"use client";

/** 3. 개발 볼륨 — 단계 단위 (4.5) */
import type { DevMark, GradeTables, Project, StepPart } from "@/lib/types";
import { devKey, devPartTotal, gradeById, recommendDev, similarParts } from "@/lib/volume";
import { Button, Callout, Check, Panel, ScrollX, Section, Select, Tag } from "./ui";

export function DevVolume({
  parts,
  marks,
  setMark,
  tables,
  projects,
  onlyUnconfirmed,
  setOnlyUnconfirmed,
  onConfirmAll,
  onUnconfirmAll,
  pending,
  steps,
}: {
  parts: StepPart[];
  marks: Record<string, DevMark>;
  setMark: (key: string, patch: Partial<DevMark>) => void;
  tables: GradeTables | null;
  projects: Project[] | null;
  onlyUnconfirmed: boolean;
  setOnlyUnconfirmed: (v: boolean) => void;
  onConfirmAll: () => void;
  onUnconfirmAll: () => void;
  pending: number;
  steps: number;
}) {
  return (
    <Section
      n="3"
      title="개발 볼륨 — 단계 단위"
      hint="— 4.5: 게임 단위로 뭉개면 −46%, 단계 단위면 +2%"
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Tag tone={pending ? "warn" : "ok"}>
          {pending ? `미확정 ${pending} / 전체 ${steps}` : `전부 확정 (${steps})`}
        </Tag>
        <Button small onClick={onConfirmAll}>
          추천값 전체 확정
        </Button>
        <Button small onClick={onUnconfirmAll}>
          전체 미확정으로
        </Button>
        <Check checked={onlyUnconfirmed} onChange={setOnlyUnconfirmed}>
          <span className="text-dim">미확정·판단 필요만 보기</span>
        </Check>
      </div>

      <div className="space-y-3">
        {parts.map((part) => (
          <PartTable
            key={part.part_key}
            part={part}
            marks={marks}
            setMark={setMark}
            tables={tables}
            projects={projects}
            onlyUnconfirmed={onlyUnconfirmed}
          />
        ))}
      </div>
    </Section>
  );
}

function PartTable({
  part,
  marks,
  setMark,
  tables,
  projects,
  onlyUnconfirmed,
}: {
  part: StepPart;
  marks: Record<string, DevMark>;
  setMark: (key: string, patch: Partial<DevMark>) => void;
  tables: GradeTables | null;
  projects: Project[] | null;
  onlyUnconfirmed: boolean;
}) {
  const t = devPartTotal(part, marks, tables);
  const gauge = similarParts(part, projects);

  const rows = part.steps
    .map((st) => {
      const key = devKey(part.part_key, st.no);
      const m = marks[key] ?? { gradeId: null, confirmed: false };
      const rec = recommendDev(st);
      const ambiguous = rec.ids.length > 1 && !m.confirmed;
      if (onlyUnconfirmed && m.confirmed && !ambiguous) return null;
      const g = gradeById(tables, m.gradeId);
      const cands = rec.ids.map((i) => gradeById(tables, i)).filter(Boolean);
      return (
        <tr
          key={st.no}
          className={ambiguous ? "bg-warn-soft" : !m.confirmed ? "bg-hover/40" : undefined}
        >
          <td className="w-10 text-right text-dim tnum">{st.no}</td>
          <td>
            <div className="font-medium">{st.text}</div>
            {st.note && <div className="mt-0.5 text-xs text-faint">메모: {st.note}</div>}
          </td>
          <td className="w-[230px]">
            <Select
              className="w-full"
              value={m.gradeId ?? ""}
              onChange={(e) => setMark(key, { gradeId: e.target.value || null })}
            >
              <option value="">— 선택 —</option>
              {rec.ids.length > 1 && (
                <optgroup label="추천 후보">
                  {cands.map((x) => (
                    <option key={x!.id} value={x!.id}>
                      {x!.label} — {x!.volume.toFixed(1)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="등급표 전체">
                {(tables?.dev ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label} — {x.volume.toFixed(1)}
                  </option>
                ))}
              </optgroup>
            </Select>
          </td>
          <td className="w-16 text-right tnum">
            {g ? (
              <span className="font-semibold text-dev">{g.volume.toFixed(1)}</span>
            ) : (
              <span className="text-faint">미정</span>
            )}
          </td>
          <td>
            <div className="text-xs leading-relaxed text-faint">
              {rec.why}
              {g?.basis && ` · 등급표: ${g.basis}`}
            </div>
            {rec.ids.length > 1 && (
              <div className="mt-1">
                <Tag tone="warn">후보 {rec.ids.length}개 — 사람이 고름 (기본값 없음)</Tag>
              </div>
            )}
          </td>
          <td className="w-16">
            <Check
              checked={m.confirmed}
              disabled={!m.gradeId}
              onChange={(v) => setMark(key, { confirmed: v })}
            >
              <span className="text-xs text-dim">확정</span>
            </Check>
          </td>
        </tr>
      );
    })
    .filter(Boolean);

  return (
    <Panel flush>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">
          {part.part_name || part.part_key}
          <span className="ml-2 text-xs font-normal text-faint">
            {part.part_key} · {part.steps.length}단계
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          {t.pending ? <Tag tone="warn">미확정 {t.pending}</Tag> : <Tag tone="ok">전부 확정</Tag>}
          <Tag tone="dev">개발 {t.total.toFixed(1)}</Tag>
        </div>
      </div>

      {gauge && (
        <p className="border-b border-line-soft px-4 py-2 text-xs text-faint">
          눈금 참고 — 과거 {gauge.n}건 개발 볼륨 {gauge.min.toFixed(1)}~{gauge.max.toFixed(1)} (중앙값{" "}
          {gauge.median.toFixed(1)}) · {gauge.samples.slice(0, 4).join(" / ")}
          {gauge.samples.length > 4 && " …"}
        </p>
      )}

      <ScrollX>
        <table className="nx-table">
          <thead>
            <tr>
              <th className="text-right">#</th>
              <th>단계</th>
              <th>등급</th>
              <th className="text-right">볼륨</th>
              <th>판정 근거</th>
              <th>검수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows
            ) : (
              <tr>
                <td colSpan={6} className="text-dim">
                  표시할 행이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollX>
    </Panel>
  );
}

export { Callout };
