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
import { guessKind } from "./volume";

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

/* ── 내용 슬라이드 읽기 ──────────────────────────────────────
   표지는 단계 이름만 준다. 등급 판정 근거(맵 이동·게임 방식)는 내용 슬라이드의
   단계 상자(「미로 게임」 같은 짧은 독립 줄)와 그 아래 설명 글머리에 있다.
   상자를 단계에 짝지어 설명을 붙이고, 표지에 없는 상자는 단계로 추가한다.
   표지가 아예 없는 러프 문서는 이 상자들이 유일한 단계 출처다.        ── */

/** 대조용 정규화 — 공백·기호를 걷어낸다. */
const norm = (s: string) => s.normalize("NFKC").replace(/[^0-9a-z가-힣]/gi, "").toLowerCase();

/** 상자와 단계가 같은 것을 가리키는지. 포함 관계 또는 낱말 겹침으로 본다. */
function sameStage(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na.length < 2 || nb.length < 2) return false;
  if (na.includes(nb) || nb.includes(na)) return true; // «양치» ⊂ «양치하기»
  const split = (s: string) =>
    s.split(/[\s(){}[\]/·,+>＞]+/).map(norm).filter((t) => t.length >= 2);
  const ta = split(a);
  const tb = split(b);
  // 낱말도 포함 관계면 겹친 것으로 본다 (잡아먹기 ↔ 먹기)
  const shared = ta.filter((t) => tb.some((u) => t.includes(u) || u.includes(t)));
  if (shared.length >= 2) return true;
  // 낱말이 하나만 겹쳐도 양쪽 다 짧으면 같은 것으로 본다 (음식물 부수기 ↔ 음식 부수기)
  return shared.length === 1 && Math.min(ta.length, tb.length) <= 2 && shared[0].length >= 3;
}

/** 단계 상자가 될 수 없는 라벨·구획 이름. */
const LABEL_RE =
  /^(구성|레퍼런스|참고|Description|디자인|배경|배치|애니|이미지|네이밍|파티클|오브젝트|조작|장애물|아이템|튜토리얼|UI|가이드|끝|맵\s*\d*|예시)$|예시$/i;

/** 짧은 독립 줄이면 단계 상자 후보다. 글머리·머리번호·라벨·표 머리는 아니다. */
function isStageBox(L: string): boolean {
  if (OP_RE.test(L)) return true; // 오프닝 마커는 단계다 (표 머리 낱말보다 우선)
  return (
    L.length >= 2 &&
    L.length <= 16 &&
    !BULLET_RE.test(L) &&
    !/^\d{1,2}[.)]/.test(L) && // 「1. 개요」 「1) 뇌」
    !/^[\d\s.,~()%-]+$/.test(L) &&
    !/[::>＞→+*]/.test(L) && // 속성 줄(「아이템: …」)·체인·강조 표기
    !/시$/.test(L) && // 「모든 활동 완료 시」 같은 조건 줄
    !HEADER_WORDS.has(L) &&
    !LABEL_RE.test(L)
  );
}

interface StageBox {
  text: string;
  desc: string[];
  /** 상자가 몇 개 없는 슬라이드에서 왔는지. 표 조각이 아니라 진짜 단계일 확률이 높다. */
  sparse: boolean;
}

const isDescLine = (L: string) => BULLET_RE.test(L) || L.startsWith("*") || /[::]/.test(L);

/** 파트에 흡수된 슬라이드들에서 단계 상자와 그 아래 설명을 모은다. */
function collectBoxes(slides: string[][]): StageBox[] {
  const out: StageBox[] = [];
  for (const lines of slides) {
    // 오브젝트 명세 표(상세 기획서의 Description)는 단계가 아니라 연출 명세다
    if (lines.includes("오브젝트") && (lines.includes("조건") || lines.includes("No"))) continue;
    const boxN = lines.filter(isStageBox).length;
    const hasDesc = lines.some((L) => isDescLine(L) && L.replace(/^[*\-–—•]\s*/, "").trim());
    // 상자가 잔뜩이면 표(콘텐츠 리스트·아이콘 예시)다
    const sparse = boxN <= 3 && hasDesc;
    let cur: StageBox | null = null;
    for (const L of lines) {
      if (isStageBox(L)) {
        const dup = out.find((b) => sameStage(b.text, L));
        cur = dup ?? { text: L, desc: [], sparse };
        if (!dup) out.push(cur);
        else dup.sparse = dup.sparse || sparse;
        continue;
      }
      // 설명 줄 — 글머리(*, -)와 속성 줄만 근거로 담는다.
      // 다른 종류의 줄이 나오면 상자와의 연결을 끊는다 (표의 옆 칸이 붙는 것 방지).
      if (cur && isDescLine(L) && L.length <= 120) {
        const d = L.replace(/^[*\-–—•]\s*/, "").trim();
        if (d) cur.desc.push(d);
      } else if (cur) {
        cur = null;
      }
    }
  }
  return out;
}

