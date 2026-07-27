import { describe, expect, it } from "vitest";
import { candidatesToSteps, parseSlides, SKIP, slideRange, type Presentation } from "./slides";
import type { Candidate } from "./types";

/** 도형 하나에 여러 줄을 담은 슬라이드를 만든다. */
const slide = (...texts: string[]): NonNullable<Presentation["slides"]>[number] => ({
  pageElements: texts.map((t) => ({
    shape: { text: { textElements: [{ textRun: { content: t } }] } },
  })),
});

/** 표 한 개짜리 슬라이드. 셀 순서는 행 우선이다 (Slides API 와 같다). */
const tableSlide = (
  rows: string[][],
  ...shapes: string[]
): NonNullable<Presentation["slides"]>[number] => ({
  pageElements: [
    ...shapes.map((t) => ({ shape: { text: { textElements: [{ textRun: { content: t } }] } } })),
    {
      table: {
        tableRows: rows.map((r) => ({
          tableCells: r.map((c) => ({ text: { textElements: [{ textRun: { content: c } }] } })),
        })),
      },
    },
  ],
});

/* ── 실제 기준 문서(코코비 신체 러프·상세)의 짜임새를 그대로 흉내 낸 조각들 ── */

/** 러프·상세의 파트 표지: 「구분/내용」 표에 활동 체인과 개발 볼륨. */
const partCover = (name: string, chain: string, volume: string) =>
  tableSlide(
    [
      ["구분", "내용"],
      ["활동", chain],
      ["개발 볼륨", volume],
    ],
    name,
  );

/** 상세의 플로우 슬라이드: 시작/활동/완료 구간에 번호 셀로 단계 나열. */
const flowSlide = (name: string, ...cells: string[]) => slide(name, cells.join("\n"));

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
    const c = parseSlides({ slides: [slide("첫 줄입니다\n1. 실제 단계\n설명문입니다")] })[0];
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

describe("파트 표지 — 러프 기획서형 (활동 체인)", () => {
  const rough = (): Presentation => ({
    slides: [
      slide("코코비 신체 탐험 러프 기획(2차)\n기 획\n박하영"),
      slide("목차\n1. 개요\n1) 문서 업데이트 기록\n4. 러프 기획\n1) 뇌\n2) 입"),
      // 개요-목표: 「개발 볼륨」은 있지만 「활동」 행이 없으니 표지가 아니다
      slide("구분\n상세\n게임\n12개\n개발 볼륨\n14.7 ~ 14.8\n- 뇌: 1.1\n- 입: 1"),
      partCover("입", "음식물 쪼개기 > 양치하기", "1"),
      slide("4. 러프 기획\n2) 입\nOP\n* 열심히 음식을 씹고 있는 이빨들"),
      slide("4. 러프 기획\n2) 입\n양치\n* 세균과 찌꺼기 드래그해서 없애기"),
      partCover("심장", "트랙 런게임", "1.1"),
    ],
  });

  it("첫 표지 앞(표지·목차·개요)은 전부 접는다", () => {
    const c = parseSlides(rough());
    expect(c.slice(0, 3).map((x) => x.skip)).toEqual([
      SKIP.beforeBody,
      SKIP.beforeBody,
      SKIP.beforeBody,
    ]);
  });

  it("표지마다 파트 한 개가 되고 활동 체인이 단계가 된다", () => {
    const parts = parseSlides(rough()).filter((x) => !x.skip);
    expect(parts.map((x) => x.title)).toEqual(["입", "심장"]);
    expect(parts[1].steps.map((s) => [s.no, s.text])).toEqual([[1, "트랙 런게임"]]);
  });

  it("상세 슬라이드의 OP 마커가 1번 단계로 붙고 체인은 뒤로 밀린다", () => {
    const [mouth] = parseSlides(rough()).filter((x) => !x.skip);
    expect(mouth.steps.map((s) => [s.no, s.text])).toEqual([
      [1, "OP"],
      [2, "음식물 쪼개기"],
      [3, "양치하기"],
    ]);
  });

  it("상세 슬라이드는 파트에 흡수되고 기획서 볼륨이 붙는다", () => {
    const [mouth, heart] = parseSlides(rough()).filter((x) => !x.skip);
    expect(mouth.idxs).toEqual([4, 5, 6]);
    expect(mouth.doc_volume).toBe("1");
    expect(heart.doc_volume).toBe("1.1");
  });

  it("「A + B」로 이은 체인도 나눈다 (소장 표지)", () => {
    const c = parseSlides({
      slides: [partCover("소장", "음식물 쪼개기 + 영양소 낚시", "1.1")],
    });
    expect(c[0].steps.map((s) => s.text)).toEqual(["음식물 쪼개기", "영양소 낚시"]);
  });

  it("「(1안) 0.6 or (2안) 0.8」 같은 볼륨 문구도 그대로 담는다", () => {
    const c = parseSlides({
      slides: [partCover("폐", "세균 쫓기 > 폐렴 치료", "(1안) 0.6 or (2안) 0.8")],
    });
    expect(c[0].doc_volume).toBe("(1안) 0.6 or (2안) 0.8");
  });

  it("구성 표지(홈/공통 화면)의 항목이 단계가 된다", () => {
    const c = parseSlides({
      slides: [
        slide("홈/콘텐츠 선택 화면\n구성\n1) 홈 화면\n2) 인트로\n3) 콘텐츠 선택 화면"),
        slide("홈 화면 설명\n* 물이 계속 흘러들어오는 위의 모습"),
      ],
    });
    expect(c[0].title).toBe("홈/콘텐츠 선택 화면");
    expect(c[0].steps.map((s) => s.text)).toEqual(["홈 화면", "인트로", "콘텐츠 선택 화면"]);
    expect(c[0].idxs).toEqual([1, 2]);
  });

  it("구성 항목이 하나뿐이면 표지가 아니다 (리워드 디바이더)", () => {
    const c = parseSlides({ slides: [slide("리워드\n구성\n탐사대 멤버")] });
    expect(c[0].steps).toHaveLength(0); // 표지 없음 → 폴백 경로
  });
});

