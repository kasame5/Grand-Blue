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
import { attempt, type ManifestAction } from '../domain/stateMachine.ts';
import type { Snapshot } from '../domain/types.ts';
import { fmtTime } from '../domain/util.ts';
import type { ManifestVersion, VersionKind } from '../domain/version.ts';

export type ScreenId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export interface Notice {
  id: string;
  at: string;
  to: string;
  text: string;
}

export interface EventItem {
  id: string;
  at: string;
  actor: string;
  text: string;
  tone: 'block' | 'warn' | 'info' | 'ok';
}

export interface AppState {
  screen: ScreenId;
  now: string;
  snapshot: Snapshot;
  versions: ManifestVersion[];
  notices: Notice[];
  events: EventItem[];
  selectedDiverId: string | null;
  selectedVersionNo: number;
  toast: string | null;
}

const BASE_MS = Date.parse('2026-11-08T12:35:00+08:00');

function timeAt(offsetMinutes: number): string {
  return new Date(BASE_MS + offsetMinutes * 60_000).toISOString();
}

let seq = 0;
const uid = (p: string) => `${p}-${(seq += 1)}`;

function welcomeNotices(): Notice[] {
  return [
    { id: uid('n'), at: timeAt(0), to: '店长', text: '船单 MO-20261108-01 v1 已确认，13 名潜水员 / 4 名教练已编组' },
    { id: uid('n'), at: timeAt(0), to: '全员', text: '2026-11-08 13:00 断崖礁出海，12:30 集合，请提前到场' },
  ];
}

function seedVersion(snap: Snapshot): ManifestVersion {
  const at = timeAt(0);
  return {
    no: 1,
    kind: 'create',
    statusAtCreation: 'confirmed',
    reason: '初始编排',
    operator: '店长',
    createdAt: at,
    snapshot: snap,
    findings: evaluate(snap, { now: at }).findings,
    parentNo: null,
  };
}

export function initialState(): AppState {
  const snap = buildBaseSnapshot('confirmed', 1);
  return {
    screen: 'p1',
    now: timeAt(0),
    snapshot: snap,
    versions: [seedVersion(snap)],
    notices: welcomeNotices(),
    events: [
      { id: uid('e'), at: timeAt(0), actor: '店长', text: '船单 v1 已确认', tone: 'ok' },
      { id: uid('e'), at: timeAt(0), actor: '系统', text: '完成 8 条规则校验：阻断 0，警告 1，提示 3', tone: 'info' },
    ],
    selectedDiverId: null,
    selectedVersionNo: 1,
    toast: null,
  };
}

// ---------------------------------------------------------------- reducer

export type Action =
  | { type: 'nav'; screen: ScreenId }
  | { type: 'select-diver'; diverId: string | null }
  | { type: 'select-version'; no: number }
  | { type: 'add-diver' }
  | { type: 'move-diver'; diverId: string; toGroupId: string }
  | { type: 'check-in'; personId: string }
  | { type: 'confirm-sea' }
  | { type: 'complete-checklist' }
  | { type: 'transition'; action: ManifestAction }
  | { type: 'dismiss-toast' };

/** 当前版本号 */
function currentNo(state: AppState): number {
  return state.versions.length;
}

