import { describe, expect, it } from "vitest";
import {
  designBreakdown,
  designDefault,
  devPartTotal,
  guessKind,
  initialDevMark,
  pkey,
  r1,
  recommendDev,
  similarParts,
  totals,
} from "./volume";
import type { DesignState, DevMark, GradeTables, StepPart } from "./types";

const TABLES: GradeTables = {
  dev: [
    { id: "game_map", label: "게임 — 맵 이동", volume: 1.0 },
    { id: "game_fixed", label: "게임 — 고정 화면", volume: 0.5 },
    { id: "cutscene", label: "컷씬", volume: 0.3 },
    { id: "contents", label: "콘선화", volume: 0.2 },
    { id: "menu", label: "메뉴", volume: 0.1 },
    { id: "inter_mid", label: "인터렉션 중", volume: 0.2 },
    { id: "inter_low", label: "인터렉션 하", volume: 0.1 },
    { id: "sticker_few", label: "스티커 5회 미만", volume: 0.1 },
    { id: "sticker_many", label: "스티커 10회 이상", volume: 0.2 },
  ],
};

const des = (o: Partial<DesignState> = {}): DesignState => ({ ...designDefault(), ...o });

describe("등급 추천 — 후보가 둘 이상이면 기본값을 주지 않는다 (F3a-2)", () => {
  it("moves_map 이 null 인 게임은 후보 2개, 기본값 없음", () => {
    const rec = recommendDev({ no: 1, text: "미니게임", kind: "game", moves_map: null });
    expect(rec.ids).toEqual(["game_map", "game_fixed"]);
    expect(rec.conf).toBe("none");
    expect(initialDevMark({ no: 1, text: "미니게임", kind: "game", moves_map: null }).gradeId).toBeNull();
  });

  it("moves_map 이 정해지면 후보 1개, 초기값이 들어간다", () => {
    expect(recommendDev({ no: 1, text: "g", kind: "game", moves_map: true }).ids).toEqual(["game_map"]);
    expect(recommendDev({ no: 1, text: "g", kind: "game", moves_map: false }).ids).toEqual(["game_fixed"]);
    expect(initialDevMark({ no: 1, text: "g", kind: "game", moves_map: true }).gradeId).toBe("game_map");
  });

  it("스티커·인터렉션도 후보가 둘이라 기본값이 없다", () => {
    expect(initialDevMark({ no: 1, text: "스티커바", kind: "sticker" }).gradeId).toBeNull();
    expect(initialDevMark({ no: 1, text: "무언가", kind: "interaction" }).gradeId).toBeNull();
  });

  it("초기 상태는 항상 미확정이다", () => {
    expect(initialDevMark({ no: 1, text: "오프닝 컷씬", kind: "cutscene" }).confirmed).toBe(false);
  });
});

describe("kind 유추 — 단계명에서만", () => {
  it.each([
    ["런게임 스테이지", "game"],
    ["미로 탈출", "game"],
    ["오프닝 컷씬", "cutscene"],
    ["엔딩", "cutscene"],
    ["콘선화", "contents"],
    ["재료 선택 화면", "menu"],
    ["메뉴", "menu"],
    ["스티커바 꾸미기", "sticker"],
  ])("%s → %s", (text, kind) => {
    expect(guessKind(text)).toBe(kind);
  });

  it("판단이 안 되면 null 이고, 추천은 inter_low 로 떨어지되 확인이 필요하다고 밝힌다", () => {
    expect(guessKind("알 수 없는 무언가")).toBeNull();
    const rec = recommendDev({ no: 1, text: "알 수 없는 무언가" });
    expect(rec.ids).toEqual(["inter_low"]);
    expect(rec.conf).toBe("low");
    expect(rec.why).toContain("확인이 필요");
  });

  it("명시된 kind 가 유추를 이긴다", () => {
    // 이름은 게임처럼 보이지만 kind 가 menu 로 지정되어 있다
    expect(recommendDev({ no: 1, text: "퍼즐 게임", kind: "menu" }).ids).toEqual(["menu"]);
  });
});

