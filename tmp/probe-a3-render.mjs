// 一次性探针：把同一句话分别按「整段 / 逐码位 / 逐字素簇」渲染，各自单独截图。
// 单独截一个元素（不靠裁切拼图）是为了避开上一版按列裁切的坐标误差。
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const PREVIEW = new URL('Preview.html', ROOT).href;
const SHOT = (name) => fileURLToPath(new URL('tmp/lab-shots/' + name, ROOT));

const CASES = {
  en: 'The quick brown fox',
  zh: '\u6625\u7720\u4e0d\u89c9\u6653\uff0c\u5904\u5904\u95fb\u557c\u9e1f\u3002',          // 春眠不觉晓，处处闻啼鸟。
  es: 'El veloz murci\u00e9lago hind\u00fa',                                                // murciélago hindú
  hi: '\u0939\u093f\u0928\u094d\u0926\u0940 \u0928\u092e\u0938\u094d\u0924\u0947',          // हिन्दी नमस्ते
  fr: '\u00c9t\u00e9 o\u00f9 l\u2019on fl\u00e2ne',                                          // Été où l’on flâne
  ar: '\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645',                // السلام عليكم
  pt: 'A\u00e7\u00e3o, cora\u00e7\u00e3o',                                                  // Ação, coração
  ru: '\u0421\u044a\u0435\u0448\u044c \u0435\u0449\u0451 \u0431\u0443\u043b\u043e\u043a',    // Съешь ещё булок
  de: 'F\u00fc\u00dfe, Gr\u00f6\u00dfe, Stra\u00dfe',                                        // Füße, Größe, Straße
  ja: '\u304b\u3099\u304d\u3099 \u306f\u309a\u3072\u309a \u5b66\u6821',                      // か+゙ き+゙ は+゚ ひ+゚ 学校（组合浊点，非预组合）
  thai: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e04\u0e38\u0e13\u0e41\u0e21\u0e48',          // สวัสดีคุณแม่
  zwj: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} \u5bb6\u5ead',                               // 👨‍👩‍👧 家庭
  keycap: '1\uFE0F\u20E3 2\uFE0F\u20E3 A',                                                   // 1️⃣ 2️⃣ A
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 3 });
await page.goto(PREVIEW);
await page.waitForTimeout(300);

const info = await page.evaluate((cases) => {
  const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
  const mark = document.querySelector('.mark');
  const cs = getComputedStyle(mark);
  const font = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing']
    .map((k) => `${k}:${cs[k]}`).join(';');
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#fff';
  const out = [];
  for (const [key, text] of Object.entries(cases)) {
    const rows = [
      ['whole', null],
      ['cp', [...text]],
      ['gr', [...seg.segment(text)].map((s) => s.segment)],
      ['wd', text.split(/(\s+)/).filter((p) => p !== '')],
    ];
    for (const [how, parts] of rows) {
      const p = document.createElement('p');
      p.id = `${how}-${key}`;
      p.style.cssText = `margin:16px;padding:0;white-space:nowrap;color:#0d0d0d;${font}`;
      if (!parts) p.textContent = text;
      else for (const part of parts) {
        if (how === 'wd' && /^\s+$/.test(part)) { p.append(document.createTextNode(part)); continue; }
        const span = document.createElement('span');
        span.textContent = part;
        span.style.cssText = 'display:inline-block';
        p.append(span);
      }
      document.body.append(p);
      out.push({ id: p.id, text, cp: [...text].length, gr: [...seg.segment(text)].length });
    }
  }
  window.__info = out;
  return out;
}, CASES);

for (const [key] of Object.entries(CASES)) {
  for (const how of ['whole', 'cp', 'gr', 'wd']) {
    await page.locator(`#${how}-${key}`).screenshot({ path: SHOT(`render-${how}-${key}.png`) });
  }
}

console.log(info.map((r) => `${r.id}  cp=${r.cp} gr=${r.gr}  ${r.text}`).join('\n'));
await browser.close();
