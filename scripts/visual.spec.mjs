/**
 * 视觉回归测试（开发期校验，不进入扩展产物）。
 *
 * 断的是「风格漂移」：tokens.css / preview.css 里任何一个取值被改动，
 * 这里的基准图比对就会失败，并输出差分图（tmp/pw-artifacts）。
 *
 * 页面是本地文件、零网络请求，所以不需要等 networkidle；
 * 舞台直接引用扩展本体的 newtab.css，所以这里守的是"看稿页 = 真页面的结构
 * ＋各风格令牌"：形态漂了、令牌漂了，都会在这里变红。
 *
 * 用户 m02895 之后看稿页就是"发布态"：三套风格共用**一幅**舞台（换的只是 data-style），
 * 页面里没有看稿工具条，风格 / 暗色 / 焦点反馈一律从设置面板里切。
 * hash 只是给测试用的状态种子（#paper / #grid / #clay / +dark / +panel / +menu / +dlg / +focus）。
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// 按脚本自身位置解析页面，而不是当前工作目录——这样从任何目录运行都找得到
// （用 path.resolve('design/Preview.html') 会跟着 cwd 走，在别的目录下整轮 ERR_FILE_NOT_FOUND）。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(path.join(ROOT, 'design', 'Preview.html')).href;

/** 镜头清单：[hash 参数, 中文名]。 */
const SHOTS = [
  ['paper', '纸白'],
  ['grid', '点阵'],
  ['clay', '暖陶'],
  ['paper+dark', '纸白 自动暗色'],
  ['grid+dark', '点阵 自动暗色'],
  ['clay+dark', '暖陶 自动暗色'],
  ['paper+panel', '纸白 设置面板'],
  ['grid+dark+panel', '点阵 暗色 + 设置面板'],
  ['clay+panel', '暖陶 设置面板'],
  ['clay+focus', '暖陶 聚焦态'],
  ['clay+noserif', '暖陶 关掉衬线（对比中文小字号）'],
  ['clay+menu', '暖陶 二级下拉菜单展开'],
  ['paper+menu', '纸白 二级下拉菜单展开'],
  ['grid+menu', '点阵 二级下拉菜单展开'],
  ['clay+stylemenu', '暖陶 从面板里换风格（发布态的唯一入口）'],
  ['clay+dlg', '暖陶 自定义引擎弹窗'],
  ['paper+dlg', '纸白 自定义引擎弹窗'],
  ['grid+dark+dlg', '点阵 暗色 + 自定义引擎弹窗'],
];

for (const [hash, label] of SHOTS) {
  test(`镜头 ${hash}（${label}）`, async ({ page }) => {
    await page.goto(`${PAGE}#${hash}`);

    // 等页面把状态摆好：只显示被选中的那一套
    const stage = page.locator('.stage[data-active]');
    await expect(stage).toBeVisible();

    // 舞台里就是真页面的结构：引导语、搜索框、提示行、设置面板。
    // 整合之后三套风格共用**同一份** markup（换的只是舞台那一个 data-style），
    // 所以这里断的是"看不看得见"，不是"有没有这个元素"。
    await expect(stage.locator('.q')).toBeVisible();
    // 提示行、引导语、面板 5 行设置 + 5 行引导语参数：三套都有、都显示（用户 m02895：
    // UI 与功能三套一套，差异只在配色 / 字体 / 和谐）。真页面增删设置项时这条会跟着提醒改。
await expect(stage.locator('.hint')).toHaveCount(0);   // 用户 m03467：那句提示行不符合设计，已从页面里删掉
    await expect(stage.locator('.panel .row')).toHaveCount(10);
    const shown = locator => locator.evaluate(el => getComputedStyle(el).display !== 'none');
    expect(await shown(stage.locator('.row-param').first())).toBe(true);
    expect(await shown(stage.locator('.row-sep'))).toBe(true);
    await expect(stage.locator('.mark')).toHaveCount(1);
    expect(await shown(stage.locator('.mark'))).toBe(true);
    await expect(stage.locator('.mark')).toHaveText('Type something');

    // 选项行是真的二级下拉菜单 / 弹窗（用户 m05424）：断"真的展开了"，
    // 不是"DOM 里有个盒子"——菜单里应该有 3 项（Bing / Google / 自定义…），
    // 弹窗里保存按钮在没有合法输入时必须是 disabled。
    if (hash.includes('menu')) {
      await expect(stage.locator('.menu:not([hidden]) .menu-opt')).toHaveCount(3);
    }
    if (hash.includes('dlg')) {
      await expect(stage.locator('.dlg')).toBeVisible();
      await expect(stage.locator('.dlg [data-dlg-save]')).toBeDisabled();
    }

    // 引擎标签：纸白 / 点阵 是等宽大写，暖陶 是句子大小写（本轮按规范裁决的那一条）
await expect(stage.locator('.tag')).toHaveText('Bing');   // 内容永远是同一句（句子形）
await expect(stage.locator('.tag')).toHaveCSS('text-transform', hash.startsWith('clay') ? 'none' : 'uppercase');

    // 发布态没有看稿工具条：它是为了方便审视做的随手按键，不属于标签页本身（用户 m02895）
    await expect(page.locator('.bar')).toHaveCount(0);

    // 聚焦那一条要的是"聚焦之后的样子"，不是过渡的中间态，也不该把闪烁的光标算进基准图：
    // 先断言真的聚焦了，再把过渡关掉、把光标设成透明，最后才截图。
    // （加这一手之前这 1 张图偶尔会红一次 —— 基准图必须每次逐字节一样。）
    if (hash.includes('focus')) {
      await expect(page.locator('.stage[data-active] .q')).toBeFocused();
      await page.addStyleTag({ content: '* { transition: none !important; } .q { caret-color: transparent !important; }' });
      await page.waitForTimeout(100);
    }

    await expect(page).toHaveScreenshot(`${hash.replace(/\+/g, '-')}.png`);
  });
}

