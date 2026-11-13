import type { Finding, Level, ManifestStatus } from '../domain/types.ts';
import type { DiffEntry } from '../domain/version.ts';

export const STATUS_LABEL: Record<ManifestStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  locked: '已锁定',
  departed: '已离港',
  closed: '已关闭',
};

export function StatusPill({ status }: { status: ManifestStatus }) {
  return <span className={`pill status-${status}`}>● {STATUS_LABEL[status]}</span>;
}

export function LevelBadge({ level }: { level: Level }) {
  const text = level === 'block' ? '阻断' : level === 'warn' ? '警告' : '提示';
  return <span className={`badge ${level}`}>{text}</span>;
}

export function FindingList({
  findings,
  compact = false,
  emptyText = '无冲突',
}: {
  findings: Finding[];
  compact?: boolean;
  emptyText?: string;
}) {
  if (findings.length === 0) {
    return <div className="empty ok">{emptyText}</div>;
  }
  return (
    <div>
      {findings.map((f, i) => (
        <div key={`${f.ruleId}-${f.subject.id}-${i}`} className={`finding ${f.level}`}>
          <div className="bar" />
          <div className="body">
            <div className="head">
              <LevelBadge level={f.level} />
              <span className="rule">{f.ruleId}</span>
              <span className="target">{f.subject.label}</span>
            </div>
            <div className="msg">{f.message}</div>
            {!compact && f.suggestion && <div className="suggest">{f.suggestion}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiffList({ entries }: { entries: DiffEntry[] }) {
  if (entries.length === 0) return <div className="empty">与上一版无差异</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th style={{ width: '34%' }}>对象</th>
          <th>变更前</th>
          <th>变更后</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.path}>
            <td>{e.label}</td>
            <td className="diff-old">{e.before}</td>
            <td className="diff-new">{e.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Kpi({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: 'block' | 'warn' | 'info' | 'ok';
}) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small> {unit}</small>}
      </div>
    </div>
  );
}

export function Gate({
  canProceed,
  blockedText,
  passedText,
  pendingText,
}: {
  canProceed: boolean;
  blockedText: string;
  passedText: string;
  pendingText?: string;
}) {
  if (canProceed) return <div className="gate passed">✓ {passedText}</div>;
  if (pendingText) return <div className="gate pending">! {pendingText}</div>;
  return <div className="gate blocked">✕ {blockedText}</div>;
}
