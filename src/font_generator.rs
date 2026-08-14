// ============================================================
// font_generator.rs - SGL 字模生成器（Rust 实现）
// 严格移植 sgl_font_conv 的 C 源码算法：
//   - font_render.c    : 用 FreeType 渲染字形
//   - bitstream.c      : 大端序位流写入
//   - rle_compress.c   : modified I3BN RLE 压缩
//   - cmap_builder.c   : DP 最优子表分割 + 后处理合并
//   - output_writer.c  : 生成 C 文件内容
// ============================================================

use freetype::face::LoadFlag;
use freetype::Library;
use once_cell::sync::OnceCell;
use std::collections::BTreeSet;
use std::path::Path;

static FONT_LIBRARY: OnceCell<Library> = OnceCell::new();

fn get_font_library() -> Result<&'static Library, String> {
    FONT_LIBRARY.get_or_try_init(|| {
        Library::init().map_err(|e| format!("FreeType init 失败: {}", e))
    })
}

// ============================================================
// 1. BitStream - 大端序位流写入（对齐 bitstream.c）
// ============================================================
struct BitStream {
    buffer: Vec<u8>,
    bit_index: usize,
}

impl BitStream {
    fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0; capacity],
            bit_index: 0,
        }
    }

    /// 写入 numBits 位（对齐 bitstream.c bitstream_write_bits）
    /// 大端序：MSB first，bit_pos = 7 - (bit_index % 8)
    fn write_bits(&mut self, value: u32, num_bits: usize) {
        // 对齐 C: for (i = numBits-1; i>=0; i--) byte_pos = bit_index/8, bit_pos = 7-(bit_index%8)
        for i in (0..num_bits).rev() {
            let byte_pos = self.bit_index / 8;
            let bit_pos = 7 - (self.bit_index % 8);

            // 动态扩容
            if byte_pos >= self.buffer.len() {
                self.buffer.resize(byte_pos * 2 + 1, 0);
            }

            if (value >> i) & 1 == 1 {
                self.buffer[byte_pos] |= 1 << bit_pos;
            }
            self.bit_index += 1;
        }
    }

    /// 字节长度（对齐 bitstream.c bitstream_byte_index: (bit_index + 7) / 8）
    fn byte_len(&self) -> usize {
        (self.bit_index + 7) / 8
    }

    fn to_bytes(&self) -> &[u8] {
        &self.buffer[..self.byte_len()]
    }
}

// ============================================================
// 2. RLE 压缩（严格对齐 rle_compress.c）
// ============================================================
const RLE_SKIP_COUNT: usize = 1;
const RLE_BIT_COLLAPSED_COUNT: usize = 10;
const RLE_COUNTER_BITS: usize = 6;
const RLE_COUNTER_MAX: usize = (1 << RLE_COUNTER_BITS) - 1; // 63
const RLE_MAX_REPEATS: usize = RLE_COUNTER_MAX + RLE_BIT_COLLAPSED_COUNT + 1; // 74

/// 计算相同像素的数量（对齐 rle_compress.c count_same）
fn count_same(pixels: &[u8], offset: usize) -> usize {
    let val = pixels[offset];
    let mut same = 1;
    for i in (offset + 1)..pixels.len() {
        if pixels[i] != val {
            break;
        }
        same += 1;
    }
    same
}