test('设置按钮能把面板打开（aria 与视觉同步）', async ({ page }) => {
  await page.goto(`${PAGE}#paper`);

  const stage = page.locator('.stage[data-active]');
  const button = stage.locator('.settings');
  const panel = stage.locator('.panel');

  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.click();

  await expect(panel).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
});

/* ---------- 二级下拉菜单 / 弹窗的行为（用户 m05424）----------
   上面那些镜头只断"长得对"，这一组断"选下去会发生什么"：
   选项写反、焦点掉在隐藏元素上、状态不同步这几类问题，截图一张都看不出来。 */
// 行一律锚在舞台本身。整合之后三套风格共用同一个 .stage（换的只是 data-style），
// 所以不能再写 .stage[data-style="clay"]：切到纸白那一套时它一个元素都匹配不到，
// 断言就会"因为看错了元素"而假绿。
const STAGE = '.stage';
const stageRow = (page, label) => page.locator(`${STAGE} .panel .row`)
  .filter({ has: page.locator('.rl', { hasText: label }) });

/** 打开暖陶的设置面板（打开时页面会把光标放进搜索框，先把焦点让开，免得吃掉快捷键）。 */
async function openSettings(page) {
  await page.locator('.stage[data-active] .settings').click();
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

test('暗色菜单三档与舞台明暗一致（on = 常暗、off = 常亮）', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const button = stageRow(page, '暗色').locator('.rv');
  await expect(button).toContainText('跟随系统');

  await button.click();
  await stageRow(page, '暗色').locator('.menu-opt[data-value="on"]').click();
  await expect(button).toContainText('常暗');
  await expect(stage).toHaveAttribute('data-theme', 'dark');

  await button.click();
  await stageRow(page, '暗色').locator('.menu-opt[data-value="off"]').click();
  await expect(button).toContainText('常亮');
  await expect(stage).not.toHaveAttribute('data-theme', 'dark');

  await button.click();
  await stageRow(page, '暗色').locator('.menu-opt[data-value="auto"]').click();
  await expect(button).toContainText('跟随系统');
});

test('「自定义…」开的弹窗把焦点关在里头，关掉后还给那一行', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const button = stageRow(page, '默认搜索引擎').locator('.rv');
  await button.click();
  await stageRow(page, '默认搜索引擎').locator('.menu-opt[data-value="custom"]').click();

  const dlg = stage.locator('.dlg-back[data-dlg]');
  await expect(dlg).toBeVisible();
  await expect(stage.locator('[data-dlg-name]')).toBeFocused();

  // aria-modal 说"这是模态"，键盘就得真被关在里头（不然 Tab 两下就落到被遮罩盖住的搜索框里）
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => document.querySelector('.stage .dlg-back').contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  // 焦点不能打在刚被藏起来的菜单项上（那样等于掉到 body）
  await expect(button).toBeFocused();
});

