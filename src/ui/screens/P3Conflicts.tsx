import { useMemo } from 'react';
import { evaluate } from '../../domain/evaluate.ts';
import { diffSnapshots } from '../../domain/version.ts';
import type { Action, AppState } from '../store.ts';
import { DiffList, FindingList, Gate, LevelBadge } from '../components.tsx';
import { impact } from '../derive.ts';

export function P3Conflicts({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: Action) => void;
}) {
  const result = useMemo(() => evaluate(state.snapshot, { now: state.now }), [state.snapshot, state.now]);

  const current = state.versions[state.versions.length - 1]!;
  const previous = state.versions.length > 1 ? state.versions[state.versions.length - 2] : undefined;
  const diff = useMemo(
    () => (previous ? diffSnapshots(previous.snapshot, current.snapshot) : []),
    [previous, current],
  );
  const affected = impact(state.snapshot, result.findings);

  return (
    <>
      <div className="page-head">
        <h1>冲突与变更影响</h1>
        <p>规则只报事实，门禁由聚合决定</p>
        <div className="spacer" />
        <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p4' })}>
          去调配 →
        </button>
      </div>

      <Gate
        canProceed={result.canConfirm}
        blockedText={`存在 ${result.summary.block} 条阻断 —— 必须改数据，不设特批放行`}
        passedText="阻断已清零，可提交确认"
        pendingText={undefined}
      />

      <div className="grid split-32">
        <div className="panel">
          <div className="panel-head">
            <h2>校验明细</h2>
            <div className="right">
              <span className="badge block">阻断 {result.summary.block}</span>
              <span className="badge warn">警告 {result.summary.warn}</span>
              <span className="badge info">提示 {result.summary.info}</span>
            </div>
          </div>
          <div className="panel-body tight" style={{ maxHeight: 460, overflow: 'auto' }}>
            <FindingList findings={result.findings} emptyText="8 条规则全部通过" />
          </div>
        </div>

        <div className="grid" style={{ gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>影响范围</h2>
            </div>
            <div className="panel-body">
              <div className="grid cols-3" style={{ gap: 8 }}>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">人员</div>
                  <div className="value" style={{ fontSize: 20 }}>
                    {affected.people}
                  </div>
                </div>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">分组</div>
                  <div className="value" style={{ fontSize: 20 }}>
                    {affected.groups}
                  </div>
                </div>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">船只</div>
                  <div className="value" style={{ fontSize: 20 }}>
                    {affected.vessels}
                  </div>
                </div>
              </div>
              <div className="legend-note">
                影响范围按“命中的对象”反推：阻断落在船上就算整船，落在组上就算整组。
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>
                版本 diff{' '}
                <span className="sub">
                  {previous ? `v${previous.no} → v${current.no}` : '首版'}
                </span>
              </h2>
            </div>
            <div className="panel-body tight" style={{ maxHeight: 300, overflow: 'auto' }}>
              <DiffList entries={diff} />
            </div>
            <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="callout">
                <b>变更原因：</b>
                {current.reason}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-body">
          <div className="actions" style={{ paddingTop: 0, marginTop: 0, borderTop: 0 }}>
            <button className="btn primary" disabled={!result.canConfirm}>
              提交确认
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p4' })}>
              调整分组与资源
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p5' })}>
              版本与离港 →
            </button>
            <span className="hint">
              {result.canConfirm
                ? '提交后生成可锁定版本'
                : `还有 ${result.summary.block} 条阻断：${result.findings
                    .filter((f) => f.level === 'block')
                    .map((f) => f.ruleId)
                    .join('、')}`}
            </span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <LevelBadge level="warn" />
            <span className="faint" style={{ fontSize: 11.5 }}>
              警告不拦离港，但需要填写说明；提示只进入离港清单。
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
