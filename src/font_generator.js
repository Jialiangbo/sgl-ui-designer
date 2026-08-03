// ============================================================
// font_generator.js - 纯 JS 字体字模生成器
// 严格对齐 sgl_font_conv 的 C 源码实现:
//   - bitstream.c     : 大端序 (MSB first) 位流写入
//   - rle_compress.c  : modified I3BN RLE 压缩
//   - cmap_builder.c  : DP 最优分割 + 后处理合并
//   - font_render.c   : FreeType 渲染 (JS 用 Canvas API 近似)
//   - output_writer.c : C 文件输出
// ============================================================

// ============================================================
// 1. BitStream - 位流写入工具（大端序，MSB first）
//    对齐 bitstream.c: bit_pos = 7 - (bit_index % 8)
// ============================================================
class BitStream {
  constructor(capacity = 1024) {
    this.buffer = new Uint8Array(capacity);
    this.bitIndex = 0;
  }

  writeBits(value, numBits) {
    // 严格对齐 bitstream.c bitstream_write_bits:
    //   for (i = numBits-1; i>=0; i--) byte_pos = bit_index/8, bit_pos = 7-(bit_index%8)
    for (let i = numBits - 1; i >= 0; i--) {
      const bytePos = (this.bitIndex / 8) | 0;
      const bitPos = 7 - (this.bitIndex % 8);
      if (bytePos >= this.buffer.length) {
        const newBuf = new Uint8Array(this.buffer.length * 2);
        newBuf.set(this.buffer);
        this.buffer = newBuf;
      }
      if ((value >> i) & 1) {
        this.buffer[bytePos] |= (1 << bitPos);
      }
      this.bitIndex++;
    }
  }

  get byteLength() {
    // 对齐 bitstream_byte_index: (bit_index + 7) / 8
    return (this.bitIndex + 7) >> 3;
  }

  toBytes() {
    return new Uint8Array(this.buffer.subarray(0, this.byteLength));
  }
}

// ============================================================
// 2. RLE 压缩 (严格对齐 rle_compress.c)
//    常量:
//      RLE_SKIP_COUNT          = 1
//      RLE_BIT_COLLAPSED_COUNT = 10
//      RLE_COUNTER_BITS        = 6
//      RLE_COUNTER_MAX         = 63
//      RLE_MAX_REPEATS         = 63 + 10 + 1 = 74
//    截断: same > 74+1=75 时取 75
//    编码:
//      same <= 1: 直接写 same 个 pixel
//      否则: 写 1 个 pixel (skip head), same -= 1
//        same <= 10: 写 pixel, 写 same 个 bit (前 same-1 个 1, 最后 1 个 0)
//        same > 10:  same -= 11, 写 pixel, 写 11 个 1, 写 same (6 bit)
// ============================================================
const RLE_SKIP_COUNT = 1;
const RLE_BIT_COLLAPSED_COUNT = 10;
const RLE_COUNTER_BITS = 6;
const RLE_COUNTER_MAX = (1 << RLE_COUNTER_BITS) - 1;        // 63
const RLE_MAX_REPEATS = RLE_COUNTER_MAX + RLE_BIT_COLLAPSED_COUNT + 1; // 74

function countSame(pixels, count, offset) {
  // 严格对齐 rle_compress.c count_same
  let same = 1;
  const val = pixels[offset];
  for (let i = offset + 1; i < count; i++) {
    if (pixels[i] !== val) break;
    same++;
  }
  return same;
}