test('风格是面板里切出来的：选一行、整页就地换，页面里没有工具条', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const styleRow = stageRow(page, '风格');
  const styleValue = styleRow.locator('.rv');
  await expect(styleValue).toContainText('暖陶');

  // 发布态（用户 m02895）：底部那排"看稿工具条"不属于标签页，页面里不该有它；
  // 风格只有设置面板这一个入口，选完面板不收、行里的值当场同步
  await expect(page.locator('.bar')).toHaveCount(0);

  const pick = async (value, label) => {
    if (await styleRow.locator('.menu').isHidden()) await styleValue.click();
    await styleRow.locator(`.menu-opt[data-value="${value}"]`).click();

    // A3（用户 m05145）：换肤那一拍，引导语拆成两张叠着的脸逐单元换。断的是"机制在场"：
    //   ① 两张脸 + 每个字素簇一个单元（这句 13 个字素，空格不占格）；
    //   ② 旧脸的字脸在改 data-style 之前就被内联冻结了 —— 忘了冻结的话两边都会是新字脸，这一条就红；
    //   ③ 错峰真的逐格加（末一个单元的过渡延迟 > 第一个），且步长没超过 26ms 上限；
    //   ④ 收尾之后回到"一张脸、一段文本"，DOM 不累积。
    const flight = await stage.locator('.mark').evaluate(el => {
      // 两张脸各拆一份，所以只数新脸那一份（= 这段文本的字素簇数，空格不占格）
      const units = [...el.querySelectorAll('.is-new .mk-u')];
      const old = el.querySelector('.is-old');
      const next = el.querySelector('.is-new');
      // computed 的 transitionDelay 是秒（如 "0.312s"），一律换算成 ms 再比
      const delay = node => (Number.parseFloat(getComputedStyle(node).transitionDelay) || 0) * 1000;
      return {
        faces: el.querySelectorAll('.mk-face').length,
        units: units.length,
        frozen: getComputedStyle(old).fontFamily,
        fresh: getComputedStyle(next).fontFamily,
        firstDelay: delay(units[0]),
        lastDelay: delay(units[units.length - 1]),
        step: Number.parseFloat(el.style.getPropertyValue('--mk-step')) || 0,
        dur: Number.parseFloat(getComputedStyle(el).getPropertyValue('--dur-theme')) || 0,
        face: (Number.parseFloat(getComputedStyle(units[0]).transitionDuration) || 0) * 1000,
        oldH: old.offsetHeight,
        newH: next.offsetHeight,
        newW: next.getBoundingClientRect().width,
        // 量一次"不换行时的自然宽度"：新脸的盒子不许比它窄（窄了就会换行）
        natural: (() => {
          const was = next.style.whiteSpace;
          next.style.whiteSpace = 'nowrap';
          const w = next.getBoundingClientRect().width;
          next.style.whiteSpace = was;
          return w;
        })(),
      };
    });
    expect(flight.faces).toBe(2);
    expect(flight.units).toBe(13);
    expect(flight.frozen).not.toBe(flight.fresh);
    expect(flight.step).toBeGreaterThan(0);
    expect(flight.step).toBeLessThanOrEqual(26);
    expect(flight.lastDelay).toBeGreaterThan(flight.firstDelay);
    // 数值契约（只断结构的话，把 FACE_RATIO / FACE_FILL 改成 0.05 / 0.01 也全绿）：
    // 单元淡入时长 = --dur-theme × 0.6；错峰 = --dur-theme × 0.805 /（单元数 − 1），且不超过 26ms 上限
    expect(flight.face).toBeCloseTo(flight.dur * 0.6, 0);
    expect(flight.step).toBeCloseTo(Math.min(26, (flight.dur * 0.805) / (flight.units - 1)), 1);
    expect(flight.lastDelay + flight.face).toBeGreaterThanOrEqual(flight.dur * 0.8);
    expect(flight.lastDelay + flight.face).toBeLessThanOrEqual(flight.dur * 1.405 + 30);
    // 换肤中途新脸不能换行（用户 m05277）：绝对定位时它的宽度会被旧脸的盒子撑着，
    // 新字脸更宽就会被挤出 1~2 个字 —— 盒子必须至少等于它的自然宽度
    expect(flight.newW).toBeGreaterThanOrEqual(flight.natural - 1);
    expect(Math.abs(flight.newH - flight.oldH)).toBeLessThanOrEqual(2);

    await expect(stage).toHaveAttribute('data-style', value);
    await expect(styleValue).toContainText(label);

    await expect(stage.locator('.mark')).toHaveText('Type something');
    await expect(stage.locator('.mark .mk-face')).toHaveCount(0);
  };

  await pick('paper', '纸白');
  await pick('grid', '点阵');
  await pick('clay', '暖陶');

  // 换风格换的是"这套皮肤"，不是"这一页的功能"：引导语 / 参数行 / 菜单都还在
  await expect(stage.locator('.mark')).toBeVisible();
  await expect(stage.locator('.row-param')).toHaveCount(5);
  await expect(styleRow.locator('.menu')).toBeAttached();
});

