/**
 * 볼륨 산출 — 순수 함수만 둔다. DOM·저장소·네트워크에 손대지 않는다.
 *
 * 원칙 (요구사항에서 그대로 옮김):
 *  - 개발 볼륨 = 단계 단위 합산 (4.5). 게임 단위로 뭉개면 크게 과소 산정된다
 *  - 디자인 볼륨 = 파트 단위 가산 (4.4). 등급표가 원래 파트 단위 규칙이다
 *  - 합산은 코드가 한다. 단계별 등급과 근거를 함께 내보내 검산한다
 *  - 등급 후보가 둘 이상이면 하나를 고르지 않는다. 기본값 없이 미정으로 남기고,
 *    미정인 단계는 합계에 넣지 않는다 (F3a-2 금지사항)
 *  - 소요일·개월은 계산하지 않는다. 스케쥴 문서가 한다
 */

import type {
  DesignState,
  DevMark,
  Grade,
  GradeTables,
  IncidentalState,
  Step,
  StepKind,
  StepPart,
} from "./types";

/** 볼륨 관리 단위는 0.1 이다. */
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** 프로젝트명 대조용 정규화. 「코코비」 접두어는 표기가 갈려서 떼고 본다. */
export const pkey = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/^코코비\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

export const gradeById = (g: GradeTables | null, id: string | null | undefined): Grade | null =>
  (id && g?.dev?.find((x) => x.id === id)) || null;

/* ══════════════════════════════════════════════════════════════
   등급 추천 — 4.3 등급표에만 근거한다. 새 기준을 만들지 않는다.
   ══════════════════════════════════════════════════════════════ */

export type Confidence = "high" | "mid" | "low" | "none";

export interface Recommendation {
  ids: string[];
  conf: Confidence;
  why: string;
}

/** kind 가 비었을 때 단계명에서만 유추한다. 추천일 뿐이고 미확정으로 남는다. */
export function guessKind(t: string): StepKind {
  if (/게임|미니게임|런게임|퍼즐|디펜스|레이싱|미로/.test(t)) return "game";
  if (/컷씬|인트로|엔딩|오프닝|\bOP\b|아웃트로/i.test(t)) return "cutscene";
  if (/콘선화|콘텐츠 선택|콘텐츠선택/.test(t)) return "contents";
  if (/선택 ?화면|메뉴|고르기|선택하기/.test(t)) return "menu";
  if (/스티커|반복/.test(t)) return "sticker";
  return null;
}

export function recommendDev(step: Step): Recommendation {
  const t = step.text || "";
  const kind = step.kind || guessKind(t);

  if (kind === "game") {
    if (step.moves_map === true)
      return { ids: ["game_map"], conf: "high", why: "맵/화면이 이동하는 게임" };
    if (step.moves_map === false)
      return { ids: ["game_fixed"], conf: "high", why: "고정 화면 게임" };
    return {
      ids: ["game_map", "game_fixed"],
      conf: "none",
      why: "맵 이동 여부가 기획서에 없습니다. 1.0 / 0.5 중 사람이 골라야 합니다.",
    };
  }
  if (kind === "contents") return { ids: ["contents"], conf: "high", why: "기본 콘선화" };
  if (kind === "cutscene") return { ids: ["cutscene"], conf: "high", why: "컷씬" };
  if (kind === "menu")
    return { ids: ["menu"], conf: "mid", why: "선택 화면 (메뉴 등). 예외 상황이 있으면 0.2" };
  if (kind === "sticker")
    return {
      ids: ["sticker_few", "sticker_many"],
      conf: "none",
      why: "조작 횟수에 따라 갈립니다. 5회 미만 0.1 / 10회 이상 0.2",
    };
  if (kind === "interaction")
    return {
      ids: ["inter_mid", "inter_low"],
      conf: "low",
      why: "인터렉션 중(구현 요소가 많은 화면) / 하(단순 터치·오브젝트 변화) 중 선택",
    };
  return {
    ids: ["inter_low"],
    conf: "low",
    why:
      "kind가 비어 있어 기본 추천입니다. 4.5의 «대부분의 단계는 인터렉션 0.1~0.2» 에 " +
      "따른 것이므로 확인이 필요합니다.",
  };
}

