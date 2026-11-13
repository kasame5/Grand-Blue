import { useMemo } from 'react';
import { evaluate } from '../../domain/evaluate.ts';
import type { Action, AppState } from '../store.ts';
import { FindingList, Gate } from '../components.tsx';
import { groupInfo } from '../derive.ts';

export function P4Reassign({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: Action) => void;
}) {
  const snap = state.snapshot;
  const result = useMemo(() => evaluate(snap, { now: state.now }), [snap, state.now]);
  const selectedId = state.selectedDiverId;
  const selectedDiver = snap.divers.find((d) => d.id === selectedId);
  const locked = snap.manifest.status === 'locked' || snap.manifest.status === 'departed' || snap.manifest.status === 'closed';

  const columns = snap.vessels.map((vessel) => ({
    vessel,
    groups: snap.groups.filter((g) => g.vesselId === vessel.id),
  }));

  const tankStats = useMemo(() => {
    const used = new Set(snap.groups.flatMap((g) => g.tankIds));
    const ok = snap.tanks.filter(
      (t) => t.status === 'ok' && t.inspectionExpiry >= snap.trip.date && t.pressure >= 200,
    ).length;
    return { total: snap.tanks.length, ok, assigned: used.size, free: snap.tanks.length - used.size };
  }, [snap]);

  return (
    <>
      <div className="page-head">
        <h1>分组与资源调配</h1>
        <p>先点一个人，再点目标分组的「移入」——每次调整都会生成新版本</p>
        <div className="spacer" />
        {selectedDiver ? (
          <span className="badge info">
            已选中 {selectedDiver.name}（{selectedDiver.level}）
          </span>
        ) : (
          <span className="badge neutral">未选中人员</span>
        )}
      </div>

      <div className="grid split-32">
        <div className="grid" style={{ gap: 10 }}>
          {columns.map(({ vessel, groups }) => {
            const total = groups.reduce((n, g) => n + g.memberIds.length, 0);
            const over = total + vessel.crewCount > vessel.capacity;
            return (
              <div key={vessel.id} className="panel">
                <div className="panel-head">
                  <h2>{vessel.name}</h2>
                  <span className={`badge ${over ? 'block' : 'neutral'}`}>
                    {total} 潜 + 船员 {vessel.crewCount} / 核定 {vessel.capacity}
                  </span>
                </div>
                <div className="panel-body">
                  <div className="board">
                    {groups.map((g) => {
                      const info = groupInfo(snap, g);
                      const isTarget = !!selectedId && !g.memberIds.includes(selectedId);
                      return (
                        <div key={g.id} className={`group ${isTarget ? 'drop-target' : ''}`}>
                          <div className="group-head">
                            <span className="group-name">{g.code}</span>
                            <span className="group-meta">
                              {info.divers} 人 · {info.tanks} 瓶
                            </span>
                          </div>
                          <div className="group-body">
                            {info.coach ? (
                              <div className="coach">
                                <b>{info.coach.name}</b>
                                <span className="faint">{info.coach.qualifications.join('/')}</span>
                              </div>
                            ) : (
                              <span className="badge block">未指派教练</span>
                            )}
                            {g.memberIds.map((id) => {
                              const d = snap.divers.find((x) => x.id === id);
                              if (!d) return null;
                              return (
                                <div
                                  key={id}
                                  className={`person clickable ${selectedId === id ? 'selected' : ''}`}
                                  onClick={() =>
                                    dispatch({
                                      type: 'select-diver',
                                      diverId: selectedId === id ? null : id,
                                    })
                                  }
                                >
                                  <span>{d.name}</span>
                                  {d.id === 'd-1014' && <span className="new">新增</span>}
                                  <span className="lv">{d.level}</span>
                                </div>
                              );
                            })}
                            {g.memberIds.length === 0 && <div className="faint">空组</div>}
                          </div>
                          <div className="group-foot">
                            {isTarget ? (
                              <button
                                className="btn primary small"
                                disabled={locked}
                                title={locked ? '已锁定，需先解锁' : ''}
                                onClick={() =>
                                  dispatch({
                                    type: 'move-diver',
                                    diverId: selectedId!,
                                    toGroupId: g.id,
                                  })
                                }
                              >
                                ← 移入 {g.code}
                              </button>
                            ) : selectedId ? (
                              <span className="faint">已在组内</span>
                            ) : (
                              <span className="faint">点击组内人员后可移入</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>教练池</h2>
            </div>
            <div className="panel-body tight">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>教练</th>
                    <th>资质</th>
                    <th className="num">今日潜数</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.instructors.map((i) => {
                    const fatigued = i.todayDives.length >= 3;
                    return (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.name}</td>
                        <td className="faint">{i.qualifications.join(' / ')}</td>
                        <td className="num">
                          {i.todayDives.length}
                          {fatigued && <span className="badge warn" style={{ marginLeft: 6 }}>疲劳</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>气瓶池</h2>
            </div>
            <div className="panel-body">
              <div className="grid cols-3" style={{ gap: 8 }}>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">总量</div>
                  <div className="value" style={{ fontSize: 19 }}>{tankStats.total}</div>
                </div>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">可用</div>
                  <div className="value" style={{ fontSize: 19 }}>{tankStats.ok}</div>
                </div>
                <div className="kpi" style={{ boxShadow: 'none' }}>
                  <div className="label">已分配</div>
                  <div className="value" style={{ fontSize: 19 }}>{tankStats.assigned}</div>
                </div>
              </div>
              <div className="legend-note">
                气瓶按组分配：组内任一瓶过期或异常，整组阻断（比真实更严）。
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>实时校验</h2>
            </div>
            <div className="panel-body tight" style={{ maxHeight: 240, overflow: 'auto' }}>
              <FindingList findings={result.findings.slice(0, 5)} compact emptyText="8 条规则全部通过" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-body">
          <Gate
            canProceed={result.canConfirm}
            blockedText={`仍有 ${result.summary.block} 条阻断，调整后再确认`}
            passedText="阻断已清零，可以进入确认与离港"
          />
          <div className="actions">
            <button className="btn primary" disabled={!result.canConfirm} onClick={() => dispatch({ type: 'nav', screen: 'p5' })}>
              完成调配，去确认与离港 →
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'nav', screen: 'p3' })}>
              查看完整冲突
            </button>
            <span className="hint">每次移入 / 移出都会生成新版本，历史版本只读</span>
          </div>
        </div>
      </div>
    </>
  );
}