describe("개발 볼륨 — 단계 단위 합산, 미정은 제외", () => {
  const part: StepPart = {
    part_key: "art",
    part_name: "아트",
    steps: [
      { no: 1, text: "재료 선택 화면", kind: "menu" },
      { no: 2, text: "이동형 게임", kind: "game", moves_map: null }, // 미정
      { no: 3, text: "오프닝 컷씬", kind: "cutscene" },
    ],
  };
  const marks: Record<string, DevMark> = {
    "art#1": { gradeId: "menu", confirmed: true },
    "art#2": { gradeId: null, confirmed: false },
    "art#3": { gradeId: "cutscene", confirmed: true },
  };

  it("미정 단계는 합계에서 빠진다", () => {
    const t = devPartTotal(part, marks, TABLES);
    expect(t.total).toBe(0.4); // 0.1 + 0.3, 게임은 미정이라 제외
    expect(t.undecided).toBe(1);
    expect(t.steps).toBe(3);
  });

  it("미정 단계는 pending 으로도 잡혀 검수가 끝나지 않는다", () => {
    const t = devPartTotal(part, marks, TABLES);
    expect(t.pending).toBe(1);
    expect(t.confirmed).toBe(2);
  });

  it("사람이 고르면 합계에 들어온다", () => {
    const t = devPartTotal(part, { ...marks, "art#2": { gradeId: "game_map", confirmed: true } }, TABLES);
    expect(t.total).toBe(1.4);
    expect(t.undecided).toBe(0);
    expect(t.pending).toBe(0);
  });

  it("등급표가 없으면 전부 미정이다", () => {
    const t = devPartTotal(part, marks, null);
    expect(t.total).toBe(0);
    expect(t.undecided).toBe(3);
  });

  it("게임 단위로 뭉개지 않고 단계마다 센다 (4.5)", () => {
    // 게임 3개가 각각 별개 단계면 1.0 × 3 이고, 하나로 뭉개면 1.0 이 된다
    const many: StepPart = {
      part_key: "g",
      steps: [1, 2, 3].map((no) => ({ no, text: `게임 ${no}`, kind: "game" as const, moves_map: true })),
    };
    const m = Object.fromEntries(
      [1, 2, 3].map((no) => [`g#${no}`, { gradeId: "game_map", confirmed: true }]),
    );
    expect(devPartTotal(many, m, TABLES).total).toBe(3.0);
  });
});

describe("디자인 가산 — 4.4 규칙", () => {
  it("아무것도 안 고르면 0", () => {
    const b = designBreakdown(des());
    expect(b.total).toBe(0);
    expect(b.rows).toHaveLength(0);
  });

  it("인게임 기본 0.3", () => {
    expect(designBreakdown(des({ ingame: true })).total).toBe(0.3);
  });

  it("인게임 하위 항목은 인게임을 켜지 않으면 더해지지 않는다", () => {
    expect(designBreakdown(des({ ingameShift: true, ingameBigMap: true, gameKinds: 4 })).total).toBe(0);
  });

  it("인게임 + 전환 + 큰 맵 = 0.7", () => {
    expect(designBreakdown(des({ ingame: true, ingameShift: true, ingameBigMap: true })).total).toBe(0.7);
  });

  it("게임 종류는 2종당 +0.1 (내림)", () => {
    const v = (n: number) => designBreakdown(des({ ingame: true, gameKinds: n })).total;
    expect(v(1)).toBe(0.3); // 2종 미만이면 가산 없음
    expect(v(2)).toBe(0.4);
    expect(v(3)).toBe(0.4); // 내림
    expect(v(4)).toBe(0.5);
  });

  it("캐릭터는 기본 2종 초과분에 2종당 +0.1", () => {
    const v = (n: number) => designBreakdown(des({ chars: n })).total;
    expect(v(2)).toBe(0);
    expect(v(3)).toBe(0); // 초과 1종 → 내림하면 0
    expect(v(4)).toBe(0.1);
    expect(v(6)).toBe(0.2);
  });

  it("팝업은 1종당 0.1", () => {
    expect(designBreakdown(des({ popups: 3 })).total).toBe(0.3);
  });

  it("데코 기본 0.3 + 카테고리 1종당 0.1 + 반영 0.1", () => {
    expect(designBreakdown(des({ deco: true, decoCats: 2, decoCarry: true })).total).toBe(0.6);
  });

  it("인트로·엔딩은 full 0.2 / spine 0.1 배타", () => {
    expect(designBreakdown(des({ intro: "full" })).total).toBe(0.2);
    expect(designBreakdown(des({ intro: "spine" })).total).toBe(0.1);
    expect(designBreakdown(des({ intro: "none" })).total).toBe(0);
  });

  it("보상 배경 가산은 보상을 켜야 붙는다", () => {
    expect(designBreakdown(des({ rewardBg: "x2" })).total).toBe(0);
    expect(designBreakdown(des({ reward: true })).total).toBe(0.2);
    expect(designBreakdown(des({ reward: true, rewardBg: "x1_5" })).total).toBe(0.3);
    expect(designBreakdown(des({ reward: true, rewardBg: "x2" })).total).toBe(0.4);
  });

  it("일러스트형은 소계 전체에 ×1.5 를 마지막에 적용한다", () => {
    const b = designBreakdown(des({ ingame: true, ingameShift: true, illust: true }));
    expect(b.subtotal).toBe(0.6);
    expect(b.total).toBe(0.9);
    expect(b.multiplier).toContain("1.5");
  });

  it("×1.5 결과도 0.1 단위로 반올림한다", () => {
    const b = designBreakdown(des({ ingame: true, illust: true })); // 0.3 × 1.5 = 0.45
    expect(b.total).toBe(0.5);
  });

  it("부동소수점 오차가 새지 않는다", () => {
    const b = designBreakdown(des({ popups: 3, deco: true, decoCats: 1 }));
    expect(b.subtotal).toBe(0.7); // 0.3 + 0.3 + 0.1
    expect(b.total).toBe(0.7);
  });
});

