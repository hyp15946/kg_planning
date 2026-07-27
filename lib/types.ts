/** projects.json / steps.json 의 형식. STEPS_SCHEMA.md 와 대응한다. */

export type DocType = "rough" | "detail";

export type StepKind =
  | "game"
  | "interaction"
  | "menu"
  | "cutscene"
  | "contents"
  | "sticker"
  | null;

export interface Step {
  no: number;
  text: string;
  kind?: StepKind;
  /** 게임일 때만. 모르면 null — 추측하지 않는다 (F3a-2). */
  moves_map?: boolean | null;
  note?: string;
}

export interface StepPart {
  part_key: string;
  part_name?: string;
  steps: Step[];
}

export interface StepsDoc {
  schema?: string;
  project?: string;
  doc_type?: DocType;
  doc_url?: string;
  doc_title?: string;
  extracted_at?: string;
  parts: StepPart[];
}

/** 등급표 4.3 의 한 줄. */
export interface Grade {
  id: string;
  label: string;
  volume: number;
  basis?: string;
}

export interface GradeTables {
  dev: Grade[];
  /** 디자인은 4.4 가산 규칙을 코드로 계산하므로 등급표를 쓰지 않는다. */
  design?: Grade[];
}

export interface IncidentalStat {
  n: number;
  median: number;
  mode: number;
  mode_count: number;
  min: number;
  max: number;
}

export interface IncidentalItem {
  label: string;
  basis?: string;
  /** 고정값을 쓰면 안 되는 항목 (표준 미확정). */
  fixed_value_forbidden?: boolean;
  dev?: IncidentalStat | null;
  design?: IncidentalStat | null;
}

export interface ProjectPart {
  part_key: string;
  part_name?: string | null;
  dev_volume: number | null;
  design_volume: number | null;
  dev_actual_days?: number | null;
  design_actual_days?: number | null;
  dev_status?: string | null;
  design_status?: string | null;
  is_qa?: boolean;
}

export interface ProjectDocs {
  rough?: string;
  detail?: string;
  rough_round?: string;
  rough_title?: string;
  detail_title?: string;
  folder?: string;
  confidence?: "high" | "low" | string;
  missing_reason?: string;
}

export interface TotalCheckEntry {
  sheet_total: number | null;
  diff: number | null;
}

export interface Project {
  id: string;
  name: string;
  match_key: string;
  aliases?: string[];
  status: string;
  volume_format: "new" | "old" | string;
  dev_volume: number | null;
  design_volume: number | null;
  has_dev_volume_column?: boolean;
  has_design_volume_column?: boolean;
  name_collision?: boolean;
  source: { sheet: string };
  total_check?: { dev?: TotalCheckEntry; design?: TotalCheckEntry };
  meta?: Record<string, string>;
  docs?: ProjectDocs;
  parts: ProjectPart[];
}

export interface ProjectsDb {
  projects: Project[];
  grade_tables?: GradeTables;
  incidental_reference?: { items?: Record<string, IncidentalItem> };
}

/* ── 사람이 확정한 값 ───────────────────────────────────────── */

/** 개발 등급 선택 상태. gradeId 가 null 이면 «미정» — 합계에 들어가지 않는다. */
export interface DevMark {
  gradeId: string | null;
  confirmed: boolean;
}

/** 디자인 가산 폼 상태 (4.4). */
export interface DesignState {
  ingame: boolean;
  ingameShift: boolean;
  ingameBigMap: boolean;
  gameKinds: number;
  popups: number;
  deco: boolean;
  decoCats: number;
  decoCarry: boolean;
  intro: "none" | "full" | "spine";
  chars: number;
  reward: boolean;
  rewardBg: "none" | "x1_5" | "x2";
  illust: boolean;
}

export interface IncidentalState {
  on: boolean;
  dev: number;
  design: number;
}

/** 슬라이드에서 뽑은 단계 후보 (사람이 검토 전). */
export interface Candidate {
  idx: number;
  title: string;
  lines: string[];
  include: boolean;
  part_key: string;
  part_name: string;
  steps: Step[];
}