describe("파트 표지 — 상세 기획서형 (플로우·No-표)", () => {
  const 뇌표지 = () =>
    tableSlide(
      [
        ["구분", "내용"],
        ["활동", "신호 전달 미로 게임"],
        ["개발 볼륨", "1.1"],
      ],
      "6. 게임 콘텐츠",
      "1) 뇌",
    );
  const 뇌플로우 = () =>
    flowSlide(
      "뇌",
      "시작",
      "1",
      "화면 로딩 완료 시",
      "- 인트로 컷씬",
      "2",
      "인트로 컷씬 완료 시",
      "- 게임 시작",
      "활동",
      "3",
      "신호 전달 미로 게임",
      "- 잠자고 있는 장기들을 찾아가 신호 전달하기",
      "*조작: 드래그",
      "완료",
      "4",
      "게임 완료 시",
      "- 게임 완료 연출",
    );

  it("「N) 이름」 소단원 머리가 파트명이 된다", () => {
    const c = parseSlides({ slides: [뇌표지()] });
    expect(c[0].title).toBe("뇌");
  });

  it("플로우 슬라이드가 있으면 활동 체인 대신 그 번호를 쓴다", () => {
    const [brain] = parseSlides({ slides: [뇌표지(), 뇌플로우()] });
    expect(brain.steps.map((s) => [s.no, s.text])).toEqual([
      [1, "인트로 컷씬"],
      [2, "게임 시작"],
      [3, "신호 전달 미로 게임"],
      [4, "게임 완료 연출"],
    ]);
    expect(brain.idxs).toEqual([1, 2]);
  });

  it("조건 줄은 메모로 가고, 조작 안내도 메모에 담긴다", () => {
    const [brain] = parseSlides({ slides: [뇌표지(), 뇌플로우()] });
    expect(brain.steps[0].note).toBe("화면 로딩 완료 시");
    expect(brain.steps[2].note).toBe("조작: 드래그");
  });

  it("플로우의 중복 번호는 뒤쪽을 버린다 (대장 5·5)", () => {
    const [colon] = parseSlides({
      slides: [
        partCover("대장", "똥 만들기 > 기생충 잡기", "1.5"),
        flowSlide(
          "대장",
          "활동",
          "4",
          "똥 만들기",
          "5",
          "기생충 컷씬",
          "5",
          "화면 로딩 완료 시",
          "- 튜토리얼",
          "완료",
          "6",
          "기생충 잡기",
        ),
      ],
    });
    expect(colon.steps.map((s) => [s.no, s.text])).toEqual([
      [4, "똥 만들기"],
      [5, "기생충 컷씬"],
      [6, "기생충 잡기"],
    ]);
  });

  it("「No/구분/내용」 번호 표(공통)는 행이 단계다", () => {
    const c = parseSlides({
      slides: [
        tableSlide(
          [
            ["No", "구분", "내용"],
            ["1", "캐릭터 선택", "캐릭터 선택 팝업"],
            ["2", "공통 컷씬", "공통 컷씬"],
            ["3", "공통 런게임: 내부", "내부 런게임"],
          ],
          "공통",
        ),
      ],
    });
    expect(c[0].title).toBe("공통");
    expect(c[0].steps.map((s) => s.text)).toEqual([
      "캐릭터 선택",
      "공통 컷씬",
      "공통 런게임: 내부",
    ]);
  });

  it("「No/활동/내용」 변형(보상)도 잡는다", () => {
    const c = parseSlides({
      slides: [
        tableSlide(
          [
            ["No", "활동", "내용"],
            ["1", "캐릭터", "플레이어블 캐릭터 획득"],
          ],
          "보상",
        ),
      ],
    });
    expect(c[0].title).toBe("보상");
    expect(c[0].steps.map((s) => s.text)).toEqual(["캐릭터"]);
  });

  it("오브젝트 명세 표(No/오브젝트/조건)는 플로우도 표지도 아니다", () => {
    const [brain] = parseSlides({
      slides: [
        뇌표지(),
        slide(
          "공통 컷씬\nDescription\nNo\n오브젝트\n조건\n상세기준 및 동작\n1\n배경\n화면 로딩 완료 시\n- 출력\n2\n탐사차\n활동\n완료",
        ),
      ],
    });
    // 명세 표를 플로우로 오인하지 않고 활동 체인을 유지한다
    expect(brain.steps.map((s) => s.text)).toEqual(["신호 전달 미로 게임"]);
    expect(brain.idxs).toEqual([1, 2]);
  });
});

