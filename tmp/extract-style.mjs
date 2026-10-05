// 一次性迁移脚本：把 风格预览.html 里的内联 <style> 抽成 preview.css，
// 好让 stylelint 这道"只准用令牌"的契约覆盖得到页面样式（原来只覆盖 *.css）。
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'D:/桌面/dsh/newtab-extension/';
const htmlPath = root + '风格预览.html';
const cssPath = root + 'preview.css';

const html = readFileSync(htmlPath, 'utf8');
const open = '<style>';
const close = '</style>';
const start = html.indexOf(open);
const end = html.indexOf(close);
if (start < 0 || end < 0) throw new Error('没找到 <style> 块，中止');

const inner = html.slice(start + open.length, end).trim();
writeFileSync(cssPath, inner + '\n', 'utf8');

const out =
  html.slice(0, start) + '<link rel="stylesheet" href="preview.css">' + html.slice(end + close.length);
writeFileSync(htmlPath, out, 'utf8');

console.log(`preview.css 写入完成：${inner.length} 字符`);
console.log(`html 里 <style> 块已换成 <link>：${html.length} -> ${out.length} 字符`);