/**
 * 추천이 단독일 때만 초기 선택값을 준다.
 * 후보가 둘 이상이면 null — 하나를 미리 골라두면 그럴듯한 숫자가 합계에 섞여
 * 들어가고, 사람이 안 보고 넘기면 그대로 확정된다 (F3a-2 금지사항).
 */
export function initialDevMark(step: Step): DevMark {
  const rec = recommendDev(step);
  return { gradeId: rec.ids.length === 1 ? rec.ids[0] : null, confirmed: false };
}

export const devKey = (partKey: string, stepNo: number) => `${partKey}#${stepNo}`;

/* ══════════════════════════════════════════════════════════════
   디자인 가산 — 4.4 「신규 볼륨 책정 가산 규칙」을 그대로 코드화
   ══════════════════════════════════════════════════════════════ */

export const designDefault = (): DesignState => ({
  ingame: false,
  ingameShift: false,
  ingameBigMap: false,
  gameKinds: 0,
  popups: 0,
  deco: false,
  decoCats: 0,
  decoCarry: false,
  intro: "none",
  chars: 0,
  reward: false,
  rewardBg: "none",
  illust: false,
});

export interface DesignBreakdown {
  rows: [string, number][];
  subtotal: number;
  total: number;
  multiplier: string | null;
}

export function designBreakdown(s: DesignState): DesignBreakdown {
  const rows: [string, number][] = [];
  if (s.ingame) {
    rows.push(["인게임 기본", 0.3]);
    if (s.ingameShift) rows.push(["화면 전환 or 배경 2배 이상", 0.3]);
    if (s.ingameBigMap) rows.push(["큰 맵에 오브젝트 배치", 0.1]);
    if (s.gameKinds >= 2)
      rows.push([`게임 종류 ${s.gameKinds}종 (2종당 +0.1)`, r1(Math.floor(s.gameKinds / 2) * 0.1)]);
  }
  if (s.popups > 0) rows.push([`인게임 팝업 ${s.popups}종 (1종당 0.1)`, r1(s.popups * 0.1)]);
  if (s.deco) {
    rows.push(["인게임 데코 기본 (1종 포함)", 0.3]);
    if (s.decoCats > 0) rows.push([`데코 카테고리 추가 ${s.decoCats}종`, r1(s.decoCats * 0.1)]);
    if (s.decoCarry) rows.push(["초반 선택이 후반 인게임에 전부 반영", 0.1]);
  }
  if (s.intro === "full") rows.push(["인게임 인트로·엔딩", 0.2]);
  if (s.intro === "spine") rows.push(["인트로·엔딩 (동일 배경, 스파인만 변경)", 0.1]);
  if (s.chars > 2)
    rows.push([
      `캐릭터 ${s.chars}종 (기본 2종 초과, 2종당 +0.1)`,
      r1(Math.floor((s.chars - 2) / 2) * 0.1),
    ]);
  if (s.reward) {
    rows.push(["보상 — 테마+스티커바 1종", 0.2]);
    if (s.rewardBg === "x1_5") rows.push(["보상 배경 1.5배 내외", 0.1]);
    if (s.rewardBg === "x2") rows.push(["보상 배경 2배 이상", 0.2]);
  }
  const subtotal = r2(rows.reduce((a, [, v]) => a + v, 0));
  return s.illust
    ? { rows, subtotal, total: r1(subtotal * 1.5), multiplier: "일러스트형·실사형 × 1.5" }
    : { rows, subtotal, total: r1(subtotal), multiplier: null };
}

