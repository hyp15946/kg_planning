/**
 * 구글 드라이브 — 기준 데이터(projects.json)를 읽는다.
 *
 * 파일 ID를 코드에 박지 않고 폴더명 → 파일명으로 찾는다. 리포가 공개여도
 * ID가 노출되지 않고, 파일을 옮기거나 다시 올려도 코드를 고칠 일이 없다.
 * 실제 접근 통제는 드라이브 공유 권한이 한다.
 */
import { DATA_FILE, DATA_FOLDER } from "./config";
import { driveId, GAuth } from "./gauth";
import { KEYS, store } from "./store";

export interface DriveFile {
  id: string;
  name?: string;
  modifiedTime?: string;
  /** 어떻게 찾았는지 — 화면에 출처로 표시한다. */
  via?: string;
}

/** 검색 질의에 들어가는 문자열을 이스케이프한다. */
const lit = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const Drive = {
  fileId(): string {
    return store.get(KEYS.dataFile) || "";
  },
  setFileId(v: string): string | null {
    const id = driveId(v);
    if (id) store.set(KEYS.dataFile, id);
    return id;
  },
  clearFileId() {
    store.del(KEYS.dataFile);
  },

  async list(q: string): Promise<DriveFile[]> {
    // corpora=allDrives 는 공유 드라이브(팀 드라이브)에 올린 경우까지 찾기 위한 것이다.
    // 다만 그때 orderBy 가 무시되므로 정렬은 받아서 직접 한다.
    const p = new URLSearchParams({
      q,
      fields: "files(id,name,modifiedTime)",
      pageSize: "20",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    const res = await GAuth.api("https://www.googleapis.com/drive/v3/files?" + p);
    const files: DriveFile[] = (await res.json()).files ?? [];
    return files.sort((a, b) =>
      String(b.modifiedTime ?? "").localeCompare(String(a.modifiedTime ?? "")),
    );
  },

  async meta(id: string): Promise<DriveFile> {
    const p = new URLSearchParams({
      fields: "id,name,modifiedTime",
      supportsAllDrives: "true",
    });
    const res = await GAuth.api(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?` + p,
    );
    return res.json();
  },

  async download(id: string): Promise<string> {
    const res = await GAuth.api(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    );
    return res.text();
  },

  /** 폴더 → 그 안의 파일 순으로 좁혀 찾고, 없으면 이름으로 전체 검색한다. */
  async locate(): Promise<DriveFile> {
    const saved = this.fileId();
    if (saved) return { ...(await this.meta(saved)), via: "설정에서 지정한 파일" };

    const folders = await this.list(
      `mimeType='application/vnd.google-apps.folder' and name='${lit(DATA_FOLDER)}' and trashed=false`,
    );
    for (const f of folders) {
      const hits = await this.list(
        `'${f.id}' in parents and name='${lit(DATA_FILE)}' and trashed=false`,
      );
      if (hits.length) return { ...hits[0], via: `폴더 「${DATA_FOLDER}」` };
    }
    const any = await this.list(`name='${lit(DATA_FILE)}' and trashed=false`);
    if (any.length) return { ...any[0], via: "드라이브 전체에서 이름으로 찾음" };

    throw new Error(
      `드라이브에서 「${DATA_FOLDER}」 폴더의 ${DATA_FILE} 을 찾지 못했습니다. ` +
        `이 계정에 파일이 공유되어 있는지 확인하거나, 설정에서 파일 링크를 직접 지정하세요.`,
    );
  },
};
