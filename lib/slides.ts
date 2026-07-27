/**
 * 슬라이드 → 단계 후보. 코드 파싱이고 외부로 아무것도 보내지 않는다.
 *
 * 기준이 된 실제 기획서(코코비 신체 러프·상세)의 짜임새에 맞춘다.
 *
 *  · 파트 표지 — 「구분/내용」 표에 「활동」 행(체인)과 「개발 볼륨」 행이 있는 슬라이드.
 *    러프·상세 모두 조직(뇌·입·위…)마다 이 표지가 한 장씩 있다.
 *  · 플로우 슬라이드 — 상세 기획서에서 표지 바로 뒤에 오는, 시작/활동/완료 구간에
 *    번호 셀(1, 2, 3…)로 단계를 나열한 도식. 이것이 가장 정확한 단계 목록이다.
 *  · No-표 표지 — 「No/구분/내용」(또는 「No/활동/내용」) 머리의 번호 표
 *    (상세의 공통·콘텐츠 선택 화면). 행이 곧 단계다.
 *  · 구성 표지 — 「구성」 아래 「1) 홈 화면」 같은 항목을 나열한 슬라이드 (러프의
 *    홈/콘텐츠 선택 화면·공통 화면). 항목이 곧 단계다.
 *
 * 단계 출처 우선순위: 플로우 > No-표 > 활동 체인(+OP) > 구성.
 * 첫 표지 앞의 슬라이드(표지·목차·개요·화면 설계…)는 전부 접고, 표지 사이의
 * 상세 슬라이드는 해당 파트에 흡수한다.
 *
 * 표지가 한 장도 없는 문서는 예전 방식(줄 머리번호 스캔)으로 읽는다.
 */
import type { Candidate, Step, StepsDoc } from "./types";

/* ── 폴백용: 줄 머리번호 ─────────────────────────────────── */

/** `1.` `(2)` `③` `4-1` 형태의 머리번호를 잡는다. */
const NUM_RE = /^\s*(?:\(?(\d{1,2})\)?[.)\]]|([①-⑳])|(\d{1,2})\s*[-–]\s*\d{1,2})\s*(.+)$/;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 홈(메인) 화면을 설명하는 슬라이드. 폴백에서 본문 시작으로 본다. */
const HOME_RE = /(?:홈|메인|타이틀|home|main|title)\s*(?:화면|페이지|씬|screen|page|scene)/i;

/** 표지·개요·목차. 제목이 짧을 때만 본문이 아닌 것으로 본다 («재료 개요» 같은 오탐 방지). */
const FRONT_RE = /(?:목차|차례|개요|표지|서론|overview|agenda|contents?|index)/i;
const isFront = (title: string) => title.length <= 14 && FRONT_RE.test(title);