function rleCompress(bs, pixels, count, bpp) {
  // 严格对齐 rle_compress.c rle_compress
  let offset = 0;
  while (offset < count) {
    const pixel = pixels[offset];
    let same = countSame(pixels, count, offset);

    // 截断到最大可编码长度 (对齐 C: if (same > RLE_MAX_REPEATS + RLE_SKIP_COUNT) same = RLE_MAX_REPEATS + RLE_SKIP_COUNT)
    if (same > RLE_MAX_REPEATS + RLE_SKIP_COUNT) {
      same = RLE_MAX_REPEATS + RLE_SKIP_COUNT;
    }
    offset += same;

    // 不够 RLE, 直接写 (对齐 C: if (same <= RLE_SKIP_COUNT))
    if (same <= RLE_SKIP_COUNT) {
      for (let i = 0; i < same; i++) {
        bs.writeBits(pixel, bpp);
      }
      continue;
    }

    // 写 "skipped" head 原值 (对齐 C: for (i=0; i<RLE_SKIP_COUNT; i++) bitstream_write_bits(pixel, bpp))
    for (let i = 0; i < RLE_SKIP_COUNT; i++) {
      bs.writeBits(pixel, bpp);
    }
    same -= RLE_SKIP_COUNT;

    // bit-extended 编码 (对齐 C: if (same <= RLE_BIT_COLLAPSED_COUNT))
    if (same <= RLE_BIT_COLLAPSED_COUNT) {
      bs.writeBits(pixel, bpp);
      for (let i = 0; i < same; i++) {
        if (i < same - 1) {
          bs.writeBits(1, 1);
        } else {
          bs.writeBits(0, 1);
        }
      }
      continue;
    }

    // counter 模式 (对齐 C: same -= RLE_BIT_COLLAPSED_COUNT + 1; bitstream_write_bits(same, RLE_COUNTER_BITS))
    same -= RLE_BIT_COLLAPSED_COUNT + 1;
    bs.writeBits(pixel, bpp);
    for (let i = 0; i < RLE_BIT_COLLAPSED_COUNT + 1; i++) {
      bs.writeBits(1, 1);
    }
    bs.writeBits(same, RLE_COUNTER_BITS);
  }
}

// ============================================================
// 3. cmap_builder - DP 最优分割 + 后处理合并 (严格对齐 cmap_builder.c)
// ============================================================
const CMAP_FORMAT0_TINY = 0;  // C: CMAP_FORMAT0_TINY
const CMAP_FORMAT0 = 1;       // C: CMAP_FORMAT0
const CMAP_SPARSE_TINY = 2;   // C: CMAP_SPARSE_TINY
const SUBTABLE_ENTRY_OVERHEAD = 16;  // C: #define SUBTABLE_ENTRY_OVERHEAD 16

function estFormat0Tiny() { return 16; }  // C: est_format0_tiny
function estFormat0(startCode, endCode) { return 16 + (endCode - startCode + 1); }  // C: est_format0
function estSparseTiny(count) { return 16 + count * 2; }  // C: est_sparse_tiny

function subtableCost(st) {
  // C: subtable_cost
  switch (st.format) {
    case CMAP_FORMAT0_TINY: return estFormat0Tiny();
    case CMAP_FORMAT0: return estFormat0(st.minCode, st.maxCode);
    case CMAP_SPARSE_TINY: return estSparseTiny(st.count);
  }
  return 0;
}

