/**
 * 기준 데이터 로딩 — 이 객체만 교체하면 방식을 바꿀 수 있다.
 *
 * 로그인한 사람만 보게 하려고 세션 저장소를 쓴다. 탭을 닫으면 사라지고
 * 드라이브에서 자동으로 다시 받으므로 오래 남겨둘 이유가 없다.
 * 부수 효과로 projects.json 을 덮어쓰면 모두가 다음 접속에 최신값을 본다.
 */
import { Drive, type DriveFile } from "./drive";
import { KEYS, store } from "./store";
import type { ProjectsDb } from "./types";

export const DataSource = {
  cached(): ProjectsDb | null {
    try {
      const s = store.get(KEYS.projects, true);
      return s ? (JSON.parse(s) as ProjectsDb) : null;
    } catch {
      return null;
    }
  },

  keep(p: ProjectsDb) {
    store.set(KEYS.projects, JSON.stringify(p), true);
  },

  async fromFile(file: File): Promise<ProjectsDb> {
    const p = JSON.parse(await file.text()) as ProjectsDb;
    this.validate(p);
    this.keep(p);
    return p;
  },

  async fromDrive(): Promise<{ payload: ProjectsDb; file: DriveFile }> {
    const file = await Drive.locate();
    const p = JSON.parse(await Drive.download(file.id)) as ProjectsDb;
    this.validate(p);
    this.keep(p);
    return { payload: p, file };
  },

  clear() {
    store.del(KEYS.projects, true);
    store.del(KEYS.projects); // 이전 버전이 localStorage 에 남긴 것도 지운다
  },

  validate(p: ProjectsDb | null) {
    if (!p || !Array.isArray(p.projects)) throw new Error("projects 배열이 없습니다.");
  },
};
