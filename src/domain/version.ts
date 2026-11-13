import type { Finding, ManifestStatus, Snapshot } from './types.ts';
import { diverById, instructorById, tankById, vesselById } from './types.ts';

export type VersionKind = 'create' | 'change' | 'rollback';

/**
 * 一个船单版本 = 一份整单快照 + 当时的判定结果。
 *
 * 为什么存整单快照而不是差异（ADR-0001）：
 * 可回滚、可 diff、能凭它复现“当时的样子”；存储冗余在课程规模下可忽略。
 */
export interface ManifestVersion {
  no: number;
  kind: VersionKind;
  /** 生成时船单处于什么状态 */
  statusAtCreation: ManifestStatus;
  reason: string;
  operator: string;
  createdAt: string;
  /** 只读快照 —— 版本一旦生成不再修改 */
  snapshot: Snapshot;
  /** 当时的规则命中结果，一并冻结 */
  findings: Finding[];
  parentNo: number | null;
}

/** 版本生命周期：生效 / 失效 / 弃用 / 冻结 */
export type VersionLifecycle = 'effective' | 'superseded' | 'discarded' | 'frozen';

export interface DiffEntry {
  path: string;
  label: string;
  before: string;
  after: string;
}

function namesOfDivers(snap: Snapshot, ids: string[]): string[] {
  return ids.map((id) => diverById(snap, id)?.name ?? id);
}

function groupLabel(snap: Snapshot, groupId: string): string {
  const g = snap.groups.find((x) => x.id === groupId);
  if (!g) return groupId;
  const v = vesselById(snap, g.vesselId);
  return `${v?.name ?? ''} ${g.code}`.trim();
}

function fmtMembers(names: string[]): string {
  return names.length === 0 ? '—' : names.join('、');
}

/**
 * 计算两个快照之间的差异。
 * 只覆盖“会影响执行”的部分：船次时刻、用船、分组、成员、教练、气瓶。
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): DiffEntry[] {
  const out: DiffEntry[] = [];

  if (before.trip.departAt !== after.trip.departAt) {
    out.push({
      path: 'trip.departAt',
      label: '离港时刻',
      before: before.trip.departAt,
      after: after.trip.departAt,
    });
  }
  if (before.trip.diveSite !== after.trip.diveSite) {
    out.push({
      path: 'trip.diveSite',
      label: '潜点',
      before: before.trip.diveSite,
      after: after.trip.diveSite,
    });
  }

  const beforeVessels = new Set(before.vessels.map((v) => v.id));
  const afterVessels = new Set(after.vessels.map((v) => v.id));
  const addedVessels = after.vessels.filter((v) => !beforeVessels.has(v.id));
  const removedVessels = before.vessels.filter((v) => !afterVessels.has(v.id));
  if (addedVessels.length > 0) {
    out.push({
      path: 'vessels.added',
      label: '新增用船',
      before: '—',
      after: addedVessels.map((v) => v.name).join('、'),
    });
  }
  if (removedVessels.length > 0) {
    out.push({
      path: 'vessels.removed',
      label: '移除用船',
      before: removedVessels.map((v) => v.name).join('、'),
      after: '—',
    });
  }

  // 以“分组 id”为锚比对；分组增减、成员增减、教练与气瓶变化
  const allGroupIds = new Set([...before.groups.map((g) => g.id), ...after.groups.map((g) => g.id)]);

  for (const groupId of allGroupIds) {
    const b = before.groups.find((g) => g.id === groupId);
    const a = after.groups.find((g) => g.id === groupId);
    const label = groupLabel(a ? after : before, groupId);

    if (!b && a) {
      out.push({
        path: `group.${groupId}.added`,
        label: `新增分组 ${label}`,
        before: '—',
        after: `${a.memberIds.length} 人`,
      });
      continue;
    }
    if (b && !a) {
      out.push({
        path: `group.${groupId}.removed`,
        label: `撤销分组 ${label}`,
        before: `${b.memberIds.length} 人`,
        after: '—',
      });
      continue;
    }
    if (!a || !b) continue;

    const addedIds = a.memberIds.filter((id) => !b.memberIds.includes(id));
    const removedIds = b.memberIds.filter((id) => !a.memberIds.includes(id));
    if (addedIds.length > 0 || removedIds.length > 0) {
      const parts: string[] = [];
      if (addedIds.length > 0) parts.push(`+${fmtMembers(namesOfDivers(after, addedIds))}`);
      if (removedIds.length > 0) parts.push(`-${fmtMembers(namesOfDivers(before, removedIds))}`);
      out.push({
        path: `group.${groupId}.members`,
        label: `${label} · 成员`,
        before: `${b.memberIds.length} 人`,
        after: `${a.memberIds.length} 人（${parts.join('，')}）`,
      });
    }

    if (a.instructorId !== b.instructorId) {
      out.push({
        path: `group.${groupId}.instructor`,
        label: `${label} · 教练`,
        before: instructorById(before, b.instructorId)?.name ?? '未指派',
        after: instructorById(after, a.instructorId)?.name ?? '未指派',
      });
    }

    if (a.tankIds.length !== b.tankIds.length) {
      out.push({
        path: `group.${groupId}.tanks`,
        label: `${label} · 气瓶`,
        before: `${b.tankIds.length} 支`,
        after: `${a.tankIds.length} 支`,
      });
    } else {
      const changed = a.tankIds.filter((id) => !b.tankIds.includes(id));
      if (changed.length > 0) {
        const codes = changed.map((id) => tankById(after, id)?.code ?? id).join('、');
        out.push({
          path: `group.${groupId}.tanks`,
          label: `${label} · 气瓶`,
          before: '—',
          after: `更换为 ${codes}`,
        });
      }
    }
  }

  return out;
}

export interface NewVersionInput {
  no: number;
  kind: VersionKind;
  statusAtCreation: ManifestStatus;
  reason: string;
  operator: string;
  createdAt: string;
  snapshot: Snapshot;
  findings: Finding[];
  parentNo: number | null;
}

export function makeVersion(input: NewVersionInput): ManifestVersion {
  return { ...input };
}

/**
 * 回滚也是一次版本（ADR-0005）：
 * 不删除、不改写，而是拿旧快照生成一个新版本。
 */
export function makeRollback(
  target: ManifestVersion,
  opts: { no: number; operator: string; createdAt: string; findings: Finding[] },
): ManifestVersion {
  return {
    no: opts.no,
    kind: 'rollback',
    statusAtCreation: 'draft',
    reason: `放弃变更，回滚至 v${target.no}`,
    operator: opts.operator,
    createdAt: opts.createdAt,
    snapshot: target.snapshot,
    findings: opts.findings,
    parentNo: target.no,
  };
}