/* ---------- 版式控件的一致性 / 亮暗过场（用户 m00768）----------
   这两条守的是"做法别再漂回去"：对齐曾经是二级菜单，暖陶的亮暗曾经是硬切。 */

// A3 的降级口径（用户 m05146）：时长归零时（减少动效 / 首屏）不拆字、也不交叉淡入 ——
// 当场换掉。这条钉住 beginFaceSwitch 里那句 `if (world <= 0) return null`：
// 删掉它就会先闪两帧旧字再硬切，DOM 里也会留下两张脸。
test('减少动效下换肤：不拆字、不交叉淡入，当场换', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const styleRow = stageRow(page, '风格');
  await styleRow.locator('.rv').click();
  await styleRow.locator('.menu-opt[data-value="paper"]').click();

  const state = await stage.locator('.mark').evaluate(el => ({
    faces: el.querySelectorAll('.mk-face').length,
    plain: el.classList.contains('is-plain'),
    text: el.textContent,
    dur: Number.parseFloat(getComputedStyle(el).getPropertyValue('--dur-theme')) || 0,
  }));
  expect(state.dur).toBe(0);
  expect(state.faces).toBe(0);
  expect(state.plain).toBe(false);
  expect(state.text).toBe('Type something');
  await expect(stage).toHaveAttribute('data-style', 'paper');
});

test('「引导语对齐」和另外四行一样是滑块，拖它引导语真的挪', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const row = stageRow(page, '引导语对齐');
  const range = row.locator('input[type="range"]');
  const out = row.locator('output');
  const markX = async () => (await page.locator(`${STAGE} .mark`).boundingBox()).x;

  // 版式控件一律滑块：这一行既没有二级菜单，也没有那个 .rv 按钮
  await expect(range).toBeVisible();
  await expect(row.locator('.rv')).toHaveCount(0);
  await expect(row.locator('.menu')).toHaveCount(0);
  await expect(range).toHaveAttribute('min', '0');
  await expect(range).toHaveAttribute('max', '2');
  await expect(range).toHaveAttribute('step', '1');

  // 三档按空间顺序：往右拖就是往右靠；居中这一档不挂 data-align（等于默认版式）
  await expect(out).toHaveText('居中');
  await expect(stage).not.toHaveAttribute('data-align', /.*/);

  /* 滑块的头与两段轨迹都是自己画的（用户 m03794 第 3 条、m04538 报的"位置偏移"）：
     原生外观下"未填充"那段由浏览器按 accent-color 现调中间色，既不跟皮肤的令牌走、
     亮暗/换肤时也不会逐色过渡；而头由浏览器自己摆、轨迹由 CSS 按百分比摆时，两者还会差出
     小半格。所以量四件事：原生外观已关掉、两段各取一支颜色令牌，以及位置那一个数
     （--slider-frac）跟着取值走 —— 头心与已填充的右端都由它算，量一个就等于量两个。 */
  const paint = await range.evaluate(el => {
    const s = getComputedStyle(el);
    return {
      appearance: s.appearance,
      fill: s.getPropertyValue('--slider-fill').trim(),
      rest: s.getPropertyValue('--border-strong').trim(),
      frac: s.getPropertyValue('--slider-frac').trim(),
    };
  });
  expect(paint.appearance).toBe('none');
  expect(paint.fill).not.toBe('');
  expect(paint.rest).not.toBe('');
  expect(paint.fill).not.toBe(paint.rest);
  expect(paint.frac).toBe('0.5');   // 三档里的中间那一档

  const set = value => range.evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const frac = () => range.evaluate(el => getComputedStyle(el).getPropertyValue('--slider-frac').trim());

  const seen = {};
  for (const [value, label, align] of [['0', '左缘', 'start'], ['1', '居中', null], ['2', '右缘', 'end']]) {
    await set(value);
    await expect(out).toHaveText(label);
    if (align) await expect(stage).toHaveAttribute('data-align', align);
    else await expect(stage).not.toHaveAttribute('data-align', /.*/);
    seen[label] = await markX();
    /* 位置那个数跟着取值走。必须用**非默认**档去量：--slider-frac 令牌自己的默认值就是 0.5，
       只看"中间那一档等于 0.5"的话，paintParam() 整段不写也照样绿（复核 P2） */
    expect(await frac()).toBe(String(Number(value) / 2));
  }
  // 读数之外，引导语本身真的从左边挪到了右边
  expect(seen['左缘']).toBeLessThan(seen['居中'] - 100);
  expect(seen['右缘']).toBeGreaterThan(seen['居中'] + 100);

  /* 抓可见的那个滑块头真拖一下（复核 P1）：头与已填充段都是画在原生 input 之上的装饰层，
     只要有一层没让开指针事件，按住看得见的圆头拖动就会一点反应都没有 —— 这条以前测不到，
     因为上面全程是 el.value = … + 派发 input，一次真指针都没有。 */
  await set('1');
  const box = await range.boundingBox();
  const knobX = box.x + 7 + 0.5 * (box.width - 14);   // 与 CSS 里那条算式同一个起点
  await page.mouse.move(knobX, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });   // 一直拖到最右
  await page.mouse.up();
  await expect(out).toHaveText('右缘');
  expect(await frac()).toBe('1');
});