/* ══════════════════════════════════════════════════════════════ 합산 */

export interface PartTotal {
  total: number;
  confirmed: number;
  pending: number;
  /** 등급이 정해지지 않은 단계 수. 합계에 들어가지 않는다. */
  undecided: number;
  steps: number;
}

export function devPartTotal(
  part: StepPart,
  marks: Record<string, DevMark>,
  tables: GradeTables | null,
): PartTotal {
  let total = 0;
  let confirmed = 0;
  let pending = 0;
  let undecided = 0;
  for (const st of part.steps) {
    const m = marks[devKey(part.part_key, st.no)];
    const g = gradeById(tables, m?.gradeId);
    if (g) {
      total += g.volume;
      if (m?.confirmed) confirmed++;
      else pending++;
    } else {
      // 등급 미정 — 합계에 넣지 않는다
      pending++;
      undecided++;
    }
  }
  return { total: r1(total), confirmed, pending, undecided, steps: part.steps.length };
}

export interface Totals {
  dev: number;
  design: number;
  incDev: number;
  incDes: number;
  devAll: number;
  designAll: number;
  pending: number;
  undecided: number;
  steps: number;
  partN: number;
}

export function totals(
  parts: StepPart[],
  marks: Record<string, DevMark>,
  design: Record<string, DesignState>,
  incidental: Record<string, IncidentalState>,
  tables: GradeTables | null,
): Totals {
  let dev = 0;
  let des = 0;
  let pending = 0;
  let steps = 0;
  let undecided = 0;
  for (const p of parts) {
    const d = devPartTotal(p, marks, tables);
    dev += d.total;
    pending += d.pending;
    steps += d.steps;
    undecided += d.undecided;
    des += designBreakdown(design[p.part_key] ?? designDefault()).total;
  }
  let incDev = 0;
  let incDes = 0;
  for (const v of Object.values(incidental)) {
    if (!v.on) continue;
    incDev += Number(v.dev) || 0;
    incDes += Number(v.design) || 0;
  }
  return {
    dev: r1(dev),
    design: r1(des),
    incDev: r1(incDev),
    incDes: r1(incDes),
    devAll: r1(dev + incDev),
    designAll: r1(des + incDes),
    pending,
    undecided,
    steps,
    partN: parts.length,
  };
}

/* ══════════════════════════════════════════════════════════════ 눈금 참고 */

export interface Gauge {
  n: number;
  min: number;
  max: number;
  median: number;
  samples: string[];
}

/**
 * 과거 같은 파트 키/이름의 개발 볼륨을 «눈금»으로만 보여준다.
 * 값의 근거가 아니라 자리 감각을 위한 참고다.
 */
export function similarParts(
  part: StepPart,
  projects: { name: string; parts: { part_key: string; part_name?: string | null; dev_volume: number | null; is_qa?: boolean }[] }[] | null,
): Gauge | null {
  if (!projects) return null;
  const key = (part.part_key || "").toLowerCase();
  const nm = part.part_name || "";
  const hits: { label: string; v: number }[] = [];
  for (const p of projects) {
    for (const x of p.parts) {
      if (x.is_qa || x.dev_volume === null) continue;
      const k = (x.part_key || "").toLowerCase();
      const n = x.part_name || "";
      if ((key && k === key) || (nm && n === nm))
        hits.push({ label: `${p.name.replace(/\n/g, " ")} ${x.dev_volume.toFixed(1)}`, v: x.dev_volume });
    }
  }
  if (!hits.length) return null;
  const nums = hits.map((h) => h.v).sort((a, b) => a - b);
  const mid = nums.length / 2;
  const median = nums.length % 2 ? nums[(nums.length - 1) / 2] : r2((nums[mid - 1] + nums[mid]) / 2);
  return {
    n: hits.length,
    min: nums[0],
    max: nums[nums.length - 1],
    median,
    samples: hits.map((h) => h.label),
  };
}
