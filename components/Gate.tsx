"use client";

/**
 * 로그인 관문.
 *
 * 이 화면이 «막는» 것은 아니다. 실제 차단은 OAuth 「내부」 대상과
 * 드라이브 공유 권한이 하고, 여기서는 잘못된 계정으로 왔을 때 알려준다.
 * — OAUTH_SETUP.md 「접근 통제가 어디서 일어나는가」
 *
 * 클라이언트 ID 는 배포용 값이 코드에 들어 있어서(lib/config.ts) 쓰는 사람이
 * 아무것도 입력하지 않는다. 아래 「개발자 설정」은 로컬 개발용 클라이언트로
 * 갈아탈 때만 쓴다.
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
  const [savedTag, setSavedTag] = useState("");
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
    ready: false,
    served: true,
    clientId: "",
    overridden: false,
    dataFile: "",
    redirect: "",
    origin: "",
  });
  useEffect(() => {
    const ok = GAuth.servedOverHttp();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회, 위 주석 참고
    setEnv({
      ready: true,
      served: ok,
      clientId: GAuth.clientId(),
      overridden: GAuth.clientIdOverridden(),
      dataFile: Drive.fileId(),
      redirect: ok ? GAuth.redirectUri() : "",
      origin: ok ? location.origin : "",
    });
  }, []);

  const { served, clientId, overridden, dataFile, redirect, origin } = env;
  const patch = (p: Partial<typeof env>) => setEnv((e) => ({ ...e, ...p }));

  const connect = async () => {
    try {
      onError("");
      await GAuth.begin();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setSetupOpen(true);
    }
  };

  const canLogin = served && !!clientId;

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
          <Button primary onClick={connect} disabled={!canLogin}>
            구글 계정으로 로그인
          </Button>
          {env.ready && !clientId && (
            <Tag tone="warn">클라이언트 ID 가 없습니다 — 개발자 설정에서 넣으세요</Tag>
          )}
          {overridden && <Tag tone="warn">개발용 클라이언트 ID 사용 중</Tag>}
        </div>

        {error && <Callout tone="bad">{error}</Callout>}

        {env.ready && !served && (
          <Callout tone="bad">
            <b>
              이 파일을 컴퓨터에서 직접 열었습니다 (<code>file://</code>).
            </b>{" "}
            구글 OAuth는 주소가 있는 페이지에서만 동작합니다. 배포된 주소로 접속하거나,
            개발 중이라면 <code>npm run dev</code> 로 띄우세요.
          </Callout>
        )}

        <p className="mt-3 text-xs leading-relaxed text-faint">
          로그인하면 기준 데이터를 드라이브에서 자동으로 불러옵니다. 따로 설정할 것이 없습니다.
        </p>
      </Panel>

      {/* 로컬 개발용 — 평소에는 접혀 있다 */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setSetupOpen((v) => !v)}
          className="text-xs text-faint hover:text-dim"
        >
          {setupOpen ? "▾" : "▸"} 개발자 설정
        </button>

        {setupOpen && (
          <Panel className="mt-2">
            <Callout tone="info">
              배포용 클라이언트 ID 는 코드에 들어 있어서 <b>보통 여기를 건드릴 일이 없습니다.</b>{" "}
              로컬에서 개발할 때 <b>localhost 가 등록된 개발용 클라이언트</b>로 갈아탈 때만 씁니다.
              여기에 넣은 값은 이 브라우저에만 저장되고 리포·배포물에는 들어가지 않습니다.
            </Callout>

            <Field label="OAuth 클라이언트 ID" hint="— 비우고 저장하면 배포용 기본값으로 돌아갑니다">
              <div className="flex flex-wrap gap-2">
                <input
                  className="nx-input flex-1 min-w-[260px] font-mono text-xs"
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => patch({ clientId: e.target.value })}
                />
                <Button
                  small
                  onClick={() => {
                    GAuth.setClientId(clientId);
                    patch({
                      clientId: GAuth.clientId(),
                      overridden: GAuth.clientIdOverridden(),
                    });
                    setSavedTag("클라이언트 ID 저장됨");
                    onError("");
                  }}
                >
                  저장
                </Button>
              </div>
            </Field>

            <div className="mt-4 border-t border-line-soft pt-3">
              <div className="mb-2 text-sm font-semibold">이 주소로 등록해야 하는 값</div>
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
                          setSavedTag("리디렉션 URI 복사됨");
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
            </div>

            <div className="mt-4 border-t border-line-soft pt-3">
              <Field
                label="기준 데이터 파일"
                hint="— 보통 비워 둡니다. 드라이브에서 이름으로 자동으로 찾습니다"
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    className="nx-input flex-1 min-w-[260px] font-mono text-xs"
                    placeholder="projects.json 의 드라이브 링크 또는 파일 ID"
                    value={dataFile}
                    onChange={(e) => patch({ dataFile: e.target.value })}
                  />
                  <Button
                    small
                    onClick={() => {
                      if (!dataFile.trim()) {
                        Drive.clearFileId();
                        setSavedTag("파일 지정 해제됨");
                        onError("");
                        return;
                      }
                      if (!Drive.setFileId(dataFile)) {
                        onError("드라이브 링크나 파일 ID 를 인식하지 못했습니다.");
                        return;
                      }
                      patch({ dataFile: Drive.fileId() });
                      setSavedTag("파일 ID 저장됨");
                      onError("");
                    }}
                  >
                    저장
                  </Button>
                  <Button
                    small
                    onClick={() => {
                      Drive.clearFileId();
                      patch({ dataFile: "" });
                      setSavedTag("파일 지정 해제됨");
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

            {savedTag && (
              <div className="mt-3">
                <Tag tone="ok">{savedTag}</Tag>
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* 드라이브를 쓸 수 없을 때의 예비 경로 */}
      <div className="mt-2">
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
