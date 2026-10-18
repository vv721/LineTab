/* A3 在多语言 / 多符号 / 自定义文本下的可行性体检。
   A. 分段策略对照：整段 / 按码点拆 / 按字素簇拆 —— 三者的宽度、行盒、以及逐行像素差。
   B. 长单词断行：整段 vs 逐字，塞进窄盒。
   C. 规模曲线：N = 14 / 40 / 120 / 240 字时的建节点耗时、动画条数、帧成本。
   用法：node tmp/probe-a3-langs.mjs  → tmp/a3-langs.json + tmp/lab-shots/a3seg-*.png */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const LAB = new URL('细节体验.html', ROOT).href;
const PREVIEW = new URL('Preview.html', ROOT).href;
const SHOT = (name) => fileURLToPath(new URL('tmp/lab-shots/' + name, ROOT));

const CASES = [
  ['ascii', 'Type something'],
  ['cjk', '今天想去哪儿'],
  ['ja', 'おはよう、今日は'],
  ['ko', '안녕하세요'],
  ['thai', 'สวัสดีตอนเช้า'],
  ['deva', 'नमस्ते दुनिया'],
  ['arabic', 'السلام عليكم'],
  ['hebrew', 'שלום עולם'],
  ['bidi', 'Hello مرحبا 123'],
  ['zwj', '👨‍👩‍👧 家庭'],
  ['tone', '👍🏽 很好'],
  ['flag', '🇨🇳 中国'],
  ['vs16', '❤️ 爱心'],
  ['keycap', '1️⃣ 数字'],
  ['longword', 'Supercalifragilisticexpialidocious'],
  ['spaces', 'a  b'],
  ['newline', 'line1\nline2'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const out = { cases: CASES.map(([k]) => k), metrics: {}, wrap: {}, scale: {} };

/* ---------- A. 三列对照 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1300, height: 1060 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(PREVIEW);
  await page.waitForTimeout(300);

  await page.evaluate((cases) => {
    const mark = document.querySelector('.mark');
    const cs = getComputedStyle(mark);
    const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    const host = document.createElement('div');
    host.id = 'a3rig';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#fff;padding:0;' +
      'display:grid;grid-template-columns:repeat(4,320px);width:1280px';
    // whole2 是 whole 的复制件：用来量"同一份渲染两次"的噪声底，否则像素差没法解读
    for (const [key, text] of cases) {
      for (const how of ['whole', 'whole2', 'cp', 'gr']) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.case = key;
        cell.dataset.how = how;
        cell.style.cssText = 'width:320px;height:56px;overflow:hidden;white-space:pre;' +
          'font-kerning:normal;box-sizing:border-box;padding:4px 6px';
        cell.style.fontFamily = cs.fontFamily;
        cell.style.fontSize = cs.fontSize;
        cell.style.fontWeight = cs.fontWeight;
        cell.style.letterSpacing = cs.letterSpacing;
        cell.style.lineHeight = cs.lineHeight;
        cell.style.color = cs.color;
        if (how === 'whole' || how === 'whole2') cell.textContent = text;
        else {
          const parts = how === 'cp' ? [...text] : [...seg.segment(text)].map((s) => s.segment);
          for (const p of parts) cell.append(Object.assign(document.createElement('span'), { textContent: p }));
        }
        host.append(cell);
      }
    }
    // 每一行外面再包一层，方便按行截图
    const rows = [];
    for (const [key] of cases) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.case = key;
      row.style.cssText = 'grid-column:1 / -1;display:grid;grid-template-columns:repeat(4,320px)';
      host.append(row);
      rows.push(row);
    }
    document.body.append(host);
    const cells = [...host.querySelectorAll('.cell')];
    rows.forEach((row, i) => {
      const key = row.dataset.case;
      for (const how of ['whole', 'whole2', 'cp', 'gr']) {
        row.append(cells.find((c) => c.dataset.case === key && c.dataset.how === how));
      }
    });
    host.querySelectorAll('.cell').forEach((c) => {
      c.style.outline = '1px solid #eee';
    });
  }, CASES);

  for (const [key] of CASES) {
    await page.locator(`#a3rig .row[data-case="${key}"]`).screenshot({ path: SHOT(`a3seg-${key}.png`) });
  }

  out.metrics = await page.evaluate((cases) => {
    const mark = document.querySelector('.mark');
    const cs = getComputedStyle(mark);
    const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    const res = {};
    const measure = (text, how) => {
      const el = document.createElement('span');
      el.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre';
      el.style.fontFamily = cs.fontFamily; el.style.fontSize = cs.fontSize;
      el.style.fontWeight = cs.fontWeight; el.style.letterSpacing = cs.letterSpacing;
      if (how === 'whole') el.textContent = text;
      else {
        const parts = how === 'cp' ? [...text] : [...seg.segment(text)].map((s) => s.segment);
        for (const p of parts) el.append(Object.assign(document.createElement('span'), { textContent: p }));
      }
      document.body.append(el);
      const r = el.getBoundingClientRect();
      el.remove();
      return +r.width.toFixed(3);
    };
    for (const [key, text] of cases) {
      const clusters = [...seg.segment(text)].map((s) => s.segment);
      res[key] = {
        codePoints: [...text].length,
        graphemes: clusters.length,
        clusters: clusters.slice(0, 8),
        wWhole: measure(text, 'whole'),
        wCp: measure(text, 'cp'),
        wGr: measure(text, 'gr'),
      };
      res[key].dCp = +(res[key].wCp - res[key].wWhole).toFixed(3);
      res[key].dGr = +(res[key].wGr - res[key].wWhole).toFixed(3);
    }
    return res;
  }, CASES);

  /* 长单词断行：90px 窄盒，整段 vs 逐字 */
  out.wrap = await page.evaluate(() => {
    const mark = document.querySelector('.mark');
    const cs = getComputedStyle(mark);
    const word = 'Supercalifragilisticexpialidocious';
    const mk = (split) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:90px;white-space:normal';
      el.style.fontFamily = cs.fontFamily; el.style.fontSize = cs.fontSize;
      el.style.fontWeight = cs.fontWeight; el.style.letterSpacing = cs.letterSpacing;
      el.style.lineHeight = cs.lineHeight;
      if (split) for (const ch of word) el.append(Object.assign(document.createElement('span'), { textContent: ch }));
      else el.textContent = word;
      document.body.append(el);
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].length;
      el.remove();
      return { h: +r.height.toFixed(1), w: +r.width.toFixed(1), lineRects: rects };
    };
    return { whole: mk(false), split: mk(true) };
  });

  out.rigErrors = errs;
  await page.close();
}