function cmapBuild(codes) {
  // 严格对齐 cmap_builder.c cmap_build
  if (!codes || codes.length === 0) return { subtables: [], count: 0 };

  const count = codes.length;
  const dp = new Array(count);

  // DP 最短路径 (对齐 C: for (i=0; i<count; i++) for (j=0; j<=i; j++))
  for (let i = 0; i < count; i++) {
    dp[i] = { dist: Infinity, start: 0, end: 0, format: CMAP_FORMAT0 };

    for (let j = 0; j <= i; j++) {
      const prevDist = j > 0 ? dp[j - 1].dist : 0;

      // format0: range < 256 (对齐 C: if (codes[i] - codes[j] < 256))
      if (codes[i] - codes[j] < 256) {
        const s = estFormat0(codes[j], codes[i]);
        if (prevDist + s < dp[i].dist) {
          dp[i].dist = prevDist + s;
          dp[i].start = j;
          dp[i].end = i;
          dp[i].format = CMAP_FORMAT0;
        }
      }

      // format0_tiny: range < 256 且连续无间隔 (对齐 C: if (codes[i]-codes[j] < 256 && codes[i]-i == codes[j]-j))
      if (codes[i] - codes[j] < 256 &&
          codes[i] - i === codes[j] - j) {
        const s = estFormat0Tiny();
        if (prevDist + s < dp[i].dist) {
          dp[i].dist = prevDist + s;
          dp[i].start = j;
          dp[i].end = i;
          dp[i].format = CMAP_FORMAT0_TINY;
        }
      }

      // sparse_tiny: range < 65536 (对齐 C: if (codes[i] - codes[j] < 65536))
      if (codes[i] - codes[j] < 65536) {
        const s = estSparseTiny(i - j + 1);
        if (prevDist + s < dp[i].dist) {
          dp[i].dist = prevDist + s;
          dp[i].start = j;
          dp[i].end = i;
          dp[i].format = CMAP_SPARSE_TINY;
        }
      }
    }
  }

  // 回溯构建结果 (对齐 C: for (idx=count; idx>0; ) backtrack)
  const result = [];
  let idx = count;
  while (idx > 0) {
    const i = idx - 1;
    const node = dp[i];
    const segLen = node.end - node.start + 1;
    const st = {
      format: node.format,
      count: segLen,
      codepoints: codes.slice(node.start, node.end + 1),
      minCode: codes[node.start],
      maxCode: codes[node.end],
    };
    result.push(st);
    idx = node.start;
  }
  // 反转 (对齐 C: backtrack 给出逆序)
  result.reverse();

  // 后处理: 相邻子表合并为 sparse_tiny 如果更省 (对齐 C: post-merge)
  let mergedFlag = true;
  while (mergedFlag) {
    mergedFlag = false;
    for (let i = 0; i + 1 < result.length; i++) {
      const a = result[i];
      const b = result[i + 1];
      const combinedFirst = a.minCode;
      const combinedLast = b.maxCode;
      // 对齐 C: if (combined_last - combined_first >= 65536) continue
      if (combinedLast - combinedFirst >= 65536) continue;

      const costA = subtableCost(a);
      const costB = subtableCost(b);
      const separate = costA + costB + 2 * SUBTABLE_ENTRY_OVERHEAD;

      const combinedCount = a.count + b.count;
      const mergedCost = estSparseTiny(combinedCount) + SUBTABLE_ENTRY_OVERHEAD;

      // 对齐 C: if (merged_cost <= separate)
      if (mergedCost <= separate) {
        a.codepoints = a.codepoints.concat(b.codepoints);
        a.count = combinedCount;
        a.maxCode = combinedLast;
        a.format = CMAP_SPARSE_TINY;
        result.splice(i + 1, 1);
        mergedFlag = true;
        break;
      }
    }
  }

  return { subtables: result, count: result.length };
}

// ============================================================
// 4. font_render - 使用 Canvas API 渲染字体 (近似 FreeType)
//    严格对齐 font_render.c 的算法流程:
//      - FT_Set_Pixel_Sizes(face, 0, pixel_size)
//      - FT_Load_Glyph(face, glyph_index, FT_LOAD_RENDER | FT_LOAD_TARGET_LIGHT | FT_LOAD_FORCE_AUTOHINT)
//      - adv_w = (int)((double)slot->linearHoriAdvance / 65536.0 * 16.0 + 0.5)
//      - box_w = (int)bmp->width
//      - box_h = (int)bmp->rows
//      - ofs_x = slot->bitmap_left
//      - ofs_y = slot->bitmap_top - (int)bmp->rows
//      - ascent = max(ofs_y + box_h), descent = min(ofs_y)
//      - font_height = ascent - descent, base_line = -descent
//
//    Canvas API 近似 FreeType:
//      - ctx.font = `${fontSize}px "${fontFamily}"`  对应 FT_Set_Pixel_Sizes
//      - ctx.textBaseline = 'top'                     顶部对齐渲染
//      - ctx.fillText(ch, padX, padY)                  对应 FT_Load_Glyph + FT_RENDER
//      - measureText().width * 16                      对应 linearHoriAdvance/65536*16
//      - getImageData alpha 通道                        对应 bmp->buffer 8-bit grayscale
//
//    坐标对齐 FreeType:
//      - textBaseline='top' 时, 文字顶部在 padY, baseline 在 padY + fontAscent
//      - bitmap_top (FT y, up positive) = baseline_y - minY = (padY + fontAscent) - minY
//      - ofs_y = bitmap_top - rows = (padY + fontAscent - minY) - (maxY - minY + 1)
//              = padY + fontAscent - maxY - 1
//      - ofs_x = bitmap_left = minX - padX
// ============================================================

let _renderCanvas = null;
let _renderCtx = null;
let _renderCanvasSize = 0;

