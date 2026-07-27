/**
 * 슬라이드 → 단계 후보. 코드 파싱이고 외부로 아무것도 보내지 않는다.
 * 플로우 도식은 번호로 나열되어 있다 (4.5·4.6). 그 번호를 그대로 옮긴다.
 *
 * 러프 기획서는 앞쪽에 표지·개요·목차가 붙고 본문은 홈 화면 설명에서 시작한다.
 * 그 앞과 번호를 못 찾은 슬라이드는 접어 두고(`skip`), 제목이 같은 슬라이드는
 * 한 후보로 합쳐 검토 화면에 한 칸으로 낸다.
 */
import type { Candidate, Step, StepsDoc } from "./types";

/** `1.` `(2)` `③` `4-1` 형태의 머리번호를 잡는다. */
const NUM_RE = /^\s*(?:\(?(\d{1,2})\)?[.)\]]|([①-⑳])|(\d{1,2})\s*[-–]\s*\d{1,2})\s*(.+)$/;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 홈(메인) 화면을 설명하는 슬라이드. 여기서부터가 실질적인 본문이다. */
const HOME_RE = /(?:홈|메인|타이틀|home|main|title)\s*(?:화면|페이지|씬|screen|page|scene)/i;

/** 표지·개요·목차. 제목이 짧을 때만 본문이 아닌 것으로 본다 («재료 개요» 같은 오탐 방지). */
const FRONT_RE = /(?:목차|차례|개요|표지|서론|overview|agenda|contents?|index)/i;
const isFront = (title: string) => title.length <= 14 && FRONT_RE.test(title);

/** 접어 둔 이유. 검토 화면의 「접어 둔 슬라이드」에 그대로 표시된다. */
export const SKIP = {
  front: "표지·개요·목차",
  beforeHome: "홈 화면 앞",
  noNumber: "번호 없음",
} as const;

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

/** 슬라이드 한 장 → 후보 한 개. 아직 접어 두지도, 합치지도 않은 상태다. */
function readSlide(sl: { pageElements?: PageElement[] }, i: number): Candidate {
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
    idxs: [i + 1],
    title,
    lines,
    include: uniq.length >= 2, // 번호가 2개 이상이면 도식일 가능성이 높다
    part_key: "",
    part_name: title,
    steps: uniq.map((s) => ({ ...s, kind: null, moves_map: null, note: "" }) as Step),
    skip: null,
  };
}

/**
 * 제목이 같은 슬라이드를 한 후보로 합친다 — 도식이 여러 장에 걸쳐 있어도 한 칸으로 본다.
 * 접어 둔 슬라이드는 합치지 않는다 (되살릴 때 어느 장인지 알아야 한다).
 */
function mergeSameTitle(cands: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const head = new Map<string, Candidate>();
  for (const c of cands) {
    const key = c.title.replace(/\s+/g, " ").trim().toLowerCase();
    const g = c.skip ? undefined : head.get(key);
    if (!g) {
      if (!c.skip) head.set(key, c);
      out.push(c);
      continue;
    }
    // 원문 텍스트는 어느 장에서 왔는지 보이게 장 머리를 넣어 이어 붙인다
    if (g.idxs.length === 1) g.lines.unshift(`— 슬라이드 ${g.idxs[0]} —`);
    g.lines.push(`— 슬라이드 ${c.idxs[0]} —`, ...c.lines);
    g.idxs.push(...c.idxs);
    // 번호와 문구가 모두 같으면 같은 도식을 두 번 적은 것으로 보고 버린다.
    // 번호만 같으면 서로 다른 단계이므로 남긴다 (합칠 때 번호를 다시 매긴다).
    for (const s of c.steps)
      if (!g.steps.some((t) => t.no === s.no && t.text === s.text)) g.steps.push(s);
    g.include = g.steps.length >= 2;
  }
  return out;
}

export function parseSlides(pres: Presentation): Candidate[] {
  const all = (pres.slides ?? []).map(readSlide);

  // 홈 화면이 처음 나오는 슬라이드를 본문 시작으로 본다. 목차가 「홈 화면」을
  // 항목으로 적어 둔 경우를 피하려고 표지·개요·목차는 시작점에서 뺀다.
  // 못 찾으면 자르지 않는다 (홈 화면이라는 말을 안 쓰는 기획서도 있다).
  const home = all.findIndex((c) => !isFront(c.title) && c.lines.some((L) => HOME_RE.test(L)));

  all.forEach((c, i) => {
    if (home >= 0 && i < home) c.skip = SKIP.beforeHome;
    else if (isFront(c.title)) c.skip = SKIP.front;
    else if (!c.steps.length) c.skip = SKIP.noNumber;
    if (c.skip) c.include = false;
  });

  return mergeSameTitle(all);
}

/** 합쳐진 슬라이드 번호를 사람이 읽게 적는다. `[3,4,5,8]` → `3–5, 8` */
export function slideRange(idxs: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < idxs.length; ) {
    let j = i;
    while (j + 1 < idxs.length && idxs[j + 1] === idxs[j] + 1) j++;
    out.push(i === j ? `${idxs[i]}` : `${idxs[i]}–${idxs[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

/** 검토 화면의 후보를 steps.json 구조로 바꾼다. 파트 키가 같으면 합친다. */
export function candidatesToSteps(
  cands: Candidate[],
  meta: { project: string; doc_type: StepsDoc["doc_type"]; doc_url: string; today: string },
): StepsDoc {
  const byKey = new Map<string, { part_key: string; part_name: string; steps: Step[] }>();
  for (const c of cands) {
    if (!c.include || !c.steps.length) continue;
    const key = (c.part_key || "").trim() || `slide${c.idxs[0]}`;
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
