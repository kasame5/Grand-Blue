import { useMemo } from 'react';
import { NEW_DIVER } from '../../data/seed.ts';
import { evaluate } from '../../domain/evaluate.ts';
import type { Action, AppState } from '../store.ts';
import { FindingList, Gate, LevelBadge } from '../components.tsx';
import { groupInfo } from '../derive.ts';

export function P2Compose({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: Action) => void;
}) {
  const result = useMemo(() => evaluate(state.snapshot, { now: state.now }), [state.snapshot, state.now]);
  const snap = state.snapshot;
  const added = snap.divers.some((d) => d.id === NEW_DIVER.id);
  const locked = snap.manifest.status === 'locked' || snap.manifest.status === 'departed' || snap.manifest.status === 'closed';

  return (
    <>
      <div className="page-head">
        <h1>船单编制</h1>
        <p>已确认预订 → 编入分组 → 规则校验 → 提交确认</p>
        <div className="spacer" />
        <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p3' })}>
          冲突与变更影响 →
        </button>
      </div>

      <div className="grid split-23">
        <div className="panel">
          <div className="panel-head">
            <h2>已确认预订池</h2>
            <span className="sub">{snap.divers.length} 人已编入</span>
          </div>
          <div className="panel-body">
            <div className="callout" style={{ marginBottom: 10 }}>
              预订系统推送的已确认名单，本系统只接收、不改写。
            </div>

            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 7,
                padding: 10,
                background: added ? '#f6fbf8' : '#fff',
              }}
            >
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 650 }}>
                    {NEW_DIVER.name}{' '}
                    <span className="badge neutral">{NEW_DIVER.level}</span>{' '}
                    {NEW_DIVER.specialties.map((s) => (
                      <span key={s} className="badge info">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {NEW_DIVER.code} · 预订刚确认 · 尚未编组
                  </div>
                </div>
                {added ? (
                  <span className="badge ok">已编入</span>
                ) : (
                  <button
                    className="btn primary small"
                    disabled={locked}
                    title={locked ? '已锁定，需先解锁' : ''}
                    onClick={() => dispatch({ type: 'add-diver' })}
                  >
                    编入海燕号 B 组
                  </button>
                )}
              </div>
            </div>

            <div className="legend-note">
              演示：点击「编入」即模拟“临时新增一名潜水员”，系统会立刻重跑 8 条规则并生成新版本。
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>分组编排结果</h2>
            <span className="sub">分组挂在船只上，超载与配比按船 / 按组校验</span>
          </div>
          <div className="panel-body tight">
            <table className="tbl">
              <thead>
                <tr>
                  <th>分组</th>
                  <th>船只</th>
                  <th>教练</th>
                  <th className="num">人数</th>
                  <th className="num">气瓶</th>
                  <th>配比</th>
                </tr>
              </thead>
              <tbody>
                {snap.groups.map((g) => {
                  const info = groupInfo(snap, g);
                  const vessel = snap.vessels.find((v) => v.id === g.vesselId);
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.code}</td>
                      <td>{vessel?.name}</td>
                      <td>
                        {info.coach?.name ?? <span className="badge block">未指派</span>}
                        {info.coach && (
                          <div className="faint" style={{ fontSize: 11 }}>
                            {info.coach.qualifications.join(' / ')}
                          </div>
                        )}
                      </td>
                      <td className="num">{info.divers}</td>
                      <td className="num">{info.tanks}</td>
                      <td className="mono">{info.ratio}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <h2>校验结果</h2>
          <div className="right">
            <LevelBadge level="block" />
            <span className="mono">{result.summary.block}</span>
            <LevelBadge level="warn" />
            <span className="mono">{result.summary.warn}</span>
            <LevelBadge level="info" />
            <span className="mono">{result.summary.info}</span>
          </div>
        </div>
        <div className="panel-body tight">
          <FindingList findings={result.findings.slice(0, 3)} compact emptyText="8 条规则全部通过" />
        </div>
        <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
          <Gate
            canProceed={result.canConfirm}
            blockedText={`存在 ${result.summary.block} 条阻断，无法提交确认`}
            passedText="无阻断，可以提交确认"
          />
          <div className="actions">
            <button
              className="btn primary"
              disabled={!result.canConfirm || locked}
              onClick={() => dispatch({ type: 'nav', screen: 'p3' })}
            >
              提交确认
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p4' })}>
              去调配分组
            </button>
            <span className="hint">提交确认后仍需店长锁定，离港时绑定版本号</span>
          </div>
        </div>
      </div>
    </>
  );
}
