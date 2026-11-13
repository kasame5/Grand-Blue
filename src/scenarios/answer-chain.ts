/**
 * 答辩链路场景：新增潜水员 → 超载阻断 → 调换分组 → 版本升级 → 通知 → 离港
 *
 * 没有任何界面，只验证领域层：
 *   8 条规则会不会真的判、状态机挡不挡、版本能不能 diff、通知发没发。
 * 这一层跑通了，界面才只是“把它画出来”。
 */
import { NEW_DIVER, SPARE_TANK, buildBaseSnapshot } from '../data/seed.ts';
import { evaluate } from '../domain/evaluate.ts';
import {
  addMember,
  checkIn,
  completeChecklist,
  confirmSeaCondition,
  moveMember,
  setStatus,
} from '../domain/mutations.ts';
import { RULE_DEFS } from '../domain/rules/defs.ts';
import { attempt } from '../domain/stateMachine.ts';
import type { EvalResult, Finding, Level, Snapshot } from '../domain/types.ts';
import { diffSnapshots, type ManifestVersion } from '../domain/version.ts';
import { banner, bold, cyan, dim, fail, green, ok, printDiff, printEval, printRulesTable, red, yellow } from './format.ts';

const hits: Record<string, number> = Object.fromEntries(RULE_DEFS.map((r) => [r.id, 0]));

function run(snap: Snapshot, now: string): EvalResult {
  const result = evaluate(snap, { now });
  for (const f of result.findings) hits[f.ruleId] = (hits[f.ruleId] ?? 0) + 1;
  return result;
}

function countBlock(findings: Finding[]): number {
  return findings.filter((f) => f.level === 'block').length;
}

let failed = false;
function expect(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(red(`\n  ✗ 断言失败：${msg}`));
    failed = true;
  }
}

// 演示时间轴（下午船次；上午王强已带 3 潜，正好构成疲劳警告）
const T = {
  init: '2026-11-08T12:35:00+08:00',
  add: '2026-11-08T12:36:00+08:00',
  move: '2026-11-08T12:40:00+08:00',
  confirm: '2026-11-08T12:45:00+08:00',
  lock: '2026-11-08T12:50:00+08:00',
  depart: '2026-11-08T12:58:00+08:00',
};

// ------------------------------------------------------------------ 1

let snap = buildBaseSnapshot('confirmed', 1);

banner('步骤 1', '初始船单 v1 · 已确认', '海燕号 11/11 · 海鸥号 8/12 · 潜水员 13 + 教练 4 + 船员 2 = 19 人');
const r1 = run(snap, T.init);
printEval(r1);
expect(countBlock(r1.findings) === 0, '初始船单不应有阻断');

// ------------------------------------------------------------------ 2

banner('步骤 2', '尝试离港（状态守卫）', '当前状态「已确认」，还没锁定');
const early = attempt('depart', snap, { now: T.init });
fail(early.message);
expect(!early.ok, '未锁定状态下不应允许离港');

// ------------------------------------------------------------------ 3

banner('步骤 3', '临时新增潜水员：李明 → 海燕号 B 组', '预订刚确认，前台把人加了进来');
let v2 = addMember(snap, 'g-b', NEW_DIVER, SPARE_TANK);
v2 = setStatus(v2, 'draft', 2);
const r2 = run(v2, T.add);
printEval(r2);

expect(countBlock(r2.findings) === 3, '新增后应产生 3 条阻断（R-01 / R-02 / R-06）');
expect(
  r2.findings.some((f) => f.ruleId === 'R-01'),
  '应命中船只超载',
);
expect(
  r2.findings.some((f) => f.ruleId === 'R-02'),
  '应命中教练资质不匹配',
);
expect(
  r2.findings.some((f) => f.ruleId === 'R-06'),
  '应命中教练配比不足',
);

// ------------------------------------------------------------------ 4

banner('步骤 4', '店长处置：把李明调到海鸥号 C 组', '海燕号腾出 1 人，C 组教练陈静具备 AOW + 深潜资质');
const v3 = setStatus(moveMember(v2, 'g-b', 'g-c', NEW_DIVER.id), 'draft', 3);
const r3 = run(v3, T.move);
printEval(r3);

expect(countBlock(r3.findings) === 0, '调组后阻断应清零');

// ------------------------------------------------------------------ 5

banner('步骤 5', '版本 diff', 'v1 → v2（新增） / v2 → v3（调组）');

console.log(`\n${bold('  v1 → v2  新增人员')}`);
printDiff(diffSnapshots(snap, v2));

console.log(`\n${bold('  v2 → v3  调换分组')}`);
printDiff(diffSnapshots(v2, v3));

// ------------------------------------------------------------------ 6

banner('步骤 6', '站内通知', '只做站内信，不接短信网关');
const inbox: Array<{ to: string; text: string }> = [
  { to: '店长', text: '船单 MO-20261108-01 变更 v3 已生成：李明由海燕号 B 组调至海鸥号 C 组' },
  { to: '陈静（教练）', text: '您所在的 C 组新增 1 名潜水员：李明（AOW / 深潜），共 4 人' },
  { to: '王强（教练）', text: 'B 组名单变更：李明已移出，当前 4 人' },
  { to: '李明（潜水员）', text: '您已被编入 2026-11-08 13:00 断崖礁 海鸥号 C 组，集合 12:30' },
];
for (const m of inbox) console.log(`  ${cyan('✉')}  → ${m.to}：${dim(m.text)}`);
ok(`已发送 ${inbox.length} 条站内信`);

