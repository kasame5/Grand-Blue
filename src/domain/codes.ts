/**
 * 区间码 / 状态码定义。
 *
 * 文档第 11 章要求“代码设计”，这里把码值集中到一处：
 * 界面、快照、审计日志都从这里取，避免各处硬编码。
 */

/** 人员区间码：1000–1999 潜水员，2000–2999 教练，3000–3999 员工 */
export const PERSON_CODE_RANGE = {
  diver: [1000, 1999],
  instructor: [2000, 2999],
  staff: [3000, 3999],
} as const;

/** 船单状态码 */
export const STATUS_CODE = {
  draft: 10,
  confirmed: 20,
  locked: 30,
  departed: 40,
  closed: 50,
} as const;

export const STATUS_LABEL: Record<keyof typeof STATUS_CODE, string> = {
  draft: '草稿',
  confirmed: '已确认',
  locked: '已锁定',
  departed: '已离港',
  closed: '已关闭',
};

/** 版本状态码（与船单状态分开，仅用于归档展示） */
export const VERSION_STATE = {
  effective: '生效',
  superseded: '失效',
  discarded: '弃用',
  frozen: '冻结',
} as const;

export type StatusCode = (typeof STATUS_CODE)[keyof typeof STATUS_CODE];

export function statusOf(code: number): keyof typeof STATUS_CODE | undefined {
  return (Object.keys(STATUS_CODE) as Array<keyof typeof STATUS_CODE>).find(
    (k) => STATUS_CODE[k] === code,
  );
}