describe("슬라이드 파싱 — 앞부분 접기", () => {
  it("홈 화면이 나오는 슬라이드 앞은 다 접는다 (표지·개요·목차)", () => {
    const c = parseSlides({
      slides: [
        slide("표지\n프로젝트 이름"),
        slide("목차\n1. 개요\n2. 홈 화면\n3. 만들기"),
        slide("홈 화면\n1. 홈 화면 진입\n2. 재료 선택"),
        slide("만들기\n1. 반죽\n2. 굽기"),
      ],
    });
    expect(c.map((x) => x.skip)).toEqual([SKIP.beforeHome, SKIP.beforeHome, null, null]);
    expect(c.filter((x) => !x.skip).map((x) => x.title)).toEqual(["홈 화면", "만들기"]);
  });

  it("목차가 「홈 화면」을 항목으로 적어 두어도 시작점으로 삼지 않는다", () => {
    const c = parseSlides({
      slides: [
        slide("목차\n1. 홈 화면\n2. 만들기"),
        slide("홈 화면 구성\n1. 홈 화면\n2. 재료 선택"),
      ],
    });
    expect(c[0].skip).toBe(SKIP.beforeHome);
    expect(c[1].skip).toBeNull();
  });

  it("홈 화면을 못 찾으면 자르지 않고, 개요·목차 제목만 접는다", () => {
    const c = parseSlides({
      slides: [slide("게임 개요\n1. 목표\n2. 규칙"), slide("만들기\n1. 반죽\n2. 굽기")],
    });
    expect(c.map((x) => x.skip)).toEqual([SKIP.front, null]);
  });

  it("긴 제목의 «개요» 는 본문으로 남긴다 (오탐 방지)", () => {
    const c = parseSlides({ slides: [slide("재료를 고르는 화면 개요 정리\n1. 하나\n2. 둘")] });
    expect(c[0].skip).toBeNull();
  });

  it("번호를 못 찾은 슬라이드는 접는다", () => {
    const c = parseSlides({ slides: [slide("이미지 도식만 있음")] });
    expect(c[0].skip).toBe(SKIP.noNumber);
    expect(c[0].include).toBe(false);
  });
});

