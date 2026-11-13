import type { EvalResult, Finding, Level } from '../domain/types.ts';
import type { DiffEntry } from '../domain/version.ts';

const useColor = process.stdout.isTTY === true;
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const red = paint('31');
export const yellow = paint('33');
export const cyan = paint('36');
export const green = paint('32');
export const dim = paint('2');
export const bold = paint('1');

const LEVEL_STYLE: Record<Level, { tag: string; color: (s: string) => string }> = {
  block: { tag: '阻断', color: red },
  warn: { tag: '警告', color: yellow },
  info: { tag: '提示', color: cyan },
};

const WIDTH = 78;

export function banner(step: string, title: string, subtitle?: string): void {
  const line = '═'.repeat(WIDTH);
  console.log(`\n${bold(line)}`);
  console.log(`${bold(` ${step} · ${title}`)}`);
  if (subtitle) console.log(dim(` ${subtitle}`));
  console.log(bold(line));
}

export function note(text: string): void {
  console.log(dim(` · ${text}`));
}

export function ok(text: string): void {
  console.log(`${green(' ✓')} ${text}`);
}

export function fail(text: string): void {
  console.log(`${red(' ✗')} ${text}`);
}

function printFinding(f: Finding): void {
  const style = LEVEL_STYLE[f.level];
  console.log(`\n  ${style.color(`[${style.tag}]`)} ${bold(f.ruleId)} ${f.subject.label}`);
  console.log(`        ${f.message}`);
  if (f.suggestion) console.log(dim(`        → ${f.suggestion}`));
}

export function printEval(result: EvalResult, opts: { showInfo?: boolean } = {}): void {
  const showInfo = opts.showInfo ?? true;
  const list = result.findings.filter((f) => showInfo || f.level !== 'info');

  if (list.length === 0) {
    console.log(`\n  ${green('无冲突')} —— 8 条规则全部通过`);
  } else {
    for (const f of list) printFinding(f);
  }

  const s = result.summary;
  console.log(
    `\n  汇总：${red(`阻断 ${s.block}`)} · ${yellow(`警告 ${s.warn}`)} · ${cyan(`提示 ${s.info}`)}` +
      `　→　${result.canConfirm ? green('可确认') : red('不可确认')}` +
      `　${result.canDepart ? green('可离港') : dim('不可离港')}`,
  );
}

export function printDiff(entries: DiffEntry[]): void {
  if (entries.length === 0) {
    console.log(dim('  （无差异）'));
    return;
  }
  for (const e of entries) {
    console.log(`\n  ${bold(e.label)}`);
    console.log(`    旧：${red(e.before)}`);
    console.log(`    新：${green(e.after)}`);
  }
}

export function printRulesTable(rows: Array<{ id: string; name: string; level: Level; hits: number }>): void {
  console.log('');
  for (const r of rows) {
    const style = LEVEL_STYLE[r.level];
    const mark = r.hits > 0 ? style.color(`命中 ${r.hits}`) : dim('未命中');
    console.log(`  ${r.id}  ${r.name.padEnd(6, '　')}  ${style.tag}   ${mark}`);
  }
}
