import type { EvalContext, Finding, ManifestStatus, Snapshot } from './types.ts';
import { deriveChecklist } from './attendance.ts';
import { evaluate } from './evaluate.ts';
import { STATUS_LABEL } from './codes.ts';

export type ManifestAction = 'confirm' | 'lock' | 'unlock' | 'revise' | 'depart' | 'close';

interface TransitionDef {
  action: ManifestAction;
  from: ManifestStatus[];
  to: ManifestStatus;
  label: string;
}

/**
 * 状态迁移表 —— 显式写成数据，不散落在 if 里。
 * 状态码见 codes.ts：10 草稿 / 20 已确认 / 30 已锁定 / 40 已离港 / 50 已关闭。
 */
const TRANSITIONS: TransitionDef[] = [
  { action: 'confirm', from: ['draft'], to: 'confirmed', label: '确认船单' },
  { action: 'lock', from: ['confirmed'], to: 'locked', label: '锁定版本' },
  { action: 'unlock', from: ['locked'], to: 'draft', label: '解锁变更' },
  { action: 'revise', from: ['draft', 'confirmed'], to: 'draft', label: '发起变更' },
  { action: 'depart', from: ['locked'], to: 'departed', label: '离港确认' },
  { action: 'close', from: ['departed'], to: 'closed', label: '关闭船单' },
];

export interface AttemptResult {
  ok: boolean;
  action: ManifestAction;
  from: ManifestStatus;
  to: ManifestStatus;
  message: string;
  blockers: Finding[];
}

/**
 * 尝试执行一次状态动作。
 *
 * 守卫逻辑只有一处：凡是“放行”类动作（确认 / 锁定 / 离港），
 * 都必须 on-blocking（阻断为 0）；离港额外要求清单完成。
 */
export function attempt(
  action: ManifestAction,
  snap: Snapshot,
  ctx: EvalContext,
): AttemptResult {
  const from = snap.manifest.status;
  const def = TRANSITIONS.find((t) => t.action === action);

  if (!def) {
    return { ok: false, action, from, to: from, message: `未知动作 ${action}`, blockers: [] };
  }

  if (!def.from.includes(from)) {
    return {
      ok: false,
      action,
      from,
      to: from,
      message: `当前状态「${STATUS_LABEL[from]}」不允许执行「${def.label}」`,
      blockers: [],
    };
  }

  const result = evaluate(snap, ctx);

  if (def.action !== 'unlock' && result.summary.block > 0) {
    return {
      ok: false,
      action,
      from,
      to: from,
      message: `存在 ${result.summary.block} 条阻断，无法${def.label}`,
      blockers: result.findings.filter((f) => f.level === 'block'),
    };
  }

  if (def.action === 'depart') {
    const pending = deriveChecklist(snap).filter((c) => !c.done);
    if (pending.length > 0) {
      return {
        ok: false,
        action,
        from,
        to: from,
        message: `离港清单未完成：${pending.map((c) => c.label).join('、')}`,
        blockers: [],
      };
    }
  }

  return {
    ok: true,
    action,
    from,
    to: def.to,
    message: `${def.label}：${STATUS_LABEL[from]} → ${STATUS_LABEL[def.to]}`,
    blockers: [],
  };
}

export function availableActions(status: ManifestStatus): ManifestAction[] {
  return TRANSITIONS.filter((t) => t.from.includes(status)).map((t) => t.action);
}