/// RLE 压缩（严格对齐 rle_compress.c rle_compress）
fn rle_compress(bs: &mut BitStream, pixels: &[u8], bpp: usize) {
    let count = pixels.len();
    let mut offset = 0;

    while offset < count {
        let pixel = pixels[offset];
        let mut same = count_same(pixels, offset);

        // 截断到最大可编码长度（对齐 C: if same > RLE_MAX_REPEATS + RLE_SKIP_COUNT）
        if same > RLE_MAX_REPEATS + RLE_SKIP_COUNT {
            same = RLE_MAX_REPEATS + RLE_SKIP_COUNT;
        }
        offset += same;

        // 不够 RLE，直接写（对齐 C: if same <= RLE_SKIP_COUNT）
        if same <= RLE_SKIP_COUNT {
            for _ in 0..same {
                bs.write_bits(pixel as u32, bpp);
            }
            continue;
        }

        // 写 "skipped" head 原值（对齐 C: for i in 0..RLE_SKIP_COUNT）
        for _ in 0..RLE_SKIP_COUNT {
            bs.write_bits(pixel as u32, bpp);
        }
        same -= RLE_SKIP_COUNT;

        // bit-extended 编码（对齐 C: if same <= RLE_BIT_COLLAPSED_COUNT）
        if same <= RLE_BIT_COLLAPSED_COUNT {
            bs.write_bits(pixel as u32, bpp);
            for i in 0..same {
                if i < same - 1 {
                    bs.write_bits(1, 1);
                } else {
                    bs.write_bits(0, 1);
                }
            }
            continue;
        }

        // counter 模式（对齐 C: same -= RLE_BIT_COLLAPSED_COUNT + 1; write_bits(same, RLE_COUNTER_BITS)）
        same -= RLE_BIT_COLLAPSED_COUNT + 1;
        bs.write_bits(pixel as u32, bpp);
        for _ in 0..(RLE_BIT_COLLAPSED_COUNT + 1) {
            bs.write_bits(1, 1);
        }
        bs.write_bits(same as u32, RLE_COUNTER_BITS);
    }
}

// ============================================================
// 3. cmap_builder - DP 最优分割 + 后处理合并（严格对齐 cmap_builder.c）
// ============================================================
const CMAP_FORMAT0_TINY: u8 = 0;
const CMAP_FORMAT0: u8 = 1;
const CMAP_SPARSE_TINY: u8 = 2;
const SUBTABLE_ENTRY_OVERHEAD: i64 = 16;

fn est_format0_tiny() -> i64 { 16 }
fn est_format0(start: u32, end: u32) -> i64 { 16 + (end - start + 1) as i64 }
fn est_sparse_tiny(count: usize) -> i64 { 16 + count as i64 * 2 }

fn subtable_cost(st: &CmapSubtable) -> i64 {
    match st.format {
        CMAP_FORMAT0_TINY => est_format0_tiny(),
        CMAP_FORMAT0 => est_format0(st.min_code, st.max_code),
        CMAP_SPARSE_TINY => est_sparse_tiny(st.count),
        _ => 0,
    }
}

#[derive(Clone)]
struct CmapSubtable {
    format: u8,
    count: usize,
    codepoints: Vec<u32>,
    min_code: u32,
    max_code: u32,
}

struct CmapPlan {
    subtables: Vec<CmapSubtable>,
}