describe("전체 합산", () => {
  const parts: StepPart[] = [
    { part_key: "a", part_name: "A", steps: [{ no: 1, text: "메뉴", kind: "menu" }] },
    { part_key: "b", part_name: "B", steps: [{ no: 1, text: "게임", kind: "game", moves_map: true }] },
  ];
  const marks: Record<string, DevMark> = {
    "a#1": { gradeId: "menu", confirmed: true },
    "b#1": { gradeId: "game_map", confirmed: true },
  };

  it("파트별 개발 + 디자인 + 부대를 각각 합친다", () => {
    const t = totals(
      parts,
      marks,
      { a: des({ ingame: true }), b: des({ reward: true }) },
      { loading: { on: true, dev: 0.2, design: 0.1 } },
      TABLES,
    );
    expect(t.dev).toBe(1.1); // 0.1 + 1.0
    expect(t.design).toBe(0.5); // 0.3 + 0.2
    expect(t.incDev).toBe(0.2);
    expect(t.incDes).toBe(0.1);
    expect(t.devAll).toBe(1.3);
    expect(t.designAll).toBe(0.6);
    expect(t.steps).toBe(2);
    expect(t.partN).toBe(2);
    expect(t.pending).toBe(0);
  });

  it("끄면 부대 항목이 빠진다", () => {
    const t = totals(parts, marks, {}, { loading: { on: false, dev: 0.2, design: 0.1 } }, TABLES);
    expect(t.incDev).toBe(0);
    expect(t.devAll).toBe(1.1);
  });

  it("디자인 상태가 없는 파트는 0 으로 센다", () => {
    expect(totals(parts, marks, {}, {}, TABLES).design).toBe(0);
  });

  it("미정이 있으면 undecided 로 보고되고 합계에서 빠진다", () => {
    const risky: StepPart[] = [
      { part_key: "a", steps: [{ no: 1, text: "게임", kind: "game", moves_map: null }] },
    ];
    const t = totals(risky, { "a#1": { gradeId: null, confirmed: false } }, {}, {}, TABLES);
    expect(t.undecided).toBe(1);
    expect(t.dev).toBe(0);
  });
});

describe("눈금 참고", () => {
  const projects = [
    { name: "P1", parts: [{ part_key: "art", dev_volume: 1.0 }] },
    { name: "P2", parts: [{ part_key: "art", dev_volume: 2.0 }] },
    { name: "P3", parts: [{ part_key: "art", dev_volume: 3.0 }] },
    { name: "P4", parts: [{ part_key: "art", dev_volume: null }] }, // 미기록은 제외
    { name: "P5", parts: [{ part_key: "art", dev_volume: 9.0, is_qa: true }] }, // QA 제외
  ];

  it("파트 키가 같은 과거 기록의 범위와 중앙값을 준다", () => {
    const g = similarParts({ part_key: "art", steps: [] }, projects)!;
    expect(g.n).toBe(3);
    expect(g.min).toBe(1.0);
    expect(g.max).toBe(3.0);
    expect(g.median).toBe(2.0);
  });

  it("짝수 개면 중앙 두 값의 평균", () => {
    const g = similarParts({ part_key: "art", steps: [] }, projects.slice(0, 2))!;
    expect(g.median).toBe(1.5);
  });

  it("맞는 기록이 없으면 null", () => {
    expect(similarParts({ part_key: "없음", steps: [] }, projects)).toBeNull();
    expect(similarParts({ part_key: "art", steps: [] }, null)).toBeNull();
  });

  it("파트명으로도 맞춘다", () => {
    const g = similarParts(
      { part_key: "", part_name: "아트", steps: [] },
      [{ name: "P", parts: [{ part_key: "x", part_name: "아트", dev_volume: 1.5 }] }],
    )!;
    expect(g.n).toBe(1);
  });
});

describe("보조 함수", () => {
  it("r1 은 0.1 단위로 반올림한다", () => {
    expect(r1(0.44999)).toBe(0.4);
    expect(r1(0.45)).toBe(0.5);
    expect(r1(0.1 + 0.2)).toBe(0.3);
  });

  it("pkey 는 코코비 접두어와 공백 차이를 무시한다", () => {
    expect(pkey("코코비 라면가게")).toBe("라면가게");
    expect(pkey("라면가게")).toBe("라면가게");
    expect(pkey("  라면   가게 ")).toBe("라면 가게");
    expect(pkey(null)).toBe("");
  });
});
