import type { Finding, Snapshot, Diver, DiverLevel, Level, Tank } from '../types.ts';
import { diverById, groupsOfVessel, instructorById, tankById, vesselById } from '../types.ts';
import { fmtTime, minutesBetween, numParam, toMs } from '../util.ts';
import type { RuleCheck } from './defs.ts';

/** 潜水员等级 → 教练必须具备的资质 */
const REQUIRED_QUALIFICATION: Record<DiverLevel, string> = {
  OW: 'OW',
  AOW: 'AOW',
  RESCUE: 'RESCUE',
};

function personLabel(snap: Snapshot, personId: string): string {
  const d = diverById(snap, personId);
  if (d) return d.name;
  const i = snap.instructors.find((x) => x.id === personId);
  return i ? i.name : personId;
}

function finding(
  ruleId: string,
  level: Level,
  subject: Finding['subject'],
  message: string,
  extra: Pick<Finding, 'fact' | 'suggestion'> = {},
): Finding {
  return { ruleId, level, subject, message, ...extra };
}

// ------------------------------------------------------------------ R-01

/** 船只超载：按船统计 潜水员 + 教练 + 船员 */
const checkCapacity: RuleCheck = (snap, params) => {
  const reserved = numParam(params, 'reservedSeats', 0);
  const out: Finding[] = [];

  for (const vessel of snap.vessels) {
    const groups = groupsOfVessel(snap, vessel.id);
    if (groups.length === 0) continue;

    const divers = groups.reduce((n, g) => n + g.memberIds.length, 0);
    const instructors = new Set(groups.map((g) => g.instructorId).filter((x): x is string => !!x)).size;
    const actual = divers + instructors + vessel.crewCount;
    const capacity = vessel.capacity - reserved;

    if (actual > capacity) {
      out.push(
        finding(
          'R-01',
          'block',
          { kind: 'vessel', id: vessel.id, label: vessel.name },
          `${vessel.name}在船 ${actual} 人（潜水员 ${divers} + 教练 ${instructors} + 船员 ${vessel.crewCount}），超过核定 ${capacity} 人`,
          {
            fact: { actual, capacity, divers, instructors, crew: vessel.crewCount },
            suggestion: `需移出 ${actual - capacity} 人，或改派其他船只`,
          },
        ),
      );
    }
  }
  return out;
};

// ------------------------------------------------------------------ R-02

/** 教练资质不匹配：组内每个人的等级与专长都要落在教练资质内 */
const checkQualification: RuleCheck = (snap) => {
  const out: Finding[] = [];

  for (const group of snap.groups) {
    if (group.instructorId === null) continue; // 未指派教练由 R-06 处理，不重复报
    const instructor = instructorById(snap, group.instructorId);
    if (!instructor) continue;

    const problems: string[] = [];
    for (const memberId of group.memberIds) {
      const diver = diverById(snap, memberId);
      if (!diver) continue;

      const required = new Set<string>([REQUIRED_QUALIFICATION[diver.level]]);
      if (diver.specialties.includes('深潜')) required.add('深潜');

      const missing = [...required].filter((q) => !instructor.qualifications.includes(q));
      if (missing.length > 0) {
        problems.push(`${diver.name}（${diver.level}）需要 ${missing.join('/')} 资质`);
      }
    }

    if (problems.length > 0) {
      const vessel = vesselById(snap, group.vesselId);
      out.push(
        finding(
          'R-02',
          'block',
          { kind: 'group', id: group.id, label: `${vessel?.name ?? ''} ${group.code}`.trim() },
          `${group.code}：教练${instructor.name}（${instructor.qualifications.join('/')}）资质不匹配 —— ${problems.join('；')}`,
          { suggestion: '更换具备对应资质的教练，或调整组内成员' },
        ),
      );
    }
  }
  return out;
};

// ------------------------------------------------------------------ R-03

function tankUsable(tank: Tank, tripDate: string, minPressure: number): boolean {
  return tank.status === 'ok' && tank.inspectionExpiry >= tripDate && tank.pressure >= minPressure;
}

