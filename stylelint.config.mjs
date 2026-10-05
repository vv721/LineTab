/**
 * 用 lint 强制「页面里只准用令牌，不准写裸值」。
 *
 * 用法（在项目目录里）：
 *   npx stylelint "*.css" --config stylelint.config.mjs
 *
 * 为什么需要它：设计语言是"契约"，而契约靠自觉一定会被破坏。
 *
 * 两道防线（缺一不可）：
 *   1) allowed-list  —— 白名单：这些属性的取值必须出现 var(--…)。
 *      注意它的判定是「值里匹配到任意一个允许项就算过」，
 *      所以 `transition: all 900ms var(--ease)` 这种"混一个令牌蒙混过关"会整条放行。
 *   2) disallowed-list —— 黑名单：专治上面那个漏洞。
 *      颜色类禁一切裸色值（hex / rgb() / hsl() / 常见具名色），
 *      动效类禁任何非 0 的字面量时长，圆角类禁字面量长度，
 *      字体类禁"令牌后面接裸字体"。
 *   两份名单共用下面同一组属性变量，避免口径分叉（上一轮就是因为分叉漏了单边 border）。
 *
 * 覆盖范围（有意为之，不是遗漏）：只锁"设计身份"类取值 —— 颜色、圆角、字体、阴影、动效。
 * 不锁：间距/内边距/宽度/定位等几何值（它们不是设计身份，令牌化收益低）。
 * 另外：自定义属性的**声明**（--x: …）本身不受任何规则约束，
 * 所以"先偷偷定义 --x，再用 var(--x)"这种绕过方式，由 scripts/check-tokens.mjs 兜住。
 */

const COLOR_PROPS =
  'color|background|background-color|background-image|border|border-color|' +
  'border-(?:top|right|bottom|left)(?:-color)?|outline|outline-color|caret-color|' +
  'accent-color|fill|stroke|text-decoration-color|box-shadow|text-shadow';
const RADIUS_PROPS = 'border-radius|border-(?:top|bottom)-(?:left|right)-radius';
const FONT_PROPS = 'font|font-family|font-size|font-weight|line-height|letter-spacing';
const MOTION_PROPS =
  'transition|transition-duration|transition-delay|transition-timing-function|' +
  'animation|animation-duration|animation-delay|animation-timing-function';

// 常见具名色。用 (?<![-\w]) / (?![-\w]) 卡住两端，避免把 var(--blue-500) 里的 blue 当成裸色。
const NAMED_COLORS =
  'white|black|red|blue|green|yellow|orange|purple|pink|brown|gray|grey|silver|gold|' +
  'navy|teal|olive|maroon|lime|aqua|cyan|magenta|fuchsia|tomato|coral|crimson|indigo|' +
  'violet|beige|ivory|khaki|salmon|turquoise|plum|orchid|lavender|azure|tan';

const RAW_COLOR = [
  '/#[0-9a-fA-F]{3,8}\\b/i',
  '/rgba?\\(/i',
  '/hsla?\\(/i',
  `/(?<![-\\w])(?:${NAMED_COLORS})(?![-\\w])/i`,
];

export default {
  rules: {
    'declaration-property-value-allowed-list': {
      // 颜色类：只准令牌，外加语义化关键字（0 / none 用来明确"取消"）
      [`/^(${COLOR_PROPS})$/`]: [
        '/var\\(--/',
        'transparent',
        'currentColor',
        'currentcolor',
        'inherit',
        'none',
        '0',
        'unset',
      ],
      // 圆角：只准令牌，或明确的 0
      [`/^(${RADIUS_PROPS})$/`]: ['/var\\(--/', '0'],
      // 字体：只准令牌（font 简写只允许 inherit）
      [`/^(${FONT_PROPS})$/`]: ['/var\\(--/', 'inherit', 'normal'],
      // 动效：时长与曲线都必须走令牌（0s / 0ms 是"明确没有延迟"，放行）
      [`/^(${MOTION_PROPS})$/`]: ['/var\\(--/', 'none', '0s', '0ms'],
    },
    'declaration-property-value-disallowed-list': {
      [`/^(${COLOR_PROPS})$/`]: RAW_COLOR,
      // 圆角：出现任何"数字 + 单位"都算违规（令牌之外的圆角一律不允许）
      [`/^(${RADIUS_PROPS})$/`]: ['/\\d+(?:\\.\\d+)?[a-zA-Z%]/'],
      // 动效：任何非 0 的字面量时长都违规（0s / 0ms 放行）
      [`/^(${MOTION_PROPS})$/`]: ['/[1-9]\\d*(?:\\.\\d+)?[a-zA-Z%]/'],
      // 字体：逗号后面必须还是令牌，禁止"令牌 + 系统裸字体"这种混搭回落
      [`/^(${FONT_PROPS})$/`]: ['/,\\s*(?!var\\()/'],
      // filter 只在黑名单里（白名单不锁它，因为 blur(2px) 这类模糊量属几何，不算设计身份；
      // 但它里面藏着裸色值时必须报错）
      filter: RAW_COLOR,
    },
  },
};
