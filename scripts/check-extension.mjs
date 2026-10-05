// ============================================================
// 扩展清单与页面的机械校验（`npm run check` 的第一步）。
//
// 为什么要有它：manifest 写错、页面引用了白名单外的文件、或者不小心写进一段内联脚本，
// 这些都不会让本地测试变红 —— 只有在 chrome://extensions 里加载失败的**那一刻**才暴露。
// 这里是纯 Node、不启动浏览器，几毫秒就能跑完，所以放在每次提交前。
//
// 白名单来自 scripts/runtime-files.mjs（与打包共用同一份）。
// 默认校验安装目录 LineTab/；也可以传一个目录来校验它的副本 —— 固件反例就是靠这个跑的。
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALLOWED_EXTERNAL_URLS, EXT_DIR, PAGE_ASSETS, RUNTIME_FILES } from './runtime-files.mjs';

const ROOT = resolve(process.argv[2] ?? EXT_DIR);
const problems = [];
const done = [];
const fail = (message) => problems.push(message);
const pass = (message) => done.push(message);

/* 文件缺失时返回空串而不是抛异常 —— 缺哪个文件由第 1 步报出来，
   后面几步照常跑完，输出才是一份"人话清单"而不是 ENOENT 堆栈 */
const read = (name) => {
  const path = join(ROOT, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

/* ---------- 1. 白名单里的文件都得在 ---------- */
for (const name of RUNTIME_FILES) {
  if (!existsSync(join(ROOT, name))) fail(`白名单里的文件不存在：${name}`);
}
if (!problems.length) pass(`${RUNTIME_FILES.length} 个运行文件都在`);

/* ---------- 2. manifest ---------- */
let manifest = null;
try {
  manifest = JSON.parse(read('manifest.json'));
} catch (error) {
  fail(`manifest.json 不是合法 JSON：${error.message}`);
}

if (manifest) {
  if (manifest.manifest_version !== 3) fail(`manifest_version 应为 3，实际 ${manifest.manifest_version}`);

  const version = String(manifest.version ?? '');
  if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(version)) fail(`version 格式不合 Chrome 要求：${version}`);

  // 商店上限（名字 45 / 简介 132 字符）：本地先卡住，免得提交时才被打回
  const name = String(manifest.name ?? '');
  const description = String(manifest.description ?? '');
  if (!name) fail('name 是空的');
  if (name.length > 45) fail(`name 超过商店上限 45 字符（现在 ${name.length}）`);
  if (!description) fail('description 是空的');
  if (description.length > 132) fail(`description 超过商店上限 132 字符（现在 ${description.length}）`);

  const newtab = manifest.chrome_url_overrides?.newtab;
  if (newtab !== 'newtab.html') fail(`chrome_url_overrides.newtab 应为 newtab.html，实际 ${newtab}`);
  else pass('chrome_url_overrides.newtab = newtab.html');

  const permissions = manifest.permissions ?? [];
  const extra = permissions.filter((item) => item !== 'storage');
  if (extra.length) fail(`permissions 只允许 storage，多出了：${extra.join(', ')}`);
  /* 少了 storage 同样要拦：装上以后 chrome.storage 是 undefined，设置会静默退化成
     只有 localStorage 可用（换台电脑设置就没了），而这份静态检查正是为了拦住这种退化。 */
  else if (!permissions.includes('storage')) fail('permissions 里必须有 storage，否则设置存不进同步存储');
  else pass('permissions 只有 storage');

  for (const key of ['host_permissions', 'content_scripts', 'background', 'web_accessible_resources', 'optional_permissions']) {
    if (manifest[key]) fail(`manifest 里不该有 ${key}（这个扩展不注入页面、不带后台脚本）`);
  }

  // 图标：四个尺寸都得有，而且 PNG 的实际边长要和键一致
  const icons = manifest.icons ?? {};
  let iconsOk = true;
  for (const size of [16, 32, 48, 128]) {
    const file = icons[String(size)];
    if (!file) {
      fail(`manifest.icons 缺少 ${size}`);
      iconsOk = false;
      continue;
    }
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      fail(`图标文件不存在：${file}`);
      iconsOk = false;
      continue;
    }
    const buf = readFileSync(path);
    const isPng = buf.subarray(1, 4).toString('latin1') === 'PNG';
    if (!isPng) {
      fail(`${file} 不是 PNG`);
      iconsOk = false;
      continue;
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width !== size || height !== size) {
      fail(`${file} 实际尺寸 ${width}×${height}，manifest 里声明的是 ${size}`);
      iconsOk = false;
    }
  }
  /* 用循环里自己记的 flag，别事后去 problems 里按"图标"两个字过滤 —— 上面几条消息
     里有两条不含"图标"（"manifest.icons 缺少 16"、"xxx 不是 PNG"），按子串过滤会漏。 */
  if (iconsOk) pass('四个图标尺寸与声明一致');
}