/** 气瓶不适航：按组校验数量与瓶况 */
const checkTanks: RuleCheck = (snap, params) => {
  const perDiver = numParam(params, 'tanksPerDiver', 1);
  const minPressure = numParam(params, 'minPressureBar', 200);
  const tripDate = snap.trip.date;
  const out: Finding[] = [];

  for (const group of snap.groups) {
    if (group.memberIds.length === 0) continue;

    const required = group.memberIds.length * perDiver;
    const tanks = group.tankIds.map((id) => tankById(snap, id)).filter((t): t is Tank => !!t);
    const usable = tanks.filter((t) => tankUsable(t, tripDate, minPressure));

    if (usable.length < required) {
      const vessel = vesselById(snap, group.vesselId);
      out.push(
        finding(
          'R-03',
          'block',
          { kind: 'group', id: group.id, label: `${vessel?.name ?? ''} ${group.code}`.trim() },
          `${group.code} 可用气瓶 ${usable.length} 支，需 ${required} 支（${group.memberIds.length} 人 × ${perDiver}）`,
          {
            fact: { usable: usable.length, required, assigned: tanks.length },
            suggestion: '从气瓶池补充分配，或替换不适航气瓶',
          },
        ),
      );
    }

    for (const tank of tanks) {
      if (tankUsable(tank, tripDate, minPressure)) continue;
      const reasons: string[] = [];
      if (tank.status !== 'ok') reasons.push(`状态为${tank.status === 'retired' ? '报废' : '维修中'}`);
      if (tank.inspectionExpiry < tripDate) reasons.push(`检验有效期至 ${tank.inspectionExpiry}`);
      if (tank.pressure < minPressure) reasons.push(`压力 ${tank.pressure}bar 低于 ${minPressure}bar`);

      out.push(
        finding(
          'R-03',
          'block',
          { kind: 'tank', id: tank.id, label: tank.code },
          `${tank.code}（${group.code}）不适航：${reasons.join('，')}`,
          { suggestion: '换用合格气瓶' },
        ),
      );
    }
  }
  return out;
};

// ------------------------------------------------------------------ R-04

/** 教练疲劳：次数、间隔、累计水下时间三选一超限即提示 */
const checkFatigue: RuleCheck = (snap, params) => {
  const maxDives = numParam(params, 'maxDivesPerDay', 3);
  const minInterval = numParam(params, 'minIntervalMinutes', 30);
  const maxUnderwater = numParam(params, 'maxUnderwaterMinutes', 120);
  const out: Finding[] = [];

  for (const instructor of snap.instructors) {
    if (instructor.todayDives.length === 0) continue;

    const dives = [...instructor.todayDives].sort((a, b) => toMs(a.start) - toMs(b.start));
    const reasons: string[] = [];

    if (dives.length >= maxDives) {
      reasons.push(`当日已带潜 ${dives.length} 次（阈值 ${maxDives} 次）`);
    }

    let underwater = 0;
    for (let i = 0; i < dives.length; i += 1) {
      const dive = dives[i]!;
      underwater += minutesBetween(dive.start, dive.end);
      const next = dives[i + 1];
      if (next) {
        const gap = minutesBetween(dive.end, next.start);
        if (gap < minInterval) {
          reasons.push(`第 ${i + 1} 潜与第 ${i + 2} 潜间隔 ${gap} 分钟（阈值 ${minInterval} 分钟）`);
        }
      }
    }
    if (underwater > maxUnderwater) {
      reasons.push(`累计水下 ${underwater} 分钟（阈值 ${maxUnderwater} 分钟）`);
    }

    if (reasons.length > 0) {
      out.push(
        finding(
          'R-04',
          'warn',
          { kind: 'person', id: instructor.id, label: instructor.name },
          `教练${instructor.name}疲劳：${reasons.join('；')}`,
          {
            fact: { dives: dives.length, underwaterMinutes: underwater },
            suggestion: '可安排备用教练，或调整后续带潜安排',
          },
        ),
      );
    }
  }
  return out;
};

// ------------------------------------------------------------------ R-05

/** 人员未到场：三个时段三种级别 —— 提醒 → 迟到警告 → 未处置阻断 */
const checkAttendance: RuleCheck = (snap, params, ctx) => {
  const lead = numParam(params, 'leadMinutes', 30);
  const overdueLead = numParam(params, 'overdueMinutes', 15);

  const now = toMs(ctx.now);
  const meetAt = toMs(snap.trip.meetAt);
  const departAt = toMs(snap.trip.departAt);

  if (now < meetAt - lead * 60_000) return [];

  const overdue = now >= departAt - overdueLead * 60_000;
  const lateMinutes = Math.round((now - meetAt) / 60_000);
  const minutesToDepart = Math.round((departAt - now) / 60_000);

  const out: Finding[] = [];
  const seen = new Set<string>();

  const check = (personId: string, name: string, checkInAt: string | null) => {
    if (checkInAt !== null || seen.has(personId)) return;
    seen.add(personId);

    const subject = { kind: 'person' as const, id: personId, label: name };

    if (overdue) {
      out.push(
        finding(
          'R-05',
          'block',
          subject,
          `${name} 未签到且未处置：距离港还剩 ${Math.max(minutesToDepart, 0)} 分钟`,
          { suggestion: '确认到场并签到，或标记弃权（将从船单移出并生成新版本）' },
        ),
      );
      return;
    }

    if (now >= meetAt) {
      out.push(
        finding(
          'R-05',
          'warn',
          subject,
          `${name} 已迟到 ${lateMinutes} 分钟仍未签到（集合 ${fmtTime(snap.trip.meetAt)}）`,
          { suggestion: '电话确认；若确定不到，标记弃权并重新编排' },
        ),
      );
      return;
    }

    out.push(
      finding('R-05', 'info', subject, `${name} 尚未签到（集合 ${fmtTime(snap.trip.meetAt)}）`, {
        suggestion: '临近集合，提醒其尽快到场',
      }),
    );
  };

  for (const group of snap.groups) {
    for (const memberId of group.memberIds) {
      const diver = diverById(snap, memberId);
      if (diver) check(diver.id, diver.name, diver.checkInAt);
    }
  }
  for (const instructor of snap.instructors) {
    check(instructor.id, instructor.name, instructor.checkInAt);
  }
  return out;
};

