import type { ChecklistItem, Snapshot } from './types.ts';
import { diverById } from './types.ts';

export interface PendingPerson {
  id: string;
  name: string;
  role: '潜水员' | '教练';
}

/**
 * 仍在分组里、但还没签到的人。
 *
 * 已弃权的人已经被移出分组（见 mutations.markAbsent），所以不会出现在这里——
 * 这正是“未签到”与“未处置”的区别：未签到只是没来，未处置是还挂在名单上。
 */
export function pendingPeople(snap: Snapshot): PendingPerson[] {
  const out: PendingPerson[] = [];
  const seen = new Set<string>();

  for (const group of snap.groups) {
    for (const id of group.memberIds) {
      if (seen.has(id)) continue;
      const diver = diverById(snap, id);
      if (!diver || diver.checkInAt !== null || diver.attendance === 'absent') continue;
      seen.add(id);
      out.push({ id, name: diver.name, role: '潜水员' });
    }
  }

  for (const instructor of snap.instructors) {
    if (seen.has(instructor.id) || instructor.checkInAt !== null) continue;
    seen.add(instructor.id);
    out.push({ id: instructor.id, name: instructor.name, role: '教练' });
  }

  return out;
}

export interface DerivedChecklistItem extends ChecklistItem {
  /** true = 由系统状态推导，不允许手工勾选 */
  auto: boolean;
}

/**
 * 离港清单里有两项不能手工勾：
 * - c1 海况确认：看 trip.seaCondition
 * - c2 人员全部签到：看是否还有未处置的人
 * 其余（气瓶装船、救生设备、离港申报）仍然手工确认。
 */
export function deriveChecklist(snap: Snapshot): DerivedChecklistItem[] {
  const pending = pendingPeople(snap);

  return snap.checklist.map((item) => {
    if (item.id === 'c1') return { ...item, done: !!snap.trip.seaCondition?.confirmedAt, auto: true };
    if (item.id === 'c2') return { ...item, done: pending.length === 0, auto: true };
    return { ...item, auto: false };
  });
}