/** 접어 둔 이유. 검토 화면의 「접어 둔 슬라이드」에 그대로 표시된다. */
export const SKIP = {
  front: "표지·개요·목차",
  beforeHome: "홈 화면 앞",
  noNumber: "번호 없음",
  beforeBody: "첫 파트 표지 앞",
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

/** 슬라이드 한 장의 텍스트를 줄 단위로 편다. 표 셀도 각각 한 줄이 된다. */
function slideLines(sl: { pageElements?: PageElement[] }): string[] {
  const chunks: string[] = [];
  for (const el of sl.pageElements ?? []) collectText(el, chunks);
  return chunks
    .join("\n")
    .split(/\r?\n/)
    .map((s) => s.replace(SOFT_BREAK, " ").trim())
    .filter(Boolean);
}

/* ── 파트 표지 인식 ──────────────────────────────────────── */

interface Cover {
  kind: "chain" | "notable" | "compose";
  name: string;
  steps: Step[];
  /** 표지의 「개발 볼륨」 문구 그대로. 산출과 눈으로 대조하는 용도. */
  doc_volume: string | null;
}

const step = (no: number, text: string, note = ""): Step => ({
  no,
  text,
  kind: null,
  moves_map: null,
  note,
});

/** 표 머리·라벨 등 파트명이 될 수 없는 낱말. */
const HEADER_WORDS = new Set([
  "구분", "내용", "활동", "개발 볼륨", "개발볼륨", "No", "no", "링크", "상세",
  "page", "구성", "시작", "완료", "튜토리얼", "OP", "ED", "Title", "Group Title",
]);

/** 체인·볼륨 값 등으로 이미 쓰인 줄을 빼고, 짧은 독립 줄을 파트명으로 고른다. */
function coverName(lines: string[], used: Set<string>): string | null {
  // 「1) 뇌」 같은 소단원 머리가 있으면 그것이 파트명이다 (상세 기획서).
  for (const L of lines) {
    const m = L.match(/^\d{1,2}\)\s*([^>>]+)$/);
    if (m && m[1].trim().length <= 20) return m[1].trim();
  }
  return (
    lines.find(
      (L) =>
        L.length <= 20 &&
        !HEADER_WORDS.has(L) &&
        !used.has(L) &&
        !/^[\d\s.,~()%-]+$/.test(L) && // 숫자·볼륨값
        !/^\d{1,2}[.)]/.test(L) && // 머리번호 줄
        !/[>＞→*]/.test(L) &&
        !L.startsWith("-"),
    ) ?? null
  );
}

/** 「활동」 행(체인)과 「개발 볼륨」 행이 있는 표지 = 파트 한 개. */
function findChainCover(lines: string[]): Cover | null {
  const actIdx = lines.findIndex((L) => L === "활동");
  const volIdx = lines.findIndex((L) => /^개발\s*볼륨$/.test(L));
  const chain = actIdx >= 0 ? lines[actIdx + 1] : undefined;
  if (actIdx < 0 || volIdx < 0 || !chain) return null;

  // 「A > B」가 기본이지만 「A + B」로 이은 표지도 있다 (신체 러프의 소장).
  // +는 낱말 사이가 띄어졌을 때만 구분자로 본다 («게임+인터랙션» 같은 표기 보호).
  const items = chain
    .split(/\s*(?:>|＞|->|→)\s*|\s+\+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length || items.some((t) => t.length > 80)) return null;

  const vol = lines[volIdx + 1];
  const used = new Set([chain, vol ?? ""]);
  const name = coverName(lines, used);
  if (!name) return null;
  return {
    kind: "chain",
    name,
    steps: items.map((t, i) => step(i + 1, t)),
    doc_volume: vol && vol.length <= 30 ? vol : null,
  };
}

/** 「No/구분/내용」(또는 「No/활동/내용」) 번호 표 = 행이 곧 단계다. */
function findNoTable(lines: string[]): Cover | null {
  const h = lines.findIndex(
    (L, i) => L === "No" && /^(구분|활동)$/.test(lines[i + 1] ?? "") && lines[i + 2] === "내용",
  );
  if (h < 0) return null;

  const steps: Step[] = [];
  for (let i = h + 3; i < lines.length; i++) {
    if (!/^\d{1,2}$/.test(lines[i])) continue;
    const text = lines[i + 1];
    if (!text || /^\d{1,2}$/.test(text) || text === "page" || text.length > 80) continue;
    steps.push(step(+lines[i], text));
  }
  if (!steps.length) return null;
  const name = coverName(lines.slice(0, h), new Set()) ?? coverName(lines, new Set());
  if (!name) return null;
  return { kind: "notable", name, steps, doc_volume: null };
}

/** 「구성」 아래 「1) 홈 화면」 항목들 = 화면 구성 파트 (러프 기획서). */
function findCompose(lines: string[]): Cover | null {
  const c = lines.indexOf("구성");
  if (c < 0 || lines.includes("오브젝트") || lines.includes("No")) return null;

  const steps: Step[] = [];
  for (let i = c + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{1,2})\)\s*(.+)$/);
    if (m && m[2].trim().length <= 80) steps.push(step(+m[1], m[2].trim()));
  }
  if (steps.length < 2) return null; // 항목이 하나면 구성 표가 아니라 디바이더다
  const name = coverName(lines.slice(0, c), new Set());
  if (!name) return null;
  return { kind: "compose", name, steps, doc_volume: null };
}

