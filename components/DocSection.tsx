"use client";

/** 1. 기획서 — 어느 문서에서 뽑은 단계인지 기록한다. */
import { useState } from "react";
import type { DocType, ProjectsDb } from "@/lib/types";
import { pkey } from "@/lib/volume";
import { Button, Field, Panel, Section, Tag } from "./ui";

export function DocSection({
  db,
  project,
  setProject,
  docType,
  setDocType,
  docUrl,
  setDocUrl,
}: {
  db: ProjectsDb | null;
  project: string;
  setProject: (v: string) => void;
  docType: DocType;
  setDocType: (v: DocType) => void;
  docUrl: string;
  setDocUrl: (v: string) => void;
}) {
  const [hint, setHint] = useState<{ text: string; low?: boolean } | null>(null);

  const fillFromDb = () => {
    if (!db) {
      setHint({ text: "기준 데이터가 없습니다. 「데이터」에서 다시 불러오세요." });
      return;
    }
    const p = db.projects.find((x) => pkey(x.match_key) === pkey(project));
    if (!p) {
      setHint({ text: "과거 DB에 같은 이름의 프로젝트가 없습니다." });
      return;
    }
    const want = docType === "rough" ? p.docs?.rough : p.docs?.detail;
    if (!want) {
      setHint({ text: p.docs?.missing_reason || "해당 구분의 기획서 링크가 없습니다." });
      return;
    }
    setDocUrl(want);
    const title = docType === "rough" ? p.docs?.rough_title : p.docs?.detail_title;
    setHint({
      text: [p.docs?.folder, title].filter(Boolean).join(" · "),
      low: p.docs?.confidence === "low",
    });
  };

  return (
    <Section n="1" title="기획서" hint="— 어느 문서에서 뽑은 단계인지 기록합니다">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="프로젝트명">
            <input
              className="nx-input"
              list="projList"
              placeholder="프로젝트명"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setHint(null);
              }}
            />
            <datalist id="projList">
              {db?.projects.map((p) => (
                <option key={p.id} value={p.name.replace(/\n/g, " ")} />
              ))}
            </datalist>
          </Field>
          <Field label="문서 구분">
            <select
              className="nx-input"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
            >
              <option value="detail">상세 기획서</option>
              <option value="rough">러프 기획서</option>
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="기획서 드라이브 링크">
            <div className="flex flex-wrap gap-2">
              <input
                className="nx-input flex-1 min-w-[280px] font-mono text-xs"
                placeholder="https://docs.google.com/presentation/d/..."
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
              />
              <Button
                disabled={!/^https?:\/\//.test(docUrl.trim())}
                onClick={() => window.open(docUrl, "_blank", "noopener")}
              >
                원문 열기
              </Button>
              <Button small onClick={fillFromDb}>
                과거 DB에서 링크 채우기
              </Button>
            </div>
          </Field>
          {hint && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
              {hint.text}
              {hint.low && <Tag tone="warn">매칭 확인 필요</Tag>}
            </p>
          )}
        </div>
      </Panel>
    </Section>
  );
}
