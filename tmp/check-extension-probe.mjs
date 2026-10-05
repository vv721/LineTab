// ============================================================
// check-extension.mjs 的固件反例：证明它真的会红，而不是永远说 ok。
//
// 做法：把真实的运行文件复制到 tmp/check-probe/run-<时间戳>/<场景>/，只改坏一处，
// 再让 check-extension.mjs 去校验那份副本（脚本支持传目录）。
// 每个场景都写明"期望 exit 0 还是 1" —— 好场景必须仍然通过，否则就是误报。
// 还能顺手断言输出内容（match / notIn）：退出码对了、人话清单却在骗人，也算不通过。
// ============================================================
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_FILES, EXT_DIR } from '../scripts/runtime-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = resolve(HERE, '..');
const EXT = EXT_DIR;
/* 每次跑都用全新的目录名：这台机器上"删掉再建同名目录"不可靠
   （Windows 上刚删掉的路径可能还被上一次的进程攥着，cpSync 会报 errno 0 的怪错）。 */
const WORK = join(HERE, 'check-probe', `run-${Date.now()}`);
const CHECKER = join(PROJ, 'scripts', 'check-extension.mjs');

const patchManifest = (dir, patch) => {
  const file = join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...patch }, null, 2));
};

const scenarios = [
  { name: 'good', expect: 0, mutate: () => {} },
  {
    name: 'good-name-44-chars',
    expect: 0,
    mutate: (dir) => patchManifest(dir, { name: 'LineTab' + '·'.repeat(37) }), // 正好 44 字符，仍在商店上限内
  },
  {
    name: 'bad-permission',
    expect: 1,
    mutate: (dir) => patchManifest(dir, { permissions: ['storage', 'tabs'] }),
  },
  {
    // 2026-xx 补：permissions 缺 storage 曾经被判"干净"（只查多出来的），
    // 而那份 manifest 装上后设置根本存不进同步存储
    name: 'bad-missing-permission',
    expect: 1,
    match: '必须有 storage',
    mutate: (dir) => patchManifest(dir, { permissions: [] }),
  },
  {
    name: 'bad-inline-script',
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, 'newtab.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', '  <script>console.log(1)</script>\n</body>'));
    },
  },
  {
    name: 'bad-inline-handler',
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, 'newtab.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('<body>', '<body onload="void 0">'));
    },
  },
  {
    name: 'bad-external-css',
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, 'newtab.html');
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace('</head>', '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">\n</head>')
      );
    },
  },
  {
    name: 'bad-manifest-version',
    expect: 1,
    mutate: (dir) => patchManifest(dir, { manifest_version: 2 }),
  },
  {
    name: 'bad-icon-size',
    expect: 1,
    // 补的断言：失败时不该还打印"四个图标尺寸与声明一致"（退出码本来就对，
    // 但人话清单自相矛盾；旧实现用 problems 里有没有"图标"两个字来判断，抓不到）
    notIn: '四个图标尺寸与声明一致',
    mutate: (dir) => {
      // 把 128 的图当 48 用：文件名与声明一致、实际边长不符，只有读 IHDR 才发现
      // （用读写字节，不用 cpSync：Windows 上 cpSync 覆盖已存在的文件会报 errno 0 的怪错）
      writeFileSync(join(dir, 'icon48.png'), readFileSync(join(dir, 'icon128.png')));
    },
  },
  {
    name: 'bad-page-asset',
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, 'newtab.html');
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace('</body>', '  <script src="tmp/probe.js"></script>\n</body>')
      );
    },
  },
  {
    // 2026-xx 补：白名单原先只扫 <link>/<script src>，图片引用会漏过检查也进不了包
    name: 'bad-img-ref',
    expect: 1,
    match: '白名单外',
    mutate: (dir) => {
      const file = join(dir, 'newtab.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', '  <img src="hero.png" alt="">\n</body>'));
    },
  },
  {
    // 同上，样式里的 url() 也要扫
    name: 'bad-css-url',
    expect: 1,
    match: '白名单外',
    mutate: (dir) => {
      const file = join(dir, 'newtab.css');
      writeFileSync(file, readFileSync(file, 'utf8') + '\n.page { background-image: url(hero-bg.svg); }\n');
    },
  },
  {
    name: 'bad-missing-file',
    expect: 1,
    match: '白名单里的文件不存在',
    mutate: (dir) => {
      // 用 unlinkSync 而不是 rmSync：这台机器上 rmSync 有时会"静默不删"，
      // 于是校验器当然说 ok —— 那一格就成了假结论。
      unlinkSync(join(dir, 'tokens.css'));
      if (existsSync(join(dir, 'tokens.css'))) throw new Error('tokens.css 没删掉，本场景结果不可信');
    },
  },
];

console.log(`工作目录：${WORK}\n`);

let failed = 0;
for (const scenario of scenarios) {
  const dir = join(WORK, scenario.name);
  mkdirSync(dir, { recursive: true });
  for (const name of RUNTIME_FILES) cpSync(join(EXT, name), join(dir, name));
  scenario.mutate(dir);

  const run = spawnSync(process.execPath, [CHECKER, dir], { encoding: 'utf8' });
  const exit = run.status;
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  const notes = [];
  if (exit !== scenario.expect) notes.push(`期望 exit ${scenario.expect}，实际 ${exit}`);
  if (scenario.match && !out.includes(scenario.match)) notes.push(`输出里没有「${scenario.match}」`);
  if (scenario.notIn && out.includes(scenario.notIn)) notes.push(`输出里不该出现「${scenario.notIn}」`);

  if (notes.length) failed += 1;
  console.log(`${notes.length ? '✗  ' : 'ok  '} ${scenario.name.padEnd(22)} ${notes.length ? notes.join('；') : `exit ${exit} 符合期望`}`);
}

console.log(failed ? `\n${failed} 个场景与期望不符` : `\n${scenarios.length} 个场景全部符合期望`);
process.exit(failed ? 1 : 0);
