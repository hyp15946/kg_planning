"use client";

/**
 * 화면 전체의 상태를 여기서 들고 있다. 메인은 볼륨 산출 하나이고,
 * 과거 기록·데이터는 보조 화면으로만 연다.
 *
 * 부팅 순서: 도메인 확인 → 관문 통과 시 드라이브에서 자동 로드.
 *
 * 로그인은 GIS 토큰 모델(팝업)이라 페이지를 떠나지 않는다. 리디렉션이 없으므로
 * ?code= 처리도, 리디렉션 URI 등록도 없다 — lib/gauth.ts 참고.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALLOWED_DOMAIN, DATA_FILE, DATA_FOLDER, FEATURE_DESIGN } from "@/lib/config";
import { DataSource } from "@/lib/datasource";
import type { DriveFile } from "@/lib/drive";
import { buildCsv, buildExport, download, today } from "@/lib/exports";
import { GAuth } from "@/lib/gauth";
import type {
  DesignState,
  DevMark,
  DocType,
  IncidentalState,
  ProjectsDb,
  StepsDoc,
} from "@/lib/types";
import { KEYS, store } from "@/lib/store";
import { designDefault, devKey, initialDevMark, totals } from "@/lib/volume";
import { DesignVolume } from "@/components/DesignVolume";
import { DevVolume } from "@/components/DevVolume";
import { DocSection } from "@/components/DocSection";
import { DropZone, Gate } from "@/components/Gate";
import { Incidental } from "@/components/Incidental";
import { PastDb } from "@/components/PastDb";
import { Result } from "@/components/Result";
import { StepSource } from "@/components/StepSource";
import { Button, Callout, Panel, Tag } from "@/components/ui";

type View = "calc" | "db" | "data";

export default function Page() {
  const [booted, setBooted] = useState(false);
  const [gated, setGated] = useState(true);
  const [gateErr, setGateErr] = useState("");
  const [email, setEmail] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  const [db, setDb] = useState<ProjectsDb | null>(null);
  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);
  const [dataErr, setDataErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("calc");

  const [project, setProject] = useState("");
  const [docType, setDocType] = useState<DocType>("detail");
  const [docUrl, setDocUrl] = useState("");

  const [steps, setSteps] = useState<StepsDoc | null>(null);
  const [marks, setMarks] = useState<Record<string, DevMark>>({});
  const [design, setDesign] = useState<Record<string, DesignState>>({});
  const [incidental, setIncidental] = useState<Record<string, IncidentalState>>({});
  // 기본은 「판단 필요」만 보인다 — 사람이 골라야 하는 단계에 먼저 눈이 가게
  const [onlyUndecided, setOnlyUndecided] = useState(true);

  const tables = db?.grade_tables ?? null;
  // ?? [] 를 그대로 쓰면 렌더마다 새 배열이 되어 아래 useMemo 가 매번 다시 돈다
  const parts = useMemo(() => steps?.parts ?? [], [steps]);
  const countbarRef = useRef<HTMLDivElement | null>(null);

  /* ── 기준 데이터 ─────────────────────────────────────── */

  const loadFromDrive = useCallback(async () => {
    setDataErr("");
    setLoading(true);
    try {
      const { payload, file } = await DataSource.fromDrive();
      setDriveFile(file);
      setDb(payload);
      setView("calc");
      return true;
    } catch (e) {
      setDriveFile(null);
      setDataErr(e instanceof Error ? e.message : String(e));
      setView("data");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const takeFile = useCallback(async (f: File) => {
    try {
      const payload = await DataSource.fromFile(f);
      setDriveFile(null);
      setDb(payload);
      setGated(false);
      setDataErr("");
      setGateErr("");
      setView("calc");
    } catch (e) {
      const m = "불러오지 못했습니다 — " + (e instanceof Error ? e.message : String(e));
      setDataErr(m);
      setGateErr(m);
    }
  }, []);

  /* ── 부팅 ────────────────────────────────────────────── */

  /** 로그인 상태를 다시 읽어 관문을 통과시키고, 필요하면 데이터를 받아온다. */
  const settle = useCallback(async () => {
    // 도메인이 다른 계정이면 토큰을 버린다.
    // 진짜 차단은 OAuth 「내부」 대상과 드라이브 공유 권한이 하고, 이건 안내다.
    if (GAuth.token() && !GAuth.allowed()) {
      const u = GAuth.user();
      GAuth.clear();
      DataSource.clear();
      setGateErr(
        `${u?.email || "이 계정"} 으로는 사용할 수 없습니다. @${ALLOWED_DOMAIN} 계정으로 로그인하세요.`,
      );
    }

    const ok = GAuth.allowed();
    setLoggedIn(ok);
    setEmail(GAuth.user()?.email ?? "");

    // 예비 경로로 이미 넣어 둔 세션이면 그대로 이어서 쓴다
    const cached = DataSource.cached();
    let usedCache = false;
    if (cached) {
      try {
        DataSource.validate(cached);
        setDb(cached);
        usedCache = true;
      } catch {
        DataSource.clear();
      }
    }

    setGated(!ok && !usedCache);
    setBooted(true);
    if (ok && !usedCache) await loadFromDrive();
  }, [loadFromDrive]);

  /**
   * 부팅. 로그인 여부와 세션 데이터는 브라우저에만 있으므로 마운트 후에 읽는다 —
   * 정적 내보내기라 빌드 시점 렌더에는 window·storage 가 없고, 렌더 중에 읽으면
   * 하이드레이션 불일치가 난다.
   * (set-state-in-effect 는 연쇄 렌더를 막으려는 규칙인데, 브라우저 전용 상태를
   *  마운트 후 한 번 읽는 것은 그 규칙이 겨냥한 경우가 아니다.)
   */
  useEffect(() => {
    store.del(KEYS.legacyVerifier, true); // 예전 PKCE 흐름이 남긴 값을 치운다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회, 위 주석 참고
    void settle();
  }, [settle]);

  /* ── 단계 목록을 새로 받으면 확정값을 초기화한다 ────────── */

  const applySteps = useCallback(
    (payload: StepsDoc) => {
      if (!payload || !Array.isArray(payload.parts))
        throw new Error("parts 배열이 없습니다. STEPS_SCHEMA.md 형식을 확인하세요.");
      for (const p of payload.parts)
        if (!Array.isArray(p.steps))
          throw new Error(`파트 '${p.part_key || "?"}' 에 steps 배열이 없습니다.`);
      if (!db?.grade_tables)
        throw new Error(
          "기준 데이터가 없습니다. 「데이터」 → 「드라이브에서 다시 불러오기」 를 눌러 주세요. 등급표가 필요합니다.",
        );

      setSteps(payload);
      // 후보가 단독일 때만 초기값을 넣는다. 둘 이상이면 미정으로 남긴다 (F3a-2).
      const m: Record<string, DevMark> = {};
      for (const p of payload.parts)
        for (const st of p.steps) m[devKey(p.part_key, st.no)] = initialDevMark(st);
      setMarks(m);
      setDesign(Object.fromEntries(payload.parts.map((p) => [p.part_key, designDefault()])));
      setIncidental(
        Object.fromEntries(
          Object.entries(db.incidental_reference?.items ?? {}).map(([k, v]) => [
            k,
            {
              on: false,
              // 고정값 금지 항목은 0 에서 시작한다 — 사람이 넣게 만든다
              dev: v.fixed_value_forbidden ? 0 : (v.dev?.median ?? 0),
              // 디자인은 화면에서 숨긴 동안 0 — 안 보이는 값이 내보내기에 섞이면 안 된다
              design: FEATURE_DESIGN && !v.fixed_value_forbidden ? (v.design?.median ?? 0) : 0,
            },
          ]),
        ),
      );
      if (payload.project) setProject(payload.project);
      if (payload.doc_type) setDocType(payload.doc_type);
      if (payload.doc_url) setDocUrl(payload.doc_url);
      requestAnimationFrame(() =>
        countbarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    },
    [db],
  );

  const setMark = (key: string, patch: Partial<DevMark>) =>
    setMarks((m) => ({ ...m, [key]: { ...(m[key] ?? { gradeId: null, confirmed: false }), ...patch } }));

  const setDesignPart = (partKey: string, patch: Partial<DesignState>) =>
    setDesign((d) => ({ ...d, [partKey]: { ...(d[partKey] ?? designDefault()), ...patch } }));

  const setIncidentalItem = (key: string, patch: Partial<IncidentalState>) =>
    setIncidental((s) => ({ ...s, [key]: { ...(s[key] ?? { on: false, dev: 0, design: 0 }), ...patch } }));

  const t = useMemo(
    () => totals(parts, marks, design, incidental, tables),
    [parts, marks, design, incidental, tables],
  );

  const exportInput = () => ({
    steps: steps!,
    marks,
    design,
    incidental,
    tables,
    project,
    docType,
    docUrl,
    today: today(),
  });

  /* ── 렌더 ────────────────────────────────────────────── */

  if (!booted)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-faint">불러오는 중…</div>
    );

  if (gated)
    return (
      <Gate error={gateErr} onError={setGateErr} onFile={takeFile} onSignedIn={settle} />
    );

  if (view === "db" && db) return <PastDb db={db} onBack={() => setView("calc")} />;

  return (
    <div className="mx-auto max-w-content px-5 py-6">
      {/* 헤더 */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">기획 볼륨 산출</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-dim">
          {email && <span className="font-medium text-ink">{email}</span>}
          <span>
            {db
              ? `기준 데이터 — 프로젝트 ${db.projects.length} · 파트 ${db.projects.reduce((s, p) => s + p.parts.length, 0)}`
              : loading
                ? "드라이브에서 불러오는 중…"
                : "기준 데이터 없음"}
          </span>
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => setView(db ? "db" : "data")}
          >
            과거 기록 보기
          </button>
          <button type="button" className="hover:text-ink" onClick={() => setView("data")}>
            데이터
          </button>
          {loggedIn && (
            <Button
              small
              onClick={() => {
                GAuth.signOut();
                DataSource.clear();
                location.reload();
              }}
            >
              연결 해제
            </Button>
          )}
        </div>
      </header>

      {view === "data" && (
        <div className="mb-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-sm">기준 데이터</b>
                <span className="ml-2 text-xs text-dim">
                  projects.json — 등급표 · 과거 실적 · 기획서 링크. 리포에 포함되지 않습니다
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  primary
                  disabled={loading}
                  onClick={() => {
                    DataSource.clear();
                    loadFromDrive();
                  }}
                >
                  {loading ? "불러오는 중…" : "드라이브에서 다시 불러오기"}
                </Button>
                <Button onClick={() => setView("calc")}>닫기</Button>
              </div>
            </div>

            <p className="mt-2 text-xs text-dim">
              {driveFile
                ? `드라이브 — ${driveFile.name ?? DATA_FILE} · ${driveFile.via ?? ""}${
                    driveFile.modifiedTime
                      ? ` · 수정 ${String(driveFile.modifiedTime).slice(0, 10)}`
                      : ""
                  }`
                : db
                  ? "직접 넣은 파일에서 읽었습니다."
                  : `드라이브의 「${DATA_FOLDER}」 폴더에서 ${DATA_FILE} 을 찾습니다.`}
            </p>

            {dataErr && <Callout tone="bad">{dataErr}</Callout>}

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-faint hover:text-dim">
                드라이브를 쓸 수 없을 때 — 파일을 직접 넣기
              </summary>
              <div className="mt-2">
                <DropZone onFile={takeFile} />
              </div>
            </details>
          </Panel>

          <Callout tone="info">
            데이터는 배포물에 포함되지 않고 <b>드라이브에서 로그인한 계정의 권한으로</b> 읽습니다.
            탭이 열려 있는 동안만 브라우저에 보관되고 탭을 닫으면 사라집니다.
          </Callout>
        </div>
      )}

      <DocSection
        db={db}
        project={project}
        setProject={setProject}
        docType={docType}
        setDocType={setDocType}
        docUrl={docUrl}
        setDocUrl={setDocUrl}
      />

      <StepSource
        docUrl={docUrl}
        project={project}
        docType={docType}
        loggedIn={loggedIn}
        onSteps={applySteps}
        onRelogin={() =>
          GAuth.signIn((err) => {
            setDataErr(err ?? "");
            if (!err) void settle();
          })
        }
      />

      {steps && (
        <>
          {/* 단계 수 배너 — F3a 안전장치. 볼륨만 보면 틀린 것을 알 수 없다. */}
          <div
            ref={countbarRef}
            className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border-2 border-dev bg-surface px-3.5 py-3"
          >
            <span className="mr-1 font-semibold text-dev">단계 수 총 {t.steps}</span>
            {parts.map((p) => (
              <span
                key={p.part_key}
                className="rounded-notion bg-dev-soft px-2 py-1 text-xs text-dev"
              >
                {p.part_name || p.part_key} <b className="text-sm tnum">{p.steps.length}</b>단계
              </span>
            ))}
          </div>
          <Callout tone="warn">
            <b>먼저 단계 수부터 확인하세요.</b> 볼륨만 보면 틀린 것을 알 수 없지만, 「만들기 =
            4단계」라고 적혀 있으면 담당자가 즉시 «19단계인데?» 라고 잡아낼 수 있습니다. 단계 수가
            틀렸다면 등급을 만지지 말고 단계 목록부터 고치세요.
          </Callout>

          {/* 산출 결과를 단계 목록 바로 다음에 둔다 — 합계·경고부터 보고,
              판단이 필요한 단계만 아래 개발 볼륨 표에서 마저 고른다 */}
          <Result
            parts={parts}
            marks={marks}
            design={design}
            incidental={incidental}
            tables={tables}
            projects={db?.projects ?? null}
            project={project}
            onExportJson={() => {
              const d = buildExport(exportInput());
              download(
                `볼륨산출_${d.project || "무제"}_${d.doc_type}.json`,
                JSON.stringify(d, null, 1),
                "application/json",
              );
            }}
            onExportCsv={() => {
              const d = buildExport(exportInput());
              download(
                `볼륨산출_${d.project || "무제"}_단계내역.csv`,
                buildCsv(d),
                "text/csv;charset=utf-8",
              );
            }}
          />

          <DevVolume
            parts={parts}
            marks={marks}
            setMark={setMark}
            tables={tables}
            projects={db?.projects ?? null}
            onlyUndecided={onlyUndecided}
            setOnlyUndecided={setOnlyUndecided}
            onConfirmAll={() =>
              setMarks((m) =>
                Object.fromEntries(
                  Object.entries(m).map(([k, v]) => [k, { ...v, confirmed: !!v.gradeId }]),
                ),
              )
            }
            onUnconfirmAll={() =>
              setMarks((m) =>
                Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, confirmed: false }])),
              )
            }
            pending={t.pending}
            undecided={t.undecided}
            steps={t.steps}
          />

          {/* 디자인 볼륨 산출은 미완성이라 숨겨 둔다 — lib/config.ts FEATURE_DESIGN */}
          {FEATURE_DESIGN && (
            <DesignVolume parts={parts} design={design} setDesign={setDesignPart} />
          )}

          <Incidental
            items={db?.incidental_reference?.items ?? {}}
            state={incidental}
            setState={setIncidentalItem}
          />
        </>
      )}

      {!steps && db && (
        <p className="mt-8 text-center text-sm text-faint">
          단계 목록을 만들면 <Tag tone="dev">3~5</Tag> 산출 항목이 여기에 나타납니다.
        </p>
      )}
    </div>
  );
}
