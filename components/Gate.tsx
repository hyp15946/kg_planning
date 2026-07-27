"use client";

/**
 * 로그인 관문.
 *
 * 이 화면이 «막는» 것은 아니다. 실제 차단은 OAuth 「내부」 대상과
 * 드라이브 공유 권한이 하고, 여기서는 잘못된 계정으로 왔을 때 알려준다.
 * — OAUTH_SETUP.md 「접근 통제가 어디서 일어나는가」
 */
import { useEffect, useState } from "react";
import { ALLOWED_DOMAIN, DATA_FILE, DATA_FOLDER } from "@/lib/config";
import { Drive } from "@/lib/drive";
import { GAuth } from "@/lib/gauth";
import { Button, Callout, Check, Field, Panel, Tag } from "./ui";

export function Gate({
  error,
  onError,
  onFile,
}: {
  error: string;
  onError: (m: string) => void;
  onFile: (f: File) => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [saved, setSaved] = useState<"" | "id" | "file">("");
  const [fallbackOpen, setFallbackOpen] = useState(false);

  /**
   * 브라우저 값은 마운트 뒤에 한 번 읽는다. 정적 내보내기라 빌드 시점에
   * 미리 렌더되고 그때는 window·localStorage 가 없으므로, 렌더 중에 읽으면
   * 하이드레이션 불일치가 난다.
   *
   * setState 를 하나로 묶어 리렌더가 한 번만 일어나게 한다.
   * (react-hooks/set-state-in-effect 는 연쇄 렌더를 막으려는 규칙인데,
   *  브라우저 전용 값을 마운트 후 한 번 읽는 것은 그 규칙이 겨냥한 경우가 아니다.)
   */
  const [env, setEnv] = useState({
    served: true,
    clientId: "",
    dataFile: "",
    redirect: "",
    origin: "",
    local: false,
  });
  useEffect(() => {
    const ok = GAuth.servedOverHttp();
    const cid = GAuth.clientId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회, 위 주석 참고
    setEnv({
      served: ok,
      clientId: cid,
      dataFile: Drive.fileId(),
      redirect: ok ? GAuth.redirectUri() : "",
      origin: ok ? location.origin : "",
      local: GAuth.isLocalhost(),
    });
    if (ok && !cid) setSetupOpen(true);
  }, []);

  const { served, redirect, origin, local } = env;
  const clientId = env.clientId;
  const dataFile = env.dataFile;
  const setClientId = (v: string) => setEnv((e) => ({ ...e, clientId: v }));
  const setDataFile = (v: string) => setEnv((e) => ({ ...e, dataFile: v }));

  const connect = async () => {
    try {
      onError("");
      await GAuth.begin();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setSetupOpen(true);
    }
  };

  const state = !served
    ? { text: "로컬 파일 — 로그인 불가", tone: "bad" as const }
    : clientId
      ? { text: `@${ALLOWED_DOMAIN} 계정으로 로그인하세요`, tone: "plain" as const }
      : { text: "클라이언트 ID 미설정 — 「설정」을 먼저 누르세요", tone: "warn" as const };

  return (
    <div className="mx-auto max-w-[680px] px-5 py-16">
      <div className="mb-6">
        <div className="mb-1 text-3xl">🔒</div>
        <h1 className="text-2xl font-semibold">사내 전용</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-dim">
          <b className="text-ink">@{ALLOWED_DOMAIN}</b> 계정으로 로그인해야 사용할 수 있습니다.
          기준 데이터는 구글 드라이브에서 직접 읽으며, 배포물에는 데이터가 들어 있지 않습니다.
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <Button primary onClick={connect} disabled={!served}>
            구글 계정으로 로그인
          </Button>
          <Button small onClick={() => setSetupOpen((v) => !v)}>
            설정
          </Button>
          <Tag tone={state.tone}>{state.text}</Tag>
        </div>

        {error && <Callout tone="bad">{error}</Callout>}

        {!served && (
          <Callout tone="bad">
            <b>이 파일을 컴퓨터에서 직접 열었습니다 (<code>file://</code>).</b> 구글 OAuth는
            주소가 있는 페이지에서만 동작합니다. 지금은 주소가 없어서 구글에 등록할 리디렉션 URI
            자체가 만들어지지 않습니다.
            <div className="mt-2">아래를 실행하고 <code>http://localhost:8000/</code> 로 여세요.</div>
            <pre className="mt-1.5 overflow-x-auto rounded-notion bg-page px-2 py-1.5 font-mono text-xs">
              npm run dev
            </pre>
          </Callout>
        )}

        {setupOpen && (
          <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
            <Field
              label="OAuth 클라이언트 ID"
              hint="— 각자 한 번 넣습니다. 브라우저에만 저장되고 리포에는 넣지 않습니다"
            >
              <div className="flex flex-wrap gap-2">
                <input
                  className="nx-input flex-1 min-w-[260px] font-mono text-xs"
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <Button
                  small
                  onClick={() => {
                    GAuth.setClientId(clientId);
                    setClientId(GAuth.clientId());
                    setSaved("id");
                    onError(GAuth.clientId() ? "" : "클라이언트 ID 를 입력하세요.");
                  }}
                >
                  저장
                </Button>
              </div>
              {saved === "id" && GAuth.clientId() && (
                <span className="mt-1 inline-block">
                  <Tag tone="ok">저장됨</Tag>
                </span>
              )}
            </Field>

            <div className="border-t border-line-soft pt-3">
              <div className="mb-2 text-sm font-semibold">구글 콘솔에 등록할 값</div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-xs text-dim">승인된 JavaScript 원본</div>
                  <code className="block overflow-x-auto rounded-notion bg-hover px-2 py-1.5 font-mono text-xs">
                    {origin || "(없음 — 서버로 띄워야 생깁니다)"}
                  </code>
                </div>
                <div>
                  <div className="mb-1 text-xs text-dim">승인된 리디렉션 URI</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-[220px] overflow-x-auto rounded-notion bg-hover px-2 py-1.5 font-mono text-xs">
                      {redirect || "(없음 — 서버로 띄워야 생깁니다)"}
                    </code>
                    <Button
                      small
                      disabled={!served}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(GAuth.redirectUri());
                          setSaved("file");
                          onError("");
                        } catch {
                          onError("복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.");
                        }
                      }}
                    >
                      복사
                    </Button>
                  </div>
                </div>
              </div>
              {served && (
                <p className="mt-2 text-xs text-faint">
                  {local
                    ? "지금은 로컬 서버로 열려 있습니다. 배포 후에는 배포 도메인으로 한 번 더 등록해야 합니다."
                    : "배포 도메인으로 열려 있습니다."}
                </p>
              )}
            </div>

            <div className="border-t border-line-soft pt-3">
              <Field
                label="기준 데이터 파일"
                hint="— 보통 비워 둡니다. 드라이브에서 이름으로 자동으로 찾습니다"
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    className="nx-input flex-1 min-w-[260px] font-mono text-xs"
                    placeholder="projects.json 의 드라이브 링크 또는 파일 ID"
                    value={dataFile}
                    onChange={(e) => setDataFile(e.target.value)}
                  />
                  <Button
                    small
                    onClick={() => {
                      if (!dataFile.trim()) {
                        Drive.clearFileId();
                        onError("");
                        return;
                      }
                      if (!Drive.setFileId(dataFile)) {
                        onError("드라이브 링크나 파일 ID 를 인식하지 못했습니다.");
                        return;
                      }
                      setDataFile(Drive.fileId());
                      onError("");
                    }}
                  >
                    저장
                  </Button>
                  <Button
                    small
                    onClick={() => {
                      Drive.clearFileId();
                      setDataFile("");
                    }}
                  >
                    지정 해제
                  </Button>
                </div>
              </Field>
              <p className="mt-1 text-xs text-faint">
                {dataFile
                  ? "이 파일만 씁니다. 지정 해제하면 다시 이름으로 찾습니다."
                  : `비어 있음 — 드라이브의 「${DATA_FOLDER}」 폴더에서 ${DATA_FILE} 을 찾습니다.`}
              </p>
            </div>

            <p className="border-t border-line-soft pt-3 text-xs leading-relaxed text-faint">
              설정 절차는 <code>OAUTH_SETUP.md</code>. 콘솔 메뉴는{" "}
              <b>Google Auth Platform → Clients</b> 입니다. <b>Slides API 와 Drive API 를 모두</b>{" "}
              켜야 하고, 스코프는 <code>presentations.readonly</code> · <code>drive.readonly</code> ·{" "}
              <code>openid</code> · <code>email</code> 입니다.
            </p>
          </div>
        )}
      </Panel>

      {/* 드라이브를 쓸 수 없을 때의 예비 경로 */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setFallbackOpen((v) => !v)}
          className="text-xs text-faint hover:text-dim"
        >
          {fallbackOpen ? "▾" : "▸"} 드라이브를 쓸 수 없을 때 — projects.json 을 직접 넣기
        </button>
        {fallbackOpen && (
          <div className="mt-2">
            <p className="mb-2 text-xs leading-relaxed text-faint">
              이미 파일을 가지고 있는 경우의 예비 경로입니다. 파일은 브라우저 밖으로 나가지 않습니다.
            </p>
            <DropZone onFile={onFile} />
          </div>
        )}
      </div>
    </div>
  );
}

/** 드래그&드롭 + 파일 선택. */
export function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [hot, setHot] = useState(false);
  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault();
        setHot(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setHot(true);
      }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHot(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={
        "block cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors " +
        (hot ? "border-dev bg-dev-soft text-dev" : "border-line text-dim hover:bg-hover")
      }
    >
      <input
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      여기로 <b>projects.json</b> 을 끌어다 놓거나 눌러서 선택
    </label>
  );
}

export { Check };
