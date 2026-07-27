"use client";

/** 6. 산출 결과 — 스케쥴 문서 볼륨 칸에 그대로 옮길 수 있는 형태 */
import type {
  DesignState,
  DevMark,
  GradeTables,
  IncidentalState,
  Project,
  StepPart,
} from "@/lib/types";
import { designBreakdown, designDefault, devPartTotal, pkey, r1, totals } from "@/lib/volume";
import { Button, Callout, Kpi, Panel, ScrollX, Section, Tag } from "./ui";

/** 과거 기록과 비교한다. 5% 밖이면 주의, 20% 이상이면 추출이 흔들린 것으로 본다. */
function Compare({
  mine,
  theirs,
  label,
}: {
  mine: number;
  theirs: number | null | undefined;
  label: string;
}) {
  if (theirs === null || theirs === undefined) return null;
  const d = r1(mine - theirs);
  const pct = theirs ? Math.round(((mine - theirs) / theirs) * 1000) / 10 : null;
  const tone = pct !== null && Math.abs(pct) >= 20 ? "bad" : pct !== null && Math.abs(pct) >= 5 ? "warn" : "ok";
  return (
    <Tag tone={tone}>
      {label} 과거 기록 {theirs.toFixed(1)} 대비 {d > 0 ? "+" : ""}
      {d.toFixed(1)}
      {pct !== null && ` (${pct > 0 ? "+" : ""}${pct}%)`}
    </Tag>
  );
}

export function Result({
  parts,
  marks,
  design,
  incidental,
  tables,
  projects,
  project,
  onExportJson,
  onExportCsv,
}: {
  parts: StepPart[];
  marks: Record<string, DevMark>;
  design: Record<string, DesignState>;
  incidental: Record<string, IncidentalState>;
  tables: GradeTables | null;
  projects: Project[] | null;
  project: string;
  onExportJson: () => void;
  onExportCsv: () => void;
}) {
  const t = totals(parts, marks, design, incidental, tables);
  const past = projects?.find((p) => pkey(p.match_key) === pkey(project));
  const usedIncidental = Object.entries(incidental).filter(([, v]) => v.on);

  return (
    <Section n="6" title="산출 결과" hint="— 스케쥴 문서 볼륨 칸에 그대로 옮길 수 있는 형태">
      {t.undecided > 0 ? (
        <Callout tone="bad">
          <b>등급이 정해지지 않은 단계가 {t.undecided}개 있습니다.</b> 후보가 둘 이상이라 기본값을
          넣지 않았습니다 — <b>이 단계들은 아래 합계에 들어가 있지 않습니다.</b> 사람이 골라야 숫자가
          완성됩니다.
        </Callout>
      ) : t.pending > 0 ? (
        <Callout tone="bad">
          <b>검수하지 않은 단계가 {t.pending}개 있습니다.</b> 아래 숫자는 추천값을 포함한 잠정치입니다.
          전부 확정한 뒤 옮기세요.
        </Callout>
      ) : null}

      <div className="my-3 flex flex-wrap gap-2.5">
        <Kpi
          label="개발 볼륨"
          hint="단계 합산 + 부대"
          tone="dev"
          value={t.devAll.toFixed(1)}
          sub={`단계 ${t.dev.toFixed(1)} + 부대 ${t.incDev.toFixed(1)}`}
        />
        <Kpi
          label="디자인 볼륨"
          hint="파트 가산 + 부대"
          tone="des"
          value={t.designAll.toFixed(1)}
          sub={`파트 ${t.design.toFixed(1)} + 부대 ${t.incDes.toFixed(1)}`}
        />
        <Kpi label="단계 수" value={t.steps} sub={`파트 ${t.partN}개`} />
        <Kpi
          label="검수"
          tone={t.pending ? "warn" : "ok"}
          value={`${t.steps - t.pending} / ${t.steps}`}
          sub="확정된 단계"
        />
      </div>

      {past && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Compare mine={t.devAll} theirs={past.dev_volume} label="개발" />
          <Compare mine={t.designAll} theirs={past.design_volume} label="디자인" />
          <span className="text-xs text-faint">
            같은 이름의 과거 기록과 비교했습니다. 5% 밖이면 주의, 20% 이상이면 추출이 흔들린 것으로 봅니다.
          </span>
        </div>
      )}

      <Panel flush>
        <ScrollX>
          <table className="nx-table">
            <thead>
              <tr>
                <th>파트 키</th>
                <th>파트명</th>
                <th className="text-right">단계 수</th>
                <th className="text-right">개발 볼륨</th>
                <th className="text-right">디자인 볼륨</th>
                <th>검수</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const d = devPartTotal(p, marks, tables);
                const b = designBreakdown(design[p.part_key] ?? designDefault());
                return (
                  <tr key={p.part_key}>
                    <td className="font-mono text-xs">{p.part_key}</td>
                    <td>{p.part_name ?? ""}</td>
                    <td className="text-right tnum">{d.steps}</td>
                    <td className="text-right tnum">
                      <span className="font-semibold text-dev">{d.total.toFixed(1)}</span>
                      {d.undecided > 0 && <span className="text-faint"> +?</span>}
                    </td>
                    <td className="text-right tnum">
                      <span className="font-semibold text-des">{b.total.toFixed(1)}</span>
                    </td>
                    <td>
                      {d.undecided > 0 ? (
                        <Tag tone="bad">등급 미정 {d.undecided}</Tag>
                      ) : d.pending > 0 ? (
                        <Tag tone="warn">미확정 {d.pending}</Tag>
                      ) : (
                        <Tag tone="ok">확정</Tag>
                      )}
                    </td>
                  </tr>
                );
              })}
              {usedIncidental.map(([k, v]) => (
                <tr key={k}>
                  <td className="font-mono text-xs text-dim">{k}</td>
                  <td className="text-dim">부대 항목</td>
                  <td className="text-right text-dim">–</td>
                  <td className="text-right tnum">
                    <span className="font-semibold text-dev">{(Number(v.dev) || 0).toFixed(1)}</span>
                  </td>
                  <td className="text-right tnum">
                    <span className="font-semibold text-des">
                      {(Number(v.design) || 0).toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <Tag tone="warn">제안값 — 표준 미확정</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>
                  합계 <span className="text-xs font-normal text-faint">코드 합산</span>
                </td>
                <td className="text-right tnum">{t.steps}</td>
                <td className="text-right tnum text-dev">{t.devAll.toFixed(1)}</td>
                <td className="text-right tnum text-des">{t.designAll.toFixed(1)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </ScrollX>
      </Panel>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button primary onClick={onExportJson}>
          계산 내역 JSON 내보내기
        </Button>
        <Button onClick={onExportCsv}>단계별 내역 CSV</Button>
        <span className="text-xs text-faint">
          검산할 수 있게 단계별 등급과 근거를 함께 저장합니다.
        </span>
      </div>
    </Section>
  );
}
