import type { Finding, Group, Snapshot, Vessel } from '../domain/types.ts';
import { diverById, instructorById, groupsOfVessel } from '../domain/types.ts';

export interface VesselLoad {
  vessel: Vessel;
  divers: number;
  instructors: number;
  crew: number;
  total: number;
  capacity: number;
  over: boolean;
}

export function vesselLoads(snap: Snapshot): VesselLoad[] {
  return snap.vessels.map((vessel) => {
    const groups = groupsOfVessel(snap, vessel.id);
    const divers = groups.reduce((n, g) => n + g.memberIds.length, 0);
    const instructors = new Set(groups.map((g) => g.instructorId).filter((x): x is string => !!x)).size;
    const total = divers + instructors + vessel.crewCount;
    return {
      vessel,
      divers,
      instructors,
      crew: vessel.crewCount,
      total,
      capacity: vessel.capacity,
      over: total > vessel.capacity,
    };
  });
}

export function groupInfo(snap: Snapshot, group: Group) {
  const coach = instructorById(snap, group.instructorId);
  const required = group.memberIds.length;
  return {
    divers: group.memberIds.length,
    coach,
    tanks: group.tankIds.length,
    requiredTanks: required,
    ratio: coach ? `${group.memberIds.length}:1` : '—',
  };
}

export function impact(snap: Snapshot, findings: Finding[]) {
  const people = new Set<string>();
  const groups = new Set<string>();
  const vessels = new Set<string>();

  for (const f of findings) {
    if (f.subject.kind === 'group') {
      groups.add(f.subject.id);
      const g = snap.groups.find((x) => x.id === f.subject.id);
      g?.memberIds.forEach((id) => people.add(id));
      if (g?.instructorId) people.add(g.instructorId);
    }
    if (f.subject.kind === 'person') people.add(f.subject.id);
    if (f.subject.kind === 'vessel') vessels.add(f.subject.id);
  }
  return { people: people.size, groups: groups.size, vessels: vessels.size };
}

export function memberName(snap: Snapshot, id: string): string {
  return diverById(snap, id)?.name ?? id;
}
