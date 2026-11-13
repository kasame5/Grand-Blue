import { useEffect, useMemo, useReducer, useState } from 'react';
import { evaluate } from '../domain/evaluate.ts';
import { fmtTime } from '../domain/util.ts';
import { StatusPill } from './components.tsx';
import { P1Workbench } from './screens/P1Workbench.tsx';
import { P2Compose } from './screens/P2Compose.tsx';
import { P3Conflicts } from './screens/P3Conflicts.tsx';
import { P4Reassign } from './screens/P4Reassign.tsx';
import { P5Version } from './screens/P5Version.tsx';
import { initialState, reducer, type ScreenId } from './store.ts';

const TABS: Array<{ id: ScreenId; idx: number; label: string }> = [
  { id: 'p1', idx: 1, label: '船单工作台' },
  { id: 'p2', idx: 2, label: '船单编制' },
  { id: 'p3', idx: 3, label: '冲突与变更影响' },
  { id: 'p4', idx: 4, label: '分组与资源调配' },
  { id: 'p5', idx: 5, label: '版本与离港' },
];

function Shell() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const result = useMemo(
    () => evaluate(state.snapshot, { now: state.now }),
    [state.snapshot, state.now],
  );

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'dismiss-toast' }), 4200);
    return () => clearTimeout(t);
  }, [state.toast]);

  const trip = state.snapshot.trip;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            出海船单<small>船单生成与变更响应系统 · 原型</small>
          </div>
          <div className="trip-info">
            <span>
              船次 <b>{trip.code}</b>
            </span>
            <span>
              潜点 <b>{trip.diveSite}</b>
            </span>
            <span>
              集合 <b>{fmtTime(trip.meetAt)}</b> · 离港 <b>{fmtTime(trip.departAt)}</b>
            </span>
          </div>
        </div>

        <div className="status-strip">
          <StatusPill status={state.snapshot.manifest.status} />
          <span className="pill ghost">v{state.snapshot.manifest.versionNo}</span>
          <span className={`pill ${result.summary.block > 0 ? 'block' : 'ghost'}`}>
            阻断 {result.summary.block}
          </span>
          <span className={`pill ${result.summary.warn > 0 ? 'warn' : 'ghost'}`}>
            警告 {result.summary.warn}
          </span>
          <span className={`pill ${result.summary.info > 0 ? 'info' : 'ghost'}`}>
            提示 {result.summary.info}
          </span>
          <span className="clock">船单 {state.snapshot.manifest.code} · 演示时间 {fmtTime(state.now)}</span>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${state.screen === t.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'nav', screen: t.id })}
            >
              <span className="idx">{t.idx}</span>
              {t.label}
              {t.id === 'p3' && result.summary.block > 0 && <span className="dot" />}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {state.screen === 'p1' && <P1Workbench state={state} dispatch={dispatch} />}
        {state.screen === 'p2' && <P2Compose state={state} dispatch={dispatch} />}
        {state.screen === 'p3' && <P3Conflicts state={state} dispatch={dispatch} />}
        {state.screen === 'p4' && <P4Reassign state={state} dispatch={dispatch} />}
        {state.screen === 'p5' && <P5Version state={state} dispatch={dispatch} />}
      </main>

      {state.toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: '#1b2430',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(16,26,40,.28)',
            fontSize: 12.5,
            maxWidth: 640,
            zIndex: 50,
          }}
        >
          {state.toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [nonce, setNonce] = useState(0);
  return (
    <>
      <Shell key={nonce} />
      <button
        onClick={() => setNonce((n) => n + 1)}
        title="把演示数据恢复到初始状态"
        style={{
          position: 'fixed',
          right: 14,
          bottom: 12,
          zIndex: 60,
          border: '1px solid var(--line-strong)',
          background: 'rgba(255,255,255,.92)',
          borderRadius: 6,
          padding: '4px 9px',
          fontSize: 11.5,
          color: 'var(--muted)',
        }}
      >
        重置演示
      </button>
    </>
  );
}