/// DP 最优分割 + 后处理合并（严格对齐 cmap_builder.c cmap_build）
fn cmap_build(codes: &[u32]) -> CmapPlan {
    let count = codes.len();
    if count == 0 {
        return CmapPlan { subtables: vec![] };
    }

    // DP 最短路径
    #[derive(Clone)]
    struct DpNode {
        dist: i64,
        start: usize,
        end: usize,
        format: u8,
    }

    let mut dp = vec![
        DpNode {
            dist: i64::MAX,
            start: 0,
            end: 0,
            format: CMAP_FORMAT0,
        };
        count
    ];

    for i in 0..count {
        for j in 0..=i {
            let prev_dist = if j > 0 { dp[j - 1].dist } else { 0 };

            // format0: range < 256
            if codes[i] - codes[j] < 256 {
                let s = est_format0(codes[j], codes[i]);
                if prev_dist != i64::MAX && prev_dist + s < dp[i].dist {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_FORMAT0;
                }
            }

            // format0_tiny: range < 256 且连续无间隔
            if codes[i] - codes[j] < 256 && codes[i] - i as u32 == codes[j] - j as u32 {
                let s = est_format0_tiny();
                if prev_dist != i64::MAX && prev_dist + s < dp[i].dist {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_FORMAT0_TINY;
                }
            }

            // sparse_tiny: range < 65536
            if codes[i] - codes[j] < 65536 {
                let s = est_sparse_tiny(i - j + 1);
                if prev_dist != i64::MAX && prev_dist + s < dp[i].dist {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_SPARSE_TINY;
                }
            }
        }
    }

    // 回溯构建结果
    let mut result: Vec<CmapSubtable> = Vec::new();
    let mut idx = count;
    while idx > 0 {
        let i = idx - 1;
        let node = &dp[i];
        let seg_len = node.end - node.start + 1;
        let st = CmapSubtable {
            format: node.format,
            count: seg_len,
            codepoints: codes[node.start..=node.end].to_vec(),
            min_code: codes[node.start],
            max_code: codes[node.end],
        };
        result.push(st);
        idx = node.start;
    }
    // 反转（回溯给出逆序）
    result.reverse();

    // 后处理：相邻子表合并为 sparse_tiny 如果更省
    let mut merged_flag = true;
    while merged_flag {
        merged_flag = false;
        let mut i = 0;
        while i + 1 < result.len() {
            let (left, right) = result.split_at_mut(i + 1);
            let a = &mut left[i];
            let b = &mut right[0];

            let combined_first = a.min_code;
            let combined_last = b.max_code;
            if combined_last - combined_first >= 65536 {
                i += 1;
                continue;
            }

            let cost_a = subtable_cost(a);
            let cost_b = subtable_cost(b);
            let separate = cost_a + cost_b + 2 * SUBTABLE_ENTRY_OVERHEAD;

            let combined_count = a.count + b.count;
            let merged_cost = est_sparse_tiny(combined_count) + SUBTABLE_ENTRY_OVERHEAD;

            if merged_cost <= separate {
                // 合并 b 到 a
                a.codepoints.extend_from_slice(&b.codepoints);
                a.count = combined_count;
                a.max_code = combined_last;
                a.format = CMAP_SPARSE_TINY;
                // 删除 b
                result.remove(i + 1);
                merged_flag = true;
                continue;
            }
            i += 1;
        }
    }

    CmapPlan { subtables: result }
}

// ============================================================
// 4. 字形渲染（对齐 font_render.c，用 FreeType）
// ============================================================
struct Glyph {
    code: u32,
    adv_w: i32,
    box_w: i32,
    box_h: i32,
    ofs_x: i32,
    ofs_y: i32,
    pixels: Vec<u8>,
}

struct FontData {
    glyphs: Vec<Glyph>,
    font_height: i32,
    base_line: i32,
}

/// 从 TTC/OTTC 类集合字体中选择能覆盖最多目标字符的 face_index
fn select_best_face_index(font_path: &Path, codes: &[u32]) -> isize {
    let library = match get_font_library() {
        Ok(l) => l,
        Err(_) => return 0,
    };
    // 先获取集合字体中包含的 face 数量
    // 用 face_index = -1 打开可读取 num_faces（普通 ttf/otf 只有 1 个 face）
    let num_faces: isize = library
        .new_face(font_path, -1)
        .ok()
        .as_ref()
        .map(|f| f.raw().num_faces as isize)
        .unwrap_or(1);

    if num_faces <= 1 {
        return 0;
    }

    // 尝试每个 face，统计 glyph_index 不为 0 的字符数，选择覆盖最多的
    let mut best_face: isize = 0;
    let mut best_count: usize = 0;
    let mut idx: isize = 0;
    while idx < num_faces {
        if let Ok(face) = library.new_face(font_path, idx) {
            let mut count: usize = 0;
            for &code in codes {
                if let Some(gi) = face.get_char_index(code as usize) {
                    if gi != 0 {
                        count += 1;
                    }
                }
            }
            if count > best_count {
                best_count = count;
                best_face = idx;
            }
            if count >= codes.len() {
                break;
            }
        }
        idx += 1;
    }
    best_face
}

