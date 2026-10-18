/* 重建 README：
   1) 用 git HEAD 版（188 行）做底；
   2) 把从会话记录里捞回来的四条本轮 bullet（m01850 / m02895 / m03467 / m03794）插回「- ⬜ 想做的话」之前；
   3) 落盘为 LF、无 BOM。
   跑法：node tmp/restore-readme.mjs   （先跑过 rescue-extract.mjs 生成 tmp/rescue-bullets.txt） */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = import.meta.dirname;
const root = path.resolve(here, '..');
const README = path.join(root, 'README.md');

const base = execFileSync('git', ['show', 'HEAD:newtab-extension/README.md'], { cwd: path.resolve(root, '..'), encoding: 'utf8' });

const dump = fs.readFileSync(path.join(here, 'rescue-bullets.txt'), 'utf8');
const recs = dump.split(/^=== .*$/m).filter(Boolean);

const TITLES = [
  '三套风格整合成一幅镜像预览页',
  '三套彻底整合成',
  '框架与皮肤分离',
  '过场与设置卡片：三套统一',
];

// 把候选切成"只留 bullet 本身"
function trimBullet(s) {
  let t = s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const i = t.indexOf('- ✅ **');
  if (i < 0) return '';
  t = t.slice(i);
  const stops = ['\n$idx', '\n\n[IO.File]', '\n', '",\n', "'\n"];
  for (const st of stops) {
    const k = t.indexOf(st, 1);
    if (k > 0) t = t.slice(0, k);
  }
  return t.trim();
}

const found = new Map();
for (const r of recs) {
  for (const title of TITLES) {
    const i = r.indexOf('- ✅ **' + title);
    if (i < 0) continue;
    const body = trimBullet(r.slice(i, r.indexOf('\n', i) < 0 ? r.length : r.indexOf('\n', i) + 1));
    const clean = trimBullet(r.slice(i, Math.min(r.length, i + 8000)));
    const cand = clean.length > body.length ? clean : body;
    if (!found.has(title) || found.get(title).length < cand.length) found.set(title, cand);
  }
}

let out = base.replace(/\r\n/g, '\n');
if (!out.endsWith('\n')) out += '\n';
const lines = out.split('\n');
const bulletLines = [];
for (const title of TITLES) {
  const t = found.get(title);
  if (!t) { console.log('MISS', title); continue; }
  bulletLines.push(t);
}
const idx = lines.findIndex(l => l.startsWith('- ⬜ 想做的话'));
console.log('anchor line:', idx + 1, 'bullets:', bulletLines.map(b => b.length).join('/'));
if (idx < 0) throw new Error('找不到 - ⬜ 想做的话 锚点');
lines.splice(idx, 0, ...bulletLines);
fs.writeFileSync(README, lines.join('\n'), 'utf8');
console.log('README 现', lines.length, '行，', fs.statSync(README).size, '字节');