test('亮暗与换肤都走逐色渐变（D1，m03794 起三套统一），关掉动画偏好就归零', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  const clay = page.locator(STAGE);

  // 18 个属性挂在同一条 --dur-theme / --ease-mid 上：15 个"颜色"（11 个语义色 + 面板表面
  // 两件 --panel-bg / --panel-shadow-color + 遮罩 --scrim + 滑块填充 --slider-fill）
  // 外加三条"会随皮肤变的形状"：--panel-r（12px ↔ 4px）、--slider-knob（10px ↔ 8px 头大小）
  // 与 --slider-r（5px 圆头 ↔ 2px 方头）
  const decl = await clay.evaluate(el => {
    const s = getComputedStyle(el);
    return { props: s.transitionProperty, dur: s.transitionDuration, ease: s.transitionTimingFunction };
  });
  expect(decl.props.split(', ').sort()).toEqual([
    '--bg', '--border', '--border-strong', '--panel-bg', '--panel-r', '--panel-shadow-color',
    '--ring', '--scrim', '--slider-fill', '--slider-knob', '--slider-r', '--surface', '--surface-2',
    '--surface-raised', '--text', '--text-2', '--text-3', '--tile-hover',
  ].sort());
  expect(decl.dur.split(', ')).toEqual(new Array(18).fill('0.42s'));
  // cubic-bezier 里自己带逗号，按"整串出现几次"数，别 split(', ')
  expect(decl.ease.split('cubic-bezier(0.45, 0, 0.55, 1)').length - 1).toBe(18);

  /* 三套都跟着化（用户 m03794：亮暗切换与换肤的缓和属于框架功能，上一版只落在暖陶）。
     整合之后三套共用同一个舞台、切风格只走面板那一行，所以在同一个元素上换过去量，再换回来给下面用 */
  await openSettings(page);
  const styleRow = stageRow(page, '风格');
  const pickStyle = async (value) => {
    if (await styleRow.locator('.menu').isHidden()) await styleRow.locator('.rv').click();
    await styleRow.locator(`.menu-opt[data-value="${value}"]`).click();
    await expect(clay).toHaveAttribute('data-style', value);
  };
  for (const value of ['paper', 'grid']) {
    await pickStyle(value);
    expect(await clay.evaluate(
      el => getComputedStyle(el).transitionProperty.includes('--panel-bg'),
    )).toBe(true);
  }
  await pickStyle('clay');

  /* 形状必须"看得见地在变"（用户 m05406 报：圆头 ↔ 方头还是一帧换）。
     把时长拉到 1s 再从纸白切到点阵，40% 处取到的头大小与圆角必须都落在两端之间 ——
     哨兵值（圆角写 9999px）会让 r 直到最后一帧才掉进可见区间，这条就是防它回来。
     不变量：肉眼看到的形状是 min(圆角, 半个头)，它也必须在 (2, 5) 之间。 */
  await clay.evaluate(el => el.style.setProperty('--dur-theme', '1000ms'));
  await pickStyle('paper');
  await page.waitForTimeout(1200);
  await pickStyle('grid');
  await page.waitForTimeout(400);
  const shapeNow = () => clay.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.stage'));
    const s = getComputedStyle(document.querySelector('.sl .knob'));
    const w = Number.parseFloat(s.width);
    return {
      knob: Number.parseFloat(cs.getPropertyValue('--slider-knob')),
      r: Number.parseFloat(cs.getPropertyValue('--slider-r')),
      w,
      rounded: Math.min(Number.parseFloat(s.borderTopLeftRadius), w / 2),
    };
  });
  const midShape = await shapeNow();
  expect(midShape.knob).toBeGreaterThan(8);
  expect(midShape.knob).toBeLessThan(10);
  expect(midShape.r).toBeGreaterThan(2);
  expect(midShape.r).toBeLessThan(5);
  expect(midShape.w).toBeGreaterThan(8);
  expect(midShape.w).toBeLessThan(10);
  expect(midShape.rounded).toBeGreaterThan(2);
  expect(midShape.rounded).toBeLessThan(5);
  await page.waitForTimeout(900);
  const endShape = await shapeNow();
  expect(endShape.w).toBeCloseTo(8, 1);
  expect(endShape.rounded).toBeCloseTo(2, 1);
  await clay.evaluate(el => el.style.removeProperty('--dur-theme'));
  await pickStyle('clay');

  // 拉长到 1s 再翻暗：0.4s 处取到的必须是"既不是亮端、也不是暗端"的中间值
  const bg = () => clay.evaluate(el => getComputedStyle(el).getPropertyValue('--bg').trim());
  await clay.evaluate(el => el.style.setProperty('--dur-theme', '1000ms'));
  const light = await bg();
  const darkRow = stageRow(page, '暗色');
  await darkRow.locator('.rv').click();                      // 发布态没有快捷键，翻暗走面板
  await darkRow.locator('.menu-opt[data-value="on"]').click();
  await page.waitForTimeout(400);
  const mid = await bg();
  await page.waitForTimeout(900);
  const dark = await bg();
  expect(dark).not.toBe(light);
  expect(mid).not.toBe(light);
  expect(mid).not.toBe(dark);

  // 关掉动画偏好：同一段过渡直接归零，不需要 JS 判断
  // （先摘掉上面那行内时长，否则 inline 会盖住媒体查询里的 0s）
  await clay.evaluate(el => el.style.removeProperty('--dur-theme'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(clay).toHaveAttribute('data-theme', 'dark');
  expect(await clay.evaluate(el => getComputedStyle(el).getPropertyValue('--dur-theme').trim())).toBe('0s');
});