function getRenderCtx(requiredSize) {
  // canvas 尺寸基于 requiredSize 动态调整, 避免大字号时字形溢出
  if (!_renderCanvas || _renderCanvasSize < requiredSize) {
    _renderCanvas = document.createElement('canvas');
    _renderCanvasSize = Math.max(256, requiredSize);
    _renderCanvas.width = _renderCanvasSize;
    _renderCanvas.height = _renderCanvasSize;
    _renderCtx = _renderCanvas.getContext('2d', { willReadFrequently: true });
  }
  return _renderCtx;
}

function renderGlyph(ctx, fontFamily, fontSize, ch, fontAscent, canvasSize, padX, padY) {
  // 清空 canvas (对齐 FreeType 每次渲染独立字形)
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.font = `${fontSize}px "${fontFamily}"`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // 渲染字符 (对齐 FT_Load_Glyph + FT_RENDER)
  ctx.fillText(ch, padX, padY);

  // advance width (对齐 C: adv_w = (int)((double)slot->linearHoriAdvance / 65536.0 * 16.0 + 0.5))
  // Canvas measureText().width 已是像素值, *16 等价于 linearHoriAdvance/65536*16
  const metrics = ctx.measureText(ch);
  const advW = Math.round(metrics.width * 16);

  // 提取像素 (对齐 C: 从 bmp->buffer 提取 8-bit grayscale)
  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const data = imageData.data;

  // 计算字形边界 (minX/maxX/minY/maxY 基于 alpha > 0)
  let minX = canvasSize, maxX = -1;
  let minY = canvasSize, maxY = -1;

  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const idx = (y * canvasSize + x) * 4 + 3;
      if (data[idx] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 空字形处理 (对齐 C: 如果 FreeType 返回 box_h=0, 字形为空)
  if (maxX < 0 || maxY < 0) {
    return {
      code: ch.charCodeAt(0),
      advW,
      boxW: 0, boxH: 0,
      ofsX: 0, ofsY: 0,
      pixels: null,
    };
  }

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const pixels = new Uint8Array(boxW * boxH);

  // 提取 grayscale 像素 (对齐 C: g->pixels[row * g->box_w + col] = val)
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      const srcIdx = ((minY + y) * canvasSize + (minX + x)) * 4 + 3;
      pixels[y * boxW + x] = data[srcIdx];
    }
  }

  // FreeType 坐标对齐:
  //   textBaseline='top' 时, top = padY, baseline = padY + fontAscent
  //   bitmap_top (FT y, up positive) = baseline_y - minY
  //   ofs_y = bitmap_top - rows = (baseline_y - minY) - (maxY - minY + 1) = baseline_y - maxY - 1
  //   ofs_x = bitmap_left = minX - padX
  const baselineY = padY + fontAscent;
  const ofsX = minX - padX;
  const ofsY = baselineY - maxY - 1;

  return {
    code: ch.charCodeAt(0),
    advW, boxW, boxH, ofsX, ofsY,
    pixels,
  };
}

function fontRender(fontFamily, fontSize, symbols) {
  // canvas 尺寸: 基于字号动态调整, 留足 padding 空间
  // 大字号需要更大的 canvas 才能容纳完整字形
  const padX = Math.max(10, fontSize);
  const padY = Math.max(10, fontSize);
  const canvasSize = Math.max(256, fontSize * 4 + padX * 2);
  const ctx = getRenderCtx(canvasSize);

  ctx.font = `${fontSize}px "${fontFamily}"`;
  ctx.textBaseline = 'top';

  // 测量字体级 ascent (对应 FreeType face->size->metrics.ascender)
  // fontBoundingBoxAscent 是字体级属性, 对常见字符稳定
  const probeMetrics = ctx.measureText('Mg');
  const fontAscent = probeMetrics.fontBoundingBoxAscent ||
                     probeMetrics.actualBoundingBoxAscent ||
                     fontSize;

  // 收集 codepoints (对齐 C: codes 必须 sorted ascending)
  const codeSet = new Set();
  for (const ch of symbols) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20) codeSet.add(code);
  }
  const codes = Array.from(codeSet).sort((a, b) => a - b);

  // 渲染所有字形 (对齐 C: for (i=0; i<count; i++) font_render_init)
  const glyphs = [];
  let ascent = -9999;   // 对齐 C: int ascent = -9999
  let descent = 9999;   // 对齐 C: int descent = 9999

  for (const code of codes) {
    const ch = String.fromCharCode(code);
    const g = renderGlyph(ctx, fontFamily, fontSize, ch, fontAscent, canvasSize, padX, padY);
    glyphs.push(g);

    // 对齐 C: 即使 box_h=0 也更新 ascent/descent (用 ofs_y + box_h 和 ofs_y)
    const glyphTop = g.ofsY + g.boxH;
    const glyphBottom = g.ofsY;
    if (glyphTop > ascent) ascent = glyphTop;
    if (glyphBottom < descent) descent = glyphBottom;
  }

  // 没有有效字形时的 fallback (C 源码不处理此情况, JS 增加保护避免负数 fontHeight)
  if (ascent < 0) {
    ascent = fontSize;
    descent = 0;
  }

  // 对齐 C: out->font_height = ascent - descent; out->base_line = -descent
  return {
    glyphs,
    glyphCount: glyphs.length,
    ascent,
    descent,
    fontHeight: ascent - descent,
    baseLine: -descent,
  };
}