/** 맵/화면이 이동하는 게임의 근거. 등급표의 「단일 게임 1.0」 판정 기준이다. */
const MAP_RE = /맵\s*\d+\s*종|화면\s*\d+\s*배|자동\s*이동|자동이동|맵\s*(이동|중앙)|트랙|길\s*따라/;
const FIXED_RE = /고정\s*화면|화면\s*고정/;
/** 설명이 게임을 말하는 근거 (단계명에 «게임»이 없을 때 kind 힌트). */
const GAME_DESC_RE = /(런|미니|미로|디펜스|퍼즐|레이싱|슈팅)\s*게임|물리\s*엔진/;

const addNote = (s: Step, msg: string) => {
  if (!s.note?.includes(msg)) s.note = (s.note ? s.note + " / " : "") + msg;
};

/** 설명에서 등급 판정 근거를 뽑아 단계에 심는다. 문서에 적힌 것만 옮긴다. */
function applyEvidence(s: Step, desc: string[]) {
  const text = desc.join("\n");
  const map = text.match(MAP_RE);
  const fixed = text.match(FIXED_RE);
  const game = text.match(GAME_DESC_RE);
  // 단계명으로 아무것도 못 읽을 때만 설명으로 kind 를 채운다.
  // 이름이 이미 컷씬/OP/연출 등을 말하면 설명의 «게임» 낱말에 끌려가지 않는다.
  const sceneName = /연출|팝업|튜토리얼|카운트|게이지|로딩|화면 전환/.test(s.text);
  if (!s.kind && !guessKind(s.text) && !sceneName && (game || map)) {
    s.kind = "game";
    if (game && !map) addNote(s, `근거: ${game[0]}`);
  }
  const k = s.kind ?? guessKind(s.text);
  if (k === "game" && s.moves_map == null) {
    if (map) {
      s.moves_map = true;
      addNote(s, `근거: ${map[0]} (맵/화면 이동)`);
    } else if (fixed) {
      s.moves_map = false;
      addNote(s, `근거: ${fixed[0]}`);
    }
  }
}

/**
 * 내용 슬라이드의 상자·설명을 단계에 붙인다.
 *  - 짝지어진 상자: 설명에서 kind·moves_map 근거를 심는다
 *  - 짝이 없는 상자: 단계로 추가한다 (표지 체인이 뭉갠 단계 — 간의 «해독 게임».
 *    F3a: 단계를 빠뜨리지 않는다). append=false 면 붙이기만 한다 (플로우·No-표 파트)
 * 파트 전체 텍스트로 추측하지는 않는다 — 게임이 여럿인 파트에서 엉뚱한 단계에
 * 근거가 붙는다. 상자에 붙은 설명만 그 단계의 근거다.
 */
function enrichSteps(
  steps: Step[],
  slides: string[][],
  append: boolean,
  appendNote = "",
): Step[] {
  const boxes = collectBoxes(slides);
  const out = steps.map((s) => ({ ...s }));
  for (const b of boxes) {
    // OP·시작 상자는 그 이름의 단계에만 붙는다 — «시작» 상자가 «게임 시작» 연출
    // 줄에 붙어 게임 근거를 옮기는 것을 막는다
    const hit = out.find((s) =>
      OP_RE.test(b.text) ? OP_RE.test(s.text) : sameStage(s.text, b.text),
    );
    if (hit) {
      applyEvidence(hit, b.desc);
      continue;
    }
    // 설명이 없으면 상자만 나란한 슬라이드(단 몇 개짜리)에서 온 것만 단계로 믿는다
    if (!append || (!b.desc.length && !b.sparse)) continue;
    const added = step(out.length + 1, b.text, appendNote);
    applyEvidence(added, b.desc);
    out.push(added);
  }
  return out;
}

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

/** 첫 표지(첫 파트) 앞 슬라이드 — 표지·목차·개요 등. 접힌 후보로 만든다. */
function frontCandidate(lines: string[], i: number): Candidate {
  const title = lines.find((L) => L.length <= 30 && !NUM_RE.test(L)) ?? `슬라이드 ${i + 1}`;
  return {
    idxs: [i + 1],
    title,
    lines,
    include: false,
    part_key: "",
    part_name: title,
    steps: [],
    skip: SKIP.beforeBody,
    doc_volume: null,
  };
}

