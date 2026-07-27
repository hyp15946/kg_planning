import { describe, expect, it } from "vitest";
import { candidatesToSteps, parseSlides, type Presentation } from "./slides";
import type { Candidate } from "./types";

/** 도형 하나에 여러 줄을 담은 슬라이드를 만든다. */
const slide = (...texts: string[]): NonNullable<Presentation["slides"]>[number] => ({
  pageElements: texts.map((t) => ({
    shape: { text: { textElements: [{ textRun: { content: t } }] } },
  })),
});

describe("슬라이드 파싱 — 머리번호", () => {
  it("1. / (2) / 3) 형태를 잡는다", () => {
    const c = parseSlides({ slides: [slide("1. 첫 단계\n(2) 둘째 단계\n3) 셋째 단계")] })[0];
    expect(c.steps.map((s) => [s.no, s.text])).toEqual([
      [1, "첫 단계"],
      [2, "둘째 단계"],
      [3, "셋째 단계"],
    ]);
  });

  it("동그라미 숫자를 잡는다", () => {
    const c = parseSlides({ slides: [slide("① 하나\n② 둘\n⑩ 열")] })[0];
    expect(c.steps.map((s) => s.no)).toEqual([1, 2, 10]);
  });

  it("4-1 형태를 잡고 앞 숫자를 번호로 쓴다", () => {
    const c = parseSlides({ slides: [slide("4-1 어떤 단계\n5-2 다른 단계")] })[0];
    expect(c.steps.map((s) => [s.no, s.text])).toEqual([
      [4, "어떤 단계"],
      [5, "다른 단계"],
    ]);
  });

  it("번호 없는 줄은 단계가 아니다", () => {
    const c = parseSlides({ slides: [slide("표지입니다\n1. 실제 단계\n설명문입니다")] })[0];
    expect(c.steps).toHaveLength(1);
  });

  it("80자를 넘는 줄은 설명문으로 보고 버린다", () => {
    const long = "1. " + "가".repeat(81);
    expect(parseSlides({ slides: [slide(long)] })[0].steps).toHaveLength(0);
  });

  it("번호가 겹치면 뒤쪽을 버리고 번호순으로 정렬한다", () => {
    const c = parseSlides({ slides: [slide("3. 셋째\n1. 첫째\n1. 중복된 첫째")] })[0];
    expect(c.steps.map((s) => [s.no, s.text])).toEqual([
      [1, "첫째"],
      [3, "셋째"],
    ]);
  });
});

