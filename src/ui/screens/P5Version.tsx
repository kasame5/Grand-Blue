import { useMemo } from 'react';
import { evaluate } from '../../domain/evaluate.ts';
import { fmtTime } from '../../domain/util.ts';
import { diffSnapshots } from '../../domain/version.ts';
import type { ManifestAction } from '../../domain/stateMachine.ts';
import type { Action, AppState } from '../store.ts';
import { currentVersion, lifecycleOf } from '../store.ts';
import { DiffList, FindingList, Gate, STATUS_LABEL } from '../components.tsx';

const LIFECYCLE_LABEL: Record<string, string> = {
  effective: '生效',
  superseded: '失效',
  discarded: '弃用',
  frozen: '冻结',
};

export function P5Version({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: Action) => void;
}) {
  const snap = state.snapshot;
  const result = useMemo(() => evaluate(snap, { now: state.now }), [snap, state.now]);
  const selected = state.versions.find((v) => v.no === state.selectedVersionNo) ?? currentVersion(state);
  const parent = state.versions.find((v) => v.no === selected.parentNo);
  const diff = useMemo(
    () => (parent ? diffSnapshots(parent.snapshot, selected.snapshot) : []),
    [parent, selected],
  );

  const status = snap.manifest.status;
  const unchecked = [
    ...snap.divers.filter((d) => !d.checkInAt).map((d) => ({ id: d.id, name: d.name, role: '潜水员' })),
    ...snap.instructors.filter((i) => !i.checkInAt).map((i) => ({ id: i.id, name: i.name, role: '教练' })),
  ];
  const pending = snap.checklist.filter((c) => !c.done);
  const seaConfirmed = !!snap.trip.seaCondition?.confirmedAt;

  const act = (a: ManifestAction) => dispatch({ type: 'transition', action: a });

  return (
    <>
      <div className="page-head">
        <h1>版本审计与离港确认</h1>
        <p>版本只增不改 · 离港绑定当前版本号</p>
        <div className="spacer" />
        <span className={`pill status-${status}`}>● {STATUS_LABEL[status]}</span>
        <span className="badge neutral">当前 v{snap.manifest.versionNo}</span>
      </div>

      <div className="grid split-23">
        <div className="panel">
          <div className="panel-head">
            <h2>版本时间线</h2>
            <span className="sub">{state.versions.length} 版</span>
          </div>
          <div className="timeline">
            {[...state.versions].reverse().map((v) => {
              const lc = lifecycleOf(state, v);
              const blocks = v.findings.filter((f) => f.level === 'block').length;
              return (
                <div
                  key={v.no}
                  className={`tl-item ${v.no === selected.no ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'select-version', no: v.no })}
                >
                  <div className="tl-rail">
                    <span className={`tl-dot ${lc}`} />
                  </div>
                  <div className="tl-main">
                    <div className="tl-title">
                      <span>v{v.no}</span>
                      <span className="badge neutral">{LIFECYCLE_LABEL[lc]}</span>
                      {blocks > 0 && <span className="badge block">阻断 {blocks}</span>}
                    </div>
                    <div className="tl-sub">
                      {fmtTime(v.createdAt)} · {v.reason}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid" style={{ gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>v{selected.no} 版本详情</h2>
              <span className="sub">
                {selected.kind === 'create' ? '首版' : selected.kind === 'rollback' ? '回滚' : '变更'}
              </span>
            </div>
            <div className="panel-body">
              <div className="callout">
                <b>{fmtTime(selected.createdAt)}</b> · {selected.operator} · {selected.reason}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="badge block">阻断 {selected.findings.filter((f) => f.level === 'block').length}</span>
                <span className="badge warn">警告 {selected.findings.filter((f) => f.level === 'warn').length}</span>
                <span className="badge info">提示 {selected.findings.filter((f) => f.level === 'info').length}</span>
                <span className="faint" style={{ fontSize: 11.5 }}>
                  判定结果随版本一起冻结
                </span>
              </div>
            </div>
            <div className="panel-head" style={{ borderTop: '1px solid var(--line)' }}>
              <h2>与上一版差异</h2>
              <span className="sub">{parent ? `v${parent.no} → v${selected.no}` : '—'}</span>
            </div>
            <div className="panel-body tight" style={{ maxHeight: 190, overflow: 'auto' }}>
              <DiffList entries={diff} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>站内通知</h2>
              <span className="sub">{state.notices.length} 条</span>
            </div>
            <div className="panel-body tight" style={{ maxHeight: 170, overflow: 'auto' }}>
              {state.notices.slice(0, 12).map((n) => (
                <div key={n.id} className="notice">
                  <span className="muted mono">{fmtTime(n.at)}</span>
                  <span className="to">{n.to}</span>
                  <span className="txt">{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>离港检查清单</h2>
            <span className="sub">
              {snap.checklist.filter((c) => c.done).length}/{snap.checklist.length} 完成
            </span>
          </div>
          <div className="panel-body">
            <div className={`check ${seaConfirmed ? 'done' : ''}`}>
              <span className="box" />
              <span>海况已确认</span>
              {!seaConfirmed ? (
                <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => dispatch({ type: 'confirm-sea' })}>
                  录入海况
                </button>
              ) : (
                <span className="faint" style={{ marginLeft: 'auto' }}>
                  {snap.trip.seaCondition?.level === 'good' ? '良好' : '一般'} · 人工录入
                </span>
              )}
            </div>

            <div className={`check ${unchecked.length === 0 ? 'done' : ''}`}>
              <span className="box" />
              <span>人员全部签到</span>
              <span className="faint" style={{ marginLeft: 'auto' }}>
                未签到 {unchecked.length} 人
              </span>
            </div>
            {unchecked.length > 0 && (
              <div className="tag-list" style={{ paddingLeft: 22, marginTop: -2, marginBottom: 4 }}>
                {unchecked.map((p) => (
                  <button
                    key={p.id}
                    className="btn small"
                    onClick={() => dispatch({ type: 'check-in', personId: p.id })}
                  >
                    {p.name} 签到
                  </button>
                ))}
              </div>
            )}

            {snap.checklist
              .filter((c) => c.id !== 'c1' && c.id !== 'c2')
              .map((c) => (
                <div key={c.id} className={`check ${c.done ? 'done' : ''}`}>
                  <span className="box" />
                  <span>{c.label}</span>
                </div>
              ))}

            {pending.length > 0 && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => dispatch({ type: 'complete-checklist' })}>
                标记清单完成（{pending.length} 项）
              </button>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>状态动作</h2>
            <span className="sub">守卫：阻断为 0，离港另需清单完成</span>
          </div>
          <div className="panel-body">
            <Gate
              canProceed={result.canConfirm}
              blockedText={`存在 ${result.summary.block} 条阻断，不能确认也不能离港`}
              passedText="无阻断，可以走完确认 → 锁定 → 离港"
            />

            <div className="actions" style={{ borderTop: 0, marginTop: 4 }}>
              <button className="btn" disabled={status !== 'draft'} onClick={() => act('confirm')}>
                确认
              </button>
              <button className="btn" disabled={status !== 'confirmed'} onClick={() => act('lock')}>
                锁定
              </button>
              <button className="btn" disabled={status !== 'locked'} onClick={() => act('unlock')}>
                解锁变更
              </button>
              <button className="btn primary" disabled={status !== 'locked'} onClick={() => act('depart')}>
                离港确认
              </button>
              <button className="btn" disabled={status !== 'departed'} onClick={() => act('close')}>
                关闭
              </button>
            </div>

            <div className="legend-note">
              当前状态「{STATUS_LABEL[status]}」。锁定后不可直接改名单，必须先解锁；离港会绑定 v
              {snap.manifest.versionNo}。
            </div>

            <div className="panel-head" style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingLeft: 0, paddingRight: 0 }}>
              <h2>当前校验</h2>
            </div>
            <div className="panel-body tight" style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 150, overflow: 'auto' }}>
              <FindingList findings={result.findings} compact emptyText="8 条规则全部通过" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