/// 渲染所有字形（对齐 font_render.c font_render_init）
fn font_render(font_path: &Path, pixel_size: i32, codes: &[u32]) -> Result<FontData, String> {
    let library = get_font_library()?;
    // TTC/OTTC 集合字体选择能覆盖最多目标字符的 face_index
    let face_index = select_best_face_index(font_path, codes);
    eprintln!("[font_render] {} face_index={} codes={}", font_path.display(), face_index, codes.len());
    let face = library
        .new_face(font_path, face_index)
        .map_err(|e| format!("加载字体失败 {} (face={}): {}", font_path.display(), face_index, e))?;

    face.set_pixel_sizes(0, pixel_size as u32)
        .map_err(|e| format!("set_pixel_sizes 失败: {}", e))?;

    let mut glyphs: Vec<Glyph> = Vec::with_capacity(codes.len());
    let mut ascent: i32 = i32::MIN; // 对齐 C: int ascent = -9999
    let mut descent: i32 = i32::MAX; // 对齐 C: int descent = 9999

    for &code in codes {
        let glyph_index = match face.get_char_index(code as usize) {
            Some(0) => continue,
            Some(idx) => idx,
            None => continue,
        };

        // 对齐 C: FT_Load_Glyph(face, glyph_index, FT_LOAD_RENDER | FT_LOAD_TARGET_LIGHT | FT_LOAD_FORCE_AUTOHINT)
        face.load_glyph(glyph_index, LoadFlag::RENDER | LoadFlag::TARGET_LIGHT | LoadFlag::FORCE_AUTOHINT)
            .map_err(|e| format!("load_glyph 失败 code={}: {}", code, e))?;

        let glyph_slot = face.glyph();
        let bitmap = glyph_slot.bitmap();

        // 对齐 C: adv_w = (int)((double)slot->linearHoriAdvance / 65536.0 * 16.0 + 0.5)
        // 通过 raw FFI 访问 linearHoriAdvance（freetype-rs 未直接暴露）
        let linear_hori_advance: i64 = unsafe {
            let raw = glyph_slot.raw();
            (*raw).linearHoriAdvance as i64
        };
        let mut adv_w = ((linear_hori_advance as f64 / 65536.0) * 16.0 + 0.5) as i32;
        // TTC 字体某些字号的 linearHoriAdvance 可能为 0，用 advance().x (26.6格式) 作为 fallback
        if adv_w == 0 {
            let advance_x = glyph_slot.advance().x as i64;
            if advance_x > 0 {
                adv_w = ((advance_x as f64 / 64.0) * 16.0 + 0.5) as i32;
                eprintln!("[font_render] linearHoriAdvance=0, fallback advance().x={} adv_w={} code={} size={}", advance_x, adv_w, code, pixel_size);
            }
        }

        // 对齐 C: box_w = (int)bmp->width
        let box_w = bitmap.width() as i32;
        // 对齐 C: box_h = (int)bmp->rows
        let box_h = bitmap.rows() as i32;
        // 对齐 C: ofs_x = slot->bitmap_left
        let ofs_x = glyph_slot.bitmap_left();
        // 对齐 C: ofs_y = slot->bitmap_top - (int)bmp->rows
        let ofs_y = glyph_slot.bitmap_top() - box_h;

        // 提取像素（对齐 C: 从 bmp->buffer 提取 8-bit grayscale）
        let buffer = bitmap.buffer();
        let pixel_count = (box_w as usize) * (box_h as usize);
        let mut pixels = vec![0u8; pixel_count];
        // FreeType bitmap.pitch: 正值=top-down(行从顶到底)，负值=bottom-up(行从底到顶)
        // 必须按实际方向读取，否则字形上下颠倒导致"乱码"
        let pitch_raw = bitmap.pitch();
        let pitch_abs = pitch_raw.unsigned_abs() as usize;
        let is_bottom_up = pitch_raw < 0;
        if (pitch_abs == box_w as usize || pitch_abs == 0) && !is_bottom_up {
            // 正向紧凑排列（最常见）
            if buffer.len() >= pixel_count {
                pixels.copy_from_slice(&buffer[..pixel_count]);
            }
        } else {
            // 按 pitch 复制每行：bottom-up 时源行号要反转（buffer[0] 是底行 → 填到 dst 的最后一行）
            for row in 0..(box_h as usize) {
                let src_row = if is_bottom_up { (box_h as usize) - 1 - row } else { row };
                let src_start = src_row * pitch_abs;
                let src_end = src_start + (box_w as usize);
                if src_end <= buffer.len() {
                    let dst_start = row * (box_w as usize);
                    pixels[dst_start..dst_start + (box_w as usize)]
                        .copy_from_slice(&buffer[src_start..src_end]);
                }
            }
        }

        // 对齐 C: 更新 ascent/descent（即使 box_h=0 也更新）
        let glyph_top = ofs_y + box_h;
        let glyph_bottom = ofs_y;
        if glyph_top > ascent {
            ascent = glyph_top;
        }
        if glyph_bottom < descent {
            descent = glyph_bottom;
        }

        eprintln!("[font_render]   code=0x{:X} adv_w={} box_w={} box_h={} ofs_x={} ofs_y={} pixels={}", code, adv_w, box_w, box_h, ofs_x, ofs_y, pixels.len());
        glyphs.push(Glyph {
            code,
            adv_w,
            box_w,
            box_h,
            ofs_x,
            ofs_y,
            pixels,
        });
    }

    // 对齐 C: 如果 ascent < 0，用默认值（C 源码不处理此情况，Rust 增加保护）
    if ascent == i32::MIN {
        ascent = pixel_size;
        descent = 0;
    }

    // 对齐 C: out->font_height = ascent - descent; out->base_line = -descent
    eprintln!("[font_render] {} 完成: glyphs={}/{} ascent={} descent={}", font_path.display(), glyphs.len(), codes.len(), ascent, descent);
    Ok(FontData {
        glyphs,
        font_height: ascent - descent,
        base_line: -descent,
    })
}

