#!/usr/bin/env node
/**
 * 生成扩展图标（icon16 / icon32 / icon48 / icon128）。
 *
 * 为什么不用图像库：本机没有 sharp/canvas 之类的东西，而 Chrome 本身就是一个
 * 很好的 SVG 光栅化器。所以把图形写成一张临时 HTML，用无头 Chrome 逐尺寸截图，
 * 再自己读 PNG 的 IHDR 断言尺寸 —— 全程零依赖。
 *
 * 用法：
 *   node scripts/make-icons.mjs          # 默认候选 i4（用户选定的那个）
 *   node scripts/make-icons.mjs i1       # 换一个候选（i1 / i2 / i3 / i4）
 *
 * 候选图（16/32/48/128 + 放大 6 倍 + 深色浅色工具条）在 tmp/icon-candidates.html。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { EXT_DIR } from './runtime-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP = join(ROOT, 'tmp');

const SIZES = [16, 32, 48, 128];

/* 图形画在 32×32 的坐标系里，再按目标尺寸整体缩放。
   底色是暖白圆角方块（自带底，深浅工具条上都不会消失），图形用近黑 #181818。 */
const MARKS = {
  i1: `<rect width="32" height="32" rx="7" fill="#faf7f1"/>
       <path d="M8 22h16" stroke="#181818" stroke-width="2" stroke-linecap="round"/>
       <rect x="14.5" y="12.5" width="3" height="7.5" rx="1.2" fill="#181818"/>`,
  i2: `<rect width="32" height="32" rx="7" fill="#faf7f1"/>
       <circle cx="15.5" cy="13.5" r="5.5" fill="none" stroke="#181818" stroke-width="2.2"/>
       <path d="M19.6 17.6 23 21" stroke="#181818" stroke-width="2.2" stroke-linecap="round"/>
       <path d="M8 26h16" stroke="#181818" stroke-width="2" stroke-linecap="round"/>`,
  i3: `<rect width="32" height="32" rx="7" fill="#faf7f1"/>
       <path d="M11 8v14h12" fill="none" stroke="#181818" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round"/>`,
  i4: `<rect width="32" height="32" rx="7" fill="#faf7f1"/>
       <path d="M10.5 8.5 18 13l-7.5 4.5" fill="none" stroke="#181818" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M8 24.5h16" stroke="#181818" stroke-width="2" stroke-linecap="round"/>`,
};
/* i4 的几何是按 16px 调过的：折角与底线之间留 3.7 个坐标单位（16px 上约 1.8px），
   否则缩放下来两条笔画会粘在一起、看着像「≥」而不是「> 加一条底线」。 */

/* 两个候选浏览器：优先本机 Chrome（图标要在它的界面上看），没有就用 Playwright 自带的 Chromium。 */
const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
];

const candidateId = (process.argv[2] || 'i4').toLowerCase();
if (!MARKS[candidateId]) {
  console.error(`未知候选 "${candidateId}"，可选：${Object.keys(MARKS).join(' / ')}`);
  process.exit(1);
}

const browser = BROWSERS.find((path) => existsSync(path));
if (!browser) {
  console.error('找不到可用的浏览器，试过：\n  ' + BROWSERS.join('\n  '));
  process.exit(1);
}

function pageHtml(svg) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; }
</style></head><body>${svg}</body></html>
`;
}

/** 只读 PNG 的头两段：IHDR 里的宽高与色彩类型（6 = RGBA） */
function pngHeader(buf) {
  const signature = buf.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('不是 PNG（签名不对）');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
  };
}

/** 取左上角那个像素的 alpha —— 圆角方块之外必须是透明的，否则深色工具条上会出现白角 */
function firstPixelAlpha(buf) {
  const chunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') chunks.push(buf.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  // 只要第一行的第一个像素。不管这行用了哪种滤波（0–4），它的左邻与上邻都不存在、
  // 按 0 处理，于是预测值恒为 0 —— 原始字节就是像素值本身。
  // raw[0] 是滤波类型，第一像素的 RGBA 是 raw[1..4]，所以 alpha 在 raw[4]。
  return raw[4];
}

mkdirSync(TMP, { recursive: true });

const results = [];
for (const size of SIZES) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg">${MARKS[candidateId]}</svg>`;
  const tempPage = join(TMP, `icon-${size}.html`);
  const out = join(EXT_DIR, `icon${size}.png`);
  writeFileSync(tempPage, pageHtml(svg), 'utf8');

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',   // 圆角之外透明
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    pathToFileURL(tempPage).href,
  ];
  const run = spawnSync(browser, args, { stdio: 'inherit' });
  rmSync(tempPage, { force: true });
  if (run.status !== 0) {
    console.error(`渲染 ${size}px 失败（退出码 ${run.status}）`);
    process.exit(1);
  }

  const buf = readFileSync(out);
  const header = pngHeader(buf);
  const cornerAlpha = firstPixelAlpha(buf);
  /* 角像素应当是全透明。实测 Chrome 的无头透明底给的是 alpha=1（不是 0）——
     肉眼等同全透明，所以判据放宽到 <= 1，并把实测值打出来，改动时能看见。 */
  const ok = header.width === size && header.height === size && header.colorType === 6 && cornerAlpha <= 1;
  results.push({ size, bytes: buf.length, header, cornerAlpha, ok });
  if (!ok) {
    console.error(
      `icon${size}.png 不符合预期：${header.width}×${header.height} colorType=${header.colorType} 角像素 alpha=${cornerAlpha}`
    );
    process.exit(1);
  }
}

console.log(`候选：${candidateId}`);
for (const item of results) {
  console.log(`  icon${String(item.size).padEnd(3)}.png  ${String(item.bytes).padStart(6)} 字节  ${item.header.width}×${item.header.height} RGBA  角像素透明`);
}
console.log('四张图尺寸、通道、圆角透明度都符合预期。');