/** 표지 기반 파싱. 표지 사이의 슬라이드는 앞 파트에 흡수한다. */
function parseByCovers(all: string[][], covers: (Cover | null)[]): Candidate[] {
  const out: Candidate[] = [];
  let cur:
    | (Candidate & { _cover: Cover; _flow: boolean; _op: string | null; _slides: string[][] })
    | null = null;

  const close = (c: typeof cur) => {
    if (!c) return;
    // 플로우를 못 찾은 체인 파트는 활동 체인 앞에 OP를 단계로 넣는다
    if (c._cover.kind === "chain" && !c._flow && c._op)
      c.steps = [step(1, c._op), ...c._cover.steps.map((s) => ({ ...s, no: s.no + 1 }))];
    c.steps = uniqSorted(c.steps);
    // 내용 슬라이드를 읽어 판정 근거를 붙인다. 플로우 파트는 이미 단계가 정확하니
    // 근거만 심고(안전망), 체인·구성 파트는 표지에 없는 상자를 단계로도 추가한다.
    c.steps = enrichSteps(
      c.steps,
      c._slides,
      c._cover.kind !== "notable" && !c._flow,
      "표지 활동에 없음 — 본문에서 발견",
    );
    c.steps.forEach((s, i) => (s.no = i + 1));
    c.include = c.steps.length > 0;
    const { _cover, _flow, _op, _slides, ...cand } = c;
    void _cover; void _flow; void _op; void _slides;
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
        _slides: [],
      };
      return;
    }
    if (!cur) {
      out.push(frontCandidate(lines, i));
      return;
    }
    // 표지 뒤 상세 슬라이드 — 파트에 흡수. 플로우 도식이면 단계를 그것으로 바꾼다.
    cur.idxs.push(i + 1);
    cur._slides.push(lines);
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

/* ── 소단원 그룹 파싱 (표지가 없는 문서) ─────────────────────
   러프 문서에 파트 표지가 없어도 내용 슬라이드마다 「1) 뇌」 같은 소단원 머리가
   있다. 같은 머리가 이어지는 구간을 파트로 보고, 단계는 그 구간의 단계 상자에서
   뽑는다. 글머리 설명이 하나도 없는 구간(개요 표 등)은 기본 제외로 둔다.    ── */

/** 슬라이드의 소단원 머리. 여러 개면 목차이고, 개요·목차 장은 본문이 아니다. */
function groupName(lines: string[]): string | null {
  if (lines.some((L) => /^\d{1,2}[.]\s*(개요|목차|차례|표지)/.test(L))) return null;
  const names = new Set<string>();
  for (const L of lines) {
    const m = L.match(/^\d{1,2}\)\s*([^>＞]+)$/);
    if (m && m[1].trim().length <= 20) names.add(m[1].trim());
  }
  return names.size === 1 ? [...names][0] : null;
}

function parseByGroups(all: string[][], covers: (Cover | null)[]): Candidate[] | null {
  const out: Candidate[] = [];
  let cur: (Candidate & { _slides: string[][]; _fromCover: boolean }) | null = null;

  const close = (c: typeof cur) => {
    if (!c) return;
    // 단계 = 표지 항목 + 구간의 상자들. OP/시작 상자는 맨 앞으로 보낸다.
    let steps = enrichSteps(c.steps, c._slides, true, "");
    steps = [...steps.filter((s) => OP_RE.test(s.text)), ...steps.filter((s) => !OP_RE.test(s.text))];
    steps.forEach((s, i) => (s.no = i + 1));
    c.steps = steps;
    // 글머리 설명이 전혀 없는 구간은 개요·기록 표일 가능성이 높다 — 빼고 시작한다
    const hasDesc =
      c._fromCover ||
      c._slides.some((ls) =>
        ls.some(
          (L) =>
            (BULLET_RE.test(L) || L.startsWith("*")) && L.replace(/^[*\-–—•]\s*/, "").trim(),
        ),
      );
    c.include = steps.length > 0 && hasDesc;
    const { _slides, _fromCover, ...cand } = c;
    void _slides; void _fromCover;
    out.push(cand);
  };

  const open = (i: number, lines: string[], name: string, cover: Cover | null) => {
    close(cur);
    cur = {
      idxs: [i + 1],
      title: name,
      lines: [...lines],
      include: true,
      part_key: "",
      part_name: name,
      steps: cover ? cover.steps.map((s) => ({ ...s })) : [],
      skip: null,
      doc_volume: cover?.doc_volume ?? null,
      _slides: cover ? [] : [lines],
      _fromCover: !!cover,
    };
  };

  all.forEach((lines, i) => {
    const cover = covers[i]; // 구성 표지도 파트 경계다 (러프의 홈/공통 화면)
    if (cover) {
      open(i, lines, cover.name, cover);
      return;
    }
    const name = groupName(lines);
    if (name && (!cur || !sameStage(cur.title, name))) {
      open(i, lines, name, null);
      return;
    }
    if (!cur) {
      out.push(frontCandidate(lines, i));
      return;
    }
    cur.idxs.push(i + 1);
    cur._slides.push(lines);
  });
  close(cur);

  // 그룹이 두 개는 되어야 이 짜임새의 문서다 (표지가 있으면 그 자체로 근거다).
  const bodies = out.filter((c) => !c.skip).length;
  return bodies >= 2 || (bodies >= 1 && covers.some(Boolean)) ? out : null;
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
  // 파트 표지(활동·No-표)가 있어야 표지 기반으로 읽는다. 구성 표지만으로는
  // 문서를 나눌 수 없다 — 조직 파트가 표지 없이 이어지는 문서일 수 있다.
  if (covers.some((c) => c && c.kind !== "compose"))
    return mergeSameTitle(parseByCovers(all, covers));
  const grouped = parseByGroups(all, covers);
  if (grouped) return mergeSameTitle(grouped);
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
