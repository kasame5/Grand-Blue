/**
 * 构建为**单个 HTML**：JS 与 CSS 全部内联。
 *
 * 为什么不用 vite / esbuild：本环境禁止 spawn 子进程，原生打包器全部不可用。
 * 这里改成纯进程内方案 —— TypeScript Compiler API 出 CommonJS，
 * browserify（纯 JS）再打成单文件。
 *
 * 结果：docs/index.html 双击即可打开，不联网、不起服务。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const browserify = require('browserify');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = (p) => p.split(String.fromCharCode(92)).join('/');

// ---------------------------------------------------------------- 1. tsc

const configPath = resolve(root, 'tsconfig.build.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
}
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);

rmSync(resolve(root, 'build'), { recursive: true, force: true });
const program = ts.createProgram(parsed.fileNames, parsed.options);
const emit = program.emit();
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics];

if (diagnostics.length > 0) {
  for (const d of diagnostics) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (d.file && d.start !== undefined) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      console.error(`${d.file.fileName}:${line + 1}:${character + 1} ${msg}`);
    } else {
      console.error(msg);
    }
  }
  if (diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    process.exitCode = 1;
    throw new Error('TypeScript 编译失败');
  }
}

// ---------------------------------------------------------------- 2. bundle

/**
 * React 的入口是 `if (NODE_ENV === 'production') require(prod) else require(dev)`。
 * browserify 静态分析**两个分支**，所以只把 NODE_ENV 换掉并不能阻止 dev 版被打进来。
 * 这里直接把三个入口改写成只引生产版。
 *
 * 注意：必须 global: true —— browserify 的普通 transform 默认不作用于 node_modules。
 */
const PROD_ENTRIES = {
  'node_modules/react/index.js': "module.exports = require('./cjs/react.production.js');",
  'node_modules/react-dom/index.js': "module.exports = require('./cjs/react-dom.production.js');",
  'node_modules/react-dom/client.js':
    "module.exports = require('./cjs/react-dom-client.production.js');",
};

function productionTransform(file) {
  const normalized = toPosix(file);
  const stub = Object.entries(PROD_ENTRIES).find(([k]) => normalized.endsWith(k))?.[1];
  const chunks = [];
  return new Transform({
    transform(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
    flush(cb) {
      if (stub) {
        cb(null, stub);
        return;
      }
      const code = Buffer.concat(chunks)
        .toString('utf8')
        .split('process.env.NODE_ENV')
        .join('"production"');
      cb(null, code);
    },
  });
}

const js = await new Promise((res, rej) => {
  const b = browserify(resolve(root, 'build/ui/main.js'), { debug: false });
  b.transform(productionTransform, { global: true });
  b.bundle((err, buf) => (err ? rej(err) : res(buf.toString('utf8'))));
});

// ---------------------------------------------------------------- 3. inline

const css = readFileSync(resolve(root, 'src/ui/styles.css'), 'utf8');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>出海船单 · 船单生成与变更响应系统（原型）</title>
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`;

mkdirSync(resolve(root, 'docs'), { recursive: true });
writeFileSync(resolve(root, 'docs/index.html'), html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✓ docs/index.html 已生成（${kb} KB，单文件、离线可开）`);
