// 把「三套舞台」时代与「单舞台」时代的设置面板行都抽出来对比：label | value
// 用法：node tmp/cmp-rows.mjs
import { readFileSync } from 'node:fs';

const decode = p => {
  const buf = readFileSync(p);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').slice(1);
  return buf.toString('utf8').replace(/^\uFEFF/, '');
};

const rows = html => {
  const out = [];
  // 只看设置面板里的行（.row），跳过 .row-sep / .row-param
  for (const m of html.matchAll(/<div class="row">([\s\S]*?)<\/div>\s*(?=<div class="row|<div class="row-sep|<\/div>)/g)) {
    const seg = m[1];
    const l = seg.match(/<span class="rl">([^<]*)<\/span>/);
    const v = seg.match(/<span class="rv"[^>]*>([\s\S]*?)<\/span>/);
    if (l) out.push(`${l[1].trim()} = ${v ? v[1].replace(/<[^>]*>/g, '').trim() : '(?)'}`);
  }
  return out;
};

const stages = html => {
  const parts = html.split(/<section class="stage"/).slice(1);
  return parts.map(p => [(p.match(/data-style="(\w+)"/) || [])[1], p]);
};

for (const [name, path] of [['旧 风格预览.html', 'tmp/old-preview.html'], ['新 Preview.html', 'Preview.html']]) {
  console.log(`\n===== ${name} =====`);
  for (const [style, body] of stages(decode(path))) {
    console.log(`-- ${style}`);
    for (const r of rows(body)) console.log(`   ${r}`);
  }
}