/** 提交一个新版本（实质变更都会走到这里） */
function commit(
  state: AppState,
  mutate: (s: Snapshot) => Snapshot,
  kind: VersionKind,
  reason: string,
  notices: Array<{ to: string; text: string }>,
  event: Omit<EventItem, 'id' | 'at'>,
): AppState {
  const no = state.versions.length + 1;
  const at = timeAt(no * 2);
  const next = setStatus(mutate(state.snapshot), 'draft', no);
  const findings = evaluate(next, { now: at }).findings;

  const version: ManifestVersion = {
    no,
    kind,
    statusAtCreation: 'draft',
    reason,
    operator: '店长',
    createdAt: at,
    snapshot: next,
    findings,
    parentNo: no - 1,
  };

  const blocks = findings.filter((f) => f.level === 'block').length;

  return {
    ...state,
    now: at,
    snapshot: next,
    versions: [...state.versions, version],
    selectedVersionNo: no,
    notices: [
      ...notices.map((n) => ({ id: uid('n'), at, ...n })),
      ...state.notices,
    ],
    events: [
      { id: uid('e'), at, ...event },
      {
        id: uid('e'),
        at,
        actor: '系统',
        text: `v${no} 校验完成：阻断 ${blocks}，警告 ${findings.filter((f) => f.level === 'warn').length}，提示 ${findings.filter((f) => f.level === 'info').length}`,
        tone: blocks > 0 ? 'block' : 'ok',
      },
      ...state.events,
    ],
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'nav':
      return { ...state, screen: action.screen, toast: null };

    case 'select-diver':
      return { ...state, selectedDiverId: action.diverId };

    case 'select-version':
      return { ...state, selectedVersionNo: action.no };

    case 'dismiss-toast':
      return { ...state, toast: null };

    case 'add-diver': {
      if (state.snapshot.divers.some((d) => d.id === NEW_DIVER.id)) {
        return { ...state, toast: '李明已经在船单里了' };
      }
      return commit(
        state,
        (s) => addMember(s, 'g-b', NEW_DIVER, SPARE_TANK),
        'change',
        '临时新增潜水员 李明（AOW/深潜）→ 海燕号 B 组',
        [
          { to: '王强（教练）', text: 'B 组新增 1 名潜水员：李明（AOW / 深潜），当前 5 人' },
          { to: '李明（潜水员）', text: '您已被编入 2026-11-08 13:00 断崖礁 海燕号 B 组' },
        ],
        { actor: '前台', text: '新增潜水员 李明 → 海燕号 B 组', tone: 'info' },
      );
    }

    case 'move-diver': {
      const from = state.snapshot.groups.find((g) => g.memberIds.includes(action.diverId));
      if (!from || from.id === action.toGroupId) return state;
      const diverted = state.snapshot.divers.find((d) => d.id === action.diverId);
      const to = state.snapshot.groups.find((g) => g.id === action.toGroupId);
      return commit(
        state,
        (s) => moveMember(s, from.id, action.toGroupId, action.diverId),
        'change',
        `${diverted?.name ?? '人员'} 由 ${from.code} 调至 ${to?.code ?? ''}`,
        [
          { to: `${diverted?.name ?? '人员'}（潜水员）`, text: `分组调整：${from.code} → ${to?.code ?? ''}` },
          { to: '相关教练', text: `名单变更：${diverted?.name ?? ''} 移出 ${from.code}` },
        ],
        {
          actor: '店长',
          text: `${diverted?.name ?? '人员'} 由 ${from.code} 调至 ${to?.code ?? ''}`,
          tone: 'info',
        },
      );
    }

    case 'check-in': {
      const at = timeAt(currentNo(state) * 2 + 1);
      const person = state.snapshot.divers.find((d) => d.id === action.personId);
      const next = checkIn(state.snapshot, action.personId, at);
      return {
        ...state,
        now: at,
        snapshot: next,
        events: [
          { id: uid('e'), at, actor: '系统', text: `${person?.name ?? action.personId} 已签到`, tone: 'ok' },
          ...state.events,
        ],
      };
    }

    case 'confirm-sea': {
      const at = timeAt(currentNo(state) * 2 + 1);
      return {
        ...state,
        now: at,
        snapshot: confirmSeaCondition(state.snapshot, 'good', at, '店长'),
        events: [
          { id: uid('e'), at, actor: '店长', text: '海况确认：良好（人工录入）', tone: 'ok' },
          ...state.events,
        ],
      };
    }

    case 'complete-checklist': {
      const at = timeAt(currentNo(state) * 2 + 1);
      return {
        ...state,
        now: at,
        snapshot: completeChecklist(state.snapshot),
        events: [
          { id: uid('e'), at, actor: '店长', text: '离港清单全部完成', tone: 'ok' },
          ...state.events,
        ],
      };
    }

    case 'transition': {
      const res = attempt(action.action, state.snapshot, { now: state.now });
      if (!res.ok) {
        return {
          ...state,
          toast: res.message,
          events: [
            { id: uid('e'), at: state.now, actor: '系统', text: `拒绝：${res.message}`, tone: 'block' },
            ...state.events,
          ],
        };
      }
      const at = timeAt(currentNo(state) * 2 + 2);
      const next = setStatus(state.snapshot, res.to, state.snapshot.manifest.versionNo);
      const extra: Notice[] = [];
      if (action.action === 'confirm') {
        extra.push({ id: uid('n'), at, to: '全员', text: '船单已确认，名单与分组以此版为准' });
      }
      if (action.action === 'lock') {
        extra.push({ id: uid('n'), at, to: '全员', text: '船单已锁定，不再接受临时变更' });
      }
      if (action.action === 'depart') {
        extra.push({ id: uid('n'), at, to: '全员', text: `已确认离港，绑定版本 v${next.manifest.versionNo}` });
      }
      return {
        ...state,
        now: at,
        snapshot: next,
        notices: [...extra, ...state.notices],
        events: [
          {
            id: uid('e'),
            at,
            actor: '店长',
            text: res.message,
            tone: action.action === 'depart' ? 'ok' : 'info',
          },
          ...state.events,
        ],
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------- 派生

export function currentVersion(state: AppState): ManifestVersion {
  return state.versions[state.versions.length - 1]!;
}

export function lifecycleOf(state: AppState, version: ManifestVersion): 'effective' | 'frozen' | 'superseded' {
  const isCurrent = version.no === currentVersion(state).no;
  if (isCurrent) {
    const s = state.snapshot.manifest.status;
    return s === 'departed' || s === 'closed' ? 'frozen' : 'effective';
  }
  return 'superseded';
}

export { timeAt };
