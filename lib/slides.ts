/**
 * 슬라이드 → 단계 후보. 코드 파싱이고 외부로 아무것도 보내지 않는다.
 * 플로우 도식은 번호로 나열되어 있다 (4.5·4.6). 그 번호를 그대로 옮긴다.
 */
import type { Candidate, Step, StepsDoc } from "./types";

/** `1.` `(2)` `③` `4-1` 형태의 머리번호를 잡는다. */
const NUM_RE = /^\s*(?:\(?(\d{1,2})\)?[.)\]]|([①-⑳])|(\d{1,2})\s*[-–]\s*\d{1,2})\s*(.+)$/;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/**
 * 구글 슬라이드는 텍스트 상자 안의 줄바꿈(Shift+Enter)을 U+000B(수직 탭)로 준다.
 * 원본 코드에는 이 문자가 눈에 보이지 않는 형태로 들어 있었다. 이스케이프로 적는다.
 */
const SOFT_BREAK = /\u000B/g;

/* Slides API 응답에서 필요한 부분만 느슨하게 기술한다. */
interface TextElement {
  textRun?: { content?: string };
}
interface PageElement {
  shape?: { text?: { textElements?: TextElement[] } };
  table?: { tableRows?: { tableCells?: { text?: { textElements?: TextElement[] } }[] }[] };
  elementGroup?: { children?: PageElement[] };
}
export interface Presentation {
  title?: string;
  slides?: { pageElements?: PageElement[] }[];
}

const runsToText = (els: TextElement[] | undefined) =>
  (els ?? []).map((r) => r.textRun?.content ?? "").join("");

/** 도형·표·그룹을 재귀로 훑어 텍스트를 모은다. */
function collectText(el: PageElement, out: string[]) {
  if (el.shape) out.push(runsToText(el.shape.text?.textElements));
  if (el.table)
    for (const r of el.table.tableRows ?? [])
      for (const c of r.tableCells ?? []) out.push(runsToText(c.text?.textElements));
  if (el.elementGroup) for (const c of el.elementGroup.children ?? []) collectText(c, out);
}

export function parseSlides(pres: Presentation): Candidate[] {
  return (pres.slides ?? []).map((sl, i) => {
    const chunks: string[] = [];
    for (const el of sl.pageElements ?? []) collectText(el, chunks);
    const lines = chunks
      .join("\n")
      .split(/\r?\n/)
      .map((s) => s.replace(SOFT_BREAK, " ").trim())
      .filter(Boolean);

    const found: { no: number; text: string }[] = [];
    for (const L of lines) {
      const m = L.match(NUM_RE);
      if (!m) continue;
      const no = m[1] ? +m[1] : m[2] ? CIRCLED.indexOf(m[2]) + 1 : +m[3];
      const text = (m[4] ?? "").trim();
      // 너무 긴 줄은 도식의 단계가 아니라 설명문일 가능성이 높다
      if (!no || !text || text.length > 80) continue;
      found.push({ no, text });
    }

    // 번호 중복은 뒤쪽을 버린다 (같은 도식이 두 번 적힌 경우)
    const seen = new Set<number>();
    const uniq: { no: number; text: string }[] = [];
    for (const s of found.sort((a, b) => a.no - b.no)) {
      if (seen.has(s.no)) continue;
      seen.add(s.no);
      uniq.push(s);
    }

    const title = lines.find((L) => L.length <= 30 && !NUM_RE.test(L)) ?? `슬라이드 ${i + 1}`;
    return {
      idx: i + 1,
      title,
      lines,
      include: uniq.length >= 2, // 번호가 2개 이상이면 도식일 가능성이 높다
      part_key: "",
      part_name: title,
      steps: uniq.map((s) => ({ ...s, kind: null, moves_map: null, note: "" }) as Step),
    };
  });
}

/** 검토 화면의 후보를 steps.json 구조로 바꾼다. 파트 키가 같으면 합친다. */
export function candidatesToSteps(
  cands: Candidate[],
  meta: { project: string; doc_type: StepsDoc["doc_type"]; doc_url: string; today: string },
): StepsDoc {
  const byKey = new Map<string, { part_key: string; part_name: string; steps: Step[] }>();
  for (const c of cands) {
    if (!c.include || !c.steps.length) continue;
    const key = (c.part_key || "").trim() || `slide${c.idx}`;
    if (!byKey.has(key))
      byKey.set(key, { part_key: key, part_name: c.part_name || key, steps: [] });
    for (const s of c.steps) byKey.get(key)!.steps.push({ ...s });
  }
  // 합친 뒤 번호를 다시 매긴다 (원본 번호는 note 에 남긴다)
  for (const p of byKey.values())
    p.steps.forEach((s, i) => {
      if (s.no !== i + 1) s.note = (s.note ? s.note + " / " : "") + `원본 번호 ${s.no}`;
      s.no = i + 1;
    });

  return {
    schema: "kigle-plan-db/steps@1",
    project: meta.project,
    doc_type: meta.doc_type,
    doc_url: meta.doc_url,
    extracted_at: meta.today,
    parts: [...byKey.values()],
  };
}