/** 우선순위: No-표 > 활동 체인 > 구성. (플로우는 표지 뒤 슬라이드에서 따로 찾는다.) */
const detectCover = (lines: string[]) =>
  findNoTable(lines) ?? findChainCover(lines) ?? findCompose(lines);

/* ── 플로우 슬라이드 (상세 기획서) ───────────────────────── */

/** 시작/활동/완료 구간 라벨. 번호 다음 줄이 이거면 단계명이 아니다. */
const PHASE_RE = /^(시작|활동|완료)$/;
const BULLET_RE = /^[-–—•]\s*/;

/**
 * 번호 셀(1, 2, 3…) 다음 줄을 단계로 읽는다.
 * 「화면 로딩 완료 시」 같은 조건 줄이면 그다음 「- 인트로 컷씬」이 실제 내용이므로
 * 그쪽을 단계명으로 쓰고 조건은 메모에 남긴다. 「*조작: 드래그」도 메모에 담는다.
 */
function findFlowSteps(lines: string[]): Step[] | null {
  // 플로우 도식에는 시작/활동/완료 라벨이 있고, 오브젝트 명세 표(No/오브젝트/조건)에는 없다
  if (!lines.includes("활동") || !lines.includes("완료")) return null;
  if (lines.includes("오브젝트") || lines.includes("No")) return null;

  const steps: Step[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\d{1,2}$/.test(lines[i])) continue;
    let text = lines[i + 1];
    if (!text || /^\d{1,2}$/.test(text) || PHASE_RE.test(text) || BULLET_RE.test(text)) continue;
    let note = "";
    const detail = lines[i + 2];
    if (/시$/.test(text) && detail && BULLET_RE.test(detail)) {
      note = text;
      text = detail.replace(BULLET_RE, "").trim();
    }
    if (!text || text.length > 80) continue;
    // 다음 번호 전까지 「*조작: …」이 있으면 메모에 붙인다
    for (let j = i + 1; j < lines.length && !/^\d{1,2}$/.test(lines[j]); j++) {
      const m = lines[j].match(/^\*?\s*(조작\s*[::].+)$/);
      if (m) note = (note ? note + " / " : "") + m[1].trim();
    }
    steps.push(step(+lines[i], text, note));
  }
  return steps.length >= 2 ? steps : null;
}

/** 러프 기획서의 오프닝 마커. 파트 상세 슬라이드에 독립 줄로 적혀 있다. */
const OP_RE = /^(OP|ED|시작)$/;

/* ── 본 파서 ─────────────────────────────────────────────── */

/** 번호 중복은 뒤쪽을 버리고 번호순으로 정렬한다 (같은 도식이 두 번 적힌 경우). */
function uniqSorted(steps: Step[]): Step[] {
  const seen = new Set<number>();
  const out: Step[] = [];
  for (const s of [...steps].sort((a, b) => a.no - b.no)) {
    if (seen.has(s.no)) continue;
    seen.add(s.no);
    out.push(s);
  }
  return out;
}