/* ---------- 3. 页面（与样式）只引用白名单里的自己人 ----------
   扫描面要够宽：`<link href>`、`<script src>`，以及任何 `src=`/`href=` 和 CSS 的 `url()`。
   只扫前两类的话，新加的 `<img src="hero.png">` 或 `background: url(hero.svg)` 会悄悄漏过去 ——
   它们打不进 ZIP，装到 Chrome 里就是 404。 */
const html = existsSync(join(ROOT, 'newtab.html')) ? read('newtab.html') : '';
const assetRefs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/gi)].map((match) => match[1]);
for (const name of PAGE_ASSETS.filter((item) => item.endsWith('.css'))) {
  if (!existsSync(join(ROOT, name))) continue;
  const css = read(name).replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) assetRefs.push(match[1]);
}
/* data: 是内联内容、# 是页内锚点、http(s) 由第 5 步单独管，都不算"要打包的文件" */
const localRefs = assetRefs.filter((ref) => !/^(?:data:|#|https?:)/i.test(ref));
if (localRefs.length) {
  const unknown = localRefs.filter((ref) => !PAGE_ASSETS.includes(ref));
  if (unknown.length) fail(`页面引用了白名单外的文件：${unknown.join(', ')}`);
  else pass(`页面（含样式里的 url()）的 ${localRefs.length} 个引用都在白名单里（${localRefs.join('、')}）`);
} else {
  fail('newtab.html 没有引用任何样式与脚本？');
}

/* ---------- 4. MV3 的 CSP：不许内联脚本、不许 on* 属性 ---------- */
const inlineScript = html.match(/<script\b(?![^>]*\bsrc=)[^>]*>/gi);
if (inlineScript) fail(`newtab.html 里有内联 <script>（MV3 的 CSP 会直接拒绝）：${inlineScript[0]}`);
const inlineHandler = html.match(/\son[a-z]+\s*=/gi);
if (inlineHandler) fail(`newtab.html 里有内联事件属性（MV3 的 CSP 会拒绝）：${inlineHandler.join(' ')}`);
if (!inlineScript && !inlineHandler) pass('没有内联脚本与内联事件属性');

/* ---------- 5. 不许有自己的外部资源 ---------- */
/** 把注释换成等长空白：注释里出现网址是说明，不是加载资源 */
function blankOutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match) => match.replace(/[^\n]/g, ' '));
}

function checkExternal(label, text, { allowEngineUrls = false } = {}) {
  const urls = [...blankOutComments(text).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((match) => match[0]);
  const offenders = urls.filter((url) => !(allowEngineUrls && ALLOWED_EXTERNAL_URLS.some((allowed) => url.startsWith(allowed))));
  if (offenders.length) fail(`${label} 里有外部地址：${[...new Set(offenders)].join(', ')}`);
  return urls.length;
}

checkExternal('newtab.html', html);
for (const name of PAGE_ASSETS) {
  if (!name.endsWith('.css')) continue;
  if (!existsSync(join(ROOT, name))) continue; // 缺失已在第 1 步报出
  const css = read(name);
  if (/@import/i.test(css)) fail(`${name} 里有 @import`);
  checkExternal(name, css);
}
if (existsSync(join(ROOT, 'newtab.js'))) {
  const js = read('newtab.js');
  const found = [...blankOutComments(js).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((match) => match[0]);
  const offenders = found.filter((url) => !ALLOWED_EXTERNAL_URLS.some((allowed) => url.startsWith(allowed)));
  if (offenders.length) fail(`newtab.js 里有非跳转用途的外部地址：${offenders.join(', ')}`);
  else if (found.length) pass(`newtab.js 里的 ${found.length} 个地址都是搜索跳转目标`);
}
if (!problems.some((item) => item.includes('外部地址') || item.includes('@import'))) pass('页面与样式都没有外部资源');

/* ---------- 结论 ---------- */
for (const line of done) console.log(`  ok  ${line}`);
if (problems.length) {
  console.error(`\n扩展校验没通过，${problems.length} 条问题：`);
  for (const line of problems) console.error(`  ✗  ${line}`);
  process.exit(1);
}
console.log(`\n扩展校验通过：${done.length} 项（manifest / 页面引用 / CSP / 零外部资源）`);