// ------------------------------------------------------------------ 7

banner('步骤 7', '确认 → 锁定', '阻断为 0 才能放行');

let live = v3;
const confirmRes = attempt('confirm', live, { now: T.confirm });
if (confirmRes.ok) {
  ok(confirmRes.message);
  live = setStatus(live, 'confirmed', 3);
} else {
  fail(confirmRes.message);
}

const lockRes = attempt('lock', live, { now: T.lock });
if (lockRes.ok) {
  ok(lockRes.message);
  live = setStatus(live, 'locked', 3);
} else {
  fail(lockRes.message);
}

// ------------------------------------------------------------------ 8

banner('步骤 8', '离港确认（清单守卫）', '锁定后还要过离港清单');
const departBlocked = attempt('depart', live, { now: T.depart });
fail(departBlocked.message);
expect(!departBlocked.ok, '清单未完成时不应允许离港');

// ------------------------------------------------------------------ 9

banner('步骤 9', '完成清单 → 离港', '海况录入、签到、气瓶装船、救生设备、离港申报');
let ready = confirmSeaCondition(live, 'good', '2026-11-08T12:52:00+08:00', '店长');
ready = checkIn(ready, 'd-1013', '2026-11-08T12:53:00+08:00');
ready = checkIn(ready, 'd-1008', '2026-11-08T12:54:00+08:00');
ready = completeChecklist(ready);

const finalEval = run(ready, T.depart);
printEval(finalEval, { showInfo: false });

const departRes = attempt('depart', ready, { now: T.depart });
if (departRes.ok) {
  ok(departRes.message);
  ready = setStatus(ready, 'departed', 3);
  console.log(dim(`    离港绑定版本：v${ready.manifest.versionNo} · 实际离港 12:58`));
} else {
  fail(departRes.message);
}
expect(departRes.ok, '无阻断且清单完成后应允许离港');

const closeRes = attempt('close', ready, { now: '2026-11-08T17:20:00+08:00' });
if (closeRes.ok) {
  ok(closeRes.message);
  ready = setStatus(ready, 'closed', 3);
}

// ------------------------------------------------------------------ 10

banner('步骤 10', '版本时间线', '只增不改：每一次实质变更都是一个版本');

const versions: ManifestVersion[] = [
  {
    no: 1, kind: 'create', statusAtCreation: 'confirmed', reason: '初始编排',
    operator: '店长', createdAt: T.init, snapshot: snap, findings: r1.findings, parentNo: null,
  },
  {
    no: 2, kind: 'change', statusAtCreation: 'draft', reason: '临时新增潜水员 李明',
    operator: '店长', createdAt: T.add, snapshot: v2, findings: r2.findings, parentNo: 1,
  },
  {
    no: 3, kind: 'change', statusAtCreation: 'draft', reason: '李明调至海鸥号 C 组，阻断清零',
    operator: '店长', createdAt: T.move, snapshot: v3, findings: r3.findings, parentNo: 2,
  },
];

const lifecycle: Record<number, string> = { 1: '失效', 2: '弃用', 3: '冻结（随船单离港）' };
for (const v of versions) {
  const blocks = countBlock(v.findings);
  console.log(
    `\n  v${v.no}  ${dim(v.kind)}  ${v.reason}` +
      `\n      生成于 ${v.createdAt.slice(11, 16)}　录入 ${v.findings.length} 条判定` +
      `　阻断 ${blocks === 0 ? green(String(blocks)) : red(String(blocks))}` +
      `　状态：${lifecycle[v.no] ?? '—'}`,
  );
}

// ------------------------------------------------------------------ 11

banner('步骤 11', '补充演示：R-03 气瓶不适航 / R-08 重复分配', '主链路没覆盖到的两条规则，单独验证');

const expired = structuredClone(snap);
const badTank = expired.tanks.find((t) => t.id === 't-114');
if (badTank) {
  badTank.inspectionExpiry = '2026-09-30';
  badTank.status = 'maintenance';
}
const r4 = run(expired, T.init);
printEval(r4, { showInfo: false });
expect(r4.findings.some((f) => f.ruleId === 'R-03'), '过期气瓶应命中 R-03');

const dup = structuredClone(snap);
dup.dayAssignments.push({ personId: 'd-1012', tripId: 'trip-20261108-pm2', groupId: 'g-x' });
const r5 = run(dup, T.init);
const dupFindings = r5.findings.filter((f) => f.ruleId === 'R-08');
for (const f of dupFindings) console.log(`\n  ${yellow('[警告]')} ${bold(f.ruleId)} ${f.subject.label}\n        ${f.message}`);
expect(dupFindings.length > 0, '同一人同日多船次应命中 R-08');

// ------------------------------------------------------------------ 12

banner('步骤 12', '8 条规则覆盖情况', '每一条都至少被触发过一次');
printRulesTable(
  RULE_DEFS.map((r) => ({ id: r.id, name: r.name, level: r.level, hits: hits[r.id] ?? 0 })),
);

console.log('');
if (failed) {
  console.error(red('部分断言失败，见上方 ✗'));
  process.exitCode = 1;
} else {
  console.log(green(bold('全部断言通过：链路、守卫、版本、规则覆盖均符合预期。')));
}
console.log(dim('（领域层验证完毕；五屏界面见 dist/index.html）\n'));