// ============================================================
// 5. output_writer - 生成 SGL 字模 C 文件内容 (严格对齐 output_writer.c)
// ============================================================

function quantizePixel(pixel, bpp) {
  // 对齐 C: quantize_pixel (pixel >> (8 - bpp))
  return pixel >> (8 - bpp);
}

function shouldCompress(bpp, compressFlag) {
  // 对齐 C: should_compress (bpp==1 不压缩, 否则按 compress_flag)
  if (!compressFlag) return false;
  if (bpp === 1) return false;
  return true;
}

function renderGlyphBitmap(g, bpp, compressFlag) {
  // 严格对齐 output_writer.c render_glyph_bitmap
  const pixelCount = g.boxW * g.boxH;

  // 量化像素 (对齐 C: qpixels[i] = quantize_pixel(g->pixels[i], bpp))
  const qpixels = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    qpixels[i] = quantizePixel(g.pixels[i], bpp);
  }

  // 分配输出 buffer (对齐 C: buf_cap = 128 + pixel_count * 2)
  const bs = new BitStream(128 + pixelCount * 2);

  if (pixelCount > 0) {
    if (shouldCompress(bpp, compressFlag)) {
      // 对齐 C: rle_compress(&bs, qpixels, pixel_count, bpp)
      rleCompress(bs, qpixels, pixelCount, bpp);
    } else {
      // 对齐 C: Raw 写入, 每个 pixel 写 bpp bits
      for (let i = 0; i < pixelCount; i++) {
        bs.writeBits(qpixels[i], bpp);
      }
    }
  }

  // 对齐 C: return bitstream_byte_index(&bs)
  return bs.toBytes();
}

function findGlyphIndex(font, code) {
  // 严格对齐 output_writer.c find_glyph_index (二分查找)
  let lo = 0, hi = font.glyphs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (font.glyphs[mid].code === code) return mid;
    if (font.glyphs[mid].code < code) lo = mid + 1;
    else hi = mid;
  }
  return -1;
}

