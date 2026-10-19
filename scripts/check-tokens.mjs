// 令牌体检：确认页面里引用的每个 var(--x) 都真的在 tokens.css 里定义过。
//
// 为什么单独写它：stylelint 只认"值里出现没出现 var(--"，
// 认不出 var(--font-size-label) 这种**根本不存在**的令牌 —— 悬空令牌不会报错，
// 浏览器只会静默回退，属于最难发现的一类事故。这个脚本补上这一格。
//
// 用法：
//   node scripts/check-tokens.mjs                       # 扫 LineTab/ + design/ + design/archive/ 的 *.css / *.html
//   node scripts/check-tokens.mjs tmp/故意坏的文件.css    # 只扫指定文件（自测用）
// 退出码：0 = 全部有出处；1 = 有悬空令牌。
//
// 它管不到的事（已知边界）：只认"令牌有没有定义过"，不认"定义在哪个作用域"。
// 例如 --dot 只在 [data-style="grid"] 里定义，别处引用它不会被这个脚本拦下。

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
/* 令牌定义在安装目录里（LineTab/）；看稿页在 design/，探索页留档在 design/archive/ */
const SCAN_DIRS = [
  path.join(root, 'LineTab'),
  path.join(root, 'design'),
  path.join(root, 'design', 'archive'),
];
const tokensFile = path.join(root, 'LineTab', 'tokens.css');

/** @returns {Set<string>} tokens.css 里定义过的令牌名 */
function readDefinedTokens() {
  const css = blankOutComments(readFileSync(tokensFile, 'utf8'));
  const names = new Set();
  for (const m of css.matchAll(/(^|[\s{;])(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[2]);
  return names;
}

/** 把注释替换成等长空白（保住行号），避免注释里提到的令牌被误判 */
function blankOutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/** 找出文本里所有 var(--x) 引用（含折行写法），带行号 */
function findReferences(text) {
  const clean = blankOutComments(text);
  const refs = [];
  for (const m of clean.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    const line = clean.slice(0, m.index).split('\n').length;
    refs.push({ name: m[1], line });
  }
  return refs;
}

const args = process.argv.slice(2);
const targets = args.length
  ? args.map((a) => path.resolve(root, a))
  : SCAN_DIRS.flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => /\.(css|html)$/.test(f))
        .map((f) => path.join(dir, f)),
    );

const defined = readDefinedTokens();
let problems = 0;

for (const file of targets) {
  for (const ref of findReferences(readFileSync(file, 'utf8'))) {
    if (!defined.has(ref.name)) {
      problems++;
      console.log(`${path.relative(root, file)}:${ref.line}  悬空令牌 ${ref.name}`);
    }
  }
}

console.log(
  problems === 0
    ? `令牌体检通过：${targets.length} 个文件的 var() 引用全部有出处（共定义 ${defined.size} 个令牌）`
    : `令牌体检失败：${problems} 处悬空引用`,
);
process.exit(problems === 0 ? 0 : 1);
