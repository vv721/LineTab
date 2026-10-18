/* A3（逐字错峰）的健壮性与性能体检。
   一次跑三件事：
   A. 文字度量：把引导语拆成逐字 <span> 后，字宽/断行/连字有没有变化（三套皮肤都测）。
   B. 运行时成本：在体验台上真点 A0/A1/A3 三版按钮，量 rAF 帧间隔与主线程指标（含 4× CPU 降速）。
   C. 健壮性：连点两次、reduced-motion、动画是否残留。
   用法：node tmp/probe-a3.mjs */
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url);
const LAB = new URL('细节体验.html', ROOT).href;

const browser = await chromium.launch({ channel: 'chrome' });
const out = {};

/* ---------- A. 文字度量（在真页面上就地测，不改文件） ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(new URL('Preview.html', ROOT).href);
  await page.waitForTimeout(300);

  out.metrics = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const mark = document.querySelector('.mark');
    const wrap = mark.parentElement;
    const measure = (text, split, extra = {}) => {
      const el = document.createElement('span');
      el.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0';
      for (const [k, v] of Object.entries(extra)) el.style[k] = v;
      if (split) for (const ch of text) el.append(Object.assign(document.createElement('span'), { textContent: ch }));
      else el.textContent = text;
      wrap.append(el);
      const r = el.getBoundingClientRect().width;
      const rects = [...el.getClientRects()].length;
      el.remove();
      return { w: +r.toFixed(3), rects };
    };
    const res = { phrase: mark.textContent, skins: {}, grapheme: {}, wrap: {} };
    const orig = stage.getAttribute('data-style');
    for (const skin of ['paper', 'grid', 'clay']) {
      stage.setAttribute('data-style', skin);
      const fam = getComputedStyle(mark).fontFamily;
      const whole = measure(res.phrase, false);
      const split = measure(res.phrase, true);
      res.skins[skin] = {
        fontFamily: fam.split(',')[0],
        whole: whole.w, split: split.w,
        deltaPx: +(split.w - whole.w).toFixed(3),
        deltaPermille: +(((split.w - whole.w) / whole.w) * 1000).toFixed(2),
        kernWhole: measure('AV Ty', false).w, kernSplit: measure('AV Ty', true).w,
      };
      // 断行：同一段文字塞进 120px 宽的盒子，整段 vs 逐字
      res.wrap[skin] = {
        whole: measure(res.phrase, false, { whiteSpace: 'normal', width: '120px' }).rects,
        split: measure(res.phrase, true, { whiteSpace: 'normal', width: '120px' }).rects,
      };
    }
    if (orig) stage.setAttribute('data-style', orig);
    // 码点 vs 字素簇
    const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    res.grapheme = {
      emojiTone: [...'👍🏽'].length, emojiToneGraphemes: [...seg.segment('👍🏽')].length,
      zwj: [...'👨‍👩‍👧'].length, zwjGraphemes: [...seg.segment('👨‍👩‍👧')].length,
    };
    // 需要连写的文字：整段 vs 逐字（用当前皮肤的字体栈）
    res.arabic = { whole: measure('السلام عليكم', false).w, split: measure('السلام عليكم', true).w };
    return res;
  });
  out.metricsErrors = errors;
  await page.close();
}

/* ---------- B/C. 运行时成本与健壮性（体验台） ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(LAB);
  await page.waitForTimeout(400);

  const runOnce = async (kind, { throttle = 1 } = {}) => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(() => document.querySelector('[data-sk-reset]').click());
    await page.waitForTimeout(120);
    const before = await cdp.send('Performance.getMetrics');
    const res = await page.evaluate(async (k) => {
      const btn = document.querySelector(`[data-sk-go="${k}"][data-sk-to="grid"]`);
      const ts = [];
      const t0 = performance.now();
      btn.click();
      const animCount = document.getAnimations().filter((a) => a.playState !== 'idle').length;
      await new Promise((done) => {
        const tick = (t) => {
          ts.push(t);
          if (t - t0 < 750) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      const deltas = ts.slice(1).map((t, i) => t - ts[i]);
      const sorted = [...deltas].sort((a, b) => a - b);
      const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2);
      return {
        animCount,
        frames: ts.length,
        long16: deltas.filter((d) => d > 16.7).length,
        long33: deltas.filter((d) => d > 33).length,
        max: +Math.max(...deltas).toFixed(2),
        p50: q(0.5), p95: q(0.95),
        cuts: document.querySelector(`[data-sk-cuts="${k}"]`).textContent,
        chars: document.querySelectorAll(`[data-sk="${k}"] .sk-q span`).length,
      };
    }, kind);
    await page.waitForTimeout(150);
    const after = await cdp.send('Performance.getMetrics');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const pick = (m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));
    const b = pick(before), a = pick(after);
    return {
      ...res,
      recalc: Math.round(a.RecalcStyleCount - b.RecalcStyleCount),
      layout: Math.round(a.LayoutCount - b.LayoutCount),
      taskMs: +(((a.TaskDuration - b.TaskDuration)) * 1000).toFixed(1),
      layoutMs: +((a.LayoutDuration - b.LayoutDuration) * 1000).toFixed(1),
      recalcMs: +((a.RecalcStyleDuration - b.RecalcStyleDuration) * 1000).toFixed(1),
    };
  };

  out.runtime = { '1x': {}, '4x': {} };
  for (const throttle of [1, 4]) {
    for (const kind of ['a0', 'a1', 'a3']) {
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await runOnce(kind, { throttle }));
      // 取中位数那一轮，另外记录三次的 long16 总和供参考
      runs.sort((x, y) => x.max - y.max);
      out.runtime[throttle + 'x'][kind] = { ...runs[1], long16_runs: runs.map((r) => r.long16) };
    }
  }

  /* C1 连点：100ms 内切两次，终态应等于最后一次目标 */
  const rapid = await page.evaluate(async () => {
    const q = '[data-sk="a3"]';
    document.querySelector('[data-sk-go="a3"][data-sk-to="grid"]').click();
    await new Promise((r) => setTimeout(r, 100));
    document.querySelector('[data-sk-go="a3"][data-sk-to="clay"]').click();
    await new Promise((r) => setTimeout(r, 900));
    const host = document.querySelector(q);
    const cs = getComputedStyle(host);
    const anims = document.getAnimations();
    return {
      style: host.getAttribute('data-style'),
      bg: cs.getPropertyValue('--bg').trim(),
      font: getComputedStyle(host.querySelector('.sk-qb')).fontFamily.split(',')[0],
      pending: anims.filter((a) => a.playState === 'running' || a.playState === 'paused').length,
      qtbOpacity: getComputedStyle(host.querySelector('.sk-qb')).opacity,
      qtaOpacity: getComputedStyle(host.querySelector('.sk-qa')).opacity,
    };
  });

  /* C2 reduced-motion */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(async () => {
    document.querySelector('[data-sk-reset]').click();
    await new Promise((r) => setTimeout(r, 100));
    document.querySelector('[data-sk-go="a3"][data-sk-to="grid"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const host = document.querySelector('[data-sk="a3"]');
    return {
      style: host.getAttribute('data-style'),
      dur: getComputedStyle(host).getPropertyValue('--dur-theme').trim(),
      cuts: document.querySelector('[data-sk-cuts="a3"]').textContent,
    };
  });

  out.robust = { rapid, reduced, errors };
  await page.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
