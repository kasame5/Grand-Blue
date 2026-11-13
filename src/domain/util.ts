/** 时间与参数的小工具。规则里所有时间比较都走这里，避免各写一套。 */

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`非法时间：${iso}`);
  return ms;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(toMs(iso) + minutes * 60_000).toISOString();
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((toMs(toIso) - toMs(fromIso)) / 60_000);
}

/** 取 HH:mm，用于消息里的口语化时间 */
export function fmtTime(iso: string): string {
  const d = new Date(toMs(iso));
  // 固定用 +08:00 展示，保证演示时不随机器时区漂移
  const shanghai = new Date(d.getTime() + 8 * 3600_000);
  const hh = String(shanghai.getUTCHours()).padStart(2, '0');
  const mm = String(shanghai.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export type RuleParams = Record<string, number | boolean | string>;

export function numParam(params: RuleParams, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}