function generateSglFontC(fontName, fontData, cmap, bpp, compress) {
  // 严格对齐 output_writer.c write_sgl_font
  const glyphCount = fontData.glyphs.length;

  // Phase 1: 编译所有字形位图 (对齐 C: Phase 1 compile all glyph bitmaps)
  const compiled = [];
  let totalBitmapSize = 0;
  for (let i = 0; i < glyphCount; i++) {
    const bm = renderGlyphBitmap(fontData.glyphs[i], bpp, compress);
    compiled.push({ bitmapData: bm, bitmapOffset: totalBitmapSize });
    totalBitmapSize += bm.length;
  }

  let out = '';

  // Phase 2: 文件头 (对齐 C: Phase 2 write C file header + MIT License)
  out += `/* source/fonts/${fontName}.c\n`;
  out += ` *\n`;
  out += ` * MIT License\n`;
  out += ` *\n`;
  out += ` * Copyright(c) 2023-present All contributors of SGL  \n`;
  out += ` * Document reference link: docs directory\n`;
  out += ` * \n`;
  out += ` * Permission is hereby granted, free of charge, to any person obtaining a copy\n`;
  out += ` * of this software and associated documentation files (the "Software"), to deal\n`;
  out += ` * in the Software without restriction, including without limitation the rights\n`;
  out += ` * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n`;
  out += ` * copies of the Software, and to permit persons to whom the Software is\n`;
  out += ` * furnished to do so, subject to the following conditions:\n`;
  out += ` * The above copyright notice and this permission notice shall be included in all\n`;
  out += ` * copies or substantial portions of the Software.\n`;
  out += ` * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n`;
  out += ` * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n`;
  out += ` * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n`;
  out += ` * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n`;
  out += ` * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n`;
  out += ` * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n`;
  out += ` * SOFTWARE.\n`;
  out += ` */\n\n`;
  out += `#include <sgl_core.h>\n`;
  out += `#include <sgl_font.h>\n\n`;

  // Phase 3: font_bitmap[] (对齐 C: Phase 3 write font_bitmap[])
  out += `static const uint8_t font_bitmap[] = {\n`;
  let hasBitmapData = false;
  for (let i = 0; i < glyphCount; i++) {
    const g = fontData.glyphs[i];
    const cg = compiled[i];
    if (cg.bitmapData.length === 0) continue;
    hasBitmapData = true;
    out += `    /* U+${g.code.toString(16).toUpperCase().padStart(4, '0')} */\n`;
    for (let b = 0; b < cg.bitmapData.length; b++) {
      if (b % 8 === 0) out += `    `;
      out += `0x${cg.bitmapData[b].toString(16).padStart(2, '0')}`;
      // 对齐 C: 逗号规则 - 最后一个字形的最后一个字节不加逗号
      if (i < glyphCount - 1 || b < cg.bitmapData.length - 1) out += `,`;
      if (b % 8 === 7 || b === cg.bitmapData.length - 1) out += `\n`;
      else out += ` `;
    }
    if (i < glyphCount - 1) out += `\n`;
  }
  if (!hasBitmapData) {
    out += `    0x00\n`;
  }
  out += `};\n\n`;

  // Phase 4: font_table[] (对齐 C: Phase 4)
  // 第一项 reserved, 按 cmap 顺序, FORMAT0 补 dummy
  out += `\nstatic const sgl_font_table_t font_table[] = {\n`;
  out += `    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */`;

  for (let stIdx = 0; stIdx < cmap.count; stIdx++) {
    const st = cmap.subtables[stIdx];

    if (st.format === CMAP_FORMAT0 || st.format === CMAP_FORMAT0_TINY) {
      // 对齐 C: FORMAT0/FORMAT0_TINY 遍历 min_code 到 max_code, 缺失字符补 dummy
      for (let code = st.minCode; code <= st.maxCode; code++) {
        const gi = findGlyphIndex(fontData, code);
        if (gi >= 0) {
          const g = fontData.glyphs[gi];
          out += `,\n    {.bitmap_index = ${compiled[gi].bitmapOffset}, .adv_w = ${g.advW}, .box_w = ${g.boxW}, .box_h = ${g.boxH}, .ofs_x = ${g.ofsX}, .ofs_y = ${g.ofsY}}`;
        } else {
          // 对齐 C: Dummy entry for gap (bitmap_index = total_bitmap_size)
          out += `,\n    {.bitmap_index = ${totalBitmapSize}, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}`;
        }
      }
    } else {
      // 对齐 C: SPARSE_TINY 只写实际 codepoint
      for (let k = 0; k < st.count; k++) {
        const code = st.codepoints[k];
        const gi = findGlyphIndex(fontData, code);
        if (gi >= 0) {
          const g = fontData.glyphs[gi];
          out += `,\n    {.bitmap_index = ${compiled[gi].bitmapOffset}, .adv_w = ${g.advW}, .box_w = ${g.boxW}, .box_h = ${g.boxH}, .ofs_x = ${g.ofsX}, .ofs_y = ${g.ofsY}}`;
        } else {
          // 对齐 C: Should not happen, but handle gracefully
          out += `,\n    {.bitmap_index = ${totalBitmapSize}, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}`;
        }
      }
    }
  }
  out += `\n};\n\n`;

  // Phase 5: unicode_list_N[] (对齐 C: Phase 5, 仅 SPARSE_TINY 输出)
  for (let stIdx = 0; stIdx < cmap.count; stIdx++) {
    const st = cmap.subtables[stIdx];
    if (st.format === CMAP_SPARSE_TINY) {
      out += `static const uint16_t unicode_list_${stIdx}[] = {\n`;
      const base = st.minCode;
      for (let k = 0; k < st.count; k++) {
        // 对齐 C: delta = codepoints[k] - base
        const delta = st.codepoints[k] - base;
        if (k % 8 === 0) out += `    `;
        out += `0x${delta.toString(16)}`;
        if (k < st.count - 1) out += `,`;
        if (k % 8 === 7 || k === st.count - 1) out += `\n`;
        else out += ` `;
      }
      out += `};\n\n`;
    }
  }

  // Phase 6: font_unicode[] (对齐 C: tab_offset 累加, 初始 1 为 reserved)
  out += `static const sgl_font_unicode_t font_unicode[] = {\n`;
  let cumulativeOffset = 1;  // 对齐 C: int cumulative_offset = 1

  for (let stIdx = 0; stIdx < cmap.count; stIdx++) {
    const st = cmap.subtables[stIdx];

    // 对齐 C: FORMAT0/FORMAT0_TINY 的 len = max_code - min_code + 1, SPARSE_TINY 的 len = count
    let len;
    if (st.format === CMAP_FORMAT0 || st.format === CMAP_FORMAT0_TINY) {
      len = st.maxCode - st.minCode + 1;
    } else {
      len = st.count;
    }

    // 对齐 C: SPARSE_TINY 用 unicode_list_N, 其他用 NULL
    let listName;
    if (st.format === CMAP_SPARSE_TINY) {
      listName = `unicode_list_${stIdx}`;
    } else {
      listName = 'NULL';
    }

    const tabOffset = cumulativeOffset;
    const comma = stIdx < cmap.count - 1 ? ',' : '';
    out += `    { .offset = 0x${st.minCode.toString(16)}, .len = ${len}, .list = ${listName}, .tab_offset = ${tabOffset}, }${comma}\n`;

    cumulativeOffset += len;
  }
  out += `};\n\n`;

  // Phase 7: sgl_font_t (对齐 C: Phase 6 write sgl_font_t)
  out += `const sgl_font_t ${fontName} = {\n`;
  out += `    .bitmap = font_bitmap,\n`;
  out += `    .table = font_table,\n`;
  out += `    .font_table_size = SGL_ARRAY_SIZE(font_table),\n`;
  out += `    .font_height = ${fontData.fontHeight},\n`;
  out += `    .base_line = ${fontData.baseLine},\n`;
  out += `    .bpp = ${bpp},\n`;
  out += `    .compress = ${shouldCompress(bpp, compress) ? 1 : 0},\n`;
  out += `    .unicode = font_unicode,\n`;
  out += `    .unicode_num = SGL_ARRAY_SIZE(font_unicode),\n`;
  out += `};\n`;

  return out;
}

