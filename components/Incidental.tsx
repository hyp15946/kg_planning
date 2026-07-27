"use client";

/**
 * 5. 부대 항목 — 러프 문서에서 읽히지 않는 고정 가산 (4.6)
 * 디자인 열은 FEATURE_DESIGN 이 꺼진 동안 숨긴다 (lib/config.ts).
 */
import { FEATURE_DESIGN } from "@/lib/config";
import type { IncidentalItem, IncidentalState, IncidentalStat } from "@/lib/types";
import { Callout, Check, NumInput, Panel, ScrollX, Section } from "./ui";

const cite = (s: IncidentalStat | null | undefined) =>
  s ? (
    <>
      n={s.n} · 중앙값 <b className="text-ink">{s.median}</b> · 최빈 {s.mode}({s.mode_count}건) ·{" "}
      {s.min}~{s.max}
    </>
  ) : (
    "표본 없음"
  );

export function Incidental({
  items,
  state,
  setState,
}: {
  items: Record<string, IncidentalItem>;
  state: Record<string, IncidentalState>;
  setState: (key: string, patch: Partial<IncidentalState>) => void;
}) {
  const keys = Object.keys(items);

  return (
    <Section n="5" title="부대 항목" hint="— 러프 문서에서 읽히지 않는 고정 가산 항목 (4.6)">
      <Callout tone="warn">
        <b>표준 가산값은 아직 정해지지 않았습니다</b> (REQUIREMENTS 9번 열린 질문). 아래 값은 과거
        데이터에서 역산한 <b>제안</b>이며 확정값이 아닙니다. 표본 수를 보고 판단하세요.
      </Callout>

      <Panel flush>
        {keys.length === 0 ? (
          <p className="p-4 text-sm text-dim">과거 데이터를 불러오면 제안값이 표시됩니다.</p>
        ) : (
          <ScrollX>
            <table className="nx-table">
              <thead>
                <tr>
                  <th className="w-14">사용</th>
                  <th>항목</th>
                  <th className="w-24 text-right">개발</th>
                  {FEATURE_DESIGN && <th className="w-24 text-right">디자인</th>}
                  <th>과거 데이터 (확정값 아님)</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const v = items[k];
                  const st = state[k] ?? { on: false, dev: 0, design: 0 };
                  return (
                    <tr key={k}>
                      <td>
                        <Check checked={st.on} onChange={(on) => setState(k, { on })} />
                      </td>
                      <td>
                        <b>{v.label}</b>
                        <span className="ml-1.5 text-xs text-faint">{k}</span>
                        {v.fixed_value_forbidden && v.basis && (
                          <div className="mt-0.5 text-xs text-warn">{v.basis}</div>
                        )}
                      </td>
                      <td className="text-right">
                        <NumInput
                          step={0.1}
                          value={st.dev}
                          onChange={(dev) => setState(k, { dev })}
                        />
                      </td>
                      {FEATURE_DESIGN && (
                        <td className="text-right">
                          <NumInput
                            step={0.1}
                            value={st.design}
                            onChange={(design) => setState(k, { design })}
                          />
                        </td>
                      )}
                      <td className="text-xs leading-relaxed text-dim">
                        개발 {cite(v.dev)}
                        {FEATURE_DESIGN && (
                          <>
                            <br />
                            디자인 {cite(v.design)}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>
    </Section>
  );
}