/* ---------- C. 规模曲线（在体验台里跑，CPU 4× 也测一遍） ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(LAB);
  await page.waitForTimeout(400);

  out.scale = await page.evaluate(() => {
    const stage = document.querySelector('[data-sk="a3"] .sk-stage');
    return { hasStage: !!stage };
  });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#a3scale{position:fixed;left:0;top:0;z-index:99;background:#fff}' +
      '#a3scale .lay{position:absolute;left:0;top:0;white-space:pre;font-family:system-ui;font-size:20px}' +
      '#a3scale .lay.qa{opacity:1}';
    document.head.append(st);
    const rig = document.createElement('div');
    rig.id = 'a3scale';
    rig.style.cssText = 'width:600px;height:220px';
    document.body.append(rig);
    window.__mkScale = (n) => {
      const rig = document.querySelector('#a3scale');
      rig.innerHTML = '';
      const text = 'W'.repeat(n);
      const t0 = performance.now();
      const layers = ['a', 'b'].map((c) => {
        const el = document.createElement('div');
        el.className = 'lay ' + c;
        for (const ch of text) el.append(Object.assign(document.createElement('span'), { textContent: ch }));
        rig.append(el);
        return el;
      });
      const buildMs = +(performance.now() - t0).toFixed(2);
      const anims = [];
      layers.forEach((el, li) => {
        [...el.children].forEach((ch, i) => anims.push(ch.animate(
          li === 0 ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
          { duration: 252, delay: i * 26, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' })));
      });
      return { buildMs, anims: anims.length, list: anims };
    };
  });

  const run = async (n, throttle) => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const before = await cdp.send('Performance.getMetrics');
    const res = await page.evaluate(async (count) => {
      const { buildMs, anims, list } = window.__mkScale(count);
      const ts = [];
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = (t) => { ts.push(t); if (t - t0 < 700) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
      list.forEach((a) => a.cancel());
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
      const q = (p) => +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(2);
      return {
        buildMs, anims: anims.length, frames: ts.length,
        long16: d.filter((x) => x > 16.7).length, max: +Math.max(...d).toFixed(2), p50: q(.5), p95: q(.95),
      };
    }, n);
    const after = await cdp.send('Performance.getMetrics');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const pick = (m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));
    const b = pick(before), a = pick(after);
    return { ...res, taskMs: +((a.TaskDuration - b.TaskDuration) * 1000).toFixed(1),
      recalc: Math.round(a.RecalcStyleCount - b.RecalcStyleCount) };
  };

  out.scale = { '1x': {}, '4x': {} };
  for (const n of [14, 40, 120, 240]) out.scale['1x'][n] = await run(n, 1);
  for (const n of [40, 120, 240]) out.scale['4x'][n] = await run(n, 4);

  /* D. 轮换与换肤撞车：动画在跑时重建节点 */
  out.rotate = await page.evaluate(async () => {
    const rig = document.querySelector('#a3scale');
    window.__mkScale(40);
    await new Promise((r) => setTimeout(r, 120));
    // 轮换 = 拆掉重建成另一段文字，同时再切一次皮肤
    const t0 = performance.now();
    window.__mkScale(23);
    document.querySelector('[data-sk-go="a3"][data-sk-to="clay"]').click();
    await new Promise((r) => setTimeout(r, 1000));
    const host = document.querySelector('[data-sk="a3"]');
    const anims = document.getAnimations();
    return {
      rebuildAndSwitchMs: +(performance.now() - t0).toFixed(0),
      style: host.getAttribute('data-style'),
      running: anims.filter((a) => a.playState === 'running' || a.playState === 'paused').length,
      qa: getComputedStyle(host.querySelector('.sk-qa')).opacity,
      qb: getComputedStyle(host.querySelector('.sk-qb')).opacity,
      scaleSpans: rig.querySelectorAll('span').length,
    };
  });
  out.scaleErrors = errs;
  await page.close();
}

await browser.close();
writeFileSync(new URL('tmp/a3-langs.json', ROOT), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
