"use client";

/**
 * 디자인 볼륨 — 파트 단위 가산 (4.4)
 * 아직 미완성이라 화면에서 숨겨 두었다 (lib/config.ts FEATURE_DESIGN).
 * 다시 켤 때 구획 번호(n)를 그때의 순서에 맞춰 매길 것.
 */
import type { DesignState, StepPart } from "@/lib/types";
import { designBreakdown, designDefault } from "@/lib/volume";
import { Callout, Check, NumInput, Panel, Section, Select, Tag } from "./ui";

export function DesignVolume({
  parts,
  design,
  setDesign,
}: {
  parts: StepPart[];
  design: Record<string, DesignState>;
  setDesign: (partKey: string, patch: Partial<DesignState>) => void;
}) {
  return (
    <Section n="4" title="디자인 볼륨 — 파트 단위 가산" hint="— 4.4 신규 볼륨 책정 규칙">
      <Callout tone="info">
        디자인 볼륨은 등급표 4.4가 <b>파트 단위 가산 규칙</b>으로 되어 있어 단계 단위로 세지 않습니다.
        개발 볼륨(단계 단위)과 계산 방식이 다릅니다.
      </Callout>

      <div className="space-y-3">
        {parts.map((part) => {
          const s = design[part.part_key] ?? designDefault();
          const b = designBreakdown(s);
          const set = (patch: Partial<DesignState>) => setDesign(part.part_key, patch);

          return (
            <Panel key={part.part_key}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {part.part_name || part.part_key}
                  <span className="ml-2 text-xs font-normal text-faint">{part.part_key}</span>
                </h3>
                <Tag tone="des">디자인 {b.total.toFixed(1)}</Tag>
              </div>

              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Check checked={s.ingame} onChange={(v) => set({ ingame: v })}>
                    <b>인게임</b> <span className="text-faint">(기본 0.3)</span>
                  </Check>
                  <div className="space-y-1.5 pl-5">
                    <Check checked={s.ingameShift} onChange={(v) => set({ ingameShift: v })}>
                      화면 전환 or 배경 2배 이상 <span className="text-faint">(+0.3)</span>
                    </Check>
                    <Check checked={s.ingameBigMap} onChange={(v) => set({ ingameBigMap: v })}>
                      큰 맵에 오브젝트 배치 <span className="text-faint">(+0.1)</span>
                    </Check>
                    <label className="flex items-center gap-2 text-sm">
                      <span>
                        게임 종류 <span className="text-faint">(2종당 +0.1)</span>
                      </span>
                      <NumInput value={s.gameKinds} onChange={(v) => set({ gameKinds: v })} />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span>
                      <b>인게임 팝업</b> 종수 <span className="text-faint">(1종당 0.1)</span>
                    </span>
                    <NumInput value={s.popups} onChange={(v) => set({ popups: v })} />
                  </label>
                  <Check checked={s.deco} onChange={(v) => set({ deco: v })}>
                    <b>인게임 데코</b> <span className="text-faint">(기본 0.3, 1종 포함)</span>
                  </Check>
                  <div className="space-y-1.5 pl-5">
                    <label className="flex items-center gap-2 text-sm">
                      <span>
                        추가 카테고리 <span className="text-faint">(1종당 +0.1)</span>
                      </span>
                      <NumInput value={s.decoCats} onChange={(v) => set({ decoCats: v })} />
                    </label>
                    <Check checked={s.decoCarry} onChange={(v) => set({ decoCarry: v })}>
                      초반 선택이 후반 인게임에 전부 반영 <span className="text-faint">(+0.1)</span>
                    </Check>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <b>인트로·엔딩</b>
                    <Select
                      value={s.intro}
                      onChange={(e) => set({ intro: e.target.value as DesignState["intro"] })}
                    >
                      <option value="none">없음</option>
                      <option value="full">있음 (0.2)</option>
                      <option value="spine">동일 배경, 스파인만 변경 (0.1)</option>
                    </Select>
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      <b>캐릭터</b> 총 종수{" "}
                      <span className="text-faint">(기본 2종 포함, 추가 2종당 +0.1)</span>
                    </span>
                    <NumInput value={s.chars} onChange={(v) => set({ chars: v })} />
                  </label>
                  <Check checked={s.reward} onChange={(v) => set({ reward: v })}>
                    <b>보상</b> — 테마+스티커바 1종 <span className="text-faint">(0.2)</span>
                  </Check>
                  <label className="flex flex-wrap items-center gap-2 pl-5 text-sm">
                    보상 배경
                    <Select
                      value={s.rewardBg}
                      onChange={(e) => set({ rewardBg: e.target.value as DesignState["rewardBg"] })}
                    >
                      <option value="none">기본</option>
                      <option value="x1_5">1.5배 내외 (+0.1)</option>
                      <option value="x2">2배 이상 (+0.2)</option>
                    </Select>
                  </label>
                  <Check checked={s.illust} onChange={(v) => set({ illust: v })}>
                    <b>일러스트형·실사형</b> — 책정 후 × 1.5
                  </Check>
                </div>
              </div>

              <div className="mt-3 border-t border-line-soft pt-2.5 text-xs leading-relaxed text-dim">
                {b.rows.length ? (
                  <>
                    {b.rows.map(([l, v], i) => (
                      <span key={l}>
                        {i > 0 && <span className="text-faint"> · </span>}
                        {l} <span className="font-semibold text-des">+{v.toFixed(1)}</span>
                      </span>
                    ))}
                    {b.multiplier && (
                      <span className="text-faint">
                        {" "}
                        → 소계 {b.subtotal.toFixed(1)} × 1.5
                      </span>
                    )}
                    <span>
                      {" "}
                      = <b className="text-des">{b.total.toFixed(1)}</b>
                    </span>
                  </>
                ) : (
                  "선택된 항목이 없습니다."
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </Section>
  );
}