// ============================================================
// 6. 对外主接口
// ============================================================

/**
 * 生成 SGL 字模 C 文件内容
 * 严格对齐 sgl_font_conv 的 C 源码算法流程:
 *   1. font_render: 用 Canvas API 渲染字符 (近似 FreeType)
 *   2. cmap_build: DP 最优子表分割 + 后处理合并
 *   3. write_sgl_font: 生成 C 文件 (font_bitmap/font_table/font_unicode/sgl_font_t)
 *
 * @param {string} fontFamily - 字体族名（已通过 FontFace 注册到浏览器）
 * @param {number} size - 字号
 * @param {number} bpp - 位深 (1, 2, 4)
 * @param {string} symbols - 需要取模的字符
 * @param {boolean} [compress=false] - 是否启用 RLE 压缩
 * @param {string} [fontName] - 可选，指定字体变量名（如 sgl_font_HarmonyOS_Sans_SC_Bold_ttf_14_bpp4）
 * @returns {string} SGL 字模 C 文件内容
 */
export function generateFontC(fontFamily, size, bpp, symbols, compress = false, fontName = null) {
  // Phase 1: 渲染所有字形 (对齐 C: font_render_init)
  const fontData = fontRender(fontFamily, size, symbols);
  if (fontData.glyphCount === 0) {
    throw new Error('没有可渲染的字符');
  }

  // Phase 2: 构建 cmap 子表 (对齐 C: cmap_build)
  const codes = fontData.glyphs.map(g => g.code);
  const cmap = cmapBuild(codes);

  // Phase 3: 生成 C 文件 (对齐 C: write_sgl_font)
  const name = fontName || `font_${Math.floor(Math.random() * 100000)}`;
  return generateSglFontC(name, fontData, cmap, bpp, compress);
}
