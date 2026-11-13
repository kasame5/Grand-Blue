import type {
  Diver,
  DiverLevel,
  Group,
  Instructor,
  ManifestStatus,
  Snapshot,
  Specialty,
  Tank,
  Vessel,
} from '../domain/types.ts';

function diver(
  seq: number,
  name: string,
  level: DiverLevel,
  specialties: Specialty[] = [],
  checkInAt: string | null = null,
): Diver {
  return {
    id: `d-${seq}`,
    code: `D-${seq}`,
    name,
    level,
    specialties,
    checkInAt,
  };
}

function instructor(
  seq: number,
  name: string,
  qualifications: string[],
  todayDives: Array<{ start: string; end: string }> = [],
  checkInAt: string | null = null,
): Instructor {
  return {
    id: `i-${seq}`,
    code: `I-${seq}`,
    name,
    qualifications,
    todayDives,
    checkInAt,
  };
}

function tank(seq: number, type: Tank['type'] = 'AL80'): Tank {
  return {
    id: `t-${seq}`,
    code: `TK-${type}-${seq}`,
    type,
    pressure: 200,
    inspectionExpiry: '2027-03-31',
    status: 'ok',
  };
}

const VESSELS: Vessel[] = [
  { id: 'v-haiyan', code: 'VS-01', name: '海燕号', capacity: 11, crewCount: 1 },
  { id: 'v-haiou', code: 'VS-02', name: '海鸥号', capacity: 12, crewCount: 1 },
];

const DIVERS: Diver[] = [
  // 海燕号 A 组
  diver(1001, '周洋', 'OW', [], '2026-11-08T12:10:00+08:00'),
  diver(1002, '林小满', 'OW', [], '2026-11-08T12:12:00+08:00'),
  diver(1003, '郑凯', 'OW', [], '2026-11-08T12:15:00+08:00'),
  diver(1004, '许静', 'OW', [], '2026-11-08T12:18:00+08:00'),
  // 海燕号 B 组
  diver(1005, '孙浩', 'OW', [], '2026-11-08T12:20:00+08:00'),
  diver(1006, '何雨', 'OW', [], '2026-11-08T12:21:00+08:00'),
  diver(1007, '马骁', 'OW', [], '2026-11-08T12:22:00+08:00'),
  diver(1008, '罗琳', 'OW', [], null),
  // 海鸥号 C 组
  diver(1009, '唐果', 'OW', [], '2026-11-08T12:05:00+08:00'),
  diver(1010, '邓一鸣', 'OW', [], '2026-11-08T12:06:00+08:00'),
  diver(1011, '冯雪', 'AOW', ['深潜'], '2026-11-08T12:07:00+08:00'),
  // 海鸥号 D 组
  diver(1012, '曹越', 'AOW', [], '2026-11-08T12:08:00+08:00'),
  diver(1013, '袁朗', 'OW', [], null),
];

const INSTRUCTORS: Instructor[] = [
  instructor(2001, '张伟', ['OW'], [{ start: '2026-11-08T07:30:00+08:00', end: '2026-11-08T08:15:00+08:00' }], '2026-11-08T12:00:00+08:00'),
  instructor(
    2002,
    '王强',
    ['OW'],
    [
      { start: '2026-11-08T07:30:00+08:00', end: '2026-11-08T08:15:00+08:00' },
      { start: '2026-11-08T08:45:00+08:00', end: '2026-11-08T09:30:00+08:00' },
      { start: '2026-11-08T10:00:00+08:00', end: '2026-11-08T10:45:00+08:00' },
    ],
    '2026-11-08T12:02:00+08:00',
  ),
  instructor(2003, '陈静', ['OW', 'AOW', '深潜'], [], '2026-11-08T12:03:00+08:00'),
  instructor(2004, '赵磊', ['OW', 'AOW', 'RESCUE'], [], '2026-11-08T12:04:00+08:00'),
];

const TANKS: Tank[] = [
  ...[101, 102, 103, 104, 105].map((n) => tank(n)),
  ...[106, 107, 108, 109, 110].map((n) => tank(n)),
  ...[111, 112, 113, 114].map((n) => tank(n)),
  ...[115, 116, 117].map((n) => tank(n)),
];

const GROUPS: Group[] = [
  {
    id: 'g-a',
    code: 'A 组',
    vesselId: 'v-haiyan',
    instructorId: 'i-2001',
    memberIds: ['d-1001', 'd-1002', 'd-1003', 'd-1004'],
    tankIds: ['t-101', 't-102', 't-103', 't-104', 't-105'],
  },
  {
    id: 'g-b',
    code: 'B 组',
    vesselId: 'v-haiyan',
    instructorId: 'i-2002',
    memberIds: ['d-1005', 'd-1006', 'd-1007', 'd-1008'],
    tankIds: ['t-106', 't-107', 't-108', 't-109', 't-110'],
  },
  {
    id: 'g-c',
    code: 'C 组',
    vesselId: 'v-haiou',
    instructorId: 'i-2003',
    memberIds: ['d-1009', 'd-1010', 'd-1011'],
    tankIds: ['t-111', 't-112', 't-113', 't-114'],
  },
  {
    id: 'g-d',
    code: 'D 组',
    vesselId: 'v-haiou',
    instructorId: 'i-2004',
    memberIds: ['d-1012', 'd-1013'],
    tankIds: ['t-115', 't-116', 't-117'],
  },
];

export const TRIP_ID = 'trip-20261108';

/** 答辩场景的初始状态：海燕 11/11、海鸥 8/12，19 人 */
export function buildBaseSnapshot(status: ManifestStatus = 'draft', versionNo = 1): Snapshot {
  return {
    trip: {
      id: TRIP_ID,
      code: 'TR-20261108-01',
      date: '2026-11-08',
      diveSite: '断崖礁',
      meetAt: '2026-11-08T12:30:00+08:00',
      departAt: '2026-11-08T13:00:00+08:00',
      seaCondition: null,
    },
    manifest: {
      id: 'mo-20261108-01',
      code: 'MO-20261108-01',
      status,
      versionNo,
    },
    vessels: VESSELS.map((v) => ({ ...v })),
    divers: DIVERS.map((d) => ({ ...d })),
    instructors: INSTRUCTORS.map((i) => ({ ...i, todayDives: [...i.todayDives] })),
    tanks: TANKS.map((t) => ({ ...t })),
    groups: GROUPS.map((g) => ({ ...g, memberIds: [...g.memberIds], tankIds: [...g.tankIds] })),
    dayAssignments: [
      ...GROUPS.flatMap((g) =>
        g.memberIds.map((pid) => ({ personId: pid, tripId: TRIP_ID, groupId: g.id })),
      ),
      ...GROUPS.filter((g) => g.instructorId).map((g) => ({
        personId: g.instructorId!,
        tripId: TRIP_ID,
        groupId: g.id,
      })),
    ],
    checklist: [
      { id: 'c1', label: '海况已确认', done: false },
      { id: 'c2', label: '人员全部签到', done: false },
      { id: 'c3', label: '气瓶已装船', done: false },
      { id: 'c4', label: '救生设备检查', done: false },
      { id: 'c5', label: '离港申报', done: false },
    ],
  };
}

/** 演示中“临时新增”的潜水员 */
export const NEW_DIVER: Diver = diver(1014, '李明', 'AOW', ['深潜'], '2026-11-08T12:02:00+08:00');

/** 演示用的备用气瓶 */
export const SPARE_TANK: Tank = tank(118);
