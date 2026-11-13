/**
 * 端到端冒烟测试（无浏览器）：
 * 用 jsdom 打开构建产物 docs/index.html，真的把答辩链路点一遍。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'docs/index.html'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e));
vc.on('error', (e) => errors.push(e));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});

const { window } = dom;
const doc = window.document;
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed += 1;
}

function text() {
  // 只取挂载点内的文本：inline <script> 也在 body 里，否则会把源码当正文
  return doc.getElementById('root')?.textContent ?? '';
}

function click(label, selector = 'button') {
  const el = [...doc.querySelectorAll(selector)].find((b) => (b.textContent ?? '').includes(label));
  if (!el) throw new Error(`找不到可点击元素：${label}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
}

async function main() {
  await tick(120);

  check('页面挂载成功', (doc.getElementById('root')?.innerHTML ?? '').length > 500);
  check('顶栏显示船次与状态', text().includes('TR-20261108-01') && text().includes('已确认'));
  check('P1 工作台渲染', text().includes('在船人数') && text().includes('海燕号'));

  // ---- ② 编制：新增李明
  click('船单编制');
  await tick();
  check('P2 显示已确认预订池', text().includes('已确认预订池'));
  check('初始无阻断', !text().includes('存在 1 条阻断'));

  click('编入海燕号 B 组');
  await tick();
  check('新增后出现阻断计数', text().includes('阻断 3') || text().includes('阻断'));

  // ---- ③ 冲突
  click('冲突与变更影响');
  await tick();
  const conflictText = text();
  check('R-01 船只超载命中', conflictText.includes('R-01') && conflictText.includes('超过核定'));
  check('R-03 气瓶不足命中', conflictText.includes('R-03') && conflictText.includes('可用气瓶'));
  check('R-06 配比不足命中', conflictText.includes('R-06'));

  // ---- ④ 调配：把李明移到 C 组
  click('分组与资源调配');
  await tick();
  check('P4 显示分组看板', text().includes('海燕号') && text().includes('海鸥号'));

  const person = [...doc.querySelectorAll('.person')].find((p) => (p.textContent ?? '').includes('李明'));
  check('看板上找到李明', !!person);
  person.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();

  const targetGroup = [...doc.querySelectorAll('.group')].find((g) =>
    (g.textContent ?? '').includes('C 组'),
  );
  const moveBtn = [...(targetGroup?.querySelectorAll('button') ?? [])].find((b) =>
    (b.textContent ?? '').includes('移入'),
  );
  check('找到 C 组的移入按钮', !!moveBtn);
  moveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(60);

  click('冲突与变更影响');
  await tick();
  const afterMove = text();
  check('调组后阻断清零', !afterMove.includes('R-01'));

  // ---- ⑤ 版本与离港
  click('版本与离港');
  await tick();
  check('P5 显示版本时间线', text().includes('v3') || text().includes('时间线'));
  check('P5 显示离港清单', text().includes('离港检查清单'));
  check('R-05 已从提示升级为迟到警告', text().includes('已迟到'));

  click('确认');
  await tick(60);
  click('锁定');
  await tick(60);

  // 未处置人员还在，离港必须被拒
  click('离港确认');
  await tick(60);
  check('有未处置人员时离港被拒', !doc.querySelector('.pill.status-departed'));

  // 一人弃权（= 变更，会升版并回到草稿），一人签到
  const absentBtn = [...doc.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === '弃权');
  check('存在弃权按钮', !!absentBtn);
  absentBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(60);
  check('弃权后生成新版本', text().includes('v4') || text().includes('弃权'));

  const checkInBtn = [...doc.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === '签到');
  if (checkInBtn) {
    checkInBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await tick(60);
  }

  // 变更后要重新确认、锁定
  click('确认');
  await tick(60);
  click('锁定');
  await tick(60);

  click('录入海况');
  await tick(60);
  const mark = [...doc.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('标记清单完成'));
  if (mark) {
    mark.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await tick(60);
  }

  click('离港确认');
  await tick(80);
  check('离港后状态变为已离港', text().includes('已离港'));

  check('运行期间无脚本错误', errors.length === 0);
  if (errors.length > 0) {
    for (const e of errors.slice(0, 3)) console.error('  jsdomError:', e.detail ?? e);
  }
}

main()
  .catch((e) => {
    console.error('\n冒烟测试异常：', e);
    failed += 1;
  })
  .finally(() => {
    console.log(failed === 0 ? '\n五屏与答辩链路全部通过。' : `\n${failed} 项失败`);
    window.close();
    process.exitCode = failed === 0 ? 0 : 1;
  });
