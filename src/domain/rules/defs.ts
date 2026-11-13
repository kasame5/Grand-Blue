import type { Level, Snapshot, Finding } from '../types.ts';
import type { RuleParams } from '../util.ts';

export type RuleScope = 'trip' | 'vessel' | 'group' | 'person';

/**
 * 规则的“数据面”：可配置、可开关、可改阈值。
 * 将来搬进数据库时，这一层原样变成一张规则表。
 */
export interface RuleDef {
  id: string;
  name: string;
  level: Level;
  scope: RuleScope;
  params: RuleParams;
  /** 人读的规则描述，界面“规则详情”直接展示 */
  message: string;
  enabled: boolean;
  /**
   * 允许判定函数按时段升级级别（提示 → 警告 → 阻断）。
   * 默认 false：级别由规则定义说了算，改配置即可把警告升为阻断。
   */
  escalating?: boolean;
}

/** 判定函数：纯函数，不查库、不读系统时间、不改快照 */
export type RuleCheck = (snap: Snapshot, params: RuleParams, ctx: { now: string }) => Finding[];

export const RULE_DEFS: RuleDef[] = [
  {
    id: 'R-01',
    name: '船只超载',
    level: 'block',
    scope: 'vessel',
    params: { reservedSeats: 0 },
    message: '单船在船人数（潜水员 + 教练 + 船员）不得超过核定载客',
    enabled: true,
  },
  {
    id: 'R-02',
    name: '潜点适配不满足',
    level: 'block',
    scope: 'group',
    params: {},
    message:
      '潜水员的最大深度与专长、带队者的带队深度与专长，三者都必须满足本次潜点要求；三者相互独立，不能互相替代',
    enabled: true,
  },
  {
    id: 'R-03',
    name: '气瓶不适航',
    level: 'block',
    scope: 'group',
    params: { tanksPerDiver: 1, minPressureBar: 200 },
    message: '组内可用气瓶数不得少于人数 × 每人瓶数；检验过期、状态异常或压力不足的瓶一律不可用',
    enabled: true,
  },
  {
    id: 'R-04',
    name: '教练疲劳',
    level: 'warn',
    scope: 'person',
    params: { maxDivesPerDay: 3, minIntervalMinutes: 30, maxUnderwaterMinutes: 120 },
    message: '当日带潜次数、两潜间隔或累计水下时间超出阈值时提示',
    enabled: true,
  },
  {
    id: 'R-05',
    name: '人员未到场',
    level: 'info',
    scope: 'person',
    params: { leadMinutes: 30, overdueMinutes: 15 },
    message:
      '集合前 30 分钟开始提醒；过了集合时间升为警告；离港前 15 分钟仍未签到则阻断——除非签到或标记弃权',
    enabled: true,
    escalating: true,
  },
  {
    id: 'R-06',
    name: '教练配比不足',
    level: 'block',
    scope: 'group',
    params: { maxDiversPerInstructor: 4 },
    message: '组内潜水员与教练之比不得超过阈值；未指派教练的组一律阻断',
    enabled: true,
  },
  {
    id: 'R-07',
    name: '海况未确认',
    level: 'info',
    scope: 'trip',
    params: { leadHours: 2 },
    message: '离港前 2 小时仍未人工录入海况确认时提示',
    enabled: true,
  },
  {
    id: 'R-08',
    name: '重复分配',
    level: 'warn',
    scope: 'person',
    params: {},
    message: '同一人同日被分配到多个船次或多个分组时提示',
    enabled: true,
  },
];
