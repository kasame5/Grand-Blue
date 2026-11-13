import type { EvalContext, EvalResult, EvalSummary, Finding, Level, Snapshot } from './types.ts';
import { CHECKS } from './rules/checks.ts';
import { RULE_DEFS } from './rules/defs.ts';
import type { RuleDef } from './rules/defs.ts';

const LEVEL_RANK: Record<Level, number> = { block: 0, warn: 1, info: 2 };

/**
 * 执行一次判定。
 *
 * 两条不可动摇的约定：
 * 1. 规则只报事实，不判断“能不能确认 / 能不能离港”—— 门禁由这里聚合。
 * 2. 级别以 RuleDef 为准，判定函数返回的级别会被覆盖，
 *    这样“把 R-04 从警告升为阻断”只是改一行配置。
 */
export function evaluate(
  snap: Snapshot,
  ctx: EvalContext,
  defs: RuleDef[] = RULE_DEFS,
): EvalResult {
  const collected: Finding[] = [];

  for (const def of defs) {
    if (!def.enabled) continue;
    const check = CHECKS[def.id];
    if (!check) continue;

    const found = check(snap, def.params, ctx);
    for (const f of found) {
      collected.push({ ...f, ruleId: def.id, level: def.level });
    }
  }

  // 稳定排序：级别 → 规则号 → 对象，保证界面顺序不跳
  collected.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.subject.label.localeCompare(b.subject.label, 'zh-Hans-CN'),
  );

  const summary: EvalSummary = {
    block: collected.filter((f) => f.level === 'block').length,
    warn: collected.filter((f) => f.level === 'warn').length,
    info: collected.filter((f) => f.level === 'info').length,
  };

  const checklistDone = snap.checklist.every((c) => c.done);

  return {
    findings: collected,
    summary,
    canConfirm: summary.block === 0,
    canDepart: summary.block === 0 && checklistDone,
    evaluatedAt: ctx.now,
  };
}