/* ---------- 引擎清单：复选 → 轮切 → 拖动排序（用户 m01021）----------
   这三件事是一串的：✓ 决定轮切"轮哪些"，菜单次序决定轮切"按什么顺序轮"。
   所以这条测试也按这个链条走。 */

test('引擎改成复选、点标签轮切、拖动改次序且轮切跟着新次序走', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  await openSettings(page);

  const stage = page.locator(STAGE);
  const engRow = stageRow(page, '默认搜索引擎');
  const tag = stage.locator('.search .tag');
  const eng = `${STAGE} [data-menu-key="engine"]`;
  const opt = value => page.locator(`${eng} .menu-opt[data-value="${value}"]:not([data-action])`);
  const checked = () => page.$$eval(
    `${eng} .menu-opt`, els => els.filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.dataset.value),
  );
  const order = () => page.$$eval(
    `${eng} .menu-opt`, els => els.map(o => o.dataset.value + (o.dataset.action ? '!' : '')),
  );
  // 菜单开着的时候再点 .rv 会把它收掉，所以按状态开
  const openEngine = async () => {
    if (await page.locator(eng).isHidden()) await engRow.locator('.rv').click();
  };

  // ① 复选：与真页面一致的两项默认勾着；多选语义；最后那条「自定义…」是动作，不参与
  await engRow.locator('.rv').click();
  await expect(page.locator(eng)).toHaveAttribute('aria-multiselectable', 'true');
  expect(await checked()).toEqual(['bing', 'google']);
  expect(await order()).toEqual(['bing', 'google', 'custom!']);

  // 翻掉一个：菜单不关、行里的值也不动 —— 复选配的是"轮切的范围"，不是"选中的那一个"
  await opt('google').click();
  expect(await checked()).toEqual(['bing']);
  await expect(page.locator(eng)).toBeVisible();
  await expect(engRow.locator('.rv')).toContainText('Bing');
  await opt('google').click();
  expect(await checked()).toEqual(['bing', 'google']);

  // ② 轮切：点搜索线右侧的引擎名，在勾着的引擎里转，面板那一行同步
  await expect(tag).toHaveText('Bing');
  await tag.click();
  await expect(tag).toHaveText('Google');
  await expect(engRow.locator('.rv')).toContainText('Google');
  await tag.click();
  await expect(tag).toHaveText('Bing');

  // ③ 拖动排序：把 Bing 拖到 Google 之后。落下前先要那点"轻度的指引"
  await openSettings(page);
  await openEngine();
  const a = await opt('bing').boundingBox();
  const b = await opt('google').boundingBox();
  const x = a.x + a.width - 18;
  await page.mouse.move(x, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, a.y + a.height / 2 + 9, { steps: 2 });
  await page.mouse.move(x, b.y + b.height - 3, { steps: 4 });
  await expect(opt('bing')).toHaveClass(/is-dragging/);
  const line = await page.locator(`${eng} .menu-opt.is-drop-before, ${eng} .menu-opt.is-drop-after`)
    .evaluate(el => getComputedStyle(
      el, el.classList.contains('is-drop-before') ? '::before' : '::after',
    ).height);
  expect(line).toBe('1px');
  await page.mouse.up();
  await expect.poll(order).toEqual(['google', 'bing', 'custom!']);
  expect((await checked()).sort()).toEqual(['bing', 'google']);   // 换位不翻 ✓（读回来的次序就是菜单次序）

  // ④ 再添一条自定义引擎（保存即生效），轮切就能看出"由上到下遍历"
  await openEngine();
  await page.locator(`${STAGE} .menu-opt[data-action="custom"]`).click();
  await page.locator(`${STAGE} [data-dlg-name]`).fill('知乎');
  await page.locator(`${STAGE} [data-dlg-url]`).fill('https://www.zhihu.com/search?q=%s');
  await page.locator(`${STAGE} [data-dlg-save]`).click();
  await expect(tag).toHaveText('知乎');
  expect(await order()).toEqual(['google', 'bing', 'custom', 'custom!']);
  await tag.click();                                    // 新次序的第一条是 Google
  await expect(tag).toHaveText('Google');
});