// ============================================================
// 5. output_writer - 生成 SGL 字模 C 文件内容（严格对齐 output_writer.c）
// ============================================================

/// 量化像素（对齐 C: quantize_pixel）
fn quantize_pixel(pixel: u8, bpp: i32) -> u8 {
    pixel >> (8 - bpp)
}

/// 是否压缩（对齐 C: should_compress）
fn should_compress(bpp: i32, compress_flag: bool) -> bool {
    if !compress_flag {
        return false;
    }
    if bpp == 1 {
        return false;
    }
    true
}

/// 渲染单个字形位图（对齐 C: render_glyph_bitmap）
fn render_glyph_bitmap(g: &Glyph, bpp: i32, compress_flag: bool) -> Vec<u8> {
    let pixel_count = (g.box_w as usize) * (g.box_h as usize);

    // 量化像素
    let mut qpixels = vec![0u8; pixel_count];
    for i in 0..pixel_count {
        qpixels[i] = quantize_pixel(g.pixels[i], bpp);
    }

    // 分配 buffer（对齐 C: buf_cap = 128 + pixel_count * 2）
    let mut bs = BitStream::new(128 + pixel_count * 2);

    if pixel_count > 0 {
        if should_compress(bpp, compress_flag) {
            rle_compress(&mut bs, &qpixels, bpp as usize);
        } else {
            // Raw：每个像素写 bpp bits
            for i in 0..pixel_count {
                bs.write_bits(qpixels[i] as u32, bpp as usize);
            }
        }
    }

    bs.to_bytes().to_vec()
}

