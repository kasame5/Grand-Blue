/**
 * 领域模型。
 *
 * 设计约束（见 docs/adr）：
 * - 判定只吃 Snapshot，不吃数据库；规则内部永不查询。
 * - Snapshot 只读；判定多少次结果都一样。
 * - “现在几点”通过 EvalContext 显式传入，规则内部禁止读系统时间。
 */

export type Level = 'block' | 'warn' | 'info';

export type ManifestStatus = 'draft' | 'confirmed' | 'locked' | 'departed' | 'closed';

export type DiverLevel = 'OW' | 'AOW' | 'RESCUE';

/**
 * 教练 / 潜导的带队资质等级。
 * 这是「能带谁、能带多深」的等级，与潜水员等级（OW/AOW/RESCUE）是两套体系，不能互相映射。
 */
export type InstructorRating = 'DIVEMASTER' | 'OWSI' | 'AOWSI' | 'SPECIALTY_INSTRUCTOR';

/** 教练等级的中文名，界面直接用 */
export const RATING_LABEL: Record<InstructorRating, string> = {
  DIVEMASTER: '潜水长',
  OWSI: '开放水域教练',
  AOWSI: '进阶教练',
  SPECIALTY_INSTRUCTOR: '专长教练',
};

/** 持证等级对应的最大深度（米），国际通行：OW 18 / AOW 30 */
export const LEVEL_MAX_DEPTH: Record<DiverLevel, number> = {
  OW: 18,
  AOW: 30,
  RESCUE: 30,
};

/** 取得深潜专长后的最大深度 */
export const DEEP_MAX_DEPTH = 40;

/** 某个潜水员能下的最大深度：取持证等级与专长的较高者 */
export function maxDepthOf(diver: Diver): number {
  return diver.specialties.includes('深潜') ? DEEP_MAX_DEPTH : LEVEL_MAX_DEPTH[diver.level];
}

export type Specialty = '深潜' | '夜潜' | '沉船' | '水下摄影';

/** 规则判定的对象类型 —— Findings 靠它定位到界面上的某一行 */
export type SubjectKind = 'trip' | 'vessel' | 'group' | 'person' | 'tank';

export interface Subject {
  kind: SubjectKind;
  id: string;
  label: string;
}

export interface Finding {
  ruleId: string;
  level: Level;
  subject: Subject;
  /** 已渲染的中文说明，界面直接用 */
  message: string;
  /** 结构化事实，便于界面画对比条（如 12/11） */
  fact?: Record<string, number | string>;
  /** 建议动作 —— 从“判定”走向“处置”的那一步 */
  suggestion?: string;
}

export interface EvalSummary {
  block: number;
  warn: number;
  info: number;
}

export interface EvalResult {
  findings: Finding[];
  summary: EvalSummary;
  /** 阻断为 0 即可确认 */
  canConfirm: boolean;
  /** 阻断为 0 且离港清单完成 */
  canDepart: boolean;
  evaluatedAt: string;
}

// ---------------------------------------------------------------- 实体

export interface SeaCondition {
  level: 'good' | 'fair' | 'poor';
  confirmedAt: string | null;
  confirmedBy: string;
}

export interface Trip {
  id: string;
  /** 船次号，如 TR-20261108-01 */
  code: string;
  date: string;
  diveSite: string;
  /** 潜点计划深度（米）—— 决定谁能下、谁能带 */
  depth: number;
  /** 潜点最低持证等级 */
  requiredLevel: DiverLevel;
  /** 潜点要求的专长，如 ['深潜'] */
  requiredSpecialties: Specialty[];
  /** 集合时刻（ISO） */
  meetAt: string;
  /** 计划离港时刻（ISO） */
  departAt: string;
  seaCondition: SeaCondition | null;
}

export interface Vessel {
  id: string;
  code: string;
  name: string;
  /** 核定载客（含船员） */
  capacity: number;
  crewCount: number;
}

/** 到场状态：未处理 / 已签到 / 已弃权（弃权 = 从船单移出） */
export type Attendance = 'pending' | 'checked-in' | 'absent';

export interface Diver {
  id: string;
  code: string;
  name: string;
  level: DiverLevel;
  specialties: Specialty[];
  checkInAt: string | null;
  attendance: Attendance;
}

export interface Instructor {
  id: string;
  code: string;
  name: string;
  /**
   * 带队资质等级。
   * 注意：这是「能带队/能教学」的等级，不是潜水员等级 —— 两者不能混。
   */
  rating: InstructorRating;
  /** 能带队的最大深度（米） */
  maxSupervisionDepth: number;
  /** 能带的专长 */
  specialties: Specialty[];
  /** 当日已完成的潜水（用于疲劳判定） */
  todayDives: Array<{ start: string; end: string }>;
  checkInAt: string | null;
}

export type TankStatus = 'ok' | 'maintenance' | 'retired';

export interface Tank {
  id: string;
  code: string;
  type: 'AL80' | 'STEEL12';
  pressure: number;
  /** 检验有效期（YYYY-MM-DD），早于出航日即不适航 */
  inspectionExpiry: string;
  status: TankStatus;
}

export interface Group {
  id: string;
  code: string;
  /** 分组挂在具体船只上 —— 超载与配比都按船/按组校验 */
  vesselId: string;
  instructorId: string | null;
  memberIds: string[];
  tankIds: string[];
}

/** 当日分配事实：用于 R-08 判定“同一人同日多船次” */
export interface DayAssignment {
  personId: string;
  tripId: string;
  groupId: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ManifestRef {
  id: string;
  /** 船单号，如 MO-20261108-01 */
  code: string;
  status: ManifestStatus;
  versionNo: number;
}

/**
 * 一次判定的完整输入。
 *
 * 它不是数据库视图，而是一份“装好的只读事实”：
 * 判定开始时该有的都在，判定过程中不再取任何外部数据。
 */
export interface Snapshot {
  trip: Trip;
  manifest: ManifestRef;
  vessels: Vessel[];
  divers: Diver[];
  instructors: Instructor[];
  tanks: Tank[];
  groups: Group[];
  /** 当日其他船次的分配，仅 R-08 使用 */
  dayAssignments: DayAssignment[];
  checklist: ChecklistItem[];
}

export interface EvalContext {
  /** 显式传入的“现在”，规则内部不允许读系统时间 */
  now: string;
}

// ---------------------------------------------------------------- 便捷查询

export function diverById(snap: Snapshot, id: string): Diver | undefined {
  return snap.divers.find((d) => d.id === id);
}

export function instructorById(snap: Snapshot, id: string | null): Instructor | undefined {
  if (!id) return undefined;
  return snap.instructors.find((i) => i.id === id);
}

export function tankById(snap: Snapshot, id: string): Tank | undefined {
  return snap.tanks.find((t) => t.id === id);
}

export function vesselById(snap: Snapshot, id: string): Vessel | undefined {
  return snap.vessels.find((v) => v.id === id);
}

export function groupById(snap: Snapshot, id: string): Group | undefined {
  return snap.groups.find((g) => g.id === id);
}

/** 某一艘船上挂了哪些组 */
export function groupsOfVessel(snap: Snapshot, vesselId: string): Group[] {
  return snap.groups.filter((g) => g.vesselId === vesselId);
}
