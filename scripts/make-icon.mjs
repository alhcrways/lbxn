// 生成应用/托盘图标 assets/icon.png（纯 Node + zlib，无外部依赖）
// 一个复古童趣风格的橙色圆脸占位图标，后续可替换为小新形象
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SIZE = 64;

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// ---- 绘制：橙色圆脸 + 眉毛 + 大黑眼 + 腮红 ----
const px = (x, y, [r, g, b, a = 255]) => {
  const i = (y * SIZE + x) * 4;
  raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
};

const raw = Buffer.alloc(SIZE * SIZE * 4);

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inCircle(x + 0.5, y + 0.5, 32, 34, 30)) continue;
    // 主脸：橙红渐变
    const t = (x + y) / (SIZE * 2);
    const base = [Math.round(230 - 20 * t), Math.round(74 + 30 * t), 25];
    px(x, y, base);
    // 顶部高光弧
    if (inCircle(x + 0.5, y + 0.5, 32, 34, 30) && !inCircle(x + 0.5, y + 0.5, 26, 24, 26) && y < 18) {
      px(x, y, [255, 179, 0]);
    }
  }
}
// 眉毛
for (const ex of [22, 42]) {
  for (let y = 26; y < 30; y++)
    for (let x = ex - 6; x < ex + 6; x++)
      if (inCircle(x, y, ex, 28, 5.5)) px(x, y, [62, 39, 35]);
}
// 大黑眼
for (const ex of [22, 42]) {
  for (let y = 34; y < 46; y++)
    for (let x = ex - 7; x < ex + 7; x++)
      if (inCircle(x, y, ex, 40, 6.5)) px(x, y, [62, 39, 35]);
  px(ex - 2, 37, [255, 255, 255]);
  px(ex - 2, 38, [255, 255, 255]);
  px(ex - 1, 37, [255, 255, 255]);
}
// 腮红
for (const ex of [13, 51]) {
  for (let y = 46; y < 51; y++)
    for (let x = ex - 4; x < ex + 4; x++)
      if (inCircle(x, y, ex, 48, 3.5)) px(x, y, [255, 138, 101]);
}
// 嘴巴
for (let x = 27; x < 38; x++) {
  const yy = 52 + Math.round(Math.sin(((x - 27) / 10) * Math.PI) * 3);
  for (let y = yy; y < yy + 2; y++) px(x, y, [62, 39, 35]);
}

// 组装 PNG
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw.copy(scanlines, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = resolve(__dirname, '../assets');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon.png'), png);
console.log('assets/icon.png 生成完成 (' + png.length + ' bytes)');