describe("슬라이드 파싱 — 텍스트 수집", () => {
  it("구글 슬라이드의 소프트 줄바꿈(U+000B)을 공백으로 바꾼다", () => {
    // Shift+Enter 로 넣은 줄바꿈이 U+000B 로 온다. 공백이 되어야 단계명이 붙는다.
    const vt = String.fromCharCode(11);
    const c = parseSlides({ slides: [slide(`1. 앞부분${vt}뒷부분\n2. 두번째`)] })[0];
    expect(c.steps[0].text).toBe("앞부분 뒷부분");
  });

  it("표 안의 텍스트도 읽는다", () => {
    const c = parseSlides({
      slides: [
        {
          pageElements: [
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      { text: { textElements: [{ textRun: { content: "1. 표 안 단계" } }] } },
                      { text: { textElements: [{ textRun: { content: "2. 또 하나" } }] } },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    })[0];
    expect(c.steps.map((s) => s.text)).toEqual(["표 안 단계", "또 하나"]);
  });

  it("그룹으로 묶인 도형도 재귀로 읽는다", () => {
    const c = parseSlides({
      slides: [
        {
          pageElements: [
            {
              elementGroup: {
                children: [
                  { shape: { text: { textElements: [{ textRun: { content: "1. 그룹 안" } }] } } },
                  {
                    elementGroup: {
                      children: [
                        { shape: { text: { textElements: [{ textRun: { content: "2. 더 깊이" } }] } } },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    })[0];
    expect(c.steps.map((s) => s.text)).toEqual(["그룹 안", "더 깊이"]);
  });
});

describe("슬라이드 파싱 — 후보 판정", () => {
  it("번호가 2개 이상이면 기본 포함, 미만이면 제외로 둔다", () => {
    const [a, b] = parseSlides({ slides: [slide("1. 하나\n2. 둘"), slide("1. 하나뿐")] });
    expect(a.include).toBe(true);
    expect(b.include).toBe(false);
  });

  it("kind·moves_map 을 추측하지 않는다 (F3a-2)", () => {
    const c = parseSlides({ slides: [slide("1. 미니게임\n2. 컷씬")] })[0];
    for (const s of c.steps) {
      expect(s.kind).toBeNull();
      expect(s.moves_map).toBeNull();
    }
  });

  it("도식이 이미지면 단계가 0개로 나온다", () => {
    const c = parseSlides({ slides: [{ pageElements: [{}] }] })[0];
    expect(c.steps).toHaveLength(0);
    expect(c.include).toBe(false);
  });

  it("슬라이드가 없어도 죽지 않는다", () => {
    expect(parseSlides({})).toEqual([]);
  });
});

describe("후보 → steps.json", () => {
  const meta = {
    project: "P",
    doc_type: "detail" as const,
    doc_url: "https://docs.google.com/presentation/d/X/edit",
    today: "2026-07-28",
  };
  const cand = (o: Partial<Candidate>): Candidate => ({
    idx: 1,
    title: "t",
    lines: [],
    include: true,
    part_key: "",
    part_name: "",
    steps: [],
    ...o,
  });

  it("제외한 슬라이드와 단계 없는 슬라이드는 빠진다", () => {
    const out = candidatesToSteps(
      [
        cand({ idx: 1, include: false, part_key: "a", steps: [{ no: 1, text: "x" }] }),
        cand({ idx: 2, include: true, part_key: "b", steps: [] }),
        cand({ idx: 3, include: true, part_key: "c", steps: [{ no: 1, text: "y" }] }),
      ],
      meta,
    );
    expect(out.parts.map((p) => p.part_key)).toEqual(["c"]);
  });

  it("파트 키가 같으면 합치고 번호를 다시 매긴다", () => {
    const out = candidatesToSteps(
      [
        cand({ idx: 1, part_key: "art", part_name: "아트", steps: [{ no: 1, text: "가" }] }),
        cand({ idx: 2, part_key: "art", part_name: "아트2", steps: [{ no: 1, text: "나" }] }),
      ],
      meta,
    );
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0].steps.map((s) => [s.no, s.text])).toEqual([
      [1, "가"],
      [2, "나"],
    ]);
  });

  it("번호가 바뀐 단계는 원본 번호를 메모에 남기고, 안 바뀐 단계는 건드리지 않는다", () => {
    // parseSlides 가 만드는 형태와 같게 note: "" 를 준다
    const out = candidatesToSteps(
      [
        cand({ idx: 1, part_key: "art", steps: [{ no: 1, text: "가", note: "" }] }),
        cand({ idx: 2, part_key: "art", steps: [{ no: 7, text: "나", note: "" }] }),
      ],
      meta,
    );
    expect(out.parts[0].steps[1].note).toContain("원본 번호 7");
    expect(out.parts[0].steps[0].note).toBe("");
  });

  it("기존 메모가 있으면 원본 번호를 덧붙인다", () => {
    const out = candidatesToSteps(
      [
        cand({ idx: 1, part_key: "art", steps: [{ no: 1, text: "가" }] }),
        cand({ idx: 2, part_key: "art", steps: [{ no: 7, text: "나", note: "기존 메모" }] }),
      ],
      meta,
    );
    expect(out.parts[0].steps[1].note).toBe("기존 메모 / 원본 번호 7");
  });

  it("파트 키가 비면 슬라이드 번호로 임시 키를 만든다", () => {
    const out = candidatesToSteps([cand({ idx: 5, part_key: "", steps: [{ no: 1, text: "x" }] })], meta);
    expect(out.parts[0].part_key).toBe("slide5");
  });

  it("메타 정보를 그대로 담는다", () => {
    const out = candidatesToSteps([cand({ part_key: "a", steps: [{ no: 1, text: "x" }] })], meta);
    expect(out.schema).toBe("kigle-plan-db/steps@1");
    expect(out.project).toBe("P");
    expect(out.doc_url).toBe(meta.doc_url);
    expect(out.extracted_at).toBe("2026-07-28");
  });
});
