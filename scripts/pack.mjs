// ============================================================
// 打包：把运行需要的文件塞进一个能被 Chrome 直接加载的 ZIP。
//
// 为什么自己写 ZIP 而不是装 archiver/jszip：
//   这个项目从头到尾零依赖（`npm ls` 只有 playwright 一个 devDependency），
//   而 ZIP 的"够用版本"只有 local header + central directory + EOCD 三段，
//   再借 Node 自带的 zlib.deflateRawSync 与 zlib.crc32，四十行就能写完。
//
// 两个刻意的选择：
//   1. 时间戳固定（1980-01-01），所以同样的输入永远产出同一个字节序列 —— 能比对、能复现。
//   2. 打完立刻把产物读回来自己解析一遍（条目名、顺序、CRC、内容），
//      不"相信自己刚写的东西"，这也是 check-extension.mjs 的一贯做法。
//
// 用法：node scripts/pack.mjs        （`npm run pack`）
//       输入：LineTab/（与装载进 Chrome 的目录完全同一份）
//       产物：<项目根>/release/LineTab-<version>.zip
// ============================================================
import { deflateRawSync, crc32, inflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXT_DIR, PROJECT_ROOT, RUNTIME_FILES } from './runtime-files.mjs';

const ROOT = PROJECT_ROOT;
const EXT = EXT_DIR;
const problems = [];
const done = [];
const fail = (message) => problems.push(message);
const pass = (message) => done.push(message);

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const version = String(manifest.version);
const outName = `${manifest.name}-${version}.zip`;
const outDir = join(ROOT, 'release');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, outName);

/* ---------- 1. 白名单里的文件都得在，且都读得出来 ---------- */
const entries = [];
for (const name of RUNTIME_FILES) {
  const path = join(EXT, name);
  try {
    if (!statSync(path).isFile()) throw new Error('不是一个普通文件');
  } catch (error) {
    fail(`打包清单里的文件读不到：${name}（${error.message}）`);
    continue;
  }
  entries.push({ name, data: readFileSync(path) });
}
if (!problems.length) pass(`${entries.length} 个运行文件都读到了`);

/* ---------- 2. 组装 ZIP ---------- */
// DOS 时间：固定成 1980-01-01 00:00:00（date 0x0021 / time 0x0000），换来可复现的产物
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function buildZip(list) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of list) {
    const nameBytes = Buffer.from(entry.name, 'ascii'); // 白名单里全是 ASCII 文件名
    const deflated = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = deflated.length < entry.data.length;
    const payload = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(entry.data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 需要的版本
    local.writeUInt16LE(0, 6); // 通用标志位（文件名是 ASCII，不需要 UTF-8 标志）
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // 扩展字段长度
    locals.push(local, nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // 制作版本
    central.writeUInt16LE(20, 6); // 需要的版本
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // 扩展字段
    central.writeUInt16LE(0, 32); // 注释
    central.writeUInt16LE(0, 34); // 起始磁盘号
    central.writeUInt16LE(0, 36); // 内部属性
    central.writeUInt32LE(0, 38); // 外部属性
    central.writeUInt32LE(offset, 42); // 这条 local header 的偏移
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + payload.length;
  }

  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // 本磁盘号
  eocd.writeUInt16LE(0, 6); // 开始磁盘号
  eocd.writeUInt16LE(list.length, 8);
  eocd.writeUInt16LE(list.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // 注释长度

  return Buffer.concat([...locals, centralBlock, eocd]);
}

/** 把刚写出来的 ZIP 解析回条目列表：条目名、内容、CRC 都对一遍 */
function readZip(buffer) {
  const eocdOffset = buffer.length - 22;
  if (buffer.readUInt32LE(eocdOffset) !== 0x06054b50) throw new Error('找不到 EOCD');
  const count = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const list = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`第 ${index} 条中央目录头签名不对`);
    const method = buffer.readUInt16LE(cursor + 10);
    const sum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('ascii');

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    if (data.length !== size) throw new Error(`${name} 解出来的长度不对`);
    if ((crc32(data) >>> 0) !== sum) throw new Error(`${name} 的 CRC 对不上`);
    list.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return list;
}

/* ---------- 3. 写盘 + 回读校验 ---------- */
if (!problems.length) {
  const zip = buildZip(entries);
  writeFileSync(outPath, zip);
  pass(`已写出 ${outName}（${zip.length} 字节）`);

  const readBack = readZip(readFileSync(outPath));
  if (readBack.length !== entries.length) fail(`回读条目数 ${readBack.length} ≠ ${entries.length}`);
  else pass(`回读条目数一致（${readBack.length}）`);

  const names = readBack.map((item) => item.name);
  const expected = entries.map((item) => item.name);
  if (names.join('\u0000') !== expected.join('\u0000')) fail(`条目顺序/名字不一致：${names.join(', ')}`);
  else pass('条目名与顺序与清单一致');

  if (names[0] !== 'manifest.json') fail(`manifest.json 必须在包根且第一条，实际第一条是 ${names[0]}`);
  else pass('manifest.json 在包根');

  const odd = names.filter((name) => name.includes('\\') || name.startsWith('/'));
  if (odd.length) fail(`条目名必须是正斜杠相对路径：${odd.join(', ')}`);

  for (const entry of readBack) {
    const source = entries.find((item) => item.name === entry.name);
    if (!source || !source.data.equals(entry.data)) fail(`${entry.name} 回读内容与源文件不一致`);
  }
  if (!problems.some((item) => item.includes('回读内容'))) pass('每个条目的内容与源文件逐字节一致');
}

/* ---------- 结论 ---------- */
for (const line of done) console.log(`  ok  ${line}`);
if (problems.length) {
  console.error(`\n打包没通过，${problems.length} 条问题：`);
  for (const line of problems) console.error(`  ✗  ${line}`);
  process.exit(1);
}
console.log(`\n打包完成：${outPath}`);
console.log('在 chrome://extensions 里"加载已解压的扩展程序"选解压后的目录即可（ZIP 本身 Chrome 不认，商店提交才用得上）。');