describe("슬라이드 파싱 — 같은 제목 합치기", () => {
  it("제목이 같은 슬라이드를 한 후보로 합친다", () => {
    const c = parseSlides({
      slides: [
        slide("만들기\n1. 반죽\n2. 굽기"),
        slide("만들기\n3. 장식\n4. 완성"),
        slide("놀기\n1. 놀기 시작\n2. 끝"),
      ],
    });
    expect(c).toHaveLength(2);
    expect(c[0].idxs).toEqual([1, 2]);
    expect(c[0].steps.map((s) => s.no)).toEqual([1, 2, 3, 4]);
    expect(c[1].idxs).toEqual([3]);
  });

  it("공백·대소문자만 다른 제목도 같은 것으로 본다", () => {
    const c = parseSlides({ slides: [slide("Play  게임\n1. 가\n2. 나"), slide("play 게임\n3. 다\n4. 라")] });
    expect(c).toHaveLength(1);
  });

  it("번호와 문구가 모두 같으면 한 번만 남긴다", () => {
    const c = parseSlides({
      slides: [slide("만들기\n1. 반죽\n2. 굽기"), slide("만들기\n2. 굽기\n3. 장식")],
    });
    expect(c[0].steps.map((s) => [s.no, s.text])).toEqual([
      [1, "반죽"],
      [2, "굽기"],
      [3, "장식"],
    ]);
  });

  it("번호만 같고 문구가 다르면 둘 다 남긴다 (합칠 때 다시 매긴다)", () => {
    const c = parseSlides({
      slides: [slide("만들기\n1. 반죽\n2. 굽기"), slide("만들기\n1. 딴 것\n2. 또 딴 것")],
    });
    expect(c[0].steps).toHaveLength(4);
  });

  it("합치면 단계가 2개 이상이 되므로 기본 포함으로 바뀐다", () => {
    const c = parseSlides({ slides: [slide("만들기\n1. 하나뿐"), slide("만들기\n2. 둘뿐")] });
    expect(c[0].include).toBe(true);
  });

  it("원문 텍스트에 어느 장에서 왔는지 남긴다", () => {
    const c = parseSlides({ slides: [slide("만들기\n1. 가\n2. 나"), slide("만들기\n3. 다\n4. 라")] });
    expect(c[0].lines[0]).toBe("— 슬라이드 1 —");
    expect(c[0].lines).toContain("— 슬라이드 2 —");
  });

  it("접어 둔 슬라이드는 제목이 같아도 합치지 않는다", () => {
    const c = parseSlides({ slides: [slide("메모"), slide("메모")] });
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.idxs)).toEqual([[1], [2]]);
  });
});

describe("슬라이드 번호 표기", () => {
  it("이어진 번호는 범위로, 떨어진 번호는 쉼표로 적는다", () => {
    expect(slideRange([3])).toBe("3");
    expect(slideRange([3, 4])).toBe("3–4");
    expect(slideRange([3, 4, 5, 8])).toBe("3–5, 8");
    expect(slideRange([])).toBe("");
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
    idxs: [1],
    title: "t",
    lines: [],
    include: true,
    part_key: "",
    part_name: "",
    steps: [],
    skip: null,
    doc_volume: null,
    ...o,
  });

  it("제외한 슬라이드와 단계 없는 슬라이드는 빠진다", () => {
    const out = candidatesToSteps(
      [
        cand({ idxs: [1], include: false, part_key: "a", steps: [{ no: 1, text: "x" }] }),
        cand({ idxs: [2], include: true, part_key: "b", steps: [] }),
        cand({ idxs: [3], include: true, part_key: "c", steps: [{ no: 1, text: "y" }] }),
      ],
      meta,
    );
    expect(out.parts.map((p) => p.part_key)).toEqual(["c"]);
  });

  it("접어 둔 후보는 빠진다", () => {
    const out = candidatesToSteps(
      [
        cand({ idxs: [1], include: false, skip: SKIP.front, part_key: "a", steps: [{ no: 1, text: "x" }] }),
        cand({ idxs: [2], part_key: "b", steps: [{ no: 1, text: "y" }] }),
      ],
      meta,
    );
    expect(out.parts.map((p) => p.part_key)).toEqual(["b"]);
  });

  it("파트 키가 같으면 합치고 번호를 다시 매긴다", () => {
    const out = candidatesToSteps(
      [
        cand({ idxs: [1], part_key: "art", part_name: "아트", steps: [{ no: 1, text: "가" }] }),
        cand({ idxs: [2], part_key: "art", part_name: "아트2", steps: [{ no: 1, text: "나" }] }),
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
        cand({ idxs: [1], part_key: "art", steps: [{ no: 1, text: "가", note: "" }] }),
        cand({ idxs: [2], part_key: "art", steps: [{ no: 7, text: "나", note: "" }] }),
      ],
      meta,
    );
    expect(out.parts[0].steps[1].note).toContain("원본 번호 7");
    expect(out.parts[0].steps[0].note).toBe("");
  });

  it("기존 메모가 있으면 원본 번호를 덧붙인다", () => {
    const out = candidatesToSteps(
      [
        cand({ idxs: [1], part_key: "art", steps: [{ no: 1, text: "가" }] }),
        cand({ idxs: [2], part_key: "art", steps: [{ no: 7, text: "나", note: "기존 메모" }] }),
      ],
      meta,
    );
    expect(out.parts[0].steps[1].note).toBe("기존 메모 / 원본 번호 7");
  });

  it("파트 키가 비면 첫 슬라이드 번호로 임시 키를 만든다", () => {
    const out = candidatesToSteps(
      [cand({ idxs: [5, 6], part_key: "", steps: [{ no: 1, text: "x" }] })],
      meta,
    );
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