test('点引擎名轮切不碰光标、也不拖出蓝色选区', async ({ page }) => {
  await page.goto(`${PAGE}#clay`);
  const stage = page.locator(STAGE);
  const tag = stage.locator('.search .tag');
  const q = stage.locator('.search .q');
  const focusState = () => page.evaluate(sel => {
    const search = document.querySelector(`${sel} .search`);
    return {
      onTag: document.activeElement === search.querySelector('.tag'),
      inSearch: search.contains(document.activeElement),
      focusWithin: search.matches(':focus-within'),
    };
  }, STAGE);

  // 第二道闸也在：连点在它自己身上拖不出选区（第一道是 mousedown 的 preventDefault）
  expect(await tag.evaluate(el => getComputedStyle(el).userSelect)).toBe('none');

  // ① 谁都没聚焦时点它：焦点不该被搬到引擎名上，搜索线也不该点亮焦点态
  await page.mouse.click(8, 8);
  await expect(tag).toHaveText('Bing');
  await tag.click();
  expect(await focusState()).toEqual({ onTag: false, inSearch: false, focusWithin: false });
  await expect(tag).toHaveText('Google');          // 轮切本身照旧

  // ② 光标本来在输入框里：点它之后光标必须还在原处（那是真聚焦，焦点态继续亮着）
  await q.click();
  expect((await focusState()).inSearch).toBe(true);
  await tag.click();
  expect(await focusState()).toEqual({ onTag: false, inSearch: true, focusWithin: true });
  await expect(tag).toHaveText('Bing');

  // ③ 连点两下：浏览器原本会选中一个词，现在选中文字必须为空
  await tag.dblclick();
  expect(await page.evaluate(() => String(window.getSelection() ?? ''))).toBe('');
  expect((await focusState()).inSearch).toBe(true);
});
