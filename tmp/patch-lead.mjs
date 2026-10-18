// 补丁二：stageFacts 每切一套风格都要先把面板打开再量（点工具条会顺手收掉面板）；
// clayGeometry 里补上 hintShown
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('./check-lead.mjs', import.meta.url);
let t = readFileSync(file, 'utf8');
const note = '// 点工具条会顺手收掉面板（「点别处收面板」的既有逻辑），量行之前先把它打开';
const pairs = [
  [
    "    document.querySelector(`.bar button[data-target=\"${s}\"]`).click();\n    await new Promise(r => setTimeout(r, 50));\n    const box = stage.querySelector('.fieldbox');",
    `    document.querySelector(\`.bar button[data-target="\${s}"]\`).click();\n    await new Promise(r => setTimeout(r, 50));\n    ${note}\n    if (stage.querySelector('.panel').hasAttribute('hidden')) stage.querySelector('.settings').click();\n    const box = stage.querySelector('.fieldbox');`,
  ],
  [
    "    gap: Math.round(l.top - m.bottom),\n    hintCount: stage.querySelectorAll('.hint').length,",
    "    gap: Math.round(l.top - m.bottom),\n    hintCount: stage.querySelectorAll('.hint').length,\n    hintShown: stage.querySelector('.hint').offsetParent !== null,",
  ],
];
for (const [from, to] of pairs) {
  if (!t.includes(from)) {
    console.log('MISS:', from.slice(0, 60));
    continue;
  }
  t = t.replace(from, to);
}
writeFileSync(file, t);
console.log('done');
