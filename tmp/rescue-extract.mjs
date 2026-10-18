/* 从捞出来的会话全文里，把当初写进 README 的那几段原文抽出来（去重、按长度降序）。
   跑法：node tmp/rescue-extract.mjs  → tmp/rescue-bullets.txt */
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const text = fs.readFileSync(path.join(here, 'rescue-full.txt'), 'utf8');
const NEEDLES = [
  '三套风格整合成一幅镜像预览页',
  '三套彻底整合成',
  '框架与皮肤分离',
  '看稿页没有工具条、也没有数字键了',
  '排布令牌只有一套',
  '框架 vs 皮肤的分界',
  '`.hint` 已经不存在',
  '过场与设置卡片：三套统一',
  '令牌体检会拦住',
  '别把一条注释的头两行换掉',
];

// 把每行 JSON 解出来，递归收集所有字符串（含工具调用参数）
const strings = [];
function collect(v) {
  if (typeof v === 'string') strings.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
}
let parsed = 0;
for (const line of text.split('\n')) {
  const s = line.trim();
  if (!s.startsWith('{')) continue;
  try { collect(JSON.parse(s)); parsed++; } catch { /* 跨帧断行，忽略 */ }
}

const seen = new Set();
const hits = [];
for (const s of strings) {
  for (const nd of NEEDLES) {
    if (!s.includes(nd)) continue;
    if (seen.has(s)) break;
    seen.add(s);
    hits.push({ nd, s });
    break;
  }
}
hits.sort((a, b) => b.s.length - a.s.length);
const out = hits.map(h => `=== needle=${h.nd} len=${h.s.length} ===\n${h.s}\n`).join('\n');
fs.writeFileSync(path.join(here, 'rescue-bullets.txt'), out, 'utf8');
console.log('parsed records:', parsed, 'string hits:', hits.length, 'out bytes:', out.length);
for (const h of hits.slice(0, 20)) console.log(`${h.s.length}\t${h.nd}\t${h.s.slice(0, 60)}`);
