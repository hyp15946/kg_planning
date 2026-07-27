"use client";

/** 2. 단계 목록 만들기 (F3a) + 2-1. 뽑아낸 단계 확인 */
import { useState } from "react";
import { GAuth, presentationId } from "@/lib/gauth";
import { candidatesToSteps, parseSlides, slideRange } from "@/lib/slides";
import { download, today } from "@/lib/exports";
import type { Candidate, DocType, StepsDoc } from "@/lib/types";
import { Button, Callout, Check, Panel, Section, Tag } from "./ui";
import { DropZone } from "./Gate";

type Src = "drive" | "file";

export function StepSource({
  docUrl,
  project,
  docType,
  loggedIn,
  onSteps,
  onRelogin,
}: {
  docUrl: string;
  project: string;
  docType: DocType;
  loggedIn: boolean;
  onSteps: (s: StepsDoc) => void;
  onRelogin: () => void;
}) {
  const [src, setSrc] = useState<Src>("drive");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{
    title: string;
    slides: number;
    groups: number;
    found: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState<Candidate[] | null>(null);

  const presId = presentationId(docUrl);

  const read = async () => {
    if (!presId) return;
    setErr("");
    setBusy(true);
    setResult(null);
    try {
      const pres = await GAuth.slides(presId);
      const c = parseSlides(pres);
      setCands(c);
      const body = c.filter((x) => !x.skip);
      setResult({
        title: pres.title ?? "",
        slides: pres.slides?.length ?? 0,
        groups: body.length,
        found: body.reduce((a, x) => a + x.steps.length, 0),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const takeStepsFile = async (f: File) => {
    try {
      const payload = JSON.parse(await f.text()) as StepsDoc;
      setErr("");
      setCands(null);
      onSteps(payload);
    } catch (e) {
      setErr("불러오지 못했습니다 — " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const meta = { project, doc_type: docType, doc_url: docUrl, today: today() };

  return (
    <>
      <Section n="2" title="단계 목록 만들기" hint="— F3a">
        <div className="mb-2.5 flex gap-1">
          {(
            [
              ["drive", "드라이브에서 읽기"],
              ["file", "steps.json 불러오기"],
            ] as [Src, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSrc(k)}
              className={
                "rounded-notion px-2.5 py-1.5 text-sm font-medium transition-colors " +
                (src === k ? "bg-ink text-page" : "text-dim hover:bg-hover")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {src === "drive" ? (
          <Panel>
            <Callout tone="info">
              구글 로그인으로 <b>본인 계정의 슬라이드를 직접 읽습니다.</b> 내용이 외부로 나가지 않고
              브라우저와 구글 사이에서만 오갑니다. 파트 표지(「활동」·「개발 볼륨」 표)와 표지
              뒤의 번호 플로우 도식에서 단계를 <b>코드로</b> 그대로 옮기고, 첫 표지 앞의
              표지·목차·개요 슬라이드는 <b>접어 둡니다.</b>
            </Callout>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={loggedIn ? "ok" : "warn"}>
                {loggedIn ? "연결됨" : "연결이 만료되었습니다"}
              </Tag>
              <Button primary disabled={!loggedIn || !presId || busy} onClick={read}>
                {busy ? "읽는 중…" : "기획서 읽기"}
              </Button>
              {!loggedIn && (
                <Button small onClick={onRelogin}>
                  다시 로그인
                </Button>
              )}
              {!presId && docUrl.trim() !== "" && (
                <span className="text-xs text-faint">
                  프레젠테이션 링크가 아닙니다 (…/presentation/d/…)
                </span>
              )}
            </div>

            {result && (
              <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm">
                <Tag tone="ok">읽음</Tag>
                <b>{result.title}</b>
                <span className="text-dim">
                  · 슬라이드 {result.slides}장 중 파트 {result.groups}개 · 단계 {result.found}개
                  발견
                </span>
                {result.found === 0 && (
                  <Tag tone="warn">파트 표지나 번호 도식을 찾지 못했습니다 — 원문 텍스트를 확인하세요</Tag>
                )}
              </p>
            )}
            {err && <Callout tone="bad">{err}</Callout>}
          </Panel>
        ) : (
          <Panel>
            <p className="mb-2.5 text-xs leading-relaxed text-dim">
              형식은 <code>STEPS_SCHEMA.md</code> 참고. 단계 목록만 담고 등급·볼륨은 넣지 않습니다.
            </p>
            <DropZone onFile={takeStepsFile} />
            {err && <Callout tone="bad">{err}</Callout>}
          </Panel>
        )}
      </Section>

      {cands && (
        <Review
          cands={cands}
          setCands={setCands}
          onApply={() => {
            try {
              onSteps(candidatesToSteps(cands, meta));
              setCands(null);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
          onExport={() => {
            const s = candidatesToSteps(cands, meta);
            download(
              `steps_${s.project || "무제"}_${s.doc_type}.json`,
              JSON.stringify(s, null, 1),
              "application/json",
            );
          }}
        />
      )}
    </>
  );
}

/** 2-1. 도식이 아닌 슬라이드를 빼고 파트 키를 지정한다. */
function Review({
  cands,
  setCands,
  onApply,
  onExport,
}: {
  cands: Candidate[];
  setCands: (c: Candidate[]) => void;
  onApply: () => void;
  onExport: () => void;
}) {
  const patch = (idx: number, p: Partial<Candidate>) =>
    setCands(cands.map((c) => (c.idxs[0] === idx ? { ...c, ...p } : c)));

  // 접어 둔 슬라이드(홈 화면 앞·표지·개요·목차·번호 없음)는 아래 접이식으로 내린다
  const body = cands.filter((c) => !c.skip);
  const folded = cands.filter((c) => c.skip);

  const on = body.filter((c) => c.include && c.steps.length);
  const n = on.reduce((a, c) => a + c.steps.length, 0);
  const noKey = on.filter((c) => !c.part_key.trim()).length;

  return (
    <Section n="2-1" title="뽑아낸 단계 확인" hint="— 파트를 지정하고 아닌 슬라이드는 빼세요">
      <Callout tone="warn">
        <b>여기서 단계 수가 맞는지부터 봐야 합니다.</b> 파트 표지마다 한 칸이고, 표지 뒤의 상세
        슬라이드는 그 파트에 흡수했습니다. 표지에 적힌 <b>기획서 볼륨</b>이 칸에 붙으니 산출
        결과와 눈으로 대조하세요. 파트가 아닌 것이 남아 있으면 체크를 풀어 빼고, 같은 파트가 여러
        칸이면 파트 키를 같게 적으면 합쳐집니다.
      </Callout>

      <div className="space-y-2">
        {body.map((c) => (
          <div
            key={c.idxs[0]}
            className={
              "rounded-lg border border-line bg-surface p-3 transition-opacity " +
              (c.include ? "" : "opacity-50")
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Check checked={c.include} onChange={(v) => patch(c.idxs[0], { include: v })}>
                <b>{c.title}</b>
              </Check>
              <span className="text-xs text-faint tnum">슬라이드 {slideRange(c.idxs)}</span>
              <Tag tone={c.steps.length ? "dev" : "plain"}>{c.steps.length}단계</Tag>
              {c.doc_volume && <Tag tone="des">기획서 볼륨 {c.doc_volume}</Tag>}
              <input
                className="nx-input w-[150px] py-1"
                placeholder="파트 키 (예: art)"
                value={c.part_key}
                onChange={(e) => patch(c.idxs[0], { part_key: e.target.value })}
              />
              <input
                className="nx-input w-[180px] py-1"
                placeholder="파트명"
                value={c.part_name}
                onChange={(e) => patch(c.idxs[0], { part_name: e.target.value })}
              />
              {!c.include && <span className="text-xs text-faint">제외됨</span>}
            </div>

            {c.steps.length ? (
              <div className="mt-2 space-y-0.5">
                {/* 여러 장을 합치면 원본 번호가 겹칠 수 있어 자리로 키를 만든다 */}
                {c.steps.map((s, i) => (
                  <div key={`${s.no}-${i}`} className="flex gap-2 text-sm">
                    <span className="w-6 shrink-0 text-right text-faint tnum">{s.no}</span>
                    <span>
                      {s.text}
                      {s.note && <span className="ml-1.5 text-xs text-faint">{s.note}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-faint">
                번호가 붙은 단계를 찾지 못했습니다. 도식이 이미지일 수 있습니다.
              </p>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-faint hover:text-dim">
                슬라이드 원문 텍스트
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-notion bg-hover px-2 py-1.5 text-xs text-dim">
                {c.lines.join("\n") || "(텍스트 없음)"}
              </pre>
            </details>
          </div>
        ))}
      </div>

      {body.length === 0 && (
        <Callout tone="bad">
          파트로 볼 슬라이드가 없습니다. 표지·도식이 이미지일 수 있습니다 — 아래에서 되살리거나{" "}
          <code>steps.json</code> 으로 넣으세요.
        </Callout>
      )}

      {folded.length > 0 && (
        <details className="mt-2.5">
          <summary className="cursor-pointer text-xs text-faint hover:text-dim">
            접어 둔 슬라이드 {folded.length}장 — 잘못 접혔다면 되살릴 수 있습니다
          </summary>
          <div className="mt-1.5 space-y-1">
            {folded.map((c) => (
              <div key={c.idxs[0]} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="shrink-0 text-faint tnum">슬라이드 {slideRange(c.idxs)}</span>
                <span className="min-w-0 truncate text-dim">{c.title}</span>
                <Tag tone="plain">{c.skip}</Tag>
                {c.steps.length > 0 && <span className="text-faint">번호 {c.steps.length}개</span>}
                <Button
                  small
                  onClick={() => patch(c.idxs[0], { skip: null, include: c.steps.length > 0 })}
                >
                  되살리기
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button primary disabled={!n} onClick={onApply}>
          이 단계 목록으로 산출하기
        </Button>
        <Button onClick={onExport}>steps.json 으로 저장</Button>
        <span className="text-xs text-dim">
          사용할 묶음 <b className="text-ink">{on.length}</b>개 · 단계{" "}
          <b className="text-ink">{n}</b>개
        </span>
        {noKey > 0 && <Tag tone="warn">파트 키 미입력 {noKey}</Tag>}
      </div>
    </Section>
  );
}
