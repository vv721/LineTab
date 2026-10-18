/* 抢救脚本 v2：v4 的 jsonl 里中文可能被写成 \uXXXX 转义，所以 needle 同时按原文与转义两种形式找。
   另外把 ASCII 特征（m03794 / m03467 / README.md）也算上，并报告每个文件的规模做诊断。
   跑法：node tmp/rescue-readme.mjs   → tmp/rescue-out.txt */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SESSIONS = 'C:\\Users\\COLORFUL\\.dsh\\sessions';
const RAW_NEEDLES = [
  '三套风格整合成一幅镜像预览页',
  '三套彻底整合成',
  '框架与皮肤分离',
  '看稿页没有工具条、也没有数字键了',
  '排布令牌只有一套',
  '框架 vs 皮肤的分界',
  '过场与设置卡片：三套统一',
  '令牌体检会拦住',
  '别把一条注释的头两行换掉',
];
const escapeJson = s => [...s].map(c => (c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('');
const NEEDLES = [
  ...RAW_NEEDLES.map(s => ({ label: s, pat: s })),
  ...RAW_NEEDLES.map(s => ({ label: 'esc:' + s.slice(0, 8), pat: escapeJson(s) })),
  { label: 'm03794', pat: 'm03794' },
  { label: 'm03467', pat: 'm03467' },
  { label: 'm02895', pat: 'm02895' },
  { label: 'm01850', pat: 'm01850' },
  { label: 'README.md', pat: 'README.md' },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl.zstd')) out.push(p);
  }
  return out;
}

const all = walk(SESSIONS).map(p => ({ p, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size }));
all.sort((a, b) => b.mtime - a.mtime);
console.log('session files:', all.length);
console.log(all.slice(0, 5).map(f => `${path.basename(path.dirname(f.p))} ${f.size}B ${new Date(f.mtime).toISOString()}`).join('\n'));

const chunks = [];
for (const { p, mtime, size } of all.slice(0, 12)) {
  let text;
  try {
    text = zlib.zstdDecompressSync(fs.readFileSync(p)).toString('utf8');
  } catch (e) {
    chunks.push(`### ${path.basename(path.dirname(p))} 解压失败 ${e.message}`);
    continue;
  }
  const lines = text.split('\n');
  let hits = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const found = NEEDLES.filter(n => line.includes(n.pat));
    if (!found.length) continue;
    hits++;
    chunks.push(`### ${path.basename(path.dirname(p))} (${size}B, ${lines.length} 行) needle=${found.map(f => f.label).join(',')}\n${line.slice(0, 30000)}\n`);
  }
  if (!hits) chunks.push(`### ${path.basename(path.dirname(p))} (${size}B, ${lines.length} 行) 无命中`);
}
fs.writeFileSync(path.join(import.meta.dirname, 'rescue-out.txt'), chunks.join('\n\n'), 'utf8');
console.log('out bytes:', fs.statSync(path.join(import.meta.dirname, 'rescue-out.txt')).size);