// ------------------------------------------------------------------ R-06

/** 教练配比不足：按组校验人数比，未指派教练直接阻断 */
const checkRatio: RuleCheck = (snap, params) => {
  const maxRatio = numParam(params, 'maxDiversPerInstructor', 4);
  const out: Finding[] = [];

  for (const group of snap.groups) {
    if (group.memberIds.length === 0) continue;
    const vessel = vesselById(snap, group.vesselId);
    const label = `${vessel?.name ?? ''} ${group.code}`.trim();

    if (!group.instructorId) {
      out.push(
        finding('R-06', 'block', { kind: 'group', id: group.id, label }, `${group.code} 未指派教练`, {
          suggestion: '从教练池指派一名教练',
        }),
      );
      continue;
    }

    const ratio = group.memberIds.length;
    if (ratio > maxRatio) {
      const instructor = instructorById(snap, group.instructorId);
      out.push(
        finding(
          'R-06',
          'block',
          { kind: 'group', id: group.id, label },
          `${group.code} 配比 ${ratio}:1（教练${instructor?.name ?? ''}），超过上限 ${maxRatio}:1`,
          {
            fact: { divers: ratio, instructors: 1, max: maxRatio },
            suggestion: `需拆出 ${ratio - maxRatio} 人另组，或增派教练`,
          },
        ),
      );
    }
  }
  return out;
};

// ------------------------------------------------------------------ R-07

/** 海况未确认：离港前 N 小时仍未人工录入 */
const checkSeaCondition: RuleCheck = (snap, params, ctx) => {
  const leadHours = numParam(params, 'leadHours', 2);
  const deadline = toMs(snap.trip.departAt) - leadHours * 3600_000;
  if (toMs(ctx.now) < deadline) return [];
  if (snap.trip.seaCondition && snap.trip.seaCondition.confirmedAt !== null) return [];

  return [
    finding(
      'R-07',
      'info',
      { kind: 'trip', id: snap.trip.id, label: snap.trip.code },
      `海况尚未确认（离港 ${fmtTime(snap.trip.departAt)}，需提前 ${leadHours} 小时录入）`,
      { suggestion: '由店长在船单上录入海况等级并确认' },
    ),
  ];
};

// ------------------------------------------------------------------ R-08

/** 重复分配：同一人同日多个船次或多个分组 */
const checkDuplicate: RuleCheck = (snap) => {
  const byPerson = new Map<string, { trips: Set<string>; groups: Set<string> }>();

  for (const a of snap.dayAssignments) {
    const entry = byPerson.get(a.personId) ?? { trips: new Set<string>(), groups: new Set<string>() };
    entry.trips.add(a.tripId);
    entry.groups.add(a.groupId);
    byPerson.set(a.personId, entry);
  }

  const out: Finding[] = [];
  for (const [personId, entry] of byPerson) {
    if (entry.trips.size <= 1 && entry.groups.size <= 1) continue;

    const reasons: string[] = [];
    if (entry.trips.size > 1) reasons.push(`同日 ${entry.trips.size} 个船次`);
    if (entry.groups.size > 1) reasons.push(`${entry.groups.size} 个分组`);

    out.push(
      finding(
        'R-08',
        'warn',
        { kind: 'person', id: personId, label: personLabel(snap, personId) },
        `${personLabel(snap, personId)} 被重复分配：${reasons.join('，')}`,
        { suggestion: '确认是否可兼顾，否则撤出其中一处' },
      ),
    );
  }
  return out;
};

/** 规则注册表：id → 判定函数 */
export const CHECKS: Record<string, RuleCheck> = {
  'R-01': checkCapacity,
  'R-02': checkQualification,
  'R-03': checkTanks,
  'R-04': checkFatigue,
  'R-05': checkAttendance,
  'R-06': checkRatio,
  'R-07': checkSeaCondition,
  'R-08': checkDuplicate,
};
