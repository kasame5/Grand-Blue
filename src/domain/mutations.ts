import type { Diver, ManifestStatus, Snapshot, Tank } from './types.ts';

/** 所有变更都返回新快照，原快照不动 —— 便于保留版本与做 diff。 */
export function clone(snap: Snapshot): Snapshot {
  // 快照是纯数据，结构化克隆即可；老运行时（如 jsdom）没有 structuredClone 时退化为 JSON
  if (typeof structuredClone === 'function') return structuredClone(snap);
  return JSON.parse(JSON.stringify(snap)) as Snapshot;
}

function addAssignment(snap: Snapshot, personId: string, groupId: string): void {
  const exists = snap.dayAssignments.some(
    (a) => a.personId === personId && a.groupId === groupId && a.tripId === snap.trip.id,
  );
  if (!exists) {
    snap.dayAssignments.push({ personId, tripId: snap.trip.id, groupId });
  }
}

function removeAssignment(snap: Snapshot, personId: string, groupId: string): void {
  snap.dayAssignments = snap.dayAssignments.filter(
    (a) => !(a.personId === personId && a.groupId === groupId && a.tripId === snap.trip.id),
  );
}

export function addMember(
  snap: Snapshot,
  groupId: string,
  diver: Diver,
  spareTank?: Tank,
): Snapshot {
  const next = clone(snap);
  if (!next.divers.some((d) => d.id === diver.id)) next.divers.push({ ...diver });
  if (spareTank && !next.tanks.some((t) => t.id === spareTank.id)) next.tanks.push({ ...spareTank });

  const group = next.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`分组不存在：${groupId}`);
  if (!group.memberIds.includes(diver.id)) group.memberIds.push(diver.id);
  if (spareTank && !group.tankIds.includes(spareTank.id)) group.tankIds.push(spareTank.id);
  addAssignment(next, diver.id, groupId);

  return next;
}

export function removeMember(snap: Snapshot, groupId: string, diverId: string): Snapshot {
  const next = clone(snap);
  const group = next.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`分组不存在：${groupId}`);

  group.memberIds = group.memberIds.filter((id) => id !== diverId);
  // 一并收回该组多出的气瓶，保持“人数 ≈ 瓶数”的平衡
  if (group.tankIds.length > group.memberIds.length && group.tankIds.length > 0) {
    group.tankIds.pop();
  }
  removeAssignment(next, diverId, groupId);
  return next;
}

export function moveMember(
  snap: Snapshot,
  fromGroupId: string,
  toGroupId: string,
  diverId: string,
): Snapshot {
  const next = clone(snap);
  const from = next.groups.find((g) => g.id === fromGroupId);
  const to = next.groups.find((g) => g.id === toGroupId);
  if (!from || !to) throw new Error('分组不存在');

  from.memberIds = from.memberIds.filter((id) => id !== diverId);
  if (from.tankIds.length > from.memberIds.length && from.tankIds.length > 0) from.tankIds.pop();
  if (!to.memberIds.includes(diverId)) to.memberIds.push(diverId);
  // 移入的组若瓶数不足，从气瓶池补一支
  if (to.tankIds.length < to.memberIds.length) {
    const used = new Set(next.groups.flatMap((g) => g.tankIds));
    const free = next.tanks.find(
      (t) => !used.has(t.id) && t.status === 'ok' && t.inspectionExpiry >= next.trip.date,
    );
    if (free) to.tankIds.push(free.id);
  }

  removeAssignment(next, diverId, fromGroupId);
  addAssignment(next, diverId, toGroupId);
  return next;
}

export function assignInstructor(snap: Snapshot, groupId: string, instructorId: string): Snapshot {
  const next = clone(snap);
  const group = next.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`分组不存在：${groupId}`);
  if (group.instructorId) removeAssignment(next, group.instructorId, groupId);
  group.instructorId = instructorId;
  addAssignment(next, instructorId, groupId);
  return next;
}

export function setStatus(snap: Snapshot, status: ManifestStatus, versionNo: number): Snapshot {
  const next = clone(snap);
  next.manifest.status = status;
  next.manifest.versionNo = versionNo;
  return next;
}

export function checkIn(snap: Snapshot, personId: string, at: string): Snapshot {
  const next = clone(snap);
  const diver = next.divers.find((d) => d.id === personId);
  if (diver) {
    diver.checkInAt = at;
    diver.attendance = 'checked-in';
  }
  const instructor = next.instructors.find((i) => i.id === personId);
  if (instructor) instructor.checkInAt = at;
  return next;
}

/**
 * 标记弃权：从分组移出、收回一支气瓶、解除当日分配，并记为 absent。
 *
 * 这是“变更”，不是“打勾”——人数、配比、气瓶数量都会变，所以调用方要生成新版本。
 */
export function markAbsent(snap: Snapshot, diverId: string): Snapshot {
  const next = clone(snap);
  const group = next.groups.find((g) => g.memberIds.includes(diverId));

  if (group) {
    group.memberIds = group.memberIds.filter((id) => id !== diverId);
    if (group.tankIds.length > group.memberIds.length && group.tankIds.length > 0) {
      group.tankIds.pop();
    }
    removeAssignment(next, diverId, group.id);
  }

  const diver = next.divers.find((d) => d.id === diverId);
  if (diver) {
    diver.attendance = 'absent';
    diver.checkInAt = null;
  }
  return next;
}

export function confirmSeaCondition(
  snap: Snapshot,
  level: 'good' | 'fair' | 'poor',
  at: string,
  by: string,
): Snapshot {
  const next = clone(snap);
  next.trip.seaCondition = { level, confirmedAt: at, confirmedBy: by };
  return next;
}

export function completeChecklist(snap: Snapshot): Snapshot {
  const next = clone(snap);
  next.checklist = next.checklist.map((c) => ({ ...c, done: true }));
  return next;
}