/// 在 font.glyphs 中查找 codepoint（对齐 C: find_glyph_index，二分查找）
fn find_glyph_index(font: &FontData, code: u32) -> Option<usize> {
    let mut lo = 0;
    let mut hi = font.glyphs.len();
    while lo < hi {
        let mid = (lo + hi) / 2;
        if font.glyphs[mid].code == code {
            return Some(mid);
        }
        if font.glyphs[mid].code < code {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    None
}

/// 生成 SGL 字模 C 文件内容（严格对齐 output_writer.c write_sgl_font）
fn write_sgl_font(font_name: &str, font: &FontData, cmap: &CmapPlan, bpp: i32, compress: bool) -> String {
    let glyph_count = font.glyphs.len();

    // Phase 1: 编译所有字形位图
    struct CompiledGlyph {
        bitmap_data: Vec<u8>,
        bitmap_offset: usize,
    }

    let mut compiled: Vec<CompiledGlyph> = Vec::with_capacity(glyph_count);
    let mut total_bitmap_size: usize = 0;
    for i in 0..glyph_count {
        let bm = render_glyph_bitmap(&font.glyphs[i], bpp, compress);
        eprintln!("[font_gen] glyph {} code=0x{:X} bpp={} compress={} bitmap_bytes={} offset={}", i, font.glyphs[i].code, bpp, compress, bm.len(), total_bitmap_size);
        // 输出 bitmap 前 16 字节用于诊断
        let head: Vec<String> = bm.iter().take(16).map(|b| format!("0x{:02x}", b)).collect();
        eprintln!("[font_gen]   bitmap head: {}", head.join(", "));
        compiled.push(CompiledGlyph {
            bitmap_offset: total_bitmap_size,
            bitmap_data: bm,
        });
        total_bitmap_size += compiled.last().unwrap().bitmap_data.len();
    }

    let mut out = String::new();

    // Phase 2: 文件头
    out.push_str(&format!("/* source/fonts/{}.c\n", font_name));
    out.push_str(" *\n");
    out.push_str(" * MIT License\n");
    out.push_str(" *\n");
    out.push_str(" * Copyright(c) 2023-present All contributors of SGL  \n");
    out.push_str(" * Document reference link: docs directory\n");
    out.push_str(" * \n");
    out.push_str(" * Permission is hereby granted, free of charge, to any person obtaining a copy\n");
    out.push_str(" * of this software and associated documentation files (the \"Software\"), to deal\n");
    out.push_str(" * in the Software without restriction, including without limitation the rights\n");
    out.push_str(" * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n");
    out.push_str(" * copies of the Software, and to permit persons to whom the Software is\n");
    out.push_str(" * furnished to do so, subject to the following conditions:\n");
    out.push_str(" * The above copyright notice and this permission notice shall be included in all\n");
    out.push_str(" * copies or substantial portions of the Software.\n");
    out.push_str(" * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n");
    out.push_str(" * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n");
    out.push_str(" * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n");
    out.push_str(" * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n");
    out.push_str(" * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n");
    out.push_str(" * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n");
    out.push_str(" * SOFTWARE.\n");
    out.push_str(" */\n\n");
    out.push_str("#include <sgl_core.h>\n");
    out.push_str("#include <sgl_font.h>\n\n");

    // Phase 3: font_bitmap[]
    out.push_str("static const uint8_t font_bitmap[] = {\n");
    for i in 0..glyph_count {
        let g = &font.glyphs[i];
        let cg = &compiled[i];
        out.push_str(&format!("    /* U+{:04X} */\n", g.code));
        for b in 0..cg.bitmap_data.len() {
            if b % 8 == 0 {
                out.push_str("    ");
            }
            out.push_str(&format!("0x{:02x}", cg.bitmap_data[b]));
            // 逗号规则：最后一个字形的最后一个字节不加逗号
            if i < glyph_count - 1 || b < cg.bitmap_data.len() - 1 {
                out.push(',');
            }
            if b % 8 == 7 || b == cg.bitmap_data.len() - 1 {
                out.push('\n');
            } else {
                out.push(' ');
            }
        }
        if i < glyph_count - 1 && !cg.bitmap_data.is_empty() {
            out.push('\n');
        }
    }
    out.push_str("};\n\n");

    // Phase 4: font_table[]
    out.push_str("\nstatic const sgl_font_table_t font_table[] = {\n");
    out.push_str("    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */");

    for st_idx in 0..cmap.subtables.len() {
        let st = &cmap.subtables[st_idx];

        if st.format == CMAP_FORMAT0 || st.format == CMAP_FORMAT0_TINY {
            // FORMAT0: 遍历 min_code 到 max_code，缺失字符补 dummy
            for code in st.min_code..=st.max_code {
                if let Some(gi) = find_glyph_index(font, code) {
                    let g = &font.glyphs[gi];
                    out.push_str(&format!(
                        ",\n    {{.bitmap_index = {}, .adv_w = {}, .box_w = {}, .box_h = {}, .ofs_x = {}, .ofs_y = {}}}",
                        compiled[gi].bitmap_offset, g.adv_w, g.box_w, g.box_h, g.ofs_x, g.ofs_y
                    ));
                } else {
                    // Dummy entry for gap
                    out.push_str(&format!(
                        ",\n    {{.bitmap_index = {}, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}}",
                        total_bitmap_size
                    ));
                }
            }
        } else {
            // SPARSE_TINY: 只写实际 codepoint
            for k in 0..st.count {
                let code = st.codepoints[k];
                if let Some(gi) = find_glyph_index(font, code) {
                    let g = &font.glyphs[gi];
                    out.push_str(&format!(
                        ",\n    {{.bitmap_index = {}, .adv_w = {}, .box_w = {}, .box_h = {}, .ofs_x = {}, .ofs_y = {}}}",
                        compiled[gi].bitmap_offset, g.adv_w, g.box_w, g.box_h, g.ofs_x, g.ofs_y
                    ));
                } else {
                    out.push_str(&format!(
                        ",\n    {{.bitmap_index = {}, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}}",
                        total_bitmap_size
                    ));
                }
            }
        }
    }
    out.push_str("\n};\n\n");

    // Phase 5: unicode_list_N[]（仅 SPARSE_TINY 输出）
    for st_idx in 0..cmap.subtables.len() {
        let st = &cmap.subtables[st_idx];
        if st.format == CMAP_SPARSE_TINY {
            out.push_str(&format!("static const uint16_t unicode_list_{}[] = {{\n", st_idx));
            let base = st.min_code;
            for k in 0..st.count {
                let delta = st.codepoints[k] - base;
                if k % 8 == 0 {
                    out.push_str("    ");
                }
                out.push_str(&format!("0x{:x}", delta));
                if k < st.count - 1 {
                    out.push(',');
                }
                if k % 8 == 7 || k == st.count - 1 {
                    out.push('\n');
                } else {
                    out.push(' ');
                }
            }
            out.push_str("};\n\n");
        }
    }

    // Phase 6: font_unicode[]
    out.push_str("static const sgl_font_unicode_t font_unicode[] = {\n");
    let mut cumulative_offset: usize = 1; // 对齐 C: int cumulative_offset = 1

    for st_idx in 0..cmap.subtables.len() {
        let st = &cmap.subtables[st_idx];

        // 对齐 C: FORMAT0/FORMAT0_TINY 的 len = max_code - min_code + 1, SPARSE_TINY 的 len = count
        let len: usize = if st.format == CMAP_FORMAT0 || st.format == CMAP_FORMAT0_TINY {
            (st.max_code - st.min_code + 1) as usize
        } else {
            st.count
        };

        // 对齐 C: SPARSE_TINY 用 unicode_list_N, 其他用 NULL
        let list_name = if st.format == CMAP_SPARSE_TINY {
            format!("unicode_list_{}", st_idx)
        } else {
            "NULL".to_string()
        };

        let tab_offset = cumulative_offset;
        let comma = if st_idx < cmap.subtables.len() - 1 { "," } else { "" };
        out.push_str(&format!(
            "    {{ .offset = 0x{:x}, .len = {}, .list = {}, .tab_offset = {}, }}{}\n",
            st.min_code, len, list_name, tab_offset, comma
        ));

        cumulative_offset += len;
    }
    out.push_str("};\n\n");

    // Phase 7: sgl_font_t
    out.push_str(&format!("const sgl_font_t {} = {{\n", font_name));
    out.push_str("    .bitmap = font_bitmap,\n");
    out.push_str("    .table = font_table,\n");
    out.push_str("    .font_table_size = SGL_ARRAY_SIZE(font_table),\n");
    out.push_str(&format!("    .font_height = {},\n", font.font_height));
    out.push_str(&format!("    .base_line = {},\n", font.base_line));
    out.push_str(&format!("    .bpp = {},\n", bpp));
    out.push_str(&format!("    .compress = {},\n", if should_compress(bpp, compress) { 1 } else { 0 }));
    out.push_str("    .unicode = font_unicode,\n");
    out.push_str("    .unicode_num = SGL_ARRAY_SIZE(font_unicode),\n");
    out.push_str("};\n");

    out
}

// ============================================================
// 6. 对外主接口
// ============================================================

/// 生成 SGL 字模 C 文件内容
///
/// 严格移植 sgl_font_conv 的 C 源码算法流程：
///   1. font_render: 用 FreeType 渲染字符
///   2. cmap_build: DP 最优子表分割 + 后处理合并
///   3. write_sgl_font: 生成 C 文件
///
/// # 参数
/// - `font_path`: 字体文件路径
/// - `size`: 字号
/// - `bpp`: 位深 (1, 2, 4)
/// - `symbols`: 需要取模的字符（UTF-8 字符串）
/// - `compress`: 是否启用 RLE 压缩
/// - `font_name`: 字体变量名（如 sgl_font_HarmonyOS_Sans_SC_Bold_ttf_14_bpp4）
///
/// # 返回
/// SGL 字模 C 文件内容
pub fn generate_font_c(
    font_path: &Path,
    size: i32,
    bpp: i32,
    symbols: &str,
    compress: bool,
    font_name: &str,
) -> Result<String, String> {
    if size <= 0 {
        return Err(format!("字号必须大于 0，当前值: {}", size));
    }
    if bpp != 1 && bpp != 2 && bpp != 4 {
        return Err(format!("bpp 必须为 1/2/4，当前值: {}", bpp));
    }
    // 1. 从 UTF-8 字符串提取 codepoints（对齐 C: utf8_to_codepoints）
    let mut codes_set: BTreeSet<u32> = BTreeSet::new();
    for ch in symbols.chars() {
        let code = ch as u32;
        // 对齐 C: codes 必须 >= 0x20
        if code >= 0x20 {
            codes_set.insert(code);
        }
    }
    let codes: Vec<u32> = codes_set.into_iter().collect();

    if codes.is_empty() {
        return Err("没有可渲染的字符".to_string());
    }

    // 2. 用 FreeType 渲染所有字形（对齐 C: font_render_init）
    let font_data = font_render(font_path, size, &codes)?;

    if font_data.glyphs.is_empty() {
        return Err("字体渲染失败：没有有效字形".to_string());
    }

    // 3. 构建 cmap 子表（对齐 C: cmap_build）
    let rendered_codes: Vec<u32> = font_data.glyphs.iter().map(|g| g.code).collect();
    let cmap = cmap_build(&rendered_codes);

    // 4. 生成 C 文件（对齐 C: write_sgl_font）
    Ok(write_sgl_font(font_name, &font_data, &cmap, bpp, compress))
}