/** 표지 기반 파싱. 표지 사이의 슬라이드는 앞 파트에 흡수한다. */
function parseByCovers(all: string[][], covers: (Cover | null)[]): Candidate[] {
  const out: Candidate[] = [];
  let cur: (Candidate & { _cover: Cover; _flow: boolean; _op: string | null }) | null = null;

  const close = (c: typeof cur) => {
    if (!c) return;
    // 플로우를 못 찾은 체인 파트는 활동 체인 앞에 OP를 단계로 넣는다
    if (c._cover.kind === "chain" && !c._flow && c._op)
      c.steps = [step(1, c._op), ...c._cover.steps.map((s) => ({ ...s, no: s.no + 1 }))];
    c.steps = uniqSorted(c.steps);
    c.include = c.steps.length > 0;
    const { _cover, _flow, _op, ...cand } = c;
    void _cover; void _flow; void _op;
    out.push(cand);
  };

  all.forEach((lines, i) => {
    const cover = covers[i];
    if (cover) {
      close(cur);
      cur = {
        idxs: [i + 1],
        title: cover.name,
        lines: [...lines],
        include: true,
        part_key: "",
        part_name: cover.name,
        steps: cover.steps.map((s) => ({ ...s })),
        skip: null,
        doc_volume: cover.doc_volume,
        _cover: cover,
        _flow: false,
        _op: null,
      };
      return;
    }
    if (!cur) {
      // 첫 표지 앞 — 표지·목차·개요·화면 설계 등. 통째로 접는다.
      const title = lines.find((L) => L.length <= 30 && !NUM_RE.test(L)) ?? `슬라이드 ${i + 1}`;
      out.push({
        idxs: [i + 1],
        title,
        lines,
        include: false,
        part_key: "",
        part_name: title,
        steps: [],
        skip: SKIP.beforeBody,
        doc_volume: null,
      });
      return;
    }
    // 표지 뒤 상세 슬라이드 — 파트에 흡수. 플로우 도식이면 단계를 그것으로 바꾼다.
    cur.idxs.push(i + 1);
    if (cur._cover.kind === "chain" && !cur._flow) {
      const flow = findFlowSteps(lines);
      if (flow) {
        cur._flow = true;
        cur.steps = flow;
        cur.lines.push(`— 슬라이드 ${i + 1} (플로우) —`, ...lines);
        return;
      }
      if (!cur._op) cur._op = lines.find((L) => OP_RE.test(L)) ?? null;
    }
  });
  close(cur);
  return out;
}

/* ── 폴백: 줄 머리번호 스캔 (표지가 없는 문서) ───────────── */

function readSlide(lines: string[], i: number): Candidate {
  const found: Step[] = [];
  for (const L of lines) {
    const m = L.match(NUM_RE);
    if (!m) continue;
    const no = m[1] ? +m[1] : m[2] ? CIRCLED.indexOf(m[2]) + 1 : +m[3];
    const text = (m[4] ?? "").trim();
    // 너무 긴 줄은 도식의 단계가 아니라 설명문일 가능성이 높다
    if (!no || !text || text.length > 80) continue;
    found.push(step(no, text));
  }
  const uniq = uniqSorted(found);

  const title = lines.find((L) => L.length <= 30 && !NUM_RE.test(L)) ?? `슬라이드 ${i + 1}`;
  return {
    idxs: [i + 1],
    title,
    lines,
    include: uniq.length >= 2, // 번호가 2개 이상이면 도식일 가능성이 높다
    part_key: "",
    part_name: title,
    steps: uniq,
    skip: null,
    doc_volume: null,
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

function parseFallback(all: string[][]): Candidate[] {
  const cands = all.map(readSlide);

  // 홈 화면이 처음 나오는 슬라이드를 본문 시작으로 본다. 목차가 「홈 화면」을
  // 항목으로 적어 둔 경우를 피하려고 표지·개요·목차는 시작점에서 뺀다.
  // 못 찾으면 자르지 않는다 (홈 화면이라는 말을 안 쓰는 기획서도 있다).
  const home = cands.findIndex((c) => !isFront(c.title) && c.lines.some((L) => HOME_RE.test(L)));

  cands.forEach((c, i) => {
    if (home >= 0 && i < home) c.skip = SKIP.beforeHome;
    else if (isFront(c.title)) c.skip = SKIP.front;
    else if (!c.steps.length) c.skip = SKIP.noNumber;
    if (c.skip) c.include = false;
  });

  return mergeSameTitle(cands);
}

export function parseSlides(pres: Presentation): Candidate[] {
  const all = (pres.slides ?? []).map(slideLines);
  const covers = all.map(detectCover);
  if (covers.some(Boolean)) return mergeSameTitle(parseByCovers(all, covers));
  return parseFallback(all);
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
