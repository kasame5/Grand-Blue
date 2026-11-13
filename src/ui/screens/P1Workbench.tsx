import { useMemo } from 'react';
import { evaluate } from '../../domain/evaluate.ts';
import { fmtTime } from '../../domain/util.ts';
import type { Action, AppState } from '../store.ts';
import { currentVersion } from '../store.ts';
import { Kpi } from '../components.tsx';
import { impact, vesselLoads } from '../derive.ts';

export function P1Workbench({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: Action) => void;
}) {
  const result = useMemo(() => evaluate(state.snapshot, { now: state.now }), [state.snapshot, state.now]);
  const loads = useMemo(() => vesselLoads(state.snapshot), [state.snapshot]);
  const totalPeople = loads.reduce((n, l) => n + l.total, 0);
  const affected = impact(state.snapshot, result.findings);
  const version = currentVersion(state);

  return (
    <>
      <div className="page-head">
        <h1>船单工作台</h1>
        <p>一次出海一张船单 · 当前第 {version.no} 版</p>
        <div className="spacer" />
        <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p5' })}>
          版本与离港 →
        </button>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <Kpi label="在船人数" value={totalPeople} unit="人" />
        <Kpi label="阻断" value={result.summary.block} unit="条" tone={result.summary.block ? 'block' : 'ok'} />
        <Kpi label="警告" value={result.summary.warn} unit="条" tone={result.summary.warn ? 'warn' : undefined} />
        <Kpi label="当前版本" value={`v${version.no}`} tone="info" />
      </div>

      {result.summary.block > 0 && (
        <div className="gate blocked" style={{ justifyContent: 'space-between' }}>
          <span>
            当前有 {result.summary.block} 条阻断，船单不可确认、不可离港。影响 {affected.people} 人 /{' '}
            {affected.groups} 个分组。
          </span>
          <button className="btn danger small" onClick={() => dispatch({ type: 'nav', screen: 'p3' })}>
            去处理 →
          </button>
        </div>
      )}

      <div className="grid split-32">
        <div className="grid" style={{ gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>用船与在船人数</h2>
              <span className="sub">潜水员 + 教练 + 船员 ≤ 核定载客</span>
            </div>
            <div className="panel-body">
              {loads.map((l) => {
                const pct = Math.min(100, (l.total / l.capacity) * 100);
                return (
                  <div key={l.vessel.id} className={`vessel ${l.over ? 'over' : ''}`}>
                    <div className="vessel-top">
                      <span className="vessel-name">{l.vessel.name}</span>
                      <span className="badge neutral">{l.vessel.code}</span>
                      {l.over && <span className="badge block">超载 {l.total - l.capacity}</span>}
                      <span className="vessel-cap">
                        {l.total} / {l.capacity}
                      </span>
                    </div>
                    <div className="meter">
                      <span
                        className={l.over ? 'over' : l.total === l.capacity ? 'full' : ''}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="meter-legend">
                      <span>潜水员 {l.divers}</span>
                      <span>教练 {l.instructors}</span>
                      <span>船员 {l.crew}</span>
                      <span>核定 {l.capacity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>冲突概览</h2>
              <div className="right">
                <button className="btn small" onClick={() => dispatch({ type: 'nav', screen: 'p3' })}>
                  查看全部
                </button>
              </div>
            </div>
            <div className="panel-body tight">
              {result.findings.length === 0 ? (
                <div className="empty ok">8 条规则全部通过</div>
              ) : (
                result.findings.slice(0, 4).map((f, i) => (
                  <div key={i} className={`finding ${f.level}`}>
                    <div className="bar" />
                    <div className="body">
                      <div className="head">
                        <span className={`badge ${f.level}`}>
                          {f.level === 'block' ? '阻断' : f.level === 'warn' ? '警告' : '提示'}
                        </span>
                        <span className="rule">{f.ruleId}</span>
                        <span className="target">{f.subject.label}</span>
                      </div>
                      <div className="msg">{f.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>变更事件流</h2>
            <span className="sub">追加式，不删除</span>
          </div>
          <div className="panel-body tight" style={{ maxHeight: 520, overflow: 'auto' }}>
            {state.events.slice(0, 14).map((e) => (
              <div key={e.id} className="notice">
                <span className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                  {fmtTime(e.at)}
                </span>
                <span className="to">{e.actor}</span>
                <span className="txt">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
