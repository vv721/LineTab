// 一次性脚本：从 风格预览.html 里删掉 B 雾青 / D 夜墨 两幅舞台与顶部两个按钮，
// 并把脚本注释里的候选数量与 hash 例子改掉（m02255）。
// 跑法：node tmp/strip-styles.mjs
import fs from 'node:fs';

const file = new URL('../风格预览.html', import.meta.url);
let text = fs.readFileSync(file, 'utf8');
const before = text.length;

for (const [comment, name] of [['<!-- ===== B 雾青 ===== -->', 'B'], ['<!-- ===== D 夜墨 ===== -->', 'D']]) {
  const start = text.indexOf(comment);
  if (start < 0) throw new Error(`没找到 ${name} 的注释锚点`);
  const end = text.indexOf('</section>', start);
  if (end < 0) throw new Error(`没找到 ${name} 的 </section>`);
  const cutTo = end + '</section>\n\n'.length;
  text = text.slice(0, start) + text.slice(cutTo);
}

text = text
  .split('\n')
  .filter((line) => !/data-target="(mist|night)"/.test(line))
  .join('\n')
  .replace('// 键盘：1-4 切候选，d 切暗色', '// 键盘：1-2 切候选（只剩 A 纸白 / C 点阵两套），d 切暗色')
  .replace('//   #night+panel    —— D 并展开设置面板', '//   #grid+panel     —— C 点阵并展开设置面板')
  .replace('//   #paper          —— A 纸白', '//   #paper          —— A 纸白\n//   #grid           —— C 点阵');

fs.writeFileSync(file, text);
console.log(`style 舞台清理完成：${before} → ${text.length} 字符`);
console.log('剩余 stage：', [...text.matchAll(/class="stage" data-style="(\w+)"/g)].map((m) => m[1]).join(', '));
console.log('剩余按钮：', [...text.matchAll(/data-target="(\w+)"/g)].map((m) => m[1]).join(', '));
