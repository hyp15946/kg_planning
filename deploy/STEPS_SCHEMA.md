# 단계 목록 입력 파일 (steps.json) 형식

단계 목록을 사이트에 넣는 **보조 경로**다. 사이트는 이 파일을 불러 등급 추천 → 사람 확정 → 코드 합산을 한다.

평소에는 이 파일이 필요 없다. **「드라이브에서 읽기」로 슬라이드에서 바로 뽑는 것이 기본**이고
(`OAUTH_SETUP.md`), 이 형식은 그게 안 될 때나 단계 목록을 손으로 만들어 둘 때 쓴다.
사이트의 「steps.json 으로 저장」 버튼으로 이 형식을 내보낼 수도 있다.

무엇이 만들든 **단계 목록만** 담는다. 볼륨·등급은 넣지 않는다 (F3a 정의).

## 최상위

```json
{
  "schema": "kigle-plan-db/steps@1",
  "project": "프로젝트명",
  "doc_type": "detail",
  "doc_url": "https://docs.google.com/presentation/d/<문서ID>/edit",
  "doc_title": "<문서 제목>",
  "extracted_at": "2026-07-25",
  "parts": [ ... ]
}
```

| 키 | 필수 | 설명 |
|---|---|---|
| `schema` | O | 고정값 `kigle-plan-db/steps@1` |
| `project` | O | 프로젝트 표준명. 과거 DB와 매칭돼 눈금 참고가 붙는다 |
| `doc_type` | O | `rough` (러프) / `detail` (상세) |
| `doc_url` | O | 기획서 드라이브 링크. 화면에서 원문으로 바로 이동 |
| `doc_title` | | 문서 제목 |
| `extracted_at` | | 추출 날짜 |

## 파트

```json
{
  "part_key": "partA",
  "part_name": "파트 A",
  "steps": [ ... ]
}
```

`part_key` 는 스케쥴 문서의 파트 키와 같은 값을 쓴다 (`bath`, `art`, `intro` …). 과거 파트와 매칭돼 눈금이 붙는다.

## 단계

```json
{"no": 1, "text": "재료 선택 화면", "kind": "menu", "moves_map": null, "note": ""}
```

| 키 | 필수 | 설명 |
|---|---|---|
| `no` | O | 기획서 플로우 도식의 번호 |
| `text` | O | 단계 이름. **기획서 문구 그대로.** 요약하거나 바꾸지 않는다 |
| `kind` | | 아래 표의 값 중 하나. **확실하지 않으면 `null`** (사이트가 단계명으로 유추한다) |
| `moves_map` | | 게임일 때만. 맵/화면이 이동하면 `true`, 고정 화면이면 `false`, **모르면 `null`** |
| `note` | | 판단 근거 메모. 화면에 그대로 표시된다 |

### `kind` 값

| 값 | 대응 |
|---|---|
| `game` | 독립 게임. `moves_map` 을 함께 채운다 |
| `interaction` | 인터렉션 (상/중/하는 사이트가 추천) |
| `menu` | 선택 화면·메뉴 |
| `cutscene` | 컷씬·인트로·엔딩 |
| `contents` | 콘선화 |
| `sticker` | 스티커바·반복 조작 |
| `null` | 판단 불가 → 사이트가 기본 추천을 내고 **미확정**으로 남긴다 |

## 만들 때 지킬 것

1. **단계를 빠뜨리거나 합치지 않는다.** 플로우 도식의 번호를 그대로 옮긴다.
   화면 최상단에 파트별 단계 수가 뜨므로, 담당자가 `만들기 = 4단계` 를 보고 즉시 잡아낸다.
2. **볼륨·등급을 넣지 않는다.** `kind` 는 힌트일 뿐이고 등급은 사이트와 사람이 정한다.
3. **`moves_map` 을 추측하지 않는다.** 기획서에 근거가 없으면 `null`.
   그러면 사이트가 1.0 / 0.5 두 후보를 띄우고 **기본값 없이 미정으로 남긴다.**
   미정인 단계는 합계에 들어가지 않으므로 사람이 반드시 고르게 된다 (F3a-2 금지사항).
4. 러프와 상세를 각각 따로 만든다. 사이트에서 나란히 비교하고 5% 밖이면 경고한다.

## 최소 예시

```json
{
  "schema": "kigle-plan-db/steps@1",
  "project": "프로젝트명",
  "doc_type": "detail",
  "doc_url": "https://docs.google.com/presentation/d/<문서ID>/edit",
  "parts": [
    {
      "part_key": "partA", "part_name": "파트 A",
      "steps": [
        {"no": 1, "text": "단계 1 이름", "kind": "interaction", "moves_map": null},
        {"no": 2, "text": "게임 단계 이름", "kind": "game", "moves_map": false},
        {"no": 3, "text": "오프닝 컷씬", "kind": "cutscene", "moves_map": null}
      ]
    },
    {
      "part_key": "partB", "part_name": "파트 B",
      "steps": [
        {"no": 1, "text": "이동형 게임 이름", "kind": "game", "moves_map": true},
        {"no": 2, "text": "오프닝 컷씬", "kind": "cutscene", "moves_map": null}
      ]
    }
  ]
}
```

각 단계에 어떤 등급을 줄지는 사이트가 등급표를 보고 추천하고, 사람이 확정한다.
`moves_map` 이 `null` 인 게임은 후보 두 개가 뜨고 기본값 없이 미정으로 남는다.
