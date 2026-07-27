/**
 * 내보내기 — 검산할 수 있게 단계별 등급과 근거를 함께 저장한다.
 * 소요일·개월은 넣지 않는다. 스케쥴 문서가 계산한다.
 */
import type { DesignState, DevMark, GradeTables, IncidentalState, StepsDoc } from "./types";
import {
  designBreakdown,
  designDefault,
  devKey,
  devPartTotal,
  gradeById,
  recommendDev,
  totals,
} from "./volume";

export interface ExportInput {
  steps: StepsDoc;
  marks: Record<string, DevMark>;
  design: Record<string, DesignState>;
  incidental: Record<string, IncidentalState>;
  tables: GradeTables | null;
  project: string;
  docType: StepsDoc["doc_type"];
  docUrl: string;
  /** 호출하는 쪽에서 넣는다 (순수하게 유지하려고 여기서 시계를 읽지 않는다). */
  today: string;
}

export function buildExport(i: ExportInput) {
  const parts = i.steps.parts ?? [];
  const t = totals(parts, i.marks, i.design, i.incidental, i.tables);
  return {
    schema: "kigle-plan-db/estimate@1",
    project: i.project,
    doc_type: i.docType,
    doc_url: i.docUrl,
    calculated_at: i.today,
    step_count: t.steps,
    unconfirmed: t.pending,
    dev_volume: t.devAll,
    design_volume: t.designAll,
    dev_from_steps: t.dev,
    dev_from_incidental: t.incDev,
    design_from_parts: t.design,
    design_from_incidental: t.incDes,
    parts: parts.map((p) => {
      const d = devPartTotal(p, i.marks, i.tables);
      const b = designBreakdown(i.design[p.part_key] ?? designDefault());
      return {
        part_key: p.part_key,
        part_name: p.part_name ?? null,
        step_count: p.steps.length,
        dev_volume: d.total,
        design_volume: b.total,
        design_breakdown: b.rows.map(([item, volume]) => ({ item, volume })),
        design_multiplier: b.multiplier,
        steps: p.steps.map((st) => {
          const m = i.marks[devKey(p.part_key, st.no)];
          const g = gradeById(i.tables, m?.gradeId);
          const rec = recommendDev(st);
          return {
            no: st.no,
            text: st.text,
            kind: st.kind ?? null,
            moves_map: st.moves_map ?? null,
            grade: g?.label ?? null,
            volume: g?.volume ?? null,
            basis: g?.basis ?? null,
            recommendation: rec.why,
            candidates: rec.ids.length,
            confirmed: !!m?.confirmed,
          };
        }),
      };
    }),
    incidental: Object.entries(i.incidental)
      .filter(([, v]) => v.on)
      .map(([key, v]) => ({
        key,
        dev: Number(v.dev) || 0,
        design: Number(v.design) || 0,
        note: "과거 데이터 역산 제안값. 표준 가산값 미확정 (REQUIREMENTS 9번)",
      })),
    notes: [
      "개발 볼륨은 단계 단위 합산 (4.5), 디자인 볼륨은 파트 단위 가산 규칙 (4.4).",
      "합산은 코드로 수행했다. 단계별 등급과 근거를 함께 저장해 검산 가능하다.",
      "소요일·개월은 계산하지 않는다. 스케쥴 문서가 처리한다.",
    ],
  };
}

/** 엑셀이 UTF-8 을 알아보게 BOM 을 붙인다. */
export function buildCsv(d: ReturnType<typeof buildExport>): string {
  const rows: (string | number)[][] = [
    ["파트키", "파트명", "단계번호", "단계", "등급", "볼륨", "등급표 근거", "추천 사유", "후보수", "확정"],
  ];
  for (const p of d.parts)
    for (const s of p.steps)
      rows.push([
        p.part_key,
        p.part_name ?? "",
        s.no,
        s.text,
        s.grade ?? "",
        s.volume ?? "",
        s.basis ?? "",
        s.recommendation,
        s.candidates,
        s.confirmed ? "O" : "",
      ]);
  rows.push([]);
  rows.push(["합계", "", "", "", "", d.dev_volume]);
  return (
    "﻿" +
    rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n")
  );
}

/** 브라우저에서 파일로 떨군다. */
export function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const today = () => new Date().toISOString().slice(0, 10);
