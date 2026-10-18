/* A3 体检第二版：① 用真引导语的字脸/字号量"拆字"的文字度量损失（含像素对照）；
   ② 查 reduced-motion 下 07 节的实际行为。用法：node tmp/probe-a3-v2.mjs */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const LAB = new URL('细节体验.html', ROOT).href;
const SHOTS = new URL('tmp/lab-shots/', ROOT).pathname.replace(/^\//, '');

const browser = await chromium.launch({ channel: 'chrome' });
const out = {};

/* ---------- ① 文字度量：真字脸 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(new URL('Preview.html', ROOT).href);
  await page.waitForTimeout(300);

  out.metrics = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const mark = document.querySelector('.mark');
    const cs0 = getComputedStyle(mark);
    const phrase = mark.textContent;
    const rig = document.createElement('div');
    rig.style.cssText = 'position:absolute;left:0;top:0;z-index:9;background:transparent';
    stage.append(rig);
    const mk = (text, split) => {
      const el = document.createElement('span');
      // 真引导语的全部字面属性：这一版不再靠"碰巧继承"
      el.style.cssText = 'display:inline-block;white-space:pre';
      el.style.fontFamily = cs0.fontFamily;
      el.style.fontSize = cs0.fontSize;
      el.style.fontWeight = cs0.fontWeight;
      el.style.letterSpacing = cs0.letterSpacing;
      el.style.lineHeight = cs0.lineHeight;
      el.style.color = cs0.color;
      if (split) for (const ch of text) el.append(Object.assign(document.createElement('span'), { textContent: ch }));
      else el.textContent = text;
      return el;
    };
    const measure = (el) => {
      rig.replaceChildren(el);
      const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(3), h: +r.height.toFixed(2), rects: [...el.getClientRects()].length };
    };
    const res = { phrase, fontSize: cs0.fontSize, skins: {}, wrap: {}, arabic: {}, cjk: {} };
    const orig = stage.getAttribute('data-style');
    for (const skin of ['paper', 'grid', 'clay']) {
      stage.setAttribute('data-style', skin);
      const fam = getComputedStyle(mark).fontFamily;
      const whole = measure(mk(phrase, false));
      const split = measure(mk(phrase, true));
      res.skins[skin] = {
        font: fam.split(',')[0].trim(),
        whole: whole.w, split: split.w,
        deltaPx: +(split.w - whole.w).toFixed(3),
        deltaPermille: +(((split.w - whole.w) / whole.w) * 1000).toFixed(2),
      };
      // 断行：塞进 90px 宽的盒子，靠高度判断有没有换行（整段 vs 逐字）
      for (const [k, el] of [['whole', mk(phrase, false)], ['split', mk(phrase, true)]]) {
        el.style.width = '90px';
        el.style.whiteSpace = 'normal';
        el.style.display = 'block';
        const h = measure(el).h;
        res.wrap[skin] = Object.assign(res.wrap[skin] || {}, { [k]: h });
      }
      // 需要连写 / 字素簇的文字
      for (const [k, text] of [['arabic', 'السلام عليكم'], ['cjk', '引导语字体']]) {
        const w = measure(mk(text, false)).w, s = measure(mk(text, true)).w;
        res[k][skin] = { whole: w, split: s, deltaPx: +(s - w).toFixed(3) };
      }
    }
    if (orig) stage.setAttribute('data-style', orig);
    res.grapheme = {
      emojiToneCodePoints: [...'👍🏽'].length,
      emojiToneGraphemes: [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment('👍🏽')].length,
    };
    return res;
  });
  out.metricsErrors = errs;
  await page.close();
}

/* ---------- ② reduced-motion 下的实际行为（逐拍读数） ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(LAB);
  await page.waitForTimeout(400);
  const steps = [];
  const snap = (label) => page.evaluate((l) => {
    const host = document.querySelector('[data-sk="a3"]');
    return {
      label: l,
      style: host.getAttribute('data-style'),
      cuts: document.querySelector('[data-sk-cuts="a3"]').textContent,
      anims: document.getAnimations().length,
      dur: getComputedStyle(host).getPropertyValue('--dur-theme').trim(),
      qa: getComputedStyle(host.querySelector('.sk-qa')).opacity,
      clock: document.querySelector('[data-sk-clock]').textContent,
    };
  }, label);

  steps.push(await snap('初始'));
  await page.evaluate(() => document.querySelector('[data-sk-reset]').click());
  await page.waitForTimeout(150);
  steps.push(await snap('复位后'));
  await page.evaluate(() => document.querySelector('[data-sk-go="a3"][data-sk-to="grid"]').click());
  await page.waitForTimeout(120);
  steps.push(await snap('切点阵 +120ms'));
  await page.waitForTimeout(900);
  steps.push(await snap('切点阵 +1020ms'));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.evaluate(() => document.querySelector('[data-sk-reset]').click());
  await page.waitForTimeout(150);
  steps.push(await snap('reduced 复位后'));
  await page.evaluate(() => document.querySelector('[data-sk-go="a3"][data-sk-to="grid"]').click());
  await page.waitForTimeout(150);
  steps.push(await snap('reduced 切点阵 +150ms'));
  await page.waitForTimeout(900);
  steps.push(await snap('reduced 切点阵 +1050ms'));
  out.reducedSteps = steps;
  out.reducedErrors = errs;
  await page.close();
}

await browser.close();
writeFileSync(new URL('tmp/a3-probe-v2.json', ROOT), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
