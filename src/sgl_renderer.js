/**
 * SGL 核心渲染引擎 JavaScript 移植
 * 基于源目录 sgl/source/draw/ 下的 C 代码逐函数移植
 * 目标：像素级还原 SGL 仿真渲染效果，实现所见即所得
 *
 * 核心设计：
 * - 内部颜色统一用 {r, g, b} (0-255)
 * - 坐标系统采用闭区间：width = x2 - x1 + 1
 * - 像素操作通过 ImageData + Uint32Array，最后 putImageData 上屏
 * - 抗锯齿算法完全照搬 SGL：边缘 1 像素环带 + 距离平方
 */

// ============================================================
// 颜色系统
// ============================================================

/**
 * hex 字符串转 {r,g,b}
 * @param {string} hex - #RRGGBB 或 #RGB
 * @returns {{r:number,g:number,b:number}}
 */
function hexToColor(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const num = parseInt(h, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

/**
 * {r,g,b} 转 CSS hex 字符串
 */
function colorToHex(c) {
  const t = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + t(c.r) + t(c.g) + t(c.b);
}

/**
 * SGL 颜色混合 sgl_color_mixer(fg, bg, factor)
 * factor 0-255，255 = 全前景
 */
function colorMixer(fg, bg, factor) {
  // SGL: bg + (fg - bg) * factor / 256，factor 范围 0-256
  const f = Math.max(0, Math.min(256, factor));
  return {
    r: Math.round((fg.r * f + bg.r * (256 - f)) / 256),
    g: Math.round((fg.g * f + bg.g * (256 - f)) / 256),
    b: Math.round((fg.b * f + bg.b * (256 - f)) / 256),
  };
}

/**
 * sgl_rgb(r, g, b) → {r,g,b}
 */
function sglRgb(r, g, b) {
  return { r, g, b };
}

// 常量
const SGL_ALPHA_MAX = 255;
const SGL_ALPHA_MIN = 0;

// SGL 定点三角函数（移植自 sgl_math.c sgl_sin / sgl_math.h sgl_cos）
// SGL_SIN_FIXED_ONE = 32768, sgl_sin 返回 0-32767 的整数
// 用于 analogclock / gauge 等控件的坐标计算，确保与 SGL 仿真像素级一致
const SGL_SIN_FIXED_ONE = 32768;
const SIN0_90_TABLE = [
  0,     572,   1144,  1715,  2286,  2856,  3425,  3993,  4560,  5126,  5690,  6252,  6813,  7371,  7927,  8481,
  9032,  9580,  10126, 10668, 11207, 11743, 12275, 12803, 13328, 13848, 14364, 14876, 15383, 15886, 16383, 16876,
  17364, 17846, 18323, 18794, 19260, 19720, 20173, 20621, 21062, 21497, 21925, 22347, 22762, 23170, 23571, 23964,
  24351, 24730, 25101, 25465, 25821, 26169, 26509, 26841, 27165, 27481, 27788, 28087, 28377, 28659, 28932, 29196,
  29451, 29697, 29934, 30162, 30381, 30591, 30791, 30982, 31163, 31335, 31498, 31650, 31794, 31927, 32051, 32165,
  32269, 32364, 32448, 32523, 32587, 32642, 32687, 32722, 32747, 32762, 32767
];

function sglMod360(angle) {
  while (angle >= 360) angle -= 360;
  while (angle < 0) angle += 360;
  return angle;
}

function sglSin(angle) {
  angle = sglMod360(angle);
  if (angle < 0) angle = 360 + angle;
  if (angle < 90) {
    return SIN0_90_TABLE[angle];
  } else if (angle < 180) {
    return SIN0_90_TABLE[180 - angle];
  } else if (angle < 270) {
    return -SIN0_90_TABLE[angle - 180];
  } else {
    return -SIN0_90_TABLE[360 - angle];
  }
}

function sglCos(angle) {
  return sglSin(angle + 90);
}

// SGL 整数平方根 sgl_sqrt (移植自 sgl_math.c)
// 返回 floor(sqrt(x)), 与 SGL 仿真完全一致
// 用于 sgl_draw_line_fill_slanted 的 inv_len 计算, 确保线条粗细与 SGL 一致
function sglSqrt(x) {
  x = x >>> 0; // 确保无符号 32 位
  let rem = 0, root = 0, divisor = 0;
  for (let i = 0; i < 16; i++) {
    root <<= 1;
    rem = ((rem << 2) + (x >>> 30)) >>> 0;
    x = (x << 2) >>> 0;
    divisor = ((root << 1) + 1) >>> 0;
    if (divisor <= rem) {
      rem = (rem - divisor) >>> 0;
      root++;
    }
  }
  return root & 0xffff;
}

// 4bpp alpha 映射表（sgl_opa4_table）
const OPA4_TABLE = [0,17,34,51,68,85,102,119,136,153,170,187,204,221,238,255];
// 2bpp alpha 映射表（sgl_opa2_table）
const OPA2_TABLE = [0,85,170,255];

// ============================================================
// Surface 抽象（对应 sgl_surf_t）
// ============================================================

/**
 * 创建绘制表面
 * @param {HTMLCanvasElement} canvas
 * @param {number} w - 逻辑宽度（控件坐标系）
 * @param {number} h - 逻辑高度
 * @param {number} scale - 缩放系数 z
 * @returns {{canvas, ctx, imageData, buf32, w, h, scale, clip}}
 */
function createSurface(canvas, w, h, scale) {
  // SGL 闭区间坐标：绘制范围 0 ~ round((w-1)*scale)
  // cw 至少要 = round((w-1)*scale)+1，否则右边框/下边框像素 px2 会超出 clip 被裁
  // (当 z<1 且 (w-1)*z 小数部分>=0.5 时，round((w-1)*z) 可能 = ceil(w*z) > cw-1)
  const cw = Math.max(1, Math.ceil(w * scale), Math.round((w - 1) * scale) + 1);
  const ch = Math.max(1, Math.ceil(h * scale), Math.round((h - 1) * scale) + 1);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const imageData = ctx.createImageData(cw, ch);
  const buf32 = new Uint32Array(imageData.data.buffer);
  // 初始化为透明
  buf32.fill(0);
  return {
    canvas, ctx, imageData, buf32,
    w: cw, h: ch, scale,
    // clip 区域（像素坐标），默认全屏
    clip: { x1: 0, y1: 0, x2: cw - 1, y2: ch - 1 },
  };
}

/**
 * 将 surface 内容刷新到 canvas
 */
function flushSurface(surf) {
  surf.ctx.putImageData(surf.imageData, 0, 0);
}

/**
 * 设置像素（带裁剪），颜色 {r,g,b}，alpha 0-255
 * 坐标为像素坐标（已乘 scale）
 */
function setPixel(surf, x, y, color, alpha) {
  if (x < surf.clip.x1 || x > surf.clip.x2 || y < surf.clip.y1 || y > surf.clip.y2) return;
  if (alpha <= 0) return;
  const idx = y * surf.w + x;
  if (alpha >= 255) {
    // 直接覆盖（ABGR 小端）
    surf.buf32[idx] = 0xff000000 | (color.b << 16) | (color.g << 8) | color.r;
  } else {
    // 与现有像素混合
    const existing = surf.buf32[idx];
    const bg = {
      r: existing & 0xff,
      g: (existing >> 8) & 0xff,
      b: (existing >> 16) & 0xff,
    };
    const mixed = colorMixer(color, bg, alpha);
    surf.buf32[idx] = 0xff000000 | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
  }
}

/**
 * 获取现有像素颜色（用于混合前的背景采样）
 */
function getPixel(surf, x, y) {
  const idx = y * surf.w + x;
  const v = surf.buf32[idx];
  return { r: v & 0xff, g: (v >> 8) & 0xff, b: (v >> 16) & 0xff };
}

/**
 * 设置边缘像素（抗锯齿用）
 * 修复透明背景下的抗锯齿问题：
 * - 背景透明时（alpha=0）：写入带 alpha 通道的颜色，让 canvas 与页面背景自然混合
 *   （SGL 仿真中背景是不透明帧缓冲，此处 surface 初始全透明，需特殊处理避免与黑色混合变暗）
 * - 背景不透明时：按 SGL 算法 sgl_color_mixer 与现有像素混合
 * @param {object} surf - 绘制表面
 * @param {number} x, y - 像素坐标
 * @param {{r,g,b}} color - 前景色
 * @param {number} edge_alpha - 边缘抗锯齿系数 0-255
 * @param {number} alpha - 整体透明度 0-255
 */
function setEdgePixel(surf, x, y, color, edge_alpha, alpha) {
  if (x < surf.clip.x1 || x > surf.clip.x2 || y < surf.clip.y1 || y > surf.clip.y2) return;
  if (edge_alpha <= 0 || alpha <= 0) return;
  const idx = y * surf.w + x;
  const existing = surf.buf32[idx];
  const bg_a = (existing >> 24) & 0xff;

  if (bg_a === 0) {
    // 背景完全透明：写入带 alpha 通道的颜色，不做黑色混合
    // SGL: color * edge_alpha/256 + bg(透明,0贡献) * (256-edge_alpha)/256
    // 由于 bg 透明，最终像素 = color with alpha = edge_alpha * alpha / 255
    const final_alpha = Math.min(255, Math.round(edge_alpha * alpha / 255));
    if (final_alpha > 0) {
      surf.buf32[idx] = (final_alpha << 24) | (color.b << 16) | (color.g << 8) | color.r;
    }
  } else {
    // 背景不透明：按 SGL 算法与现有像素混合
    const bg = { r: existing & 0xff, g: (existing >> 8) & 0xff, b: (existing >> 16) & 0xff };
    const mixed = colorMixer(color, bg, edge_alpha);
    if (alpha >= 255) {
      surf.buf32[idx] = 0xff000000 | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
    } else {
      const final = colorMixer(mixed, bg, alpha);
      surf.buf32[idx] = 0xff000000 | (final.b << 16) | (final.g << 8) | final.r;
    }
  }
}

// ============================================================
// 矩形区域裁剪辅助
// ============================================================

/**
 * 计算两矩形交集，返回 null 表示无交集
 */
function areaClip(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  if (x1 > x2 || y1 > y2) return null;
  return { x1, y1, x2, y2 };
}

// ============================================================
// sgl_draw_fill_rect - 圆角填充矩形
// 移植自 sgl_draw_rect.c:72-160
// ============================================================

/**
 * @param {object} surf - 绘制表面
 * @param {number} x1,y1,x2,y2 - 矩形区域（逻辑坐标，闭区间）
 * @param {number} radius - 圆角半径
 * @param {{r,g,b}} color - 填充色
 * @param {number} alpha - 透明度 0-255
 */
function drawFillRect(surf, x1, y1, x2, y2, radius, color, alpha) {
  if (alpha <= 0) return;
  const z = surf.scale;
  // 转像素坐标
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const pr = Math.round(radius * z);

  // 裁剪
  const clip = areaClip(surf.clip, { x1: px1, y1: py1, x2: px2, y2: py2 });
  if (!clip) return;

  if (pr <= 0) {
    // 直角矩形
    for (let y = clip.y1; y <= clip.y2; y++) {
      for (let x = clip.x1; x <= clip.x2; x++) {
        setPixel(surf, x, y, color, alpha);
      }
    }
    return;
  }

  // 圆角矩形 - 九宫格分区
  const cx1 = px1 + pr;  // 左圆心 x
  const cx2 = px2 - pr;  // 右圆心 x
  const cy1 = py1 + pr;  // 上圆心 y
  const cy2 = py2 - pr;  // 下圆心 y
  const r2 = pr * pr;
  const r2_max = (pr + 1) * (pr + 1);
  const r2_diff = Math.max(r2_max - r2, 1);
  const r2_fix_diff = Math.floor((255 << 15) / r2_diff);

  for (let y = clip.y1; y <= clip.y2; y++) {
    // 确定该行的圆心 y（如果 y 在角带内）
    let cy_tmp = null;
    if (y < cy1) cy_tmp = cy1;
    else if (y > cy2) cy_tmp = cy2;

    let cx_tmp = null;
    let dy2 = 0;
    if (cy_tmp !== null) {
      dy2 = (y - cy_tmp) * (y - cy_tmp);
    }

    for (let x = clip.x1; x <= clip.x2; x++) {
      if (cy_tmp === null) {
        // 中间带，直接填充
        setPixel(surf, x, y, color, alpha);
      } else {
        // 角带
        if (x >= cx1 && x <= cx2) {
          // 中间段，直接填充
          setPixel(surf, x, y, color, alpha);
        } else {
          // 角段
          cx_tmp = x < cx1 ? cx1 : cx2;
          const real_r2 = (x - cx_tmp) * (x - cx_tmp) + dy2;
          if (real_r2 >= r2_max) {
            // 圆外
            if (x > cx_tmp) break; // 早终止
            continue;
          }
          if (real_r2 >= r2) {
            // 边缘抗锯齿带（使用 setEdgePixel 正确处理透明背景）
            const edge_alpha = Math.floor(((r2_max - real_r2) * r2_fix_diff) >> 15);
            setEdgePixel(surf, x, y, color, edge_alpha, alpha === 255 ? 255 : alpha);
          } else {
            // 圆内
            setPixel(surf, x, y, color, alpha);
          }
        }
      }
    }
  }
}

// ============================================================
// sgl_draw_fill_rect_border - 只画边框
// 移植自 sgl_draw_rect.c:173-273
// ============================================================

/**
 * @param {number} border - 边框宽度
 */
function drawFillRectBorder(surf, x1, y1, x2, y2, radius, borderColor, border, alpha) {
  if (border <= 0 || alpha <= 0) return;
  const z = surf.scale;
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const pr = Math.round(radius * z);
  const pb = Math.round(border * z);

  const clip = areaClip(surf.clip, { x1: px1, y1: py1, x2: px2, y2: py2 });
  if (!clip) return;

  // 内部矩形
  const ix1 = px1 + pb;
  const iy1 = py1 + pb;
  const ix2 = px2 - pb;
  const iy2 = py2 - pb;

  if (pr <= 0) {
    // 直角边框
    for (let y = clip.y1; y <= clip.y2; y++) {
      for (let x = clip.x1; x <= clip.x2; x++) {
        const inBorder = (y < iy1 || y > iy2 || x < ix1 || x > ix2);
        if (inBorder) {
          setPixel(surf, x, y, borderColor, alpha);
        }
      }
    }
    return;
  }

  // 圆角边框
  const cx1 = px1 + pr, cx2 = px2 - pr;
  const cy1 = py1 + pr, cy2 = py2 - pr;
  const radius_in = Math.max(pr - pb, 0);
  const out_r2 = pr * pr;
  const out_r2_max = (pr + 1) * (pr + 1);
  const in_r2 = radius_in * radius_in;
  const in_r2_max = (radius_in + 1) * (radius_in + 1);
  const out_diff = Math.max(out_r2_max - out_r2, 1);
  const in_diff = Math.max(in_r2_max - in_r2, 1);
  const out_fix = Math.floor((255 << 15) / out_diff);
  const in_fix = Math.floor((255 << 15) / in_diff);

  for (let y = clip.y1; y <= clip.y2; y++) {
    let cy_tmp = null;
    if (y < cy1) cy_tmp = cy1;
    else if (y > cy2) cy_tmp = cy2;

    let dy2 = 0;
    if (cy_tmp !== null) dy2 = (y - cy_tmp) * (y - cy_tmp);

    for (let x = clip.x1; x <= clip.x2; x++) {
      // 内部矩形直接跳过（非角带）
      if (cy_tmp === null) {
        // 中间带
        if (x >= ix1 && x <= ix2) continue; // 内部
        setPixel(surf, x, y, borderColor, alpha);
      } else {
        // 角带
        if (x >= cx1 && x <= cx2) {
          // 中间段
          if (y >= iy1 && y <= iy2) continue; // 内部
          setPixel(surf, x, y, borderColor, alpha);
        } else {
          // 角段
          const cx_tmp = x < cx1 ? cx1 : cx2;
          const real_r2 = (x - cx_tmp) * (x - cx_tmp) + dy2;
          if (real_r2 >= out_r2_max) {
            if (x > cx_tmp) break;
            continue;
          }
          if (real_r2 <= in_r2) {
            // 内圆内，跳过
            continue;
          }
          if (real_r2 < in_r2_max && radius_in > 0) {
            // 内圆边缘抗锯齿（使用 setEdgePixel 正确处理透明背景）
            const edge_alpha = Math.floor(((real_r2 - in_r2) * in_fix) >> 15);
            setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha);
          } else if (real_r2 <= out_r2) {
            // 直接画边框色
            setPixel(surf, x, y, borderColor, alpha);
          } else {
            // 外圆边缘抗锯齿（使用 setEdgePixel 正确处理透明背景）
            const edge_alpha = Math.floor(((out_r2_max - real_r2) * out_fix) >> 15);
            setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha);
          }
        }
      }
    }
  }
}

// ============================================================
// sgl_draw_fill_rich_rect - 四角独立圆角矩形填充
// 移植自 sgl_draw_rect.c:175-259
// ============================================================

/**
 * @param {number} tl_radius - 左上圆角
 * @param {number} tr_radius - 右上圆角
 * @param {number} bl_radius - 左下圆角
 * @param {number} br_radius - 右下圆角
 */
function drawFillRichRect(surf, x1, y1, x2, y2, tl_radius, tr_radius, bl_radius, br_radius, color, alpha) {
  if (alpha <= 0) return;
  const z = surf.scale;
  // 转像素坐标
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const r_tl = Math.max(Math.round(tl_radius * z), 0);
  const r_tr = Math.max(Math.round(tr_radius * z), 0);
  const r_bl = Math.max(Math.round(bl_radius * z), 0);
  const r_br = Math.max(Math.round(br_radius * z), 0);

  // 裁剪
  const clip = areaClip(surf.clip, { x1: px1, y1: py1, x2: px2, y2: py2 });
  if (!clip) return;

  if (r_tl === 0 && r_tr === 0 && r_bl === 0 && r_br === 0) {
    for (let y = clip.y1; y <= clip.y2; y++) {
      for (let x = clip.x1; x <= clip.x2; x++) {
        setPixel(surf, x, y, color, alpha);
      }
    }
    return;
  }

  // SGL: x_mid/y_mid 划分四象限，每个像素选择对应角的圆心和半径
  const x_mid = (px1 + px2) >> 1;
  const y_mid = (py1 + py2) >> 1;

  for (let y = clip.y1; y <= clip.y2; y++) {
    for (let x = clip.x1; x <= clip.x2; x++) {
      let r = 0, cx = 0, cy = 0;
      if (y <= y_mid) {
        if (x <= x_mid) {
          r = r_tl; cx = px1 + r; cy = py1 + r;
        } else {
          r = r_tr; cx = px2 - r; cy = py1 + r;
        }
      } else {
        if (x <= x_mid) {
          r = r_bl; cx = px1 + r; cy = py2 - r;
        } else {
          r = r_br; cx = px2 - r; cy = py2 - r;
        }
      }

      // in_x_straight: 当前像素是否在直线段范围内（圆心内侧）
      const in_x_straight = (x <= x_mid) ? (x >= cx) : (x <= cx);
      const in_y_straight = (y <= y_mid) ? (y >= cy) : (y <= cy);

      if (in_x_straight || in_y_straight || r === 0) {
        setPixel(surf, x, y, color, alpha);
      } else {
        // 圆角区域
        const r2 = r * r;
        const r2_max = (r + 1) * (r + 1);
        const r2_diff = Math.max(r2_max - r2, 1);
        const r2_fix_diff = Math.floor((255 << 15) / r2_diff);
        const dy2 = (y - cy) * (y - cy);
        const real_r2 = (x - cx) * (x - cx) + dy2;
        if (real_r2 >= r2_max) {
          // 圆外：不绘制
          continue;
        } else if (real_r2 >= r2) {
          // 边缘抗锯齿
          const edge_alpha = Math.floor(((r2_max - real_r2) * r2_fix_diff) >> 15);
          setEdgePixel(surf, x, y, color, edge_alpha, alpha === 255 ? 255 : alpha);
        } else {
          // 圆内
          setPixel(surf, x, y, color, alpha);
        }
      }
    }
  }
}

// ============================================================
// sgl_draw_fill_rect_border_rich - 四角独立圆角边框
// 移植自 sgl_draw_rect.c:388-505
// ============================================================

/**
 * @param {number} border - 边框宽度
 */
function drawFillRectBorderRich(surf, x1, y1, x2, y2, tl_radius, tr_radius, bl_radius, br_radius, borderColor, border, alpha) {
  if (border <= 0 || alpha <= 0) return;
  const z = surf.scale;
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const pb = Math.round(border * z);
  const r_tl = Math.max(Math.round(tl_radius * z), 0);
  const r_tr = Math.max(Math.round(tr_radius * z), 0);
  const r_bl = Math.max(Math.round(bl_radius * z), 0);
  const r_br = Math.max(Math.round(br_radius * z), 0);

  const clip = areaClip(surf.clip, { x1: px1, y1: py1, x2: px2, y2: py2 });
  if (!clip) return;

  // 边框内边界（rect 缩进 border）
  const cx1i = px1 + pb;
  const cx2i = px2 - pb;
  const cyi1 = py1 + pb;
  const cyi2 = py2 - pb;

  if (r_tl === 0 && r_tr === 0 && r_bl === 0 && r_br === 0) {
    // 纯直角边框
    for (let y = clip.y1; y <= clip.y2; y++) {
      const edge_row = (y < cyi1 || y > cyi2);
      for (let x = clip.x1; x <= clip.x2; x++) {
        if (edge_row || x < cx1i || x > cx2i) {
          setPixel(surf, x, y, borderColor, alpha);
        }
      }
    }
    return;
  }

  const x_mid = (px1 + px2) >> 1;
  const y_mid = (py1 + py2) >> 1;

  for (let y = clip.y1; y <= clip.y2; y++) {
    const edge_row = (y < cyi1 || y > cyi2);
    for (let x = clip.x1; x <= clip.x2; x++) {
      let r = 0, cx = 0, cy = 0;
      if (y <= y_mid) {
        if (x <= x_mid) {
          r = r_tl; cx = px1 + r; cy = py1 + r;
        } else {
          r = r_tr; cx = px2 - r; cy = py1 + r;
        }
      } else {
        if (x <= x_mid) {
          r = r_bl; cx = px1 + r; cy = py2 - r;
        } else {
          r = r_br; cx = px2 - r; cy = py2 - r;
        }
      }

      const in_x_straight = (x <= x_mid) ? (x >= cx) : (x <= cx);
      const in_y_straight = (y <= y_mid) ? (y >= cy) : (y <= cy);

      if (in_x_straight || in_y_straight || r === 0) {
        // 直线段：只在边框宽度内绘制
        if (x < cx1i || x > cx2i || edge_row) {
          setPixel(surf, x, y, borderColor, alpha);
        }
      } else {
        // 圆角段
        const radius_in = Math.max(r - pb, 0);
        const out_r2 = r * r;
        const out_r2_max = (r + 1) * (r + 1);
        const in_r2 = radius_in * radius_in;
        const in_r2_max = (radius_in + 1) * (radius_in + 1);
        const out_r2_diff = Math.max(out_r2_max - out_r2, 1);
        const out_fix_diff = Math.floor((255 << 15) / out_r2_diff);
        const in_r2_diff = Math.max(in_r2_max - in_r2, 1);
        const in_fix_diff = Math.floor((255 << 15) / in_r2_diff);
        const dy2 = (y - cy) * (y - cy);
        const real_r2 = (x - cx) * (x - cx) + dy2;

        if (real_r2 >= out_r2_max) {
          // 圆外
          continue;
        } else if (real_r2 <= in_r2) {
          // 内圆内（不绘制边框）
          continue;
        } else if (real_r2 < in_r2_max) {
          // 内圆边缘抗锯齿
          const edge_alpha = Math.floor(((real_r2 - in_r2) * in_fix_diff) >> 15);
          setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha === 255 ? 255 : alpha);
        } else if (real_r2 <= out_r2) {
          // 边框实体
          setPixel(surf, x, y, borderColor, alpha);
        } else {
          // 外圆边缘抗锯齿
          const edge_alpha = Math.floor(((out_r2_max - real_r2) * out_fix_diff) >> 15);
          setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha === 255 ? 255 : alpha);
        }
      }
    }
  }
}

// ============================================================
// sgl_draw_rect - 统一矩形绘制（填充+边框）
// 移植自 sgl_draw_rect.c:504-523
// ============================================================

/**
 * @param {object} desc - {alpha, border, border_alpha, border_mask, color, radius, border_color, pixmap}
 */
function drawRect(surf, x1, y1, x2, y2, desc) {
  if (desc.alpha <= 0 && desc.border_alpha <= 0) return;
  const z = surf.scale;
  const pb = Math.round((desc.border || 0) * z);

  // SGL: rect_tmp = rect 缩进 border
  // 先画填充（内部矩形缩进 border）
  if (desc.alpha > 0) {
    const fillRadius = Math.max(Math.round((desc.radius || 0) * z) - pb, 0);
    // SGL: if (desc->pixmap == NULL) sgl_draw_fill_rect else sgl_draw_fill_rect_pixmap
    if (desc.pixmap) {
      // 有 pixmap 时用 drawPixmap 绘制（模拟 sgl_draw_fill_rect_pixmap）
      const innerX1 = x1 + (desc.border || 0);
      const innerY1 = y1 + (desc.border || 0);
      const innerX2 = x2 - (desc.border || 0);
      const innerY2 = y2 - (desc.border || 0);
      const innerW = innerX2 - innerX1 + 1;
      const innerH = innerY2 - innerY1 + 1;
      if (innerW > 0 && innerH > 0) {
        drawPixmap(surf, Math.round(innerX1 * z), Math.round(innerY1 * z),
                   Math.round(innerW * z), Math.round(innerH * z),
                   desc.pixmap, desc.pixmapFormat || 'RGB565', desc.alpha,
                   Math.round(fillRadius / z));
      }
    } else {
      drawFillRect(surf, x1 + (desc.border || 0), y1 + (desc.border || 0),
                   x2 - (desc.border || 0), y2 - (desc.border || 0),
                   fillRadius / z, desc.color, desc.alpha);
    }
  }

  // 再画边框（用原始 rect 和原始 radius）
  if (desc.border > 0 && !desc.border_mask && desc.border_alpha > 0) {
    drawFillRectBorder(surf, x1, y1, x2, y2, desc.radius || 0, desc.border_color, desc.border, desc.border_alpha);
  }
}

// ============================================================
// sgl_draw_fill_circle - 实心圆（2x 超采样抗锯齿）
// 移植自 sgl_draw_circle.c:41-78
// ============================================================

/**
 * @param {number} cx, cy - 圆心（逻辑坐标）
 * @param {number} radius - 半径（逻辑坐标）
 */
function drawFillCircle(surf, cx, cy, radius, color, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  const z = surf.scale;
  const pcx = Math.round(cx * z);
  const pcy = Math.round(cy * z);
  const pr = Math.round(radius * z);

  // 2x 超采样
  const cx2 = 2 * pcx + 1;
  const cy2 = 2 * pcy + 1;
  const diameter = pr * 2;
  const r2_max = diameter * diameter;
  const r2 = Math.max((diameter - 3) * (diameter - 3), 0);
  const r2_diff = Math.max(r2_max - r2, 1);
  const r2_fix_diff = Math.floor((255 << 15) / r2_diff);

  const x1 = Math.max(surf.clip.x1, pcx - pr);
  const x2 = Math.min(surf.clip.x2, pcx + pr);
  const y1 = Math.max(surf.clip.y1, pcy - pr);
  const y2 = Math.min(surf.clip.y2, pcy + pr);

  for (let y = y1; y <= y2; y++) {
    const dy2 = (2 * y - cy2) * (2 * y - cy2);
    for (let x = x1; x <= x2; x++) {
      const dx2 = (2 * x - cx2) * (2 * x - cx2) + dy2;
      if (dx2 >= r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (dx2 >= r2) {
        // 边缘抗锯齿（使用 setEdgePixel 正确处理透明背景）
        const edge_alpha = Math.floor(((r2_max - dx2) * r2_fix_diff) >> 15);
        setEdgePixel(surf, x, y, color, edge_alpha, alpha);
      } else {
        setPixel(surf, x, y, color, alpha);
      }
    }
  }
}

// ============================================================
// sgl_draw_fill_circle_border - 圆环边框
// 移植自 sgl_draw_circle.c:92-149
// ============================================================

function drawFillCircleBorder(surf, cx, cy, radius, borderColor, border, alpha) {
  if (border <= 0 || alpha <= 0 || radius <= 0) return;
  const z = surf.scale;
  const pcx = Math.round(cx * z);
  const pcy = Math.round(cy * z);
  const pr = Math.round(radius * z);
  const pb = Math.round(border * z);

  const cx2 = 2 * pcx + 1;
  const cy2 = 2 * pcy + 1;
  const diameter = pr * 2;
  const out_r2_max = diameter * diameter;
  const out_r2 = Math.max((diameter - 3) * (diameter - 3), 0);
  const radius_in = Math.max(pr - pb, 0);
  const diameter_in = radius_in * 2;
  const in_r2_max = diameter_in * diameter_in;
  const in_r2 = Math.max((diameter_in - 3) * (diameter_in - 3), 0);

  const out_diff = Math.max(out_r2_max - out_r2, 1);
  const in_diff = Math.max(in_r2_max - in_r2, 1);
  const out_fix = Math.floor((255 << 15) / out_diff);
  const in_fix = Math.floor((255 << 15) / in_diff);

  const x1 = Math.max(surf.clip.x1, pcx - pr - 1);
  const x2 = Math.min(surf.clip.x2, pcx + pr + 1);
  const y1 = Math.max(surf.clip.y1, pcy - pr - 1);
  const y2 = Math.min(surf.clip.y2, pcy + pr + 1);

  for (let y = y1; y <= y2; y++) {
    const dy2 = (2 * y - cy2) * (2 * y - cy2);
    for (let x = x1; x <= x2; x++) {
      const dx2 = (2 * x - cx2) * (2 * x - cx2) + dy2;
      if (dx2 >= out_r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (dx2 <= in_r2 && radius_in > 0) {
        continue; // 内圆内
      }
      if (dx2 < in_r2_max && radius_in > 0) {
        // 内圆边缘（使用 setEdgePixel 正确处理透明背景）
        const edge_alpha = Math.floor(((dx2 - in_r2) * in_fix) >> 15);
        setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha);
      } else if (dx2 <= out_r2) {
        setPixel(surf, x, y, borderColor, alpha);
      } else {
        // 外圆边缘（使用 setEdgePixel 正确处理透明背景）
        const edge_alpha = Math.floor(((out_r2_max - dx2) * out_fix) >> 15);
        setEdgePixel(surf, x, y, borderColor, edge_alpha, alpha);
      }
    }
  }
}

// ============================================================
// sgl_draw_circle - 圆形统一入口（填充+边框）
// 移植自 sgl_draw_circle.c:336-352
// ============================================================

function drawCircle(surf, cx, cy, radius, desc) {
  if (desc.alpha <= 0) return;
  const border = desc.border || 0;
  // 先填充（半径减 border）
  if (radius - border > 0) {
    drawFillCircle(surf, cx, cy, radius - border, desc.color, desc.alpha);
  }
  // 再画边框（用原始 radius）
  if (border > 0 && desc.border_alpha > 0) {
    drawFillCircleBorder(surf, cx, cy, radius, desc.border_color, border, desc.border_alpha);
  }
}

// ============================================================
// sgl_draw_fill_ring - 圆环
// 移植自 sgl_draw_ring.c:42-103
// 注意：ring 用 diameter-4（与 circle 的 diameter-3 不同）
// ============================================================

function drawFillRing(surf, cx, cy, radiusIn, radiusOut, color, alpha) {
  if (alpha <= 0 || radiusOut <= 0) return;
  const z = surf.scale;
  const pcx = Math.round(cx * z);
  const pcy = Math.round(cy * z);
  const prOut = Math.round(radiusOut * z);
  const prIn = Math.round(radiusIn * z);

  const cx2 = 2 * pcx + 1;
  const cy2 = 2 * pcy + 1;
  const diaOut = prOut * 2;
  const out_r2_max = diaOut * diaOut;
  const out_r2 = Math.max((diaOut - 4) * (diaOut - 4), 0);
  const diaIn = prIn * 2;
  const in_r2_max = diaIn * diaIn;
  const in_r2 = Math.max((diaIn - 4) * (diaIn - 4), 0);

  const out_diff = Math.max(out_r2_max - out_r2, 1);
  const in_diff = Math.max(in_r2_max - in_r2, 1);
  const out_fix = Math.floor((255 << 15) / out_diff);
  const in_fix = Math.floor((255 << 15) / in_diff);

  const x1 = Math.max(surf.clip.x1, pcx - prOut - 1);
  const x2 = Math.min(surf.clip.x2, pcx + prOut + 1);
  const y1 = Math.max(surf.clip.y1, pcy - prOut - 1);
  const y2 = Math.min(surf.clip.y2, pcy + prOut + 1);

  for (let y = y1; y <= y2; y++) {
    const dy2 = (2 * y - cy2) * (2 * y - cy2);
    for (let x = x1; x <= x2; x++) {
      const dx2 = (2 * x - cx2) * (2 * x - cx2) + dy2;
      if (dx2 >= out_r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (dx2 <= in_r2 && prIn > 0) {
        continue;
      }
      if (dx2 <= in_r2_max && prIn > 0) {
        // 内边缘（使用 setEdgePixel 正确处理透明背景，ring 中间透明此处最关键）
        const edge_alpha = Math.floor(((dx2 - in_r2) * in_fix) >> 15);
        setEdgePixel(surf, x, y, color, edge_alpha, alpha);
      } else if (dx2 <= out_r2) {
        setPixel(surf, x, y, color, alpha);
      } else {
        // 外边缘（使用 setEdgePixel 正确处理透明背景）
        const edge_alpha = Math.floor(((out_r2_max - dx2) * out_fix) >> 15);
        setEdgePixel(surf, x, y, color, edge_alpha, alpha);
      }
    }
  }
}

// ============================================================
// sgl_draw_fill_arc - 圆弧/扇形
// 移植自 sgl_draw_arc.c:111-247
// 角度系统：0° 在正上方，顺时针增加
// ============================================================

/**
 * @param {object} desc - {cx, cy, radius_in, radius_out, start_angle, end_angle, mode, color, bg_color, alpha}
 * mode: 0=NORMAL, 1=RING, 2=NORMAL_SMOOTH, 3=RING_SMOOTH
 */
function drawFillArc(surf, desc) {
  const { cx, cy, radius_in, radius_out, start_angle, end_angle, mode, color, bg_color, alpha } = desc;
  if (alpha <= 0 || radius_out <= 0) return;

  const z = surf.scale;
  const pcx = Math.round(cx * z);
  const pcy = Math.round(cy * z);
  const prOut = Math.round(radius_out * z);
  const prIn = Math.round(radius_in * z);

  // 整圆退化
  if (start_angle === 0 && end_angle === 360) {
    drawFillRing(surf, cx, cy, prIn / z, prOut / z, color, alpha);
    return;
  }
  if (start_angle === end_angle) return;

  const out_r2 = prOut * prOut;
  const out_r2_max = (prOut + 1) * (prOut + 1);
  const in_r2 = prIn * prIn;
  const in_r2_max = prIn > 0 ? (prIn - 1) * (prIn - 1) : 0;
  const rate = in_r2 > in_r2_max ? Math.floor(0xff00 / (in_r2 - in_r2_max)) : 0;
  const rate2 = out_r2_max > out_r2 ? Math.floor(0xff00 / (out_r2_max - out_r2)) : 0;

  // 角度范围
  let arcSpan = end_angle - start_angle;
  if (arcSpan < 0) arcSpan += 360;
  const isLargeArc = arcSpan > 180 ? 1 : 0;

  // 起止向量（SGL 角度系：0° 在上，顺时针）
  // sx = sin(start), sy = -cos(start)
  const sRad = start_angle * Math.PI / 180;
  const eRad = end_angle * Math.PI / 180;
  const sx = Math.sin(sRad), sy = -Math.cos(sRad);
  const ex = Math.sin(eRad), ey = -Math.cos(eRad);

  const x1 = Math.max(surf.clip.x1, pcx - prOut - 1);
  const x2 = Math.min(surf.clip.x2, pcx + prOut + 1);
  const y1 = Math.max(surf.clip.y1, pcy - prOut - 1);
  const y2 = Math.min(surf.clip.y2, pcy + prOut + 1);

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const dx = x - pcx;
      const dy = y - pcy;
      const real_r2 = dx * dx + dy * dy;

      if (real_r2 >= out_r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (real_r2 < in_r2_max && prIn > 0) {
        continue;
      }

      // 边缘 alpha
      let edge_alpha = 255;
      if (real_r2 < in_r2 && prIn > 0) {
        edge_alpha = Math.floor(((real_r2 - in_r2_max) * rate) >> 8);
      } else if (real_r2 > out_r2) {
        edge_alpha = Math.floor(((out_r2_max - real_r2) * rate2) >> 8);
      }

      // 角度范围判断（叉积）
      const ds = dx * sy - dy * sx;
      const de = dy * ex - dx * ey;
      let inRange;
      if (isLargeArc) {
        inRange = ds > 0 || de > 0;
      } else {
        inRange = ds >= 0 && de >= 0;
      }

      if (inRange) {
        // 在弧形范围内
        if (edge_alpha >= 255) {
          setPixel(surf, x, y, color, alpha);
        } else {
          // 边缘抗锯齿（使用 setEdgePixel 正确处理透明背景）
          setEdgePixel(surf, x, y, color, edge_alpha, alpha);
        }
      } else if (mode === 1) {
        // RING 模式：范围外用 bg_color（使用 setEdgePixel 正确处理透明背景）
        setEdgePixel(surf, x, y, bg_color, edge_alpha, alpha);
      }
    }
  }
}

// ============================================================
// 直线绘制
// 移植自 sgl_draw_line.c
// ============================================================

/**
 * 水平线 sgl_draw_fill_hline
 */
function drawHLine(surf, x1, x2, y, width, color, alpha) {
  if (alpha <= 0 || width <= 0) return;
  const z = surf.scale;
  const px1 = Math.round(x1 * z);
  const px2 = Math.round(x2 * z);
  const py = Math.round(y * z);
  const pw = Math.round(width * z);
  const ry1 = py - Math.floor((pw - 1) / 2);
  const ry2 = py + Math.floor(pw / 2);
  for (let y2 = ry1; y2 <= ry2; y2++) {
    for (let x = Math.min(px1, px2); x <= Math.max(px1, px2); x++) {
      setPixel(surf, x, y2, color, alpha);
    }
  }
}

/**
 * 垂直线 sgl_draw_fill_vline
 */
function drawVLine(surf, x, y1, y2, width, color, alpha) {
  if (alpha <= 0 || width <= 0) return;
  const z = surf.scale;
  const px = Math.round(x * z);
  const py1 = Math.round(y1 * z);
  const py2 = Math.round(y2 * z);
  const pw = Math.round(width * z);
  const rx1 = px - Math.floor((pw - 1) / 2);
  const rx2 = px + Math.floor(pw / 2);
  for (let y = Math.min(py1, py2); y <= Math.max(py1, py2); y++) {
    for (let x = rx1; x <= rx2; x++) {
      setPixel(surf, x, y, color, alpha);
    }
  }
}

/**
 * 斜线 SDF 算法 draw_line_fill_slanted
 * 移植自 sgl_draw_line.c:115-218
 */
function drawLineSlanted(surf, x1, y1, x2, y2, width, color, alpha) {
  if (alpha <= 0) return;
  const z = surf.scale;
  // SGL 直接使用逻辑坐标, 这里乘 scale 转像素坐标
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const pw = Math.round(width * z);

  if (px1 === px2) { drawVLine(surf, x1, y1, y2, width, color, alpha); return; }
  if (py1 === py2) { drawHLine(surf, x1, x2, y1, width, color, alpha); return; }

  // 严格移植自 sgl_draw_line_fill_slanted (sgl_draw_line.c:115-218)
  const bax = px2 - px1;
  const bay = py2 - py1;
  const b_sqd = bax * bax + bay * bay;
  if (b_sqd === 0) return;

  // SGL 用 sgl_sqrt (整数平方根, 向下取整), 不能用 Math.sqrt (浮点)
  const sqrt_bsqd = sglSqrt(b_sqd);
  // SGL: inv_len = (65536 + sqrt_bsqd/2) / sqrt_bsqd (整数除法, 向零截断)
  const inv_len = Math.trunc((65536 + Math.trunc(sqrt_bsqd / 2)) / sqrt_bsqd);
  const inner_limit = (pw - 1) << 8;
  const outer_limit = pw << 8;
  const aa_range = outer_limit - inner_limit;

  // 包围盒 (SGL: c_rect)
  const c_rect = {
    x1: Math.min(px1, px2) - pw,
    x2: Math.max(px1, px2) + pw,
    y1: Math.min(py1, py2) - pw,
    y2: Math.max(py1, py2) + pw,
  };

  // clip = surf.clip ∩ c_rect
  const clipX1 = Math.max(surf.clip.x1, c_rect.x1);
  const clipY1 = Math.max(surf.clip.y1, c_rect.y1);
  const clipX2 = Math.min(surf.clip.x2, c_rect.x2);
  const clipY2 = Math.min(surf.clip.y2, c_rect.y2);
  if (clipX1 > clipX2 || clipY1 > clipY2) return;

  // SGL: len = sqrt_bsqd, band_half = (thickness+1) * len
  const len = sqrt_bsqd;
  const band_half = (pw + 1) * len;
  const cap_r = pw + 1;
  const cap_r2 = cap_r * cap_r;

  for (let y = clipY1; y <= clipY2; y++) {
    const pay = y - py1;
    let row_start = clipX2 + 1;
    let row_end = clipX1 - 1;

    // 计算该行可能的 x 范围 (基于带状区域)
    if (bay !== 0) {
      const c0 = -px1 * bay - pay * bax;
      // SGL 用 64 位整数除法 (向零截断), JS 用 Math.trunc 模拟
      const e1 = Math.trunc((band_half - c0) / bay);
      const e2 = Math.trunc((-band_half - c0) / bay);
      const xlo = Math.min(e1, e2);
      const xhi = Math.max(e1, e2);
      const bx1 = xlo - 2;
      const bx2 = xhi + 2;
      if (bx1 < row_start) row_start = bx1;
      if (bx2 > row_end) row_end = bx2;
    } else {
      const dy = pay < 0 ? -pay : pay;
      if (dy * len <= band_half) {
        row_start = clipX1;
        row_end = clipX2;
      }
    }

    // 端点圆帽 1 (x1, y1)
    const dy1 = y - py1;
    const rem1 = cap_r2 - dy1 * dy1;
    if (rem1 >= 0) {
      const dx = sglSqrt(rem1) + 1;
      if (px1 - dx < row_start) row_start = px1 - dx;
      if (px1 + dx > row_end) row_end = px1 + dx;
    }

    // 端点圆帽 2 (x2, y2)
    const dy2 = y - py2;
    const rem2 = cap_r2 - dy2 * dy2;
    if (rem2 >= 0) {
      const dx = sglSqrt(rem2) + 1;
      if (px2 - dx < row_start) row_start = px2 - dx;
      if (px2 + dx > row_end) row_end = px2 + dx;
    }

    // 裁剪到 clip
    if (row_start < clipX1) row_start = clipX1;
    if (row_end > clipX2) row_end = clipX2;

    if (row_start <= row_end) {
      let dot = (row_start - px1) * bax + pay * bay;
      let cross = (row_start - px1) * bay - pay * bax;
      for (let x = row_start; x <= row_end; x++) {
        const cur_dot = dot;
        const cur_cross = cross;
        dot += bax;
        cross += bay;

        let dist_q8;
        const abs_cross = cur_cross >= 0 ? cur_cross : -cur_cross;
        if (cur_dot >= 0 && cur_dot <= b_sqd) {
          // SGL: dist_q8 = (abs_cross * inv_len) >> 8
          // >> 8 对正数等同于 Math.floor(x / 256)
          dist_q8 = Math.floor((abs_cross * inv_len) / 256);
        } else {
          // 端点外
          const along = cur_dot < 0 ? -cur_dot : (cur_dot - b_sqd);
          const raw_sq = along * along + cur_cross * cur_cross;
          const raw_d = sglSqrt(raw_sq);
          dist_q8 = Math.floor((raw_d * inv_len) / 256);
        }

        if (dist_q8 < inner_limit) {
          // 内部: 直接画
          setPixel(surf, x, y, color, alpha);
        } else if (dist_q8 < outer_limit) {
          // 抗锯齿带
          // SGL: c = (outer_limit - dist_q8) * 255 / aa_range (整数除法)
          const c = Math.trunc((outer_limit - dist_q8) * 255 / aa_range);
          if (alpha >= 255) {
            // SGL: *blend = sgl_color_mixer(color, *blend, c)
            const bg = getPixel(surf, x, y);
            const mixed = colorMixer(color, bg, c);
            setPixel(surf, x, y, mixed, 255);
          } else {
            // SGL: final_a = (c * alpha) >> 8; *blend = sgl_color_mixer(color, *blend, final_a)
            const final_a = (c * alpha) >> 8;
            const bg = getPixel(surf, x, y);
            const mixed = colorMixer(color, bg, final_a);
            setPixel(surf, x, y, mixed, 255);
          }
        }
      }
    }
  }
}

/**
 * 直线统一入口 sgl_draw_line
 */
function drawLine(surf, x1, y1, x2, y2, width, color, alpha) {
  drawLineSlanted(surf, x1, y1, x2, y2, width, color, alpha);
}

// ============================================================
// 文本绘制
// SGL 用字模位图，设计器中用 Canvas fillText 模拟
// 但对齐逻辑完全照搬 SGL
// ============================================================

/**
 * sgl_get_text_pos - 文本位置计算
 * 移植自 sgl_core.c:1412-1431
 * @param {object} coords - {x1,y1,x2,y2} 控件区域
 * @param {string} text - 文本
 * @param {number} fontSize - 字号
 * @param {number} offset - 文本偏移
 * @param {number} align - 对齐方式 (0=CENTER,1=TOP_MID,...,8=RIGHT_MID)
 * @returns {{x,y}} 文本起始位置
 */
function getTextPos(coords, text, fontSize, offset, align) {
  const parentW = coords.x2 - coords.x1 + 1;
  const parentH = coords.y2 - coords.y1 + 1;
  // 估算文本宽高（近似 sgl_font_get_string_width）
  const textW = estimateTextWidth(text, fontSize) + offset;
  const textH = fontSize;

  let x = 0, y = 0;
  switch (align) {
    case 0: x = (parentW - textW) / 2; y = (parentH - textH) / 2; break; // CENTER
    case 1: x = (parentW - textW) / 2; y = 0; break; // TOP_MID
    case 2: x = 0; y = 0; break; // TOP_LEFT
    case 3: x = parentW - textW; y = 0; break; // TOP_RIGHT
    case 4: x = (parentW - textW) / 2; y = parentH - textH; break; // BOT_MID
    case 5: x = 0; y = parentH - textH; break; // BOT_LEFT
    case 6: x = parentW - textW; y = parentH - textH; break; // BOT_RIGHT
    case 7: x = 0; y = (parentH - textH) / 2; break; // LEFT_MID
    case 8: x = parentW - textW; y = (parentH - textH) / 2; break; // RIGHT_MID
  }
  return { x: coords.x1 + x, y: coords.y1 + y };
}

/**
 * 估算文本宽度（近似 SGL 的 sgl_font_get_string_width）
 */
function estimateTextWidth(text, fontSize) {
  if (!text) return 0;
  // SGL 字符宽度约为 fontSize * 0.6（等宽近似）
  return text.length * fontSize * 0.6;
}

// ============================================================
// 实时字模渲染系统（所见即所得 + 实时响应）
// 用 Canvas 光栅化字符 → 按 bpp 量化 alpha → 用 SGL colorMixer 混合
// 修改 bpp/字号/文本/字体均立即响应，无需异步加载
// ============================================================

// 共享离屏 canvas（willReadFrequently 优化 getImageData 性能）
let _offCanvas = null;
let _offCtx = null;
function _getOffCtx() {
  if (!_offCanvas) {
    _offCanvas = document.createElement('canvas');
    _offCtx = _offCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { canvas: _offCanvas, ctx: _offCtx };
}

/**
 * 用 Canvas measureText 实时测量文本像素宽度
 */
function measureTextWidth(text, fontSize, fontFamily) {
  const { ctx } = _getOffCtx();
  ctx.font = `${fontSize}px ${fontFamily || 'sans-serif'}`;
  return ctx.measureText(text).width;
}

/**
 * 实时文本位置计算（用 Canvas measureText 精确宽度）
 * @param {object} coords - {x1,y1,x2,y2}
 * @param {string} text
 * @param {number} fontSize
 * @param {string} fontFamily
 * @param {number} offset - 文本偏移
 * @param {number} align - 0=CENTER,1=TOP_MID,2=TOP_LEFT,3=TOP_RIGHT,4=BOT_MID,5=BOT_LEFT,6=BOT_RIGHT,7=LEFT_MID,8=RIGHT_MID
 */
function getTextPosRealtime(coords, text, fontSize, fontFamily, offset, align) {
  const parentW = coords.x2 - coords.x1 + 1;
  const parentH = coords.y2 - coords.y1 + 1;
  const textW = measureTextWidth(text, fontSize, fontFamily) + offset;
  const textH = fontSize;
  let x = 0, y = 0;
  switch (align) {
    case 0: x = (parentW - textW) / 2; y = (parentH - textH) / 2; break;
    case 1: x = (parentW - textW) / 2; y = 0; break;
    case 2: x = 0; y = 0; break;
    case 3: x = parentW - textW; y = 0; break;
    case 4: x = (parentW - textW) / 2; y = parentH - textH; break;
    case 5: x = 0; y = parentH - textH; break;
    case 6: x = parentW - textW; y = parentH - textH; break;
    case 7: x = 0; y = (parentH - textH) / 2; break;
    case 8: x = parentW - textW; y = (parentH - textH) / 2; break;
  }
  return { x: coords.x1 + x, y: coords.y1 + y };
}

/**
 * 按 bpp 量化 alpha 值（模拟 SGL 字模的 bpp 量化效果）
 * 4bpp: 16 级 alpha（_OPA4_TABLE）
 * 2bpp: 4 级 alpha（_OPA2_TABLE）
 * 1bpp: 2 级 alpha（0 或 255）
 */
function _quantizeAlpha(a, bpp) {
  if (bpp === 4) return _OPA4_TABLE[Math.min(15, a >> 4)];
  if (bpp === 2) return _OPA2_TABLE[Math.min(3, a >> 6)];
  if (bpp === 1) return a >= 128 ? 255 : 0;
  return a;
}

/**
 * 实时字模渲染：Canvas fillText + bpp 量化后处理
 * 必须在 flushSurface 之后调用（直接画到 canvas 上）
 * 修改 bpp/字号/文本/字体均立即响应
 * @param {object} surf - 绘制表面
 * @param {number} x - 起始 x（逻辑坐标）
 * @param {number} y - 起始 y（逻辑坐标）
 * @param {string} text
 * @param {{r,g,b}} color
 * @param {number} alpha - 整体透明度 0-255
 * @param {number} fontSize - 字号
 * @param {string} fontFamily - CSS font-family
 * @param {number} bpp - 抗锯齿参数 1/2/4
 */
// 辅助 canvas（挂到 DOM，用于 fillText 生成字模 alpha 数据）
let _textAlphaCanvas = null;
let _textAlphaCtx = null;
function _getTextAlphaCanvas() {
  if (_textAlphaCanvas && _textAlphaCanvas.parentNode) return { canvas: _textAlphaCanvas, ctx: _textAlphaCtx };
  _textAlphaCanvas = document.createElement('canvas');
  _textAlphaCanvas.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(_textAlphaCanvas);
  _textAlphaCtx = _textAlphaCanvas.getContext('2d', { willReadFrequently: true });
  return { canvas: _textAlphaCanvas, ctx: _textAlphaCtx };
}

/**
 * 实时字模渲染：辅助 canvas fillText 生成 alpha + SGL 查表量化 + colorMixer 两步混合
 * 完全复刻 sgl_draw_character.c 的 alpha 混合算法
 * 必须在 flushSurface 之前调用（写入 surf.buf32，之后由 flushSurface 上屏）
 *
 * SGL 算法：
 *   alpha_dot = sgl_opa4_table[dot]  (4bpp=16级, 2bpp=4级, 1bpp=二值)
 *   color_mix = sgl_color_mixer(color, bg, alpha_dot)
 *   result    = sgl_color_mixer(color_mix, bg, alpha)
 */
function drawStringRealtime(surf, x, y, text, color, alpha, fontSize, fontFamily, bpp) {
  if (!text || alpha <= 0) return;
  const z = surf.scale;
  const fs = Math.max(1, Math.round(fontSize * z));
  const cssFont = fs + 'px ' + (fontFamily || 'sans-serif');
  const px = Math.round(x * z);
  const py = Math.round(y * z);

  // 用辅助 canvas 渲染白色文本，获取纯 alpha 通道（字模数据）
  const helper = _getTextAlphaCanvas();
  const ac = helper.canvas;
  const actx = helper.ctx;
  actx.font = cssFont;
  const metrics = actx.measureText(text);
  const tw = Math.max(1, Math.ceil(metrics.width)) + 2;
  const th = fs + 4;
  ac.width = tw;
  ac.height = th;
  // 重新设置 font（canvas 尺寸变化后 ctx 状态被重置）
  actx.font = cssFont;
  actx.textBaseline = 'top';
  actx.fillStyle = '#ffffff';
  actx.clearRect(0, 0, tw, th);
  actx.fillText(text, 1, 2);

  let alphaData;
  try {
    alphaData = actx.getImageData(0, 0, tw, th);
  } catch (e) {
    // fillText 不工作或被安全策略阻止，直接在目标 canvas 上 fillText（fallback）
    const ctx = surf.ctx;
    ctx.save();
    ctx.font = cssFont;
    ctx.textBaseline = 'top';
    ctx.fillStyle = colorToHex(color);
    ctx.globalAlpha = alpha / 255;
    ctx.fillText(text, px, py);
    ctx.restore();
    return;
  }

  // 检查 alpha 数据是否有效（fillText 是否产生像素）
  let hasPixels = false;
  const aData = alphaData.data;
  for (let i = 3; i < aData.length; i += 4) {
    if (aData[i] > 0) { hasPixels = true; break; }
  }
  if (!hasPixels) {
    // fillText 未产生像素，fallback 到目标 canvas 直接 fillText
    const ctx = surf.ctx;
    ctx.save();
    ctx.font = cssFont;
    ctx.textBaseline = 'top';
    ctx.fillStyle = colorToHex(color);
    ctx.globalAlpha = alpha / 255;
    ctx.fillText(text, px, py);
    ctx.restore();
    return;
  }

  // 按 SGL 算法逐像素混合到 surf.buf32
  const qBpp = bpp || 4;
  for (let j = 0; j < th; j++) {
    const sy = py + j;
    if (sy < surf.clip.y1 || sy > surf.clip.y2) continue;
    for (let i = 0; i < tw; i++) {
      const aIdx = (j * tw + i) * 4 + 3;
      const rawAlpha = aData[aIdx];
      if (rawAlpha <= 0) continue;

      // SGL 查表量化 alpha
      let alpha_dot;
      if (qBpp === 4) {
        alpha_dot = _OPA4_TABLE[Math.min(15, rawAlpha >> 4)];
      } else if (qBpp === 2) {
        alpha_dot = _OPA2_TABLE[Math.min(3, rawAlpha >> 6)];
      } else if (qBpp === 1) {
        alpha_dot = rawAlpha >= 128 ? 255 : 0;
      } else {
        alpha_dot = rawAlpha;
      }
      if (alpha_dot <= 0) continue;

      const sx = px + i;
      if (sx < surf.clip.x1 || sx > surf.clip.x2) continue;
      const idx = sy * surf.w + sx;
      const existing = surf.buf32[idx];
      const bg_a = (existing >> 24) & 0xff;
      const bg = { r: existing & 0xff, g: (existing >> 8) & 0xff, b: (existing >> 16) & 0xff };

      // SGL 两步混合
      const color_mix = colorMixer(color, bg, alpha_dot);
      const final_color = alpha >= 255 ? color_mix : colorMixer(color_mix, bg, alpha);

      if (bg_a === 0 && alpha_dot < 255) {
        // 透明背景：保留 alpha 通道（与 setEdgePixel 一致）
        const final_alpha = Math.min(255, Math.round(alpha_dot * alpha / 255));
        if (final_alpha > 0) {
          surf.buf32[idx] = (final_alpha << 24) | (final_color.b << 16) | (final_color.g << 8) | final_color.r;
        }
      } else {
        surf.buf32[idx] = 0xff000000 | (final_color.b << 16) | (final_color.g << 8) | final_color.r;
      }
    }
  }
  // 注意：调用者需要在之后调用 flushSurface 把 buf32 上屏
}

// ============================================================
// SGL 字模位图渲染系统（所见即所得）
// 移植自 sgl_draw_text.c / sgl_core.c
// 使用 sgl_font_conv.exe 生成的字模数据，逐像素 alpha 混合
// ============================================================

const _fontBitmapCache = new Map();
const _OPA4_TABLE = [0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255];
const _OPA2_TABLE = [0, 85, 170, 255];

/**
 * 解析 sgl_font_conv.exe 生成的 C 文件为字模数据对象
 */
function parseFontCFile(content) {
  // 移除所有 /* ... */ 注释，避免注释中的数字被误提取为字模数据
  const cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');

  // bitmap 数组：static const uint8_t font_bitmap[] = {...};
  const bitmapMatch = cleaned.match(/uint8_t\s+\w*bitmap\w*\[\]\s*=\s*\{([\s\S]*?)\}/);
  if (!bitmapMatch) throw new Error('解析字模失败: 未找到 bitmap 数组');
  const bitmapStr = bitmapMatch[1];
  const bitmapNums = [];
  const bitmapRe = /0x([0-9a-fA-F]{1,2})|(\d+)/g;
  let m;
  while ((m = bitmapRe.exec(bitmapStr)) !== null) {
    bitmapNums.push(m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2], 10));
  }
  const bitmap = new Uint8Array(bitmapNums);

  // table 数组：static const sgl_font_table_t font_table[] = {...};
  // 数组名可能是 font_table 或 xxx_tab，兼容两种格式
  const tableMatch = cleaned.match(/sgl_font_table_t\s+\w+\[\]\s*=\s*\{([\s\S]*?)\};/);
  if (!tableMatch) throw new Error('解析字模失败: 未找到 table 数组');
  const tableStr = tableMatch[1];
  const table = [];
  const entryRe = /\{[^}]*\.bitmap_index\s*=\s*(-?\d+)[^}]*\.adv_w\s*=\s*(-?\d+)[^}]*\.box_w\s*=\s*(-?\d+)[^}]*\.box_h\s*=\s*(-?\d+)[^}]*\.ofs_x\s*=\s*(-?\d+)[^}]*\.ofs_y\s*=\s*(-?\d+)[^}]*\}/g;
  while ((m = entryRe.exec(tableStr)) !== null) {
    table.push({
      bitmap_index: parseInt(m[1], 10),
      adv_w: parseInt(m[2], 10),
      box_w: parseInt(m[3], 10),
      box_h: parseInt(m[4], 10),
      ofs_x: parseInt(m[5], 10),
      ofs_y: parseInt(m[6], 10),
    });
  }

  // unicode list 数组：static const uint16_t unicode_list_N[] = {...};
  const unicodeLists = {};
  const listRe = /uint16_t\s+(unicode_list_\d+)\[\]\s*=\s*\{([\s\S]*?)\}/g;
  while ((m = listRe.exec(cleaned)) !== null) {
    const nums = [];
    const numRe = /0x([0-9a-fA-F]+)|(\d+)/g;
    let lm;
    while ((lm = numRe.exec(m[2])) !== null) {
      nums.push(lm[1] !== undefined ? parseInt(lm[1], 16) : parseInt(lm[2], 10));
    }
    unicodeLists[m[1]] = nums;
  }

  // unicode 映射表：static const sgl_font_unicode_t font_unicode[] = {...};
  // list 中存的是相对 offset 的偏移量（与 SGL sgl_search_unicode_ch_index 一致）
  const unicode = [];
  const uniRe = /\{\s*\.offset\s*=\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*\.len\s*=\s*(\d+)\s*,\s*\.list\s*=\s*(\w+)\s*,\s*\.tab_offset\s*=\s*(\d+)\s*,?\s*\}/g;
  while ((m = uniRe.exec(content)) !== null) {
    const listName = m[3];
    const offsetVal = m[1].startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1], 10);
    unicode.push({
      offset: offsetVal,
      len: parseInt(m[2], 10),
      list: (listName === 'NULL' || listName === '0') ? null : (unicodeLists[listName] || null),
      tab_offset: parseInt(m[4], 10),
    });
  }

  const fontHeightMatch = content.match(/\.font_height\s*=\s*(\d+)/);
  const baseLineMatch = content.match(/\.base_line\s*=\s*(-?\d+)/);
  const bppMatch = content.match(/\.bpp\s*=\s*(\d+)/);
  const compressMatch = content.match(/\.compress\s*=\s*(\d+)/);

  return {
    bitmap, table, unicode,
    font_height: fontHeightMatch ? parseInt(fontHeightMatch[1], 10) : 14,
    base_line: baseLineMatch ? parseInt(baseLineMatch[1], 10) : 3,
    bpp: bppMatch ? parseInt(bppMatch[1], 10) : 4,
    compress: compressMatch ? parseInt(compressMatch[1], 10) : 0,
  };
}

function registerFontData(key, fontData) { _fontBitmapCache.set(key, fontData); }
function getFontData(key) { return _fontBitmapCache.get(key) || null; }
function fontDataKey(fontPath, size, bpp) { return `${fontPath}|${size}|${bpp}`; }

/**
 * sgl_search_unicode_ch_index - 查找字符索引
 * 移植自 sgl_core.c:1238-1278
 */
function searchUnicodeChIndex(font, unicode) {
  const code = font.unicode;
  if (!code || code.length === 0) return 0;
  let i;
  for (i = 0; i < code.length - 1; i++) {
    if (unicode >= code[i].offset && unicode < code[i + 1].offset) break;
  }
  if (i >= code.length) i = code.length - 1;
  const seg = code[i];
  const target = unicode - seg.offset;
  if (seg.list === null) {
    if (target >= seg.len) return 0;
    return target + seg.tab_offset;
  }
  let left = 0, right = seg.len - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (seg.list[mid] === target) return mid + seg.tab_offset;
    if (seg.list[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return 0;
}

/**
 * sgl_font_get_string_width - 计算字符串像素宽度
 */
function fontGetStringWidth(str, font) {
  if (!str || !font) return 0;
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const chIndex = searchUnicodeChIndex(font, str.charCodeAt(i));
    if (chIndex < font.table.length) {
      len += (font.table[chIndex].adv_w + 8) >> 4;
    }
  }
  return len;
}

function fontGetHeight(font) { return font ? font.font_height : 0; }

/**
 * sgl_draw_character - 绘制单个字符（字模位图逐像素 alpha 混合）
 * 移植自 sgl_draw_text.c:182-274
 */
function drawCharacter(surf, x, y, chIndex, color, alpha, font) {
  const entry = font.table[chIndex];
  if (!entry) return;
  const offset_y2 = font.font_height - entry.ofs_y - font.base_line;
  const dot = font.bitmap;
  const bitmapStart = entry.bitmap_index;
  const font_w = entry.box_w;
  const font_h = entry.box_h;
  if (font_w <= 0 || font_h <= 0) return;

  const z = surf.scale;
  const text_rect = {
    x1: x + entry.ofs_x,
    x2: x + entry.ofs_x + font_w - 1,
    y1: y + offset_y2 - font_h,
    y2: y + offset_y2 - 1,
  };

  const px1 = Math.round(text_rect.x1 * z);
  const py1 = Math.round(text_rect.y1 * z);
  const px2 = Math.round(text_rect.x2 * z);
  const py2 = Math.round(text_rect.y2 * z);

  const cx1 = Math.max(px1, surf.clip.x1);
  const cy1 = Math.max(py1, surf.clip.y1);
  const cx2 = Math.min(px2, surf.clip.x2);
  const cy2 = Math.min(py2, surf.clip.y2);
  if (cx1 > cx2 || cy1 > cy2) return;

  const bpp = font.bpp;
  // 将像素坐标反向映射回字模坐标（最近邻），避免缩放时 rel_x/rel_y 超出字模尺寸而读到相邻字符
  for (let py = cy1; py <= cy2; py++) {
    const rel_y = Math.min(font_h - 1, Math.floor((py - py1) / z));
    for (let px = cx1; px <= cx2; px++) {
      const rel_x = Math.min(font_w - 1, Math.floor((px - px1) / z));
      const pixel_index = rel_y * font_w + rel_x;
      let alpha_dot = 0;

      if (bpp === 4) {
        const byte_index = pixel_index >> 1;
        const byte_val = dot[bitmapStart + byte_index];
        alpha_dot = _OPA4_TABLE[(pixel_index & 1) ? (byte_val & 0x0F) : (byte_val >> 4)];
      } else if (bpp === 2) {
        const byte_index = pixel_index >> 2;
        const shift = (3 - (pixel_index & 3)) * 2;
        alpha_dot = _OPA2_TABLE[(dot[bitmapStart + byte_index] >> shift) & 0x03];
      } else if (bpp === 1) {
        const byte_index = pixel_index >> 3;
        const shift = 7 - (pixel_index & 7);
        alpha_dot = ((dot[bitmapStart + byte_index] >> shift) & 0x01) ? 255 : 0;
      }

      if (alpha_dot <= 0) continue;

      const idx = py * surf.w + px;
      const existing = surf.buf32[idx];
      const bg_a = (existing >> 24) & 0xff;
      const bg = { r: existing & 0xff, g: (existing >> 8) & 0xff, b: (existing >> 16) & 0xff };

      const color_mix = colorMixer(color, bg, alpha_dot);
      const final_color = alpha >= 255 ? color_mix : colorMixer(color_mix, bg, alpha);

      if (bg_a === 0 && alpha_dot < 255) {
        const final_alpha = Math.min(255, Math.round(alpha_dot * alpha / 255));
        if (final_alpha > 0) {
          surf.buf32[idx] = (final_alpha << 24) | (final_color.b << 16) | (final_color.g << 8) | final_color.r;
        }
      } else {
        surf.buf32[idx] = 0xff000000 | (final_color.b << 16) | (final_color.g << 8) | final_color.r;
      }
    }
  }
}

/**
 * sgl_draw_string - SGL 字符串渲染（逐字符字模位图）
 */
function drawStringSGL(surf, x, y, str, color, alpha, font) {
  if (!str || alpha <= 0 || !font) return;
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    const chIndex = searchUnicodeChIndex(font, str.charCodeAt(i));
    drawCharacter(surf, cx, y, chIndex, color, alpha, font);
    if (chIndex < font.table.length) {
      cx += (font.table[chIndex].adv_w + 8) >> 4;
    }
  }
}

/**
 * SGL 文本位置计算（使用真实字模宽度）
 * 使用 Math.trunc 模拟 C 语言整数除法（向零截断），与 SGL sgl_get_align_pos 一致
 */
function getTextPosSGL(coords, text, font, offset, align) {
  const parentW = coords.x2 - coords.x1 + 1;
  const parentH = coords.y2 - coords.y1 + 1;
  const textW = fontGetStringWidth(text, font) + offset;
  const textH = fontGetHeight(font);
  let x = 0, y = 0;
  switch (align) {
    case 0: x = Math.trunc((parentW - textW) / 2); y = Math.trunc((parentH - textH) / 2); break;
    case 1: x = Math.trunc((parentW - textW) / 2); y = 0; break;
    case 2: x = 0; y = 0; break;
    case 3: x = parentW - textW; y = 0; break;
    case 4: x = Math.trunc((parentW - textW) / 2); y = parentH - textH; break;
    case 5: x = 0; y = parentH - textH; break;
    case 6: x = parentW - textW; y = parentH - textH; break;
    case 7: x = 0; y = Math.trunc((parentH - textH) / 2); break;
    case 8: x = parentW - textW; y = Math.trunc((parentH - textH) / 2); break;
  }
  return { x: coords.x1 + x, y: coords.y1 + y };
}

/**
 * 绘制单行文本（实时渲染）
 * 默认使用 Canvas 光栅化 + bpp 量化 + SGL colorMixer 混合，完全实时
 * @param {object} surf
 * @param {number} x - 起始 x（逻辑坐标）
 * @param {number} y - 起始 y（逻辑坐标）
 * @param {string} text
 * @param {{r,g,b}} color
 * @param {number} alpha - 透明度 0-255
 * @param {number} fontSize - 字号
 * @param {string} fontFamily - CSS font-family
 * @param {number} [bpp=4] - 抗锯齿参数 1/2/4
 */
function drawString(surf, x, y, text, color, alpha, fontSize, fontFamily, bpp) {
  if (!text || alpha <= 0) return;
  drawStringRealtime(surf, x, y, text, color, alpha, fontSize, fontFamily, bpp || 4);
}

/**
 * 绘制多行文本 sgl_draw_string_mult_line
 * 移植自 sgl_draw_text.c:316-343
 */
function drawStringMultiLine(surf, x, y, text, color, alpha, fontSize, fontFamily, lineMargin, maxWidth, bpp) {
  if (!text || alpha <= 0) return;
  const lines = text.split('\n');
  let cy = y;
  const lineH = fontSize + lineMargin;

  for (const line of lines) {
    // 自动换行
    let remaining = line;
    while (remaining.length > 0 && maxWidth > 0) {
      let end = remaining.length;
      while (end > 0 && measureTextWidth(remaining.substring(0, end), fontSize, fontFamily) > maxWidth) {
        end--;
      }
      if (end <= 0) end = 1;
      drawString(surf, x, cy, remaining.substring(0, end), color, alpha, fontSize, fontFamily, bpp);
      remaining = remaining.substring(end);
      cy += lineH;
    }
    if (remaining.length === 0 && lines.length > 1) {
      // 空行也推进
    }
    cy += lineH;
  }
}

// ============================================================
// 2dball / LED 径向渐变
// 移植自 sgl_2dball.c / sgl_led.c 的逐像素操作
// ============================================================

/**
 * 绘制 2D 渐变球体
 * 严格移植自 sgl_2dball.c（全部使用 SGL 整数算法）
 * SGL: radius = sgl_obj_get_width(obj) / 2（circle_zoom 后 = 设置的 radius）
 * SGL: cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, 整数除法
 * SGL: r2_max = diameter^2, r2 = max((diameter-3)^2, 0)
 * SGL: ds_alpha = dx2 * 256 / r2, 整数除法（线性渐变）
 * SGL: 边缘抗锯齿 edge_alpha = ((r2_max - dx2) * r2_fix_diff) >> 15
 * SGL: color_mixer(bg, color, ds_alpha) 再 mixer(结果, 背景像素, alpha)
 * 注意: radius 参数是 sgl_2dball_set_radius 设置的值，不是 surf.w/2
 */
function draw2dBall(surf, cx, cy, radius, color, bgColor, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  // 用 surface 像素尺寸计算中心，匹配 SGL 整数除法: cx = (x1+x2)/2 = (width-1)/2
  const pcx = Math.floor((surf.w - 1) / 2);
  const pcy = Math.floor((surf.h - 1) / 2);
  // SGL: radius = sgl_obj_get_width(obj) / 2，circle_zoom 后等于设置的 radius
  // 乘以 scale 转换为 surface 像素坐标
  const z = surf.scale;
  const pr = Math.max(1, Math.round(radius * z));

  const cx2 = 2 * pcx + 1;
  const cy2 = 2 * pcy + 1;
  const diameter = pr * 2;
  const r2_max = diameter * diameter;
  const r2 = Math.max((diameter - 3) * (diameter - 3), 0);
  const r2_diff = Math.max(r2_max - r2, 1);
  // SGL: r2_fix_diff = (SGL_ALPHA_MAX << SGL_FIXED_SHIFT) / max(r2_max - r2, 1)
  const r2_fix_diff = Math.floor((255 << 15) / r2_diff);

  // SGL: 遍历 clip 区域（obj->area），circle_zoom 后 = [cx-pr+1, cx+pr]
  const x1 = Math.max(surf.clip.x1, pcx - pr + 1);
  const x2 = Math.min(surf.clip.x2, pcx + pr);
  const y1 = Math.max(surf.clip.y1, pcy - pr + 1);
  const y2 = Math.min(surf.clip.y2, pcy + pr);

  for (let y = y1; y <= y2; y++) {
    const dy2 = (2 * y - cy2) * (2 * y - cy2);
    for (let x = x1; x <= x2; x++) {
      const dx2 = (2 * x - cx2) * (2 * x - cx2) + dy2;
      // SGL: if (dx2 >= r2_max) { if (x > cx) break; continue; }
      if (dx2 >= r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (dx2 >= r2) {
        // SGL: 边缘抗锯齿 edge_alpha = ((r2_max - dx2) * r2_fix_diff) >> SGL_FIXED_SHIFT
        const edge_alpha = ((r2_max - dx2) * r2_fix_diff) >> 15;
        // SGL: color_mix = sgl_color_mixer(bg_color, *blend, edge_alpha)
        const colorMix = colorMixer(bgColor, getPixel(surf, x, y), edge_alpha);
        // SGL: *blend = sgl_color_mixer(color_mix, *blend, alpha)
        setPixel(surf, x, y, colorMixer(colorMix, getPixel(surf, x, y), alpha), 255);
      } else {
        // SGL: ds_alpha = dx2 * SGL_ALPHA_NUM / r2, 整数除法
        const ds_alpha = Math.floor(dx2 * 256 / r2);
        // SGL: *blend = sgl_color_mixer(sgl_color_mixer(bg_color, color, ds_alpha), *blend, alpha)
        const colorMix = colorMixer(bgColor, color, ds_alpha);
        setPixel(surf, x, y, colorMixer(colorMix, getPixel(surf, x, y), alpha), 255);
      }
    }
  }
}

/**
 * SGL LED 渲染 sgl_led.c
 * r2=(diameter-6)^2, ds_alpha=dx2*256/r2, 平方曲线 ds_alpha=pow2(ds_alpha)/256
 */
function drawLed(surf, cx, cy, radius, color, bgColor, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  const z = surf.scale;
  const pr = Math.round(radius * z);
  // LED 总是充满控件区域，用 surface 像素尺寸计算中心确保任意缩放下对称
  // 匹配 SGL 整数除法语: cx = (x1+x2)/2 = (width-1)/2
  const pcx = Math.floor((surf.w - 1) / 2);
  const pcy = Math.floor((surf.h - 1) / 2);

  const cx2 = 2 * pcx + 1;
  const cy2 = 2 * pcy + 1;
  const diameter = pr * 2;
  const r2_max = diameter * diameter;
  const r2 = Math.max((diameter - 6) * (diameter - 6), 0);
  const r2_diff = Math.max(r2_max - r2, 1);
  const r2_fix_diff = Math.floor((255 << 15) / r2_diff);

  const x1 = Math.max(surf.clip.x1, pcx - pr);
  const x2 = Math.min(surf.clip.x2, pcx + pr);
  const y1 = Math.max(surf.clip.y1, pcy - pr);
  const y2 = Math.min(surf.clip.y2, pcy + pr);

  for (let y = y1; y <= y2; y++) {
    const dy2 = (2 * y - cy2) * (2 * y - cy2);
    for (let x = x1; x <= x2; x++) {
      const dx2 = (2 * x - cx2) * (2 * x - cx2) + dy2;
      if (dx2 >= r2_max) {
        if (x > pcx) break;
        continue;
      }
      if (dx2 >= r2) {
        // 边缘抗锯齿
        const edge_alpha = Math.floor(((r2_max - dx2) * r2_fix_diff) >> 15);
        const colorMix = colorMixer(bgColor, getPixel(surf, x, y), edge_alpha);
        setPixel(surf, x, y, colorMixer(colorMix, getPixel(surf, x, y), alpha), 255);
      } else {
        // 内部平方曲线渐变 SGL: ds_alpha = pow2(dx2*256/r2) / 256
        const ds_alpha = Math.floor((dx2 * 256) / r2);
        const ds_alpha2 = Math.floor((ds_alpha * ds_alpha) / 256);
        const colorMix = colorMixer(bgColor, color, ds_alpha2);
        setPixel(surf, x, y, colorMixer(colorMix, getPixel(surf, x, y), alpha), 255);
      }
    }
  }
}

// ============================================================
// sgl_polygon_fill_scanline - 多边形扫描线填充
// 精确移植自 sgl_polygon.c:134-196
// 算法要点：
//   - 扫描线在像素中心 y+0.5 处（8.8 定点数 +128）
//   - 奇偶规则：(y1 > scan_y) == (y2 > scan_y) 跳过（严格大于）
//   - 填充范围内缩 1 像素：x_start = inter[i]+1, x_end = inter[i+1]-1
// ============================================================

/**
 * @param {object} surf - 绘制表面
 * @param {Array<{x,y}>} points - 顶点数组（逻辑坐标）
 * @param {{r,g,b}} color - 填充色
 * @param {number} alpha - 透明度 0-255
 */
function drawFillPolygon(surf, points, color, alpha) {
  if (alpha <= 0 || !points || points.length < 3) return;
  // SGL: if (polygon->fill_color.full != 0) 才画填充
  // RGB565 下黑色 (0,0,0) 的 .full = 0，跳过填充以保持 WYSIWYG
  if (color.r === 0 && color.g === 0 && color.b === 0) return;
  const z = surf.scale;
  // 转换为像素坐标
  const pts = points.map(p => ({
    x: Math.round(p.x * z),
    y: Math.round(p.y * z)
  }));

  // 求包围盒
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.max(minY, surf.clip.y1);
  maxY = Math.min(maxY, surf.clip.y2);
  if (minY > maxY) return;

  const n = pts.length;

  for (let y = minY; y <= maxY; y++) {
    const intersections = [];
    // 扫描线在像素中心 y+0.5，用 8.8 定点数表示
    const scan_y = (y << 8) + 128;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      // 顶点坐标转 8.8 定点数 + 0.5 偏移
      const x1_q8 = (pts[j].x << 8) + 128;
      const y1_q8 = (pts[j].y << 8) + 128;
      const x2_q8 = (pts[i].x << 8) + 128;
      const y2_q8 = (pts[i].y << 8) + 128;

      // 奇偶规则：两端点严格大于扫描线的情况相同则跳过
      if ((y1_q8 > scan_y) === (y2_q8 > scan_y) || y1_q8 === y2_q8) continue;

      // 线性插值求 x 交点（8.8 定点数，C 的 int64 除法向零截断）
      const num = (scan_y - y1_q8) * (x2_q8 - x1_q8);
      const den = (y2_q8 - y1_q8);
      const x_q8 = x1_q8 + Math.trunc(num / den);
      // 转回整数坐标（减 0.5 偏移后右移 8 位）
      intersections.push((x_q8 - 128) >> 8);
    }

    if (intersections.length < 2) continue;

    // 排序
    intersections.sort((a, b) => a - b);

    // 成对填充，内缩 1 像素（与 SGL 一致）
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const x_start = Math.max(intersections[i] + 1, surf.clip.x1);
      const x_end = Math.min(intersections[i + 1] - 1, surf.clip.x2);
      if (x_start > x_end) continue;
      for (let x = x_start; x <= x_end; x++) {
        setPixel(surf, x, y, color, alpha);
      }
    }
  }
}

// ============================================================
// sgl_polygon_draw_border_line - 多边形边框线段（SDF 算法）
// 精确移植自 sgl_polygon.c:41-132
// 算法要点：
//   - 8.8 定点数 SDF，像素中心 (px<<8)+128
//   - radius_fp = width << 7（半宽，q8）
//   - fade = radius_fp + 128 - dist（width/2 + 0.5 - dist）
//   - 端点圆角 cap（投影到端点后求距离）
//   - sgl_sqrt 返回 floor(sqrt(x))
// ============================================================

/**
 * @param {object} surf - 绘制表面
 * @param {number} x1,y1,x2,y2 - 线段端点（逻辑坐标）
 * @param {number} width - 边框宽度
 * @param {{r,g,b}} color - 边框色
 * @param {number} alpha - 透明度 0-255
 */
function drawPolygonBorderLine(surf, x1, y1, x2, y2, width, color, alpha) {
  if (width === 0 || alpha === 0) return;
  const z = surf.scale;
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);

  const bax = px2 - px1;
  const bay = py2 - py1;
  const len_sq = bax * bax + bay * bay;

  // 长度为 0（点）的情况：画圆
  if (len_sq === 0) {
    const radius = ((width + 1) >> 1);
    for (let py = py1 - radius; py <= py1 + radius; py++) {
      for (let px = px1 - radius; px <= px1 + radius; px++) {
        const dx = ((px << 8) + 128) - ((px1 << 8) + 128);
        const dy = ((py << 8) + 128) - ((py1 << 8) + 128);
        // sgl_sqrt 返回 floor(sqrt(x))
        const dist = Math.floor(Math.sqrt(dx * dx + dy * dy));
        const radius_fp = width << 7;
        const fade = radius_fp + 128 - dist;
        if (fade > 0) {
          const cov = fade >= 255 ? 255 : fade;
          // 用 setEdgePixel 正确处理透明背景上的抗锯齿（保留 alpha 通道）
          setEdgePixel(surf, px, py, color, cov, alpha);
        }
      }
    }
    return;
  }

  // 正常线段：SDF 算法
  const extent = (width + 3) >> 1;
  const minX = Math.max(surf.clip.x1, Math.min(px1, px2) - extent);
  const maxX = Math.min(surf.clip.x2, Math.max(px1, px2) + extent);
  const minY = Math.max(surf.clip.y1, Math.min(py1, py2) - extent);
  const maxY = Math.min(surf.clip.y2, Math.max(py1, py2) + extent);

  const radius_fp = width << 7;
  const len_sq_shift16 = len_sq << 16;
  const px1_q8 = (px1 << 8) + 128;
  const py1_q8 = (py1 << 8) + 128;
  const px2_q8 = (px2 << 8) + 128;
  const py2_q8 = (py2 << 8) + 128;
  const bax_q8 = bax << 8;
  const bay_q8 = bay << 8;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const pcx = (px << 8) + 128;
      const pcy = (py << 8) + 128;
      const ax = pcx - px1_q8;
      const ay = pcy - py1_q8;
      // 点积（int64 运算，JS Number 可精确表示到 2^53）
      const dot = ax * bax_q8 + ay * bay_q8;

      let qx, qy;
      if (dot <= 0) {
        // 投影到起点
        qx = px1_q8;
        qy = py1_q8;
      } else if (dot >= len_sq_shift16) {
        // 投影到终点
        qx = px2_q8;
        qy = py2_q8;
      } else {
        // 投影到线段上（C int64 除法向零截断，用浮点近似避免溢出）
        const t = dot / len_sq_shift16;
        qx = px1_q8 + Math.trunc(bax_q8 * t);
        qy = py1_q8 + Math.trunc(bay_q8 * t);
      }

      const dx = pcx - qx;
      const dy = pcy - qy;
      // sgl_sqrt 返回 floor(sqrt(x))
      const dist = Math.floor(Math.sqrt(dx * dx + dy * dy));
      const fade = radius_fp + 128 - dist;

      if (fade > 0) {
        const cov = fade >= 255 ? 255 : fade;
        // 用 setEdgePixel 正确处理透明背景上的抗锯齿（保留 alpha 通道）
        setEdgePixel(surf, px, py, color, cov, alpha);
      }
    }
  }
}

// ============================================================
// sgl_draw_polygon_border - 多边形边框（连接各顶点）
// 调用 sgl_polygon_draw_border_line 绘制每条边
// ============================================================

/**
 * @param {number} border - 边框宽度
 */
function drawPolygonBorder(surf, points, borderColor, border, alpha) {
  if (border <= 0 || alpha <= 0 || !points || points.length < 2) return;
  // SGL: if (polygon->border_color.full != 0) 才画边框
  // RGB565 下黑色 (0,0,0) 的 .full = 0，跳过边框以保持 WYSIWYG
  if (borderColor.r === 0 && borderColor.g === 0 && borderColor.b === 0) return;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    drawPolygonBorderLine(surf, p1.x, p1.y, p2.x, p2.y, border, borderColor, alpha);
  }
}

// ============================================================
// 主题常量 (sgl_theme.h - DEFAULT 套：白底黑字)
// ============================================================
const SGL_THEME_COLOR = { r: 255, g: 255, b: 255 };
const SGL_THEME_BG_COLOR = { r: 0, g: 0, b: 0 };
const SGL_THEME_BORDER_COLOR = { r: 0, g: 0, b: 0 };
const SGL_THEME_TEXT_COLOR = { r: 0, g: 0, b: 0 };
const SGL_THEME_BORDER_WIDTH = 2;
const SGL_THEME_ALPHA = 255;
const SGL_THEME_RADIUS = 0;
const SGL_COLOR_RED = { r: 255, g: 0, b: 0 };
const SGL_COLOR_WHITE = { r: 255, g: 255, b: 255 };
const SGL_COLOR_BLACK = { r: 0, g: 0, b: 0 };

// ============================================================
// sgl_draw_wireframe - 矩形线框（4条边，圆角处简化为直角）
// 移植自 sgl_draw_rect.c 的 wireframe 分支
// ============================================================
function drawWireframe(surf, x1, y1, x2, y2, radius, border, color, alpha) {
  if (border <= 0 || alpha <= 0) return;
  if (radius === 0) {
    // 直角框：与 SGL sgl_draw_wireframe radius==0 分支一致
    const sOfs = Math.floor((border - 1) / 2);
    const eOfs = Math.floor(border / 2);
    drawHLine(surf, x1, x2, y1 + sOfs, border, color, alpha);
    drawHLine(surf, x1, x2, y2 - eOfs, border, color, alpha);
    drawVLine(surf, x1 + sOfs, y1, y2, border, color, alpha);
    drawVLine(surf, x2 - eOfs, y1, y2, border, color, alpha);
  } else {
    // 圆角框：与 SGL sgl_draw_wireframe radius>0 分支一致，调用 drawFillRectBorder
    drawFillRectBorder(surf, x1, y1, x2, y2, radius, color, border, alpha);
  }
}

// ============================================================
// sgl_draw_icon - 4bpp 点阵图标（带 alpha 渐变）
// icon = { width, height, bitmap: Uint8Array }
// bitmap 每像素 4 位（0-15），高 4 位在前
// 移植自 sgl_draw_icon.c（仅支持 4bpp）
// ============================================================
function drawIcon(surf, x, y, color, alpha, icon) {
  if (!icon || !icon.bitmap || alpha <= 0) return;
  const z = surf.scale;
  const px = Math.round(x * z);
  const py = Math.round(y * z);
  const w = icon.width;
  const h = icon.height;
  // 4bpp: 每字节 2 像素，奇数宽度时每行需要 (w+1)/2 字节
  const bytesPerRow = (w + 1) >> 1;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const byte_x = xx >> 1;
      const dot_index = byte_x + yy * bytesPerRow;
      let alpha_dot = (xx & 1) ? (icon.bitmap[dot_index] & 0x0F) : (icon.bitmap[dot_index] >> 4);
      alpha_dot = alpha_dot | (alpha_dot << 4); // 4-bit 扩展到 8-bit
      if (alpha_dot === 0) continue;
      const cx = px + Math.round(xx * z);
      const cy = py + Math.round(yy * z);
      const cw = Math.max(1, Math.round(z));
      for (let dy = 0; dy < cw; dy++) {
        for (let dx = 0; dx < cw; dx++) {
          // SGL sgl_draw_icon 两步混合：
          // *buf = sgl_color_mixer(color, *buf, alpha_dot);
          // 若整体 alpha < 255: *buf = sgl_color_mixer(*buf_prev, *buf, alpha);
          blendPixelRGB565TwoStep(surf, cx + dx, cy + dy, color, alpha_dot, alpha);
        }
      }
    }
  }
}

// dropdown 箭头位图（18×10, 4bpp）- 移植自 sgl_dropdown.c
const DROPDOWN_ICON = {
  width: 18,
  height: 10,
  bitmap: new Uint8Array([
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x30,0x00,
    0x0c,0xfa,0x00,0x00,0x00,0x00,0x05,0xee,0x50,
    0x0c,0xff,0xa0,0x00,0x00,0x00,0x5e,0xfe,0x30,
    0x00,0xcf,0xfa,0x00,0x00,0x05,0xef,0xe3,0x00,
    0x00,0x0c,0xff,0xa0,0x00,0x5e,0xfe,0x30,0x00,
    0x00,0x00,0xcf,0xfa,0x05,0xef,0xe3,0x00,0x00,
    0x00,0x00,0x0c,0xff,0xae,0xfe,0x30,0x00,0x00,
    0x00,0x00,0x00,0xcf,0xff,0xe3,0x00,0x00,0x00,
    0x00,0x00,0x00,0x0c,0xfe,0x30,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x53,0x00,0x00,0x00,0x00,
  ])
};

// checkbox 未选中位图（26×22, 4bpp）- 移植自 sgl_checkbox.c unchecked_pixmap
const CHECKBOX_UNCHECKED_ICON = {
  width: 26,
  height: 22,
  bitmap: new Uint8Array([
    0x00,0x03,0x33,0x33,0x33,0x33,0x33,0x33,0x33,0x00,0x00,0x00,0x00,
    0x05,0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xea,0x00,0x00,0x00,
    0x8e,0xfe,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xce,0xff,0xa0,0x00,0x00,
    0xef,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xaf,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x3e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0e,0xe0,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x3e,0xe0,0x00,0x00,
    0xef,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,0x03,0xcf,0xe0,0x00,0x00,
    0x5e,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,0x80,0x00,0x00,
    0x03,0xcf,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xc5,0x00,0x00,0x00,
  ])
};

// checkbox 选中位图（26×22, 4bpp）- 移植自 sgl_checkbox.c checked_pixmap
const CHECKBOX_CHECKED_ICON = {
  width: 26,
  height: 22,
  bitmap: new Uint8Array([
    0x00,0x03,0x33,0x33,0x33,0x33,0x33,0x33,0x33,0x00,0x00,0x00,0x00,
    0x05,0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xe3,0x00,0x30,0x00,
    0x8e,0xfe,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0x80,0x5e,0xfa,0x00,
    0xef,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x05,0xef,0xff,0xa0,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x5e,0xff,0xff,0xe0,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x05,0xef,0xff,0xff,0xe0,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x5e,0xff,0xff,0xfe,0x30,
    0xee,0x50,0x03,0x55,0x00,0x00,0x00,0x05,0xef,0xff,0xff,0xe3,0x00,
    0xee,0x50,0x3e,0xfe,0x80,0x00,0x00,0x5e,0xff,0xff,0xfe,0x30,0x00,
    0xee,0x50,0xef,0xff,0xe8,0x00,0x05,0xef,0xff,0xff,0xe3,0x00,0x00,
    0xee,0x58,0xef,0xff,0xfe,0x80,0x5e,0xff,0xff,0xfe,0x30,0x00,0x00,
    0xee,0x50,0xcf,0xff,0xff,0xe8,0xef,0xff,0xff,0xe3,0x00,0x00,0x00,
    0xee,0x50,0x0c,0xff,0xff,0xff,0xff,0xff,0xfe,0x30,0x85,0x00,0x00,
    0xee,0x50,0x00,0xcf,0xff,0xff,0xff,0xff,0xe3,0x0c,0xe8,0x00,0x00,
    0xee,0x50,0x00,0x0c,0xff,0xff,0xff,0xfe,0x30,0x0e,0xe8,0x00,0x00,
    0xee,0x50,0x00,0x00,0xcf,0xff,0xff,0xe3,0x00,0x0e,0xe8,0x00,0x00,
    0xee,0x50,0x00,0x00,0x0c,0xff,0xfe,0x30,0x00,0x0e,0xe8,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0xcf,0xe3,0x00,0x00,0x0e,0xe8,0x00,0x00,
    0xee,0x50,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x3e,0xe8,0x00,0x00,
    0xef,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,0x03,0xcf,0xe3,0x00,0x00,
    0x5e,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,0x80,0x00,0x00,
    0x03,0xcf,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xc5,0x00,0x00,0x00,
  ])
};

// numberkbd enter 位图（30×20, 4bpp）- 移植自 sgl_numberkbd.c btn_enter_bitmap
const NUMBERKBD_ENTER_ICON = {
  width: 30,
  height: 20,
  bitmap: new Uint8Array([
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x8e,0xfa,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08,0xef,0xff,0xa0,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x8e,0xff,0xff,0xfa,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08,0xef,0xff,0xff,0xfe,0x50,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x8e,0xff,0xff,0xff,0xfe,0x30,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x08,0xef,0xff,0xff,0xff,0xe3,0x00,
    0x00,0x00,0xae,0xe8,0x00,0x00,0x00,0x00,0x8e,0xff,0xff,0xff,0xfe,0x30,0x00,
    0x00,0x0a,0xff,0xfe,0x80,0x00,0x00,0x08,0xef,0xff,0xff,0xff,0xe3,0x00,0x00,
    0x00,0xae,0xff,0xff,0xe8,0x00,0x00,0x8e,0xff,0xff,0xff,0xfe,0x30,0x00,0x00,
    0x05,0xef,0xff,0xff,0xfe,0x80,0x08,0xef,0xff,0xff,0xff,0xe3,0x00,0x00,0x00,
    0x03,0xef,0xff,0xff,0xff,0xe8,0x8e,0xff,0xff,0xff,0xfe,0x30,0x00,0x00,0x00,
    0x00,0x5e,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xe3,0x00,0x00,0x00,0x00,
    0x00,0x05,0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,0x30,0x00,0x00,0x00,0x00,
    0x00,0x00,0x5e,0xff,0xff,0xff,0xff,0xff,0xff,0xe3,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x05,0xef,0xff,0xff,0xff,0xff,0xfe,0x30,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x5e,0xff,0xff,0xff,0xff,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x05,0xef,0xff,0xff,0xfe,0x30,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x5e,0xff,0xff,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x05,0xef,0xfe,0x30,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x5c,0xc3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  ])
};

// numberkbd backspace 位图（30×13, 4bpp）- 移植自 sgl_numberkbd.c btn_backspace_bitmap
const NUMBERKBD_BACKSPACE_ICON = {
  width: 30,
  height: 13,
  bitmap: new Uint8Array([
    0x00,0x00,0x00,0x3e,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x05,0xef,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x5e,0xff,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x08,0xef,0xff,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x8e,0xff,0xff,0xec,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,0xcc,
    0x0a,0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,
    0x3e,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,
    0x03,0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfe,
    0x00,0x3e,0xff,0xff,0xc6,0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x65,
    0x00,0x03,0xef,0xff,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x0c,0xff,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0xcf,0xc0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x0a,0xa0,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  ])
};

// ============================================================
// keyboard icon 位图（4bpp）- 移植自 sgl_keyboard.c font_bitmap
// keyboard_icon 字体包含 6 个 icon，用于键盘的 backspace/enter/newline/keybd/left/right 按键
// ============================================================

// backspace icon (23×18, 4bpp) - U+E81E
const KEYBOARD_BACKSPACE_ICON = {
  width: 23,
  height: 18,
  bitmap: new Uint8Array([
    0x00,0x00,0x05,0xde,0xee,0xee,0xee,0xee,0xee,0xee,0xec,0x30,
    0x00,0x03,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xfd,0x00,
    0x00,0xdf,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xf0,0x00,
    0x8f,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x00,0x3f,
    0xff,0xff,0xf6,0x7f,0xff,0xff,0x49,0xff,0xff,0xf0,0x0d,0xff,
    0xff,0xfd,0x00,0x7f,0xff,0x40,0x2f,0xff,0xff,0x08,0xff,0xff,
    0xff,0xfc,0x00,0x7f,0x50,0x2e,0xff,0xff,0xf3,0xff,0xff,0xff,
    0xff,0xfc,0x00,0x20,0x1e,0xff,0xff,0xff,0xcf,0xff,0xff,0xff,
    0xff,0xfc,0x00,0x0d,0xff,0xff,0xff,0xf7,0xff,0xff,0xff,0xff,
    0xff,0x50,0x00,0x7f,0xff,0xff,0xff,0x0c,0xff,0xff,0xff,0xff,
    0x50,0x1a,0x00,0x7f,0xff,0xff,0xf0,0x2f,0xff,0xff,0xff,0x50,
    0x1d,0xfc,0x00,0x8f,0xff,0xff,0x00,0x7f,0xff,0xff,0xe1,0x1d,
    0xff,0xfc,0x02,0xff,0xff,0xf0,0x00,0xcf,0xff,0xff,0xdd,0xff,
    0xff,0xfc,0xef,0xff,0xff,0x00,0x02,0xff,0xff,0xff,0xff,0xff,
    0xff,0xff,0xff,0xff,0xf0,0x00,0x07,0xff,0xff,0xff,0xff,0xff,
    0xff,0xff,0xff,0xff,0x00,0x00,0x0c,0xff,0xff,0xff,0xff,0xff,
    0xff,0xff,0xff,0x90,0x00,0x00,0x04,0x55,0x55,0x55,0x55,0x55,
    0x55,0x55,0x40,
  ])
};

// enter icon (18×14, 4bpp) - U+E866
const KEYBOARD_ENTER_ICON = {
  width: 18,
  height: 14,
  bitmap: new Uint8Array([
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x1d,0x70,
    0x00,0x00,0x00,0x00,0x00,0x00,0x01,0xdf,0xb0,
    0x00,0x00,0x00,0x00,0x00,0x00,0x1d,0xfb,0x00,
    0x00,0x00,0x00,0x00,0x00,0x01,0xdf,0xb0,0x00,
    0x00,0x00,0x00,0x00,0x00,0x1d,0xfb,0x00,0x00,
    0x00,0x00,0x00,0x00,0x01,0xdf,0xb0,0x00,0x00,
    0x1c,0x30,0x00,0x00,0x1d,0xfb,0x00,0x00,0x00,
    0x6f,0xf3,0x00,0x01,0xdf,0xb0,0x00,0x00,0x00,
    0x08,0xff,0x30,0x1d,0xfb,0x00,0x00,0x00,0x00,
    0x00,0x8f,0xf4,0xdf,0xb0,0x00,0x00,0x00,0x00,
    0x00,0x08,0xff,0xfb,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x8f,0xb0,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x06,0x00,0x00,0x00,0x00,0x00,0x00,
  ])
};

// keybd icon (21×20, 4bpp) - U+E9B7
const KEYBOARD_KEYBD_ICON = {
  width: 21,
  height: 20,
  bitmap: new Uint8Array([
    0x03,0xcd,0xdd,0xdd,0xdd,0xdd,0xdd,0xdd,0xdd,0xc3,0x00,
    0xef,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xe0,0x0f,
    0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x01,0xff,
    0xd0,0x2e,0x04,0xc0,0xc4,0x0e,0x20,0xdf,0xf1,0x1f,0xfd,
    0x01,0xe0,0x3c,0x0c,0x30,0xe1,0x0d,0xff,0x11,0xff,0xff,
    0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xf1,0x1f,0xfd,0x01,
    0xe0,0x3c,0x0c,0x30,0xe1,0x0d,0xff,0x11,0xff,0xd0,0x1e,
    0x03,0xc0,0xc3,0x0e,0x10,0xdf,0xf1,0x1f,0xff,0xff,0xff,
    0xff,0xff,0xff,0xff,0xff,0xff,0x11,0xff,0xff,0xff,0xee,
    0xee,0xee,0xef,0xff,0xff,0xf1,0x1f,0xff,0xff,0xe0,0x00,
    0x00,0x00,0xef,0xff,0xff,0x10,0xff,0xff,0xfe,0x00,0x00,
    0x00,0x0e,0xff,0xff,0xf0,0x0e,0xff,0xff,0xff,0xff,0xff,
    0xff,0xff,0xff,0xfe,0x00,0x4c,0xee,0xee,0xee,0xee,0xee,
    0xee,0xee,0xec,0x40,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x33,0x33,0x33,0x30,
    0x00,0x00,0x00,0x00,0x00,0x00,0x06,0xff,0xff,0xf6,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x07,0xff,0xf7,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x08,0xf8,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,0x00,0x00,0x05,0x00,0x00,0x00,0x00,
    0x00,
  ])
};

// newline icon (20×12, 4bpp) - U+E9B8
const KEYBOARD_NEWLINE_ICON = {
  width: 20,
  height: 12,
  bitmap: new Uint8Array([
    0x00,0x00,0x00,0x81,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x0a,0xfb,0x00,0x00,0x00,0x00,0x0b,0xd1,
    0x00,0x00,0xaf,0xe2,0x00,0x00,0x00,0x00,0x0d,0xf1,
    0x00,0x0a,0xfe,0x20,0x00,0x00,0x00,0x00,0x0d,0xf1,
    0x00,0xaf,0xe2,0x00,0x00,0x00,0x00,0x00,0x0d,0xf1,
    0x0a,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xf1,
    0x08,0xff,0xfe,0xee,0xee,0xee,0xee,0xee,0xee,0xe1,
    0x00,0x8f,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x08,0xfe,0x30,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x8f,0xe3,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x08,0xfb,0x00,0x00,0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x60,0x00,0x00,0x00,0x00,0x00,0x00,
  ])
};

// left icon (8×12, 4bpp) - U+EA2A
const KEYBOARD_LEFT_ICON = {
  width: 8,
  height: 12,
  bitmap: new Uint8Array([
    0x00,0x00,0x01,0x80,0x00,0x00,0x1c,0xf8,
    0x00,0x01,0xcf,0xc0,0x00,0x1c,0xfc,0x00,
    0x01,0xcf,0xc0,0x00,0x0c,0xfc,0x00,0x00,
    0x0b,0xfd,0x10,0x00,0x00,0xbf,0xd1,0x00,
    0x00,0x0b,0xfd,0x10,0x00,0x00,0xbf,0xd1,
    0x00,0x00,0x0b,0xf8,0x00,0x00,0x00,0x70,
  ])
};

// right icon (8×12, 4bpp) - U+EA2B
const KEYBOARD_RIGHT_ICON = {
  width: 8,
  height: 12,
  bitmap: new Uint8Array([
    0x08,0x10,0x00,0x00,
    0x8f,0xc1,0x00,0x00,
    0x0c,0xfc,0x10,0x00,
    0x00,0xcf,0xc1,0x00,
    0x00,0x0c,0xfc,0x10,
    0x00,0x00,0xcf,0xc0,
    0x00,0x01,0xdf,0xb0,
    0x00,0x1d,0xfb,0x00,
    0x01,0xdf,0xb0,0x00,
    0x1d,0xfb,0x00,0x00,
    0x8f,0xb0,0x00,0x00,
    0x07,0x00,0x00,0x00,
  ])
};

// ============================================================
// sgl_split_len - 按权重切分长度（键盘布局用）
// 移植自 sgl_core.c
// ============================================================
function splitLen(weights, n, total, margin, out) {
  // 严格移植自 sgl_math.c sgl_split_len
  // span = length - gap * (count + 1)，每个按键前一个gap + 最后一个按键后一个gap
  let total_w = 0;
  for (let i = 0; i < n; i++) total_w += Math.max(0, weights[i]);
  if (total_w <= 0) {
    for (let i = 0; i < n; i++) out[i] = 0;
    return;
  }
  const span = total - margin * (n + 1);
  let error = 0;
  for (let i = 0; i < n; i++) {
    const numerator = weights[i] * span;
    out[i] = Math.floor(numerator / total_w);
    error += numerator % total_w;
    if (error >= total_w) {
      out[i] += 1;
      error -= total_w;
    }
  }
}

// ============================================================
// SGL keyboard 数据表（移植自 sgl_keyboard.c）
// 用于设计器和预览的 keyboard 渲染
// ============================================================

// key_mode: 0=UPPER, 1=LOWER, 2=SPEC
// layout_mode: 0=upper/lower (共用布局), 1=number/spec (共用布局)
// layout_mode = key_mode >> 1 (UPPER/LOWER→0, SPEC→1)
// 默认展示 LOWER 模式 (key_mode=1, layout_mode=0)

// 按键显示文本 keybd_btn_map[3][40][4]
const KEYBD_BTN_MAP = [
  // UPPER (key_mode=0)
  ["1#","Q","W","E","R","T","Y","U","I","O","P","<<",
   "abc","A","S","D","F","G","H","J","K","L","nl",
   "_","-","Z","X","C","V","B","N","M",".",",",":",
   "kbd","<"," ",">","OK"],
  // LOWER (key_mode=1)
  ["1#","q","w","e","r","t","y","u","i","o","p","<<",
   "ABC","a","s","d","f","g","h","j","k","l","nl",
   "_","-","z","x","c","v","b","n","m",".",",",":",
   "kbd","<"," ",">","OK"],
  // SPEC (key_mode=2)
  ["1","2","3","4","5","6","7","8","9","0","<<",
   "abc","+","-","/","*","=","%","!","?","#","<",">",
   "\\","@","$","(",")","{","}","[","]",";","\"","'",
   "kbd","<"," ",">","OK"],
];

// 按键宽度权重表 keybd_btn_width[2][4][12]
const KEYBD_BTN_WIDTH = [
  // upper/lower mode
  [[5,4,4,4,4,4,4,4,4,4,4,7],
   [6,3,3,3,3,3,3,3,3,3,7],
   [1,1,1,1,1,1,1,1,1,1,1,1],
   [2,2,6,2,2]],
  // number/spec mode
  [[1,1,1,1,1,1,1,1,1,1,2],
   [2,1,1,1,1,1,1,1,1,1,1,1],
   [1,1,1,1,1,1,1,1,1,1,1,1],
   [2,2,6,2,2]],
];

// 每行按键数 keyboard_btn_count[2][4]
const KEYBOARD_BTN_COUNT = [
  [12, 11, 12, 5],  // upper/lower
  [11, 12, 12, 5],  // number/spec
];

// 行高权重（所有行等高）
const KEYBD_BTN_HEIGHT = [1, 1, 1, 1];

// icon 按键索引（LOWER 模式）
// KEYBOARD_KEY_BACKSPACE=11, KEYBOARD_KEY_NEWLINE=22, KEYBOARD_KEY_CLOSE=35,
// KEYBOARD_KEY_LEFT=36, KEYBOARD_KEY_RIGHT=38, KEYBOARD_KEY_ENTER=39
const KEYBOARD_KEY_BACKSPACE = 11;
const KEYBOARD_KEY_NEWLINE = 22;
const KEYBOARD_KEY_CLOSE = 35;
const KEYBOARD_KEY_LEFT = 36;
const KEYBOARD_KEY_RIGHT = 38;
const KEYBOARD_KEY_ENTER = 39;

// icon 元数据：advW=sgl_font_get_string_width(=368>>4=23), fontHeight=20, baseLine=2
// ofs_x/ofs_y 来自 font_table，bitmap 实际绘制位置 = (text_x + ofs_x, text_y + base_line + ofs_y)
const KEYBOARD_ICON_META = {
  backspace: { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 0, ofsY: -1, icon: KEYBOARD_BACKSPACE_ICON },
  enter:     { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 3, ofsY: 1,  icon: KEYBOARD_ENTER_ICON },
  keybd:     { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 1, ofsY: -3, icon: KEYBOARD_KEYBD_ICON },
  newline:   { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 1, ofsY: 2,  icon: KEYBOARD_NEWLINE_ICON },
  left:      { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 7, ofsY: 2,  icon: KEYBOARD_LEFT_ICON },
  right:     { advW: 23, fontHeight: 20, baseLine: 2, ofsX: 8, ofsY: 2,  icon: KEYBOARD_RIGHT_ICON },
};

/**
 * 绘制 keyboard icon，严格移植自 sgl_draw_character
 * SGL 通过字体系统绘制 icon（sgl_draw_string → sgl_draw_character），不是 sgl_draw_icon
 *
 * SGL sgl_draw_character 的 bitmap 位置计算：
 *   offset_y2 = font_height - ofs_y - base_line
 *   text_rect.x1 = x + ofs_x
 *   text_rect.y1 = y + offset_y2 - box_h
 *   text_rect.y2 = y + offset_y2 - 1
 *
 * SGL 像素数据读取（连续，不按行填充）：
 *   pixel_index = rel_y * font_w + rel_x
 *   byte_index = pixel_index >> 1
 *   alpha_dot = (pixel_index & 1) ? (dot[byte_index] & 0x0F) : (dot[byte_index] >> 4)
 *   alpha_dot = sgl_opa4_table[alpha_dot]  (4bit→8bit: i*17)
 *
 * @param {object} surf - 绘制表面
 * @param {number} textX - 文本绘制起点 x（btn.x1 + (btn_width - advW) / 2）
 * @param {number} textY - 文本绘制起点 y（btn.y1 + (btn_height - fontHeight) / 2）
 * @param {{r,g,b}} color - 前景色
 * @param {number} alpha - 整体透明度 0-255
 * @param {object} meta - KEYBOARD_ICON_META 中的元数据
 */
function drawKeyboardIcon(surf, textX, textY, color, alpha, meta) {
  const icon = meta.icon;
  if (!icon || !icon.bitmap || alpha <= 0) return;
  const z = surf.scale;
  const fontW = icon.width;   // box_w
  const fontH = icon.height;  // box_h
  // SGL: offset_y2 = font_height - ofs_y - base_line
  const offsetY2 = meta.fontHeight - meta.ofsY - meta.baseLine;
  // SGL: text_rect.x1 = x + ofs_x, text_rect.y1 = y + offset_y2 - box_h
  const bmpX = textX + meta.ofsX;
  const bmpY = textY + offsetY2 - fontH;

  // 转像素坐标
  const px = Math.round(bmpX * z);
  const py = Math.round(bmpY * z);

  for (let yy = 0; yy < fontH; yy++) {
    for (let xx = 0; xx < fontW; xx++) {
      // SGL: pixel_index = rel_y * font_w + rel_x (连续，不按行填充)
      const pixelIndex = yy * fontW + xx;
      const byteIndex = pixelIndex >> 1;
      let alphaDot;
      if (pixelIndex & 1) {
        alphaDot = icon.bitmap[byteIndex] & 0x0F;
      } else {
        alphaDot = icon.bitmap[byteIndex] >> 4;
      }
      // sgl_opa4_table: 4bit → 8bit (i * 17)
      alphaDot = alphaDot * 17;
      if (alphaDot === 0) continue;

      const cx = px + Math.round(xx * z);
      const cy = py + Math.round(yy * z);
      const cw = Math.max(1, Math.round(z));
      for (let dy = 0; dy < cw; dy++) {
        for (let dx = 0; dx < cw; dx++) {
          // SGL: color_mix = sgl_color_mixer(color, *blend, alpha_dot)
          //       *blend = sgl_color_mixer(color_mix, *blend, alpha)
          blendPixelRGB565TwoStep(surf, cx + dx, cy + dy, color, alphaDot, alpha);
        }
      }
    }
  }
}

/**
 * 判断按键索引是否为 icon，返回 icon 名称或 null
 * 移植自 sgl_keyboard.c keyindex_is_icon
 * @param {number} keyMode - 0=UPPER, 1=LOWER, 2=SPEC
 * @param {number} index - 按键索引 0-39
 * @returns {string|null} - icon 名称
 */
function keyindexIsIcon(keyMode, index) {
  // KEYBOARD_KEY_NUMBER_BACKSPACE=10, SPEC 模式下 index 10 为 backspace
  if (index === 10 && keyMode === 2) return 'backspace';
  // KEYBOARD_KEY_BACKSPACE=11, 非 SPEC 模式下 index 11 为 backspace
  if (index === KEYBOARD_KEY_BACKSPACE && keyMode < 2) return 'backspace';
  // KEYBOARD_KEY_ENTER=39
  if (index === KEYBOARD_KEY_ENTER) return 'enter';
  // KEYBOARD_KEY_NEWLINE=22, 非 SPEC 模式下 index 22 为 newline
  if (index === KEYBOARD_KEY_NEWLINE && keyMode !== 2) return 'newline';
  // KEYBOARD_KEY_CLOSE=35
  if (index === KEYBOARD_KEY_CLOSE) return 'keybd';
  // KEYBOARD_KEY_LEFT=36
  if (index === KEYBOARD_KEY_LEFT) return 'left';
  // KEYBOARD_KEY_RIGHT=38
  if (index === KEYBOARD_KEY_RIGHT) return 'right';
  return null;
}

// ============================================================
// 虚线绘制（Bresenham + dash 模式）
// 移植自 sgl_scope.c draw_dashed_line
// ============================================================
function drawDashedLine(surf, x1, y1, x2, y2, dashLen, gapLen, color, alpha) {
  if (alpha <= 0 || dashLen <= 0) return;
  const z = surf.scale;
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);

  const dx = Math.abs(px2 - px1);
  const dy = Math.abs(py2 - py1);
  const sx = px1 < px2 ? 1 : -1;
  const sy = py1 < py2 ? 1 : -1;
  const steps = Math.max(dx, dy);
  const pdash = Math.max(1, Math.round(dashLen * z));
  const pgap = Math.max(1, Math.round(gapLen * z));
  const pattern = pdash + pgap;

  let x = px1, y = py1;
  let err = dx - dy;
  let pos = 0;
  for (let i = 0; i <= steps; i++) {
    if (pos < pdash) setPixel(surf, x, y, color, alpha);
    pos++;
    if (pos >= pattern) pos = 0;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// ============================================================
// 位图绘制（按 pixmapFormat 量化像素，匹配 SGL 色彩降级）
// ============================================================

// 将 bits 位量化值扩展回 8 位（SGL 位深扩展算法）
// 例如 5 位 0b11111(31) → 0b11111111(255)
function _expandBits(v, bits) {
  if (bits >= 8) return v & 0xff;
  let result = 0;
  let shift = 8 - bits;
  while (shift >= 0) {
    result |= v << shift;
    shift -= bits;
  }
  if (shift < 0) {
    result |= v >> (-shift);
  }
  return result & 0xff;
}

/**
 * 严格移植 SGL sgl_img_ext_construct_cb 的 ext_img 渲染算法。
 * 在控件逻辑坐标 (0,0) ~ (w-1,h-1) 范围内，对每个目标像素做逆变换采样源图片，
 * 并用 SGL colorMixer + setPixel 完成 alpha 混合。
 * @param {Object} surf - createSurface 返回的表面
 * @param {ImageData} imgData - 源图片 RGBA 数据
 * @param {number} w - 控件逻辑宽度
 * @param {number} h - 控件逻辑高度
 * @param {number} rotation - 旋转角度（度）
 * @param {number} scaleUniform - SGL 统一缩放系数（int8，0=1.0）
 * @param {number|string|null} pivotX - 旋转中心 X，空/null 表示图片中心
 * @param {number|string|null} pivotY - 旋转中心 Y，空/null 表示图片中心
 * @param {number} alpha - 全局透明度 0-255
 * @param {string} [pixmapFormat] - pixmap 格式（RGB565/ARGB4444/...），
 *                                  不透明格式忽略原图 alpha，透明格式使用原图 alpha
 */
function drawExtImg(surf, imgData, w, h, rotation, scaleUniform, pivotX, pivotY, alpha, pixmapFormat) {
  if (!imgData || alpha <= 0) return;
  // SGL ext_img 的 decode_pixel 不支持 RLE 压缩格式（default 分支返回黑色），
  // 设计器与 SGL 仿真一致：RLE 格式不渲染
  if (pixmapFormat && /^RLE_/i.test(pixmapFormat)) return;
  const imgW = imgData.width;
  const imgH = imgData.height;
  const src = imgData.data;
  const z = surf.scale;

  // SGL decode_pixel：RGB565/RGB332/RGB888 等不透明格式返回 SGL_ALPHA_MAX，
  // ARGB4444/ARGB2222/ARGB8888 等透明格式才读取 alpha 位。
  const baseFmt = (pixmapFormat || 'RGB565').toUpperCase();
  const opaqueFormats = new Set(['RGB565', 'RGB332', 'RGB888']);
  const isOpaqueFmt = opaqueFormats.has(baseFmt);

  // 按 pixmap 格式对颜色做 encode-decode 量化，模拟 SGL 实际存储/读取后的颜色损失
  // SGL 项目色深为 RGB565，sgl_color_t 内部就是 RGB565
  // decode_pixel 流程：从 pixmap 字节流读取 → sgl_rgbXXX_to_color → RGB565
  // 设计器模拟：RGBA8888 → 编码为 pixmap 格式 → sgl_rgbXXX_to_color(RGB565) → 扩展回 RGBA8888
  function quantizeColor(r, g, b, a) {
    // 不透明格式：透明/半透明像素按黑色背景合成（与 main.rs convert_image_to_pixmap 一致）
    if (isOpaqueFmt) {
      r = Math.round(r * a / 255);
      g = Math.round(g * a / 255);
      b = Math.round(b * a / 255);
      a = 255;
    }
    let r5, g6, b5, alpha;
    switch (baseFmt) {
      case 'RGB332': {
        // RGB332: R3G3B2
        const v = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
        // sgl_rgb332_to_color in RGB565:
        b5 = (v & 0x03) << 3;
        g6 = ((v >> 2) & 0x07) << 3;
        r5 = ((v >> 5) & 0x07) << 2;
        alpha = 255;
        break;
      }
      case 'ARGB2222': {
        // ARGB2222: A2R2G2B2
        const v = ((a >> 6) << 6) | ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        // sgl_rgb222_to_color in RGB565:
        b5 = (v & 0x03) << 3;
        g6 = ((v >> 2) & 0x03) << 4;
        r5 = ((v >> 4) & 0x03) << 3;
        alpha = OPA2_TABLE[v >> 6];
        break;
      }
      case 'RGB565': {
        // RGB565: R5G6B5
        const v = (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
        // sgl_rgb565_to_color in RGB565: direct
        b5 = v & 0x1F;
        g6 = (v >> 5) & 0x3F;
        r5 = (v >> 11) & 0x1F;
        alpha = 255;
        break;
      }
      case 'ARGB4444': {
        // ARGB4444: A4R4G4B4
        const v = (((a & 0xF0) << 8) | ((r & 0xF0) << 4) | (g & 0xF0) | (b >> 4));
        // sgl_rgb444_to_color in RGB565:
        b5 = (v & 0xF) << 1;
        g6 = ((v >> 4) & 0xF) << 2;
        r5 = ((v >> 8) & 0xF) << 1;
        alpha = OPA4_TABLE[v >> 12];
        break;
      }
      case 'RGB888': {
        // RGB888: R8G8B8 (stored as B G R in bytes)
        // sgl_rgb888_to_color in RGB565:
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = 255;
        break;
      }
      case 'ARGB8888': {
        // sgl_rgb888_to_color in RGB565 (color part same as RGB888):
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = a;
        break;
      }
      default:
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = 255;
    }
    // RGB565 → RGBA8888 扩展（设计器内部用 RGBA8888 表示）
    return {
      r: (r5 << 3) | (r5 >> 2),
      g: (g6 << 2) | (g6 >> 4),
      b: (b5 << 3) | (b5 >> 2),
      a: alpha
    };
  }

  // pivot 默认图片中心，整数除法与 SGL 一致
  const pvX = pivotX != null && String(pivotX).trim() !== '' ? Math.floor(Number(pivotX)) : Math.floor(imgW / 2);
  const pvY = pivotY != null && String(pivotY).trim() !== '' ? Math.floor(Number(pivotY)) : Math.floor(imgH / 2);

  // 无旋转且无缩放：走 SGL 简单 blit 路径
  // SGL: center_x = (coords.x1 + coords.x2) / 2, start_x = center_x - pixmap->width / 2
  // 图片在控件逻辑坐标 (0,0)~(w-1,h-1) 内居中，像素级对齐采用整数除法。
  if ((rotation || 0) === 0 && (scaleUniform || 0) === 0) {
    const centerX = Math.floor((w - 1) / 2);
    const centerY = Math.floor((h - 1) / 2);
    const startX = centerX - Math.floor(imgW / 2);
    const startY = centerY - Math.floor(imgH / 2);

    for (let py = 0; py < surf.h; py++) {
      const ly = py / z;
      const srcY = Math.floor(ly) - startY;
      if (srcY < 0 || srcY >= imgH) continue;
      for (let px = 0; px < surf.w; px++) {
        const lx = px / z;
        const srcX = Math.floor(lx) - startX;
        if (srcX < 0 || srcX >= imgW) continue;
        const idx = (srcY * imgW + srcX) * 4;
        const q = quantizeColor(src[idx], src[idx + 1], src[idx + 2], src[idx + 3]);
        const a = isOpaqueFmt ? 255 : q.a;
        if (a <= 0) continue;
        // SGL blend_pixel 两步混合：先用 pix_opa 混合，再用 global_alpha 混合
        blendPixelRGB565TwoStep(surf, px, py, { r: q.r, g: q.g, b: q.b }, a, alpha);
      }
    }
    return;
  }

  // 旋转 + 缩放路径：逆变换采样
  const scaleFactor = 1 + (scaleUniform || 0) / 128;
  const invScale = 1 / scaleFactor;
  const rad = (rotation || 0) * Math.PI / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);

  for (let py = 0; py < surf.h; py++) {
    const ly = py / z;
    for (let px = 0; px < surf.w; px++) {
      const lx = px / z;
      // 目标像素相对 pivot 的偏移
      const relX = lx - pvX;
      const relY = ly - pvY;
      // 逆旋转 + 逆缩放，得到源图片中的相对位置
      const rxRot = cos * relX + sin * relY;
      const ryRot = -sin * relX + cos * relY;
      const rx = rxRot * invScale;
      const ry = ryRot * invScale;
      const srcX = Math.floor(rx + pvX);
      const srcY = Math.floor(ry + pvY);
      if (srcX < 0 || srcX >= imgW || srcY < 0 || srcY >= imgH) continue;
      const idx = (srcY * imgW + srcX) * 4;
      const q = quantizeColor(src[idx], src[idx + 1], src[idx + 2], src[idx + 3]);
      const a = isOpaqueFmt ? 255 : q.a;
      if (a <= 0) continue;
      // SGL blend_pixel 两步混合
      blendPixelRGB565TwoStep(surf, px, py, { r: q.r, g: q.g, b: q.b }, a, alpha);
    }
  }
}

/**
 * 按 pixmapFormat 量化绘制图片到 surface（WYSIWYG 色彩降级）
 * RLE_* 格式为无损压缩，视觉与基础格式相同，按基础格式渲染
 * 按最近邻算法缩放到目标尺寸
 * @param {Object} surf - createSurface 返回的表面
 * @param {number} x, y - 目标起始坐标（逻辑坐标）
 * @param {number} destW, destH - 目标宽高（逻辑坐标）
 * @param {ImageData} imgData - 图片像素数据
 * @param {string} fmt - pixmapFormat (RGB565/ARGB4444/RGB888/ARGB8888/RGB332/ARGB2222 或 RLE_ 前缀)
 * @param {number} alpha - 整体透明度 0-255
 */
function drawPixmap(surf, x, y, destW, destH, imgData, fmt, alpha, radius = 0) {
  if (!imgData || alpha <= 0 || destW <= 0 || destH <= 0) return;
  const z = surf.scale;
  const srcW = imgData.width;
  const srcH = imgData.height;
  const srcData = imgData.data;

  // SGL sgl_draw_fill_rect_pixmap 行为模拟：
  // 该函数通过 sgl_pixmap_get_buf 把 pixmap->bitmap.array 强转为 sgl_color_t*，
  // 16 位色深下每个 sgl_color_t 占 2 字节，不按 pixmap 格式解码。
  // 这意味着只有 RGB565（2字节）能正确显示，其他格式都会颜色错乱——
  // 这正是 SGL 仿真的实际行为，设计器必须一致才能 WYSIWYG。
  const baseFmt = (fmt || 'RGB565').replace(/^RLE_/, '').toUpperCase();

  // 是否含 alpha 通道（用于非 Alpha 格式的黑色背景预乘）
  const alphaFormats = new Set(['ARGB2222', 'ARGB4444', 'ARGB8888']);
  const hasAlpha = alphaFormats.has(baseFmt);

  // 先把 ImageData 按 pixmap 格式 encode 成字节数组（与 main.rs convert_image_to_pixmap 一致）
  const bytesPerPixel = {
    'RGB332': 1, 'ARGB2222': 1, 'RGB565': 2, 'ARGB4444': 2, 'RGB888': 3, 'ARGB8888': 4
  }[baseFmt] || 2;
  const pixmapBytes = new Uint8Array(srcW * srcH * bytesPerPixel);
  let writeOff = 0;
  for (let yy = 0; yy < srcH; yy++) {
    for (let xx = 0; xx < srcW; xx++) {
      const idx = (yy * srcW + xx) * 4;
      let r = srcData[idx];
      let g = srcData[idx + 1];
      let b = srcData[idx + 2];
      let a = srcData[idx + 3];
      // 非 Alpha 格式：透明/半透明像素按黑色背景合成（与 main.rs 一致）
      if (!hasAlpha) {
        r = Math.round(r * a / 255);
        g = Math.round(g * a / 255);
        b = Math.round(b * a / 255);
        a = 255;
      }
      switch (baseFmt) {
        case 'RGB332':
          pixmapBytes[writeOff++] = ((r & 0xE0) | ((g >> 3) & 0x1C) | ((b >> 6) & 0x03));
          break;
        case 'ARGB2222':
          pixmapBytes[writeOff++] = (((a >> 6) << 6) | ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6));
          break;
        case 'RGB565': {
          const v = (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
          pixmapBytes[writeOff++] = v & 0xFF;
          pixmapBytes[writeOff++] = (v >> 8) & 0xFF;
          break;
        }
        case 'ARGB4444': {
          const v = (((a & 0xF0) << 8) | ((r & 0xF0) << 4) | (g & 0xF0) | (b >> 4));
          pixmapBytes[writeOff++] = v & 0xFF;
          pixmapBytes[writeOff++] = (v >> 8) & 0xFF;
          break;
        }
        case 'RGB888':
          pixmapBytes[writeOff++] = b;
          pixmapBytes[writeOff++] = g;
          pixmapBytes[writeOff++] = r;
          break;
        case 'ARGB8888':
          pixmapBytes[writeOff++] = b;
          pixmapBytes[writeOff++] = g;
          pixmapBytes[writeOff++] = r;
          pixmapBytes[writeOff++] = a;
          break;
        default:
          pixmapBytes[writeOff++] = 0;
          pixmapBytes[writeOff++] = 0;
      }
    }
  }

  // 逻辑目标矩形 → 像素目标矩形（闭区间，与 SGL 一致）
  const px1 = Math.round(x * z);
  const py1 = Math.round(y * z);
  const px2 = Math.round((x + destW - 1) * z);
  const py2 = Math.round((y + destH - 1) * z);

  // 圆角参数（像素坐标，按 scale 缩放）
  const pr = Math.round(radius * z);
  const hasRadius = pr > 0;
  let cx1 = 0, cx2 = 0, cy1 = 0, cy2 = 0, r2 = 0, r2_max = 0, r2_fix_diff = 0;
  if (hasRadius) {
    cx1 = px1 + pr;
    cx2 = px2 - pr;
    cy1 = py1 + pr;
    cy2 = py2 - pr;
    r2 = pr * pr;
    r2_max = (pr + 1) * (pr + 1);
    const r2_diff = Math.max(r2_max - r2, 1);
    r2_fix_diff = Math.floor((255 << 15) / r2_diff);
  }

  // SGL 采样使用 15 位定点数运算（与 sgl_draw_fill_rect_pixmap 一致）：
  //   scale_x = (pixmap->width << 15) / rect_w
  //   step_x = (scale_x * (x - rect->x1)) >> 15
  const physRectW = px2 - px1 + 1;
  const physRectH = py2 - py1 + 1;
  const scale_x = Math.floor((srcW << 15) / physRectW);
  const scale_y = Math.floor((srcH << 15) / physRectH);

  for (let py = py1; py <= py2; py++) {
    const dy = py;
    if (dy < surf.clip.y1 || dy > surf.clip.y2) continue;
    const sy = (scale_y * (dy - py1)) >> 15;

    // 圆角 y 判断（确定该行是否在角带内）
    let cy_tmp = null;
    let dy2 = 0;
    if (hasRadius) {
      if (dy < cy1) { cy_tmp = cy1; dy2 = (dy - cy1) * (dy - cy1); }
      else if (dy > cy2) { cy_tmp = cy2; dy2 = (dy - cy2) * (dy - cy2); }
    }

    for (let px = px1; px <= px2; px++) {
      const dx = px;
      if (dx < surf.clip.x1 || dx > surf.clip.x2) continue;

      // 圆角判断：角带内的角段像素需要计算到圆心的距离
      let edgeAlpha = 255;
      if (hasRadius && cy_tmp !== null && (dx < cx1 || dx > cx2)) {
        const cx_tmp = dx < cx1 ? cx1 : cx2;
        const real_r2 = (dx - cx_tmp) * (dx - cx_tmp) + dy2;
        if (real_r2 >= r2_max) {
          if (dx > cx_tmp) break; // 早终止（圆外右侧）
          continue;               // 圆外左侧，跳过
        }
        if (real_r2 >= r2) {
          edgeAlpha = Math.floor(((r2_max - real_r2) * r2_fix_diff) >> 15);
        }
      }

      // SGL 定点采样 x
      const sx = (scale_x * (dx - px1)) >> 15;
      // SGL sgl_pixmap_get_buf 把 pixmap->bitmap.array 强转为 sgl_color_t* 索引，
      // 16 位色深下每个 sgl_color_t 占 2 字节，按 2 字节为单位跳读。
      // 对于非 2 字节格式，SGL 会跨像素读取产生错误颜色——这正是 SGL 的实际行为。
      // 对于 1 字节格式（RGB332/ARGB2222），图片下半部分会越界，画黑色近似。
      const colorTIdx = sy * srcW + sx;
      const byteOffset = colorTIdx * 2;
      let color16;
      if (byteOffset + 1 < pixmapBytes.length) {
        color16 = pixmapBytes[byteOffset] | (pixmapBytes[byteOffset + 1] << 8);
      } else if (byteOffset < pixmapBytes.length) {
        color16 = pixmapBytes[byteOffset];
      } else {
        color16 = 0;
      }

      // 从 RGB565 位域提取颜色（模拟 sgl_color16_t 位域读取）
      const red5 = (color16 >> 11) & 0x1F;
      const green6 = (color16 >> 5) & 0x3F;
      const blue5 = color16 & 0x1F;
      const r = (red5 << 3) | (red5 >> 2);
      const g = (green6 << 2) | (green6 >> 4);
      const b = (blue5 << 3) | (blue5 >> 2);

      // 用全局 alpha 混合（SGL: sgl_color_mixer(*pbuf, *blend, alpha)）
      // SGL 不使用 pixmap 自身的 alpha，只用全局 alpha 参数
      let finalAlpha = alpha;
      if (edgeAlpha < 255) finalAlpha = (finalAlpha * edgeAlpha) >> 8;
      blendPixelRGB565(surf, dx, dy, { r, g, b }, finalAlpha);
    }
  }
}

// ============================================================
// drawSprite - SGL sprite 专用渲染（严格移植自 sgl_sprite.c）
// SGL sprite 只支持 ARGB4444，不缩放（1:1 像素映射）
// 渲染算法：
//   1. 读取 ARGB4444 像素：tex_a = c >> 12, RGB444 = c & 0xFFF
//   2. 颜色转换 sgl_rgb444_to_color（RGB565 模式）：
//      blue = (c & 0xF) << 1, green = ((c>>4) & 0xF) << 2, red = ((c>>8) & 0xF) << 1
//   3. alpha 计算：eff_alpha = tex_a * 17（无 global_alpha）
//      或 eff_alpha = (tex_a * global_alpha * 17) >> 8（有 global_alpha）
//   4. 与现有帧缓冲像素混合 sgl_color_mixer（RGB565 优化算法）
// ============================================================

/**
 * RGB565 颜色混合（严格移植 sgl_core.h sgl_color_mixer RGB565 分支）
 * @param {number} fg565 - 前景 RGB565 值
 * @param {number} bg565 - 背景 RGB565 值
 * @param {number} factor - 混合系数 0-255
 * @returns {number} 混合后的 RGB565 值
 */
function colorMixerRGB565(fg565, bg565, factor) {
  // SGL: factor = (factor + 4) >> 3;  // 0-255 → 0-32
  factor = (factor + 4) >> 3;
  // SGL: bg = (bg | (bg << 16)) & 0x07E0F81F;
  let bg = ((bg565 | (bg565 << 16)) & 0x07E0F81F) >>> 0;
  let fg = ((fg565 | (fg565 << 16)) & 0x07E0F81F) >>> 0;
  // SGL: result = ((((fg - bg) * factor) >> 5) + bg) & 0x7E0F81F;
  let result = (((((fg - bg) * factor) >> 5) + bg) & 0x7E0F81F) >>> 0;
  // SGL: ret = (result >> 16) | result;
  return ((result >> 16) | result) & 0xFFFF;
}

/**
 * RGBA8888 转 RGB565（取高位）
 */
function rgba8888ToRGB565(r, g, b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

/**
 * RGB565 转 RGBA8888（扩展回 8 位）
 */
function rgb565ToRGBA8888(c565) {
  // 提取 5/6/5 位
  const r5 = (c565 >> 11) & 0x1F;
  const g6 = (c565 >> 5) & 0x3F;
  const b5 = c565 & 0x1F;
  // 扩展回 8 位（SGL 显示时硬件会做这个转换）
  return { r: (r5 << 3) | (r5 >> 2), g: (g6 << 2) | (g6 >> 4), b: (b5 << 3) | (b5 >> 2) };
}

/**
 * 将前景色按 SGL RGB565 优化算法混合到 surface 指定像素。
 * 项目色深为 16 位 RGB565，所有 pixmap/图标/sprite 的混合都必须走此路径
 * 才能与 SGL 仿真像素级一致。
 * @param {object} surf
 * @param {number} x, y - 像素坐标
 * @param {{r,g,b}} fg - 前景色（已量化到当前格式）
 * @param {number} alpha - 混合系数 0-255
 */
function blendPixelRGB565(surf, x, y, fg, alpha) {
  if (alpha <= 0) return;
  if (x < surf.clip.x1 || x > surf.clip.x2 || y < surf.clip.y1 || y > surf.clip.y2) return;
  const idx = y * surf.w + x;
  const existing = surf.buf32[idx];
  const bg_a = (existing >> 24) & 0xff;
  if (bg_a === 0) {
    // 背景透明：写入带 alpha 的前景颜色，让 canvas 与页面背景自然混合
    surf.buf32[idx] = (Math.min(255, alpha) << 24) | (fg.b << 16) | (fg.g << 8) | fg.r;
  } else {
    const bg565 = rgba8888ToRGB565(existing & 0xff, (existing >> 8) & 0xff, (existing >> 16) & 0xff);
    const fg565 = rgba8888ToRGB565(fg.r, fg.g, fg.b);
    const mixed565 = colorMixerRGB565(fg565, bg565, alpha);
    const mixed = rgb565ToRGBA8888(mixed565);
    surf.buf32[idx] = 0xff000000 | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
  }
}

/**
 * SGL blend_pixel 两步混合（RGB565 色深）
 * 模拟 SGL ext_img / icon 的 blend_pixel：
 *   if (pix_opa != 255) src = sgl_color_mixer(src, *dst, pix_opa);
 *   if (global_alpha != 255) *dst = sgl_color_mixer(src, *dst, global_alpha);
 * 由于 SGL sgl_color_mixer 的 factor 先量化到 0-32，两步混合和一步合并不等价，
 * 必须分两步执行才能与 SGL 像素级一致。
 * @param {object} surf
 * @param {number} x, y - 像素坐标
 * @param {{r,g,b}} fg - 前景色（已量化到 RGB565 等价值）
 * @param {number} pix_opa - 像素自身 alpha 0-255
 * @param {number} global_alpha - 全局 alpha 0-255
 */
function blendPixelRGB565TwoStep(surf, x, y, fg, pix_opa, global_alpha) {
  if (pix_opa <= 0 || global_alpha <= 0) return;
  if (x < surf.clip.x1 || x > surf.clip.x2 || y < surf.clip.y1 || y > surf.clip.y2) return;
  const idx = y * surf.w + x;
  const existing = surf.buf32[idx];
  const bg_a = (existing >> 24) & 0xff;

  // 前景色转 RGB565
  const fg565 = rgba8888ToRGB565(fg.r, fg.g, fg.b);

  if (bg_a === 0) {
    // 背景透明：简化为一步合并（SGL 帧缓冲不透明，此处为设计器特有逻辑）
    const effA = (pix_opa === 255) ? global_alpha
               : (global_alpha === 255) ? pix_opa
               : Math.round(pix_opa * global_alpha / 255);
    surf.buf32[idx] = (Math.min(255, effA) << 24) | (fg.b << 16) | (fg.g << 8) | fg.r;
    return;
  }

  // 背景不透明：严格两步混合
  const bg565 = rgba8888ToRGB565(existing & 0xff, (existing >> 8) & 0xff, (existing >> 16) & 0xff);

  // Step 1: if pix_opa != 255, src = mixer(fg, bg, pix_opa)
  let src565;
  if (pix_opa !== 255) {
    src565 = colorMixerRGB565(fg565, bg565, pix_opa);
  } else {
    src565 = fg565;
  }

  // Step 2: if global_alpha != 255, dst = mixer(src, bg, global_alpha)
  let result565;
  if (global_alpha !== 255) {
    result565 = colorMixerRGB565(src565, bg565, global_alpha);
  } else {
    result565 = src565;
  }

  const mixed = rgb565ToRGBA8888(result565);
  surf.buf32[idx] = 0xff000000 | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
}

/**
 * SGL sprite 专用渲染（严格移植自 sgl_sprite.c）
 * 不缩放，1:1 像素映射，与现有帧缓冲像素混合
 * @param {object} surf - createSurface 返回的表面
 * @param {ImageData} imgData - 图片像素数据（RGBA8888）
 * @param {number} alpha - 整体透明度 0-255 (global_alpha)
 */
// ============================================================
// drawImg - SGL img 控件渲染（移植自 sgl_img.c）
// img 控件支持全部12种pixmap格式（含RLE），使用decode_pixel按格式解码
// 1:1像素映射，无缩放
// ============================================================
function drawImg(surf, x, y, imgData, fmt, alpha) {
  if (!imgData || alpha <= 0) return;
  // img 控件不支持RLE压缩格式（rle_decompress_line需要状态机，设计器简化处理）
  // 对于RLE格式，设计器按基础格式解码显示（与SGL仿真不完全一致，但可预览）
  const baseFmt = (fmt || 'RGB565').replace(/^RLE_/, '').toUpperCase();
  const srcW = imgData.width;
  const srcH = imgData.height;
  const srcData = imgData.data;
  const z = surf.scale;

  const opaqueFormats = new Set(['RGB565', 'RGB332', 'RGB888']);
  const isOpaqueFmt = opaqueFormats.has(baseFmt);

  function decodePixel(r, g, b, a) {
    if (isOpaqueFmt) {
      r = Math.round(r * a / 255);
      g = Math.round(g * a / 255);
      b = Math.round(b * a / 255);
      a = 255;
    }
    let r5, g6, b5, alpha;
    switch (baseFmt) {
      case 'RGB332': {
        const v = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
        b5 = (v & 0x03) << 3;
        g6 = ((v >> 2) & 0x07) << 3;
        r5 = ((v >> 5) & 0x07) << 2;
        alpha = 255;
        break;
      }
      case 'ARGB2222': {
        const v = ((a >> 6) << 6) | ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        b5 = (v & 0x03) << 3;
        g6 = ((v >> 2) & 0x03) << 4;
        r5 = ((v >> 4) & 0x03) << 3;
        alpha = OPA2_TABLE[v >> 6];
        break;
      }
      case 'RGB565': {
        const v = (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
        b5 = v & 0x1F;
        g6 = (v >> 5) & 0x3F;
        r5 = (v >> 11) & 0x1F;
        alpha = 255;
        break;
      }
      case 'ARGB4444': {
        const v = (((a & 0xF0) << 8) | ((r & 0xF0) << 4) | (g & 0xF0) | (b >> 4));
        b5 = (v & 0xF) << 1;
        g6 = ((v >> 4) & 0xF) << 2;
        r5 = ((v >> 8) & 0xF) << 1;
        alpha = OPA4_TABLE[v >> 12];
        break;
      }
      case 'RGB888': {
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = 255;
        break;
      }
      case 'ARGB8888': {
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = a;
        break;
      }
      default:
        b5 = (b >> 3);
        g6 = (g >> 2);
        r5 = (r >> 3);
        alpha = 255;
    }
    return {
      r: (r5 << 3) | (r5 >> 2),
      g: (g6 << 2) | (g6 >> 4),
      b: (b5 << 3) | (b5 >> 2),
      a: alpha
    };
  }

  // img 控件1:1像素映射，无缩放
  const px1 = Math.round(x * z);
  const py1 = Math.round(y * z);
  const px2 = Math.round((x + srcW - 1) * z);
  const py2 = Math.round((y + srcH - 1) * z);

  for (let py = py1; py <= py2; py++) {
    if (py < surf.clip.y1 || py > surf.clip.y2) continue;
    const sy = Math.floor((py - py1) / z);
    if (sy < 0 || sy >= srcH) continue;

    for (let px = px1; px <= px2; px++) {
      if (px < surf.clip.x1 || px > surf.clip.x2) continue;
      const sx = Math.floor((px - px1) / z);
      if (sx < 0 || sx >= srcW) continue;

      const idx = (sy * srcW + sx) * 4;
      const q = decodePixel(srcData[idx], srcData[idx + 1], srcData[idx + 2], srcData[idx + 3]);
      const pixAlpha = isOpaqueFmt ? 255 : q.a;
      if (pixAlpha <= 0) continue;

      blendPixelRGB565TwoStep(surf, px, py, { r: q.r, g: q.g, b: q.b }, pixAlpha, alpha);
    }
  }
}

// ============================================================
// drawArcLabel - SGL arc_label 控件渲染（移植自 sgl_arc_label.c）
// 支持文本绘制 + 0-360度旋转
// ============================================================
function drawArcLabel(surf, x, y, w, h, text, textColor, bgColor, bgFlag, radius, align, fontSize, fontFamily, fontBpp, angle, offsetX, offsetY, alpha) {
  if (alpha <= 0 || !text) return;
  const z = surf.scale;

  // SGL sgl_arc_label_construct_cb：
  // 1. 若 bg_flag 为真，先用 sgl_draw_fill_rect 画背景圆角矩形
  if (bgFlag) {
    drawFillRect(surf, x, y, x + w - 1, y + h - 1, radius, hexToColor(bgColor), alpha);
  }

  // 2. 计算文本对齐位置
  // getTextPosRealtime(coords, text, fontSize, fontFamily, offset, align)
  // align: 0=CENTER,1=TOP_MID,2=TOP_LEFT,3=TOP_RIGHT,4=BOT_MID,5=BOT_LEFT,6=BOT_RIGHT,7=LEFT_MID,8=RIGHT_MID
  const alignMap = {
    'CENTER': 0, 'TOP_MID': 1, 'TOP_LEFT': 2, 'TOP_RIGHT': 3,
    'BOT_MID': 4, 'BOT_LEFT': 5, 'BOT_RIGHT': 6, 'LEFT_MID': 7, 'RIGHT_MID': 8
  };
  const alignIdx = alignMap[align] != null ? alignMap[align] : 0;
  const coords = { x1: x, y1: y, x2: x + w - 1, y2: y + h - 1 };
  const pos = getTextPosRealtime(coords, text, fontSize, fontFamily, 0, alignIdx);
  const drawX = pos.x + (offsetX || 0);
  const drawY = pos.y + (offsetY || 0);

  if (angle && angle !== 0) {
    // SGL 旋转模式（rota != 0）：
    // - 计算文本宽高，margin = text_height * 2
    // - 分配临时缓冲 buf_w * buf_h，用 bg_color 填充整个缓冲（不管 bg_flag）
    // - 在临时缓冲 (margin, margin) 处绘制文本
    // - 调用 sgl_draw_xform_surf 旋转绘制到主 surface
    const textW = measureTextWidth(text, fontSize, fontFamily);
    const textH = fontHeight(fontSize);
    const margin = textH * 2;
    const bufW = textW + margin * 2;
    const bufH = textH + margin * 2;

    // 创建临时canvas和surface
    const tempCanvas = document.createElement('canvas');
    const tempSurf = createSurface(tempCanvas, bufW, bufH, 1);
    // SGL: 总是用 bg_color 填充临时缓冲（旋转文本需要不透明背景）
    const bgC = hexToColor(bgColor);
    for (let i = 0; i < tempSurf.buf32.length; i++) {
      tempSurf.buf32[i] = 0xff000000 | (bgC.b << 16) | (bgC.g << 8) | bgC.r;
    }
    // 在临时surface上 (margin, margin) 处绘制文本
    // drawStringRealtime(surf, x, y, text, color, alpha, fontSize, fontFamily, bpp)
    drawStringRealtime(tempSurf, margin, margin, text, hexToColor(textColor), alpha, fontSize, fontFamily, fontBpp);
    flushSurface(tempSurf);

    // SGL: center_x = coords.x1 + (coords.x2 - coords.x1) / 2
    //      绘制位置 = (center_x - buf_w/2, center_y - buf_h/2)
    const centerX = Math.round((x + (w - 1) / 2) * z);
    const centerY = Math.round((y + (h - 1) / 2) * z);

    // 使用canvas的旋转变换（模拟 sgl_draw_xform_surf）
    const ctx = surf.ctx;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(tempCanvas, -Math.round(bufW / 2 * z), -Math.round(bufH / 2 * z), Math.round(bufW * z), Math.round(bufH * z));
    ctx.restore();
  } else {
    // SGL 无旋转模式（rota == 0）：
    // - 直接调用 sgl_draw_string 绘制，使用 offset 偏移
    drawStringRealtime(surf, drawX, drawY, text, hexToColor(textColor), alpha, fontSize, fontFamily, fontBpp);
  }
}

function drawSprite(surf, imgData, alpha) {
  if (!imgData || alpha <= 0) return;
  const srcW = imgData.width;
  const srcH = imgData.height;
  const srcData = imgData.data;

  // SGL sprite 不缩放：1:1 像素映射，图片左上角对齐控件左上角
  // clip 限制在 surf 范围内
  const x1 = Math.max(surf.clip.x1, 0);
  const y1 = Math.max(surf.clip.y1, 0);
  const x2 = Math.min(surf.clip.x2, srcW - 1, surf.w - 1);
  const y2 = Math.min(surf.clip.y2, srcH - 1, surf.h - 1);
  if (x1 > x2 || y1 > y2) return;

  const globalAlpha = alpha;

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const srcIdx = (y * srcW + x) * 4;
      const r8 = srcData[srcIdx];
      const g8 = srcData[srcIdx + 1];
      const b8 = srcData[srcIdx + 2];
      const a8 = srcData[srcIdx + 3];

      // 量化到 ARGB4444（SGL sprite 的 pixmap 格式）
      const tex_a = a8 >> 4;  // 0-15
      // 计算有效 alpha
      let eff_alpha;
      if (globalAlpha === 255) {
        eff_alpha = tex_a * 17;  // 0-255
      } else {
        eff_alpha = (tex_a * globalAlpha * 17) >> 8;
      }

      if (eff_alpha === 0) continue;  // SGL: if (eff_alpha) 才混合

      // RGB444 → RGB565（SGL sgl_rgb444_to_color RGB565 模式）
      const r4 = r8 >> 4;
      const g4 = g8 >> 4;
      const b4 = b8 >> 4;
      // SGL: blue = (c & 0xF) << 1, green = ((c>>4) & 0xF) << 2, red = ((c>>8) & 0xF) << 1
      const fg565 = ((r4 << 1) << 11) | ((g4 << 2) << 5) | (b4 << 1);

      // 获取 surf 现有像素（背景），量化到 RGB565
      const idx = y * surf.w + x;
      const existing = surf.buf32[idx];
      const bg_a = (existing >> 24) & 0xff;
      const bgR = existing & 0xff;
      const bgG = (existing >> 8) & 0xff;
      const bgB = (existing >> 16) & 0xff;
      const bg565 = rgba8888ToRGB565(bgR, bgG, bgB);

      // SGL RGB565 混合
      const mixed565 = colorMixerRGB565(fg565, bg565, eff_alpha);
      const mixed = rgb565ToRGBA8888(mixed565);

      // 写回 surf（保持背景的 alpha 通道：透明背景保持透明，不透明背景保持不透明）
      if (bg_a === 0) {
        // 背景透明：写入带 alpha 通道的颜色（让 canvas 与页面背景自然混合）
        surf.buf32[idx] = (Math.min(255, eff_alpha) << 24) | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
      } else {
        // 背景不透明：写入不透明像素
        surf.buf32[idx] = 0xff000000 | (mixed.b << 16) | (mixed.g << 8) | mixed.r;
      }
    }
  }
}

// ============================================================
// drawQrcode - SGL qrcode 渲染（严格移植自 sgl_qrcode.c）
// SGL qrcode 渲染算法：
//   1. 画背景矩形（radius = min(obj.radius, scale)）
//   2. 遍历 size×size 网格，对每个黑色模块画单元格矩形
//      坐标累加逻辑（严格照搬 SGL 源码）：
//        coords.y1 初始 = obj.y1，每行 y1 += scale
//        coords.x1 每行重置 = obj.x1 + zone，每列 x1 += scale
//      所以第一行从 obj.y1 + scale 开始，第一列从 obj.x1 + zone + scale 开始
//      单元格 radius = min(scale/2, cell_radius)
//   3. logo 区域（如有）
// ============================================================

/**
 * SGL qrcode 渲染（严格移植自 sgl_qrcode.c）
 * @param {object} surf - 绘制表面
 * @param {number} objX1 - 控件左上角 x（逻辑坐标）
 * @param {number} objY1 - 控件左上角 y（逻辑坐标）
 * @param {number} objW - 控件宽度
 * @param {number} objH - 控件高度
 * @param {object} opts - { qrSize, isDark, scale, zone, cellRadius, bgColor, cellColor, alpha, objRadius, ecc, logoImg, logoFormat }
 */
function drawQrcode(surf, objX1, objY1, objW, objH, opts) {
  const { qrSize, isDark, scale, zone, cellRadius, bgColor, cellColor, alpha, objRadius, ecc, logoImg, logoFormat } = opts;
  if (alpha <= 0 || scale <= 0) return;

  // 1. 画背景（SGL: radius = sgl_min(obj->radius, qrcode->scale)）
  const bgRadius = Math.min(objRadius || 0, scale);
  drawFillRect(surf, objX1, objY1, objX1 + objW - 1, objY1 + objH - 1, bgRadius, bgColor, alpha);

  // 2. 遍历 QR 模块网格，严格照搬 SGL 的坐标累加逻辑
  // SGL: coords.y1 初始 = obj->coords.y1，每行 coords.y1 += scale
  // SGL: coords.x1 每行重置 = obj->coords.x1 + zone，每列 coords.x1 += scale
  let coordsY1 = objY1;  // 初始值 = obj.y1
  const cellR = Math.min(Math.floor(scale / 2), cellRadius || 0);

  for (let y = 0; y < qrSize; y++) {
    coordsY1 += scale;  // SGL: coords.y1 += qrcode->scale
    const coordsY2 = coordsY1 + scale - 1;
    let coordsX1 = objX1 + zone;  // SGL: coords.x1 = obj->coords.x1 + qrcode->zone
    for (let x = 0; x < qrSize; x++) {
      coordsX1 += scale;  // SGL: coords.x1 += qrcode->scale
      const coordsX2 = coordsX1 + scale - 1;
      if (isDark(x, y)) {
        drawFillRect(surf, coordsX1, coordsY1, coordsX2, coordsY2, cellR, cellColor, alpha);
      }
    }
  }

  // 3. logo 绘制（严格移植自 sgl_qrcode.c:95-102 和 qrcode_get_pixmap_size）
  // SGL: if (qrcode->pixmap) { qrcode_get_pixmap_size(qrcode, &coords); ... sgl_draw_fill_rect_pixmap(...) }
  if (logoImg) {
    // 移植 qrcode_get_pixmap_size：根据 ecc 容错率计算 logo 可占面积
    // SGL 用 uint32_t 整数运算（截断除法），JS 必须用 Math.floor 模拟
    const total = qrSize * qrSize;
    let allow;
    switch (ecc) {
      case 0: allow = Math.floor(total * 7  / 100); break;
      case 1: allow = Math.floor(total * 15 / 100); break;
      case 2: allow = Math.floor(total * 25 / 100); break;
      case 3: allow = Math.floor(total * 30 / 100); break;
      default: allow = 0; break;
    }
    // safe zone, not fill the ecc all area
    allow = Math.floor(allow * 80 / 100);
    const modSize = sglSqrt(allow);
    // SGL: mod->y1 = scale * ((size - mod_size + 1) / 2 + zone)
    // 注意 SGL 用整数除法（向下取整）
    const modY1 = scale * (Math.floor((qrSize - modSize + 1) / 2) + zone);
    const modX1 = modY1 + 1;  // SGL: mod->x1 = mod->y1 + 1
    const modX2 = modX1 + modSize * scale - 1;
    const modY2 = modY1 + modSize * scale - 1;
    // 转为绝对坐标（SGL: coords.x1 += obj->coords.x1）
    const logoX1 = objX1 + modX1;
    const logoY1 = objY1 + modY1;
    const logoX2 = objX1 + modX2;
    const logoY2 = objY1 + modY2;
    // drawPixmap 接收逻辑坐标（内部乘 z 转像素），直接传入逻辑坐标避免双重缩放
    const logoW = logoX2 - logoX1 + 1;
    const logoH = logoY2 - logoY1 + 1;
    // logo 圆角 = min(objRadius, scale)（与背景相同，逻辑坐标）
    // SGL: sgl_draw_fill_rect_pixmap(surf, &obj->area, &coords, radius, pixmap, alpha)
    drawPixmap(surf, logoX1, logoY1, logoW, logoH, logoImg, logoFormat || 'RGB565', alpha, bgRadius);
  }
}

// ============================================================
// SGL chart 控件渲染（严格移植 sgl_piechart.c / sgl_linechart.c / sgl_barchart.c）
// ============================================================

// 解析 seriesData 为数值数组的数组
// 格式: "1,2,3,4,5; 2,3,4,5,6" → [[1,2,3,4,5], [2,3,4,5,6]]
function _chartParseSeriesData(w) {
  const sd = w.seriesData || '';
  if (!sd.trim()) return [];
  return sd.split(';').map(s => s.trim()).filter(s => s).map(s => {
    return s.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
  }).filter(arr => arr.length > 0);
}

// 格式化整数为字符串（移植 sgl_linechart_format_value）
function _chartFormatValue(value) {
  if (value === 0) return '0';
  let neg = value < 0;
  let v = Math.abs(value);
  let tmp = [];
  while (v && tmp.length < 16) {
    tmp.push(String.fromCharCode(48 + (v % 10)));
    v = Math.floor(v / 10);
  }
  let result = neg ? '-' : '';
  while (tmp.length > 0) result += tmp.pop();
  return result;
}

// 计算有效步长（移植 sgl_linechart_get_effective_step）
function _chartGetEffectiveStep(axis) {
  let range = axis.max - axis.min;
  if (range <= 0) return 1;
  if (axis.step > 0) return axis.step;
  let div = axis.auto_divisions || 4;
  let step = Math.floor(range / div);
  return step <= 0 ? 1 : step;
}

// 自动缩放轴（移植 sgl_linechart_update_axis_auto / sgl_barchart_update_axis_auto）
function _chartUpdateAxisAuto(seriesArr, xAxis, yAxis, autoScaleX, autoScaleY, isBarchart) {
  let dataMinX = Infinity, dataMaxX = -Infinity;
  let dataMinY = Infinity, dataMaxY = -Infinity;
  let maxPoints = 0;

  for (let i = 0; i < seriesArr.length; i++) {
    const s = seriesArr[i];
    if (s.length === 0) continue;
    if (s.length > maxPoints) maxPoints = s.length;
    for (let j = 0; j < s.length; j++) {
      const vy = s[j];
      if (vy < dataMinY) dataMinY = vy;
      if (vy > dataMaxY) dataMaxY = vy;
      if (!isBarchart) {
        const vx = j;
        if (vx < dataMinX) dataMinX = vx;
        if (vx > dataMaxX) dataMaxX = vx;
      }
    }
  }

  if (isBarchart) {
    if (autoScaleX) {
      xAxis.min = 0;
      xAxis.max = maxPoints > 0 ? maxPoints - 1 : 0;
    }
    if (!autoScaleY) return;
    if (dataMinY === Infinity) {
      yAxis.min = 0;
      yAxis.max = 10;
      return;
    }
    if (dataMinY > 0) dataMinY = 0;
    if (dataMaxY < 0) dataMaxY = 0;
    if (dataMinY === dataMaxY) {
      yAxis.min = dataMinY - 1;
      yAxis.max = dataMaxY + 1;
    } else {
      let range = dataMaxY - dataMinY;
      let margin = Math.floor(range / 10);
      if (margin <= 0) margin = 1;
      yAxis.min = dataMinY - (dataMinY < 0 ? margin : 0);
      yAxis.max = dataMaxY + margin;
    }
  } else {
    if (dataMinX === Infinity || dataMinY === Infinity) {
      if (autoScaleX) { xAxis.min = 0; xAxis.max = 10; }
      if (autoScaleY) { yAxis.min = 0; yAxis.max = 10; }
      return;
    }
    if (autoScaleX) {
      if (dataMinX === dataMaxX) {
        xAxis.min = dataMinX - 1;
        xAxis.max = dataMaxX + 1;
      } else {
        let range = dataMaxX - dataMinX;
        let margin = Math.floor(range / 10);
        if (margin <= 0) margin = 1;
        xAxis.min = dataMinX - margin;
        xAxis.max = dataMaxX + margin;
      }
    }
    if (autoScaleY) {
      if (dataMinY === dataMaxY) {
        yAxis.min = dataMinY - 1;
        yAxis.max = dataMaxY + 1;
      } else {
        let range = dataMaxY - dataMinY;
        let margin = Math.floor(range / 10);
        if (margin <= 0) margin = 1;
        yAxis.min = dataMinY - margin;
        yAxis.max = dataMaxY + margin;
      }
    }
  }
}

// 饼图渲染（移植 sgl_piechart_construct_cb）
function _drawPiechart(surf, w, R, opts, overlays) {
  const alpha = opts.alpha;
  const objX1 = 0, objY1 = 0, objX2 = w.width - 1, objY2 = w.height - 1;

  // 解析扇区数据
  const sliceValues = (w.sliceValues || '30;50;20').split(';').map(s => parseFloat(s.trim()) || 0);
  const sliceColors = (w.sliceColors || '#ff0000;#00ff00;#0000ff').split(';').map(s => s.trim());
  const sliceLabels = (w.sliceLabels || 'A;B;C').split(';').map(s => s.trim());
  const sliceAlphas = (w.sliceAlpha || '').split(';').map(s => {
    const v = parseInt(s.trim());
    return isNaN(v) ? 0 : v;
  });
  const sliceCount = w.sliceCount || sliceValues.length;

  // 计算总值（只累加正值）
  let totalValue = 0;
  for (let i = 0; i < sliceValues.length; i++) {
    if (sliceValues[i] > 0) totalValue += sliceValues[i];
  }
  if (totalValue <= 0) totalValue = 1;

  // 图例设置
  const legendEnable = w.legendEnable != null ? w.legendEnable : true;
  const legendPos = w.legendPos != null ? w.legendPos : 2;
  const legendDir = w.legendDir || 0;
  const legendTextColor = w.legendTextColor || '#e4e4e7';
  const legendAreaSize = w.legendAreaSize || 60;
  const legendAlpha = w.legendAlpha != null ? w.legendAlpha : 255;
  const legendBoxSize = w.legendBoxSize || 10;
  const legendPadding = w.legendPadding != null ? w.legendPadding : 4;
  const legendItemGap = w.legendItemGap != null ? w.legendItemGap : 4;
  const legendBg = w.legendBg || false;
  const legendBgColor = w.legendBgColor || '#000000';
  const legendBorderColor = w.legendBorderColor || '#000000';
  const fontSize = opts.fontSize;

  // 分割 pie_rect 和 legend_rect
  let pieRect = { x1: objX1, y1: objY1, x2: objX2, y2: objY2 };
  let legendRect = null;
  let legendHasArea = false;

  if (legendEnable && sliceCount > 0 && legendAlpha > 0 && legendPos > 0) {
    let width = objX2 - objX1 + 1;
    let height = objY2 - objY1 + 1;
    let legendSize = legendAreaSize || 60;

    switch (legendPos) {
      case 1: // LEFT
        if (legendSize >= width) legendSize = Math.floor(width / 3);
        legendRect = { x1: objX1, x2: objX1 + legendSize - 1, y1: objY1, y2: objY2 };
        pieRect.x1 = legendRect.x2 + 1;
        legendHasArea = true;
        break;
      case 2: // RIGHT
        if (legendSize >= width) legendSize = Math.floor(width / 3);
        legendRect = { x1: objX2 - legendSize + 1, x2: objX2, y1: objY1, y2: objY2 };
        pieRect.x2 = legendRect.x1 - 1;
        legendHasArea = true;
        break;
      case 3: // TOP
        if (legendSize >= height) legendSize = Math.floor(height / 3);
        legendRect = { x1: objX1, x2: objX2, y1: objY1, y2: objY1 + legendSize - 1 };
        pieRect.y1 = legendRect.y2 + 1;
        legendHasArea = true;
        break;
      case 4: // BOTTOM
        if (legendSize >= height) legendSize = Math.floor(height / 3);
        legendRect = { x1: objX1, x2: objX2, y1: objY2 - legendSize + 1, y2: objY2 };
        pieRect.y2 = legendRect.y1 - 1;
        legendHasArea = true;
        break;
    }
  }

  // 绘制扇区（SGL piechart 不画背景边框，只画扇区和图例）
  if (sliceCount > 0 && totalValue > 0) {
    let pieW = pieRect.x2 - pieRect.x1 + 1;
    let pieH = pieRect.y2 - pieRect.y1 + 1;
    let radius;

    if (w.radius && w.radius > 0) {
      radius = w.radius;
    } else {
      radius = Math.floor(Math.min(pieW, pieH) / 2);
    }

    if (radius > 0) {
      let cx = Math.floor((pieRect.x1 + pieRect.x2) / 2);
      let cy = Math.floor((pieRect.y1 + pieRect.y2) / 2);

      let radiusIn = Math.floor(radius * (w.innerRadiusRate || 0) / 100);
      if (radiusIn < 0) radiusIn = 0;
      if (radiusIn >= radius) radiusIn = radius - 1;

      let globalAlpha = alpha;
      if (globalAlpha === 0) globalAlpha = 255;

      let baseAngle = w.startAngle || 0;
      while (baseAngle < 0) baseAngle += 360;
      while (baseAngle >= 360) baseAngle -= 360;

      // 找最后一个正值扇区
      let lastPositive = -1;
      for (let i = 0; i < sliceValues.length; i++) {
        if (sliceValues[i] > 0) lastPositive = i;
      }

      let currentAngle = baseAngle;
      for (let i = 0; i < sliceValues.length; i++) {
        if (sliceValues[i] <= 0) continue;

        let endAngle;
        if (i === lastPositive) {
          endAngle = baseAngle + 360;
        } else {
          let delta = Math.floor(360 * sliceValues[i] / totalValue);
          if (delta <= 0) delta = 1;
          endAngle = currentAngle + delta;
        }

        if (endAngle > baseAngle + 360) endAngle = baseAngle + 360;

        let sliceAlpha = sliceAlphas[i] || 255;
        if (sliceAlpha === 0) sliceAlpha = 255;
        let mixAlpha = Math.floor(sliceAlpha * globalAlpha / 255);
        if (mixAlpha === 0) mixAlpha = sliceAlpha;

        const col = R.hexToColor(sliceColors[i] || sliceColors[0] || '#FFFFFF');
        // SGL_ARC_MODE_NORMAL=0, SGL_ARC_MODE_NORMAL_SMOOTH=2
        const mode = w.smooth ? 2 : 0;

        R.drawFillArc(surf, {
          cx, cy, radius_in: radiusIn, radius_out: radius,
          start_angle: currentAngle & 0x1FF, end_angle: endAngle & 0x1FF,
          mode: mode, color: col, bg_color: col, alpha: mixAlpha
        });

        currentAngle = endAngle;
      }
    }
  }

  // 绘制图例
  if (legendHasArea && legendRect) {
    const clip = legendRect;
    const rectW = clip.x2 - clip.x1 + 1;
    const rectH = clip.y2 - clip.y1 + 1;
    if (rectW > 0 && rectH > 0) {
      // 图例背景和边框
      if (legendBg) {
        R.drawFillRect(surf, clip.x1, clip.y1, clip.x2, clip.y2, 0, R.hexToColor(legendBgColor), legendAlpha);
        R.drawFillRectBorder(surf, clip.x1, clip.y1, clip.x2, clip.y2, 0, R.hexToColor(legendBorderColor), 1, legendAlpha);
      }

      const boxSize = legendBoxSize || 10;
      const padding = legendPadding;
      const gap = legendItemGap;
      const fontH = fontSize;

      if (legendDir === 0) {
        // 垂直布局
        let y = clip.y1 + padding;
        for (let i = 0; i < sliceValues.length; i++) {
          const boxX1 = clip.x1 + padding;
          const boxY1 = y;
          const col = R.hexToColor(sliceColors[i] || sliceColors[0] || '#FFFFFF');
          R.drawFillRect(surf, boxX1, boxY1, boxX1 + boxSize - 1, boxY1 + boxSize - 1, 0, col, legendAlpha);

          if (sliceLabels[i]) {
            const textX = clip.x1 + padding + boxSize + 4;
            let textY = y + Math.floor((boxSize - fontH) / 2);
            if (textY < clip.y1) textY = clip.y1;
            overlays.push({
              text: sliceLabels[i], color: legendTextColor,
              fontSize: fontSize, fontFamily: opts.fontFamily,
              x: textX, y: textY
            });
          }

          let step = boxSize;
          if (fontH > boxSize) step = fontH;
          y += step + gap;
          if (y > clip.y2) break;
        }
      } else {
        // 水平布局
        let contentW = rectW - padding * 2;
        if (contentW > 0) {
          let visibleCnt = sliceValues.length || 1;
          let itemW = Math.floor(contentW / visibleCnt);
          if (itemW < boxSize + 4) itemW = boxSize + 4;

          for (let i = 0; i < sliceValues.length; i++) {
            let baseX = clip.x1 + padding + i * itemW;
            let boxY1 = clip.y1 + padding;
            const col = R.hexToColor(sliceColors[i] || sliceColors[0] || '#FFFFFF');
            R.drawFillRect(surf, baseX, boxY1, baseX + boxSize - 1, boxY1 + boxSize - 1, 0, col, legendAlpha);

            if (sliceLabels[i]) {
              const textX = baseX + boxSize + 4;
              let textY = boxY1 + Math.floor((boxSize - fontH) / 2);
              if (textY < clip.y1) textY = clip.y1;
              overlays.push({
                text: sliceLabels[i], color: legendTextColor,
                fontSize: fontSize, fontFamily: opts.fontFamily,
                x: textX, y: textY
              });
            }
          }
        }
      }
    }
  }
}

// 折线图/柱状图网格和标签绘制（移植 sgl_linechart_draw_grid_and_labels / sgl_barchart_draw_grid_and_labels）
function _drawChartGridAndLabels(surf, w, R, opts, overlays, plotRect, fullRect, xAxis, yAxis, baseAlpha, isBarchart) {
  const objX1 = fullRect.x1, objX2 = fullRect.x2;
  const plotW = plotRect.x2 - plotRect.x1;
  const plotH = plotRect.y2 - plotRect.y1;
  if (plotW <= 0 || plotH <= 0) return;

  let xRange = xAxis.max - xAxis.min;
  let yRange = yAxis.max - yAxis.min;
  if (xRange <= 0) xRange = 1;
  if (yRange <= 0) yRange = 1;

  const showLabels = w.showYLabels !== undefined && w.showYLabels !== null ? w.showYLabels : true;
  const gridColor = R.hexToColor(w.gridColor || '#3C3C3C');
  const gridDashed = w.gridDashed != null ? w.gridDashed : true;
  const gridAlpha = 80;
  const textColor = w.textColor || '#000000';
  const fontSize = opts.fontSize;
  const fontHeight = opts.fontHeight || opts.fontSize;
  const xLabels = (w.xLabels || '').split(';').map(s => s.trim()).filter(s => s);
  const MAX_TICKS = 8;

  let mixGridAlpha = Math.floor(gridAlpha * baseAlpha / 255);
  if (mixGridAlpha === 0 && gridAlpha) mixGridAlpha = gridAlpha;

  // Y轴：水平网格线和标签
  {
    let step = _chartGetEffectiveStep(yAxis);
    let v = yAxis.min;
    let tickIdx = 0;
    const labelAreaX2 = plotRect.x1 - 2;

    while (tickIdx < MAX_TICKS && v <= yAxis.max) {
      let y = plotRect.y2 - Math.floor((v - yAxis.min) * plotH / yRange);

      if (gridDashed) {
        R.drawDashedLine(surf, plotRect.x1, y, plotRect.x2, y, 6, 4, gridColor, mixGridAlpha);
      } else {
        R.drawHLine(surf, plotRect.x1, plotRect.x2, y, 1, gridColor, mixGridAlpha);
      }

      if (showLabels && opts.hasFont && labelAreaX2 > objX1 + 2) {
        let textY = y - Math.floor(fontHeight / 2);
        if (textY < plotRect.y1) textY = plotRect.y1;
        if (textY > plotRect.y2 - fontHeight) textY = plotRect.y2 - fontHeight;
        overlays.push({
          text: _chartFormatValue(v), color: textColor,
          fontSize: fontSize, fontFamily: opts.fontFamily,
          x: objX1 + 2, y: textY
        });
      }

      tickIdx++;
      v += step;
    }
  }

  // X轴：垂直网格线和标签
  {
    let step = _chartGetEffectiveStep(xAxis);
    let v = xAxis.min;
    let tickIdx = 0;
    const labelY = plotRect.y2 + 2;

    while (tickIdx < MAX_TICKS && v <= xAxis.max) {
      let x = plotRect.x1 + Math.floor((v - xAxis.min) * plotW / xRange);

      if (gridDashed) {
        R.drawDashedLine(surf, x, plotRect.y1, x, plotRect.y2, 6, 4, gridColor, mixGridAlpha);
      } else {
        R.drawVLine(surf, x, plotRect.y1, plotRect.y2, 1, gridColor, mixGridAlpha);
      }

      if (showLabels && opts.hasFont) {
        let labelStr;
        if (xLabels.length > 0 && tickIdx < xLabels.length) {
          labelStr = xLabels[tickIdx];
        } else {
          labelStr = _chartFormatValue(v);
        }
        const textW = R.estimateTextWidth(labelStr, fontSize);
        let textX = x - Math.floor(textW / 2);
        if (textX < plotRect.x1) textX = plotRect.x1;
        if (textX > objX2 - textW) textX = objX2 - textW;
        overlays.push({
          text: labelStr, color: textColor,
          fontSize: fontSize, fontFamily: opts.fontFamily,
          x: textX, y: labelY
        });
      }

      tickIdx++;
      v += step;
    }
  }
}

// 折线图渲染（移植 sgl_linechart_construct_cb）
function _drawLinechart(surf, w, R, opts, overlays) {
  // ============================================================
  // 严格移植自 sgl_linechart.c: sgl_linechart_construct_cb
  // 变量名、顺序、计算方式与 SGL 源码完全一致
  // ============================================================

  const alpha = opts.alpha;
  const chart_alpha = alpha ? alpha : 255;
  const obj_coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
  const obj_area = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };

  // full_rect = obj->coords, selfclip to obj->area
  let full_rect = { x1: obj_coords.x1, y1: obj_coords.y1, x2: obj_coords.x2, y2: obj_coords.y2 };
  if (full_rect.x1 < obj_area.x1) full_rect.x1 = obj_area.x1;
  if (full_rect.y1 < obj_area.y1) full_rect.y1 = obj_area.y1;
  if (full_rect.x2 > obj_area.x2) full_rect.x2 = obj_area.x2;
  if (full_rect.y2 > obj_area.y2) full_rect.y2 = obj_area.y2;
  if (full_rect.x1 >= full_rect.x2 || full_rect.y1 >= full_rect.y2) return;

  // Draw background and border
  const bg_alpha = w.bgAlpha != null ? w.bgAlpha : 255;
  const obj_border = w.borderWidth != null ? w.borderWidth : 2;
  const bg_color = R.hexToColor(w.bgColor || '#000000');
  const obj_radius = w.radius || 0;
  const border_color = R.hexToColor(w.borderColor || '#000000');
  const obj_focus = 0;

  R.drawRect(surf, obj_area.x1, obj_area.y1, obj_area.x2, obj_area.y2, {
    alpha: bg_alpha,
    border: obj_border,
    color: bg_color,
    radius: obj_radius,
    border_color: border_color,
    border_mask: obj_focus,
    border_alpha: 255,
    pixmap: null
  });

  // Layout: reserve space for axis labels, or use custom plot area
  // x_font = chart->x_axis.label_font ? chart->x_axis.label_font : sgl_get_system_font()
  // y_font = chart->y_axis.label_font ? chart->y_axis.label_font : sgl_get_system_font()
  // sgl_system.font = NULL，所以无自定义字体时 x_font/y_font = NULL
  const x_font = opts.hasFont ? { font_height: opts.fontHeight || opts.fontSize || 14 } : null;
  const y_font = opts.hasFont ? { font_height: opts.fontHeight || opts.fontSize || 14 } : null;

  const x_axis_show_labels = w.showYLabels !== undefined && w.showYLabels !== null ? w.showYLabels : true;
  const y_axis_show_labels = w.showYLabels !== undefined && w.showYLabels !== null ? w.showYLabels : true;

  let plot_rect;

  // custom_plot_rect 默认为 false，走 auto 布局
  let custom_plot_rect = false;

  if (custom_plot_rect) {
    // User-defined plot area (relative to widget top-left)
    // 暂未实现
  } else {
    let top_margin    = 4;
    let right_margin  = 4;
    let bottom_margin = 4;
    let left_margin   = 4;

    if (x_axis_show_labels && x_font) {
      bottom_margin += x_font.font_height + 4;
    }
    if (y_axis_show_labels && y_font) {
      left_margin += 40; /* fixed width area for Y labels */
    }

    plot_rect = {
      x1: full_rect.x1 + left_margin,
      y1: full_rect.y1 + top_margin,
      x2: full_rect.x2 - right_margin,
      y2: full_rect.y2 - bottom_margin
    };
  }

  if (plot_rect.x1 >= plot_rect.x2 || plot_rect.y1 >= plot_rect.y2) return;

  // 解析序列数据
  const seriesArr = _chartParseSeriesData(w);
  const seriesColors = (w.seriesColors || '#FFFFFF').split(';').map(s => s.trim());
  const seriesLineAlpha = (w.seriesLineAlpha || '').split(';').map(s => {
    const v = parseInt(s.trim());
    return isNaN(v) ? 0 : v;
  });
  const seriesLineWidth = (w.seriesLineWidth || '').split(';').map(s => {
    const v = parseInt(s.trim());
    return isNaN(v) ? 0 : v;
  });

  // 轴配置
  const autoScale = w.autoScale !== undefined && w.autoScale !== null ? w.autoScale : true;

  let xAxis = { min: 0, max: 100, step: 0, auto_divisions: 4, show_labels: x_axis_show_labels, label_font: x_font };
  let yAxis = { min: w.minValue || 0, max: w.maxValue || 100, step: 0, auto_divisions: 4, show_labels: y_axis_show_labels, label_font: y_font };

  _chartUpdateAxisAuto(seriesArr, xAxis, yAxis, autoScale, autoScale, false);

  const base_alpha = chart_alpha;

  // plot_clip = plot_rect (无开屏动画)
  const plot_clip = { x1: plot_rect.x1, y1: plot_rect.y1, x2: plot_rect.x2, y2: plot_rect.y2 };

  // 绘制网格和标签
  _drawChartGridAndLabels(surf, w, R, opts, overlays, plot_rect, full_rect, xAxis, yAxis, base_alpha, false);

  // 绘制序列：sgl_linechart_draw_series
  let plot_w = plot_rect.x2 - plot_rect.x1;
  let plot_h = plot_rect.y2 - plot_rect.y1;
  if (plot_w <= 0 || plot_h <= 0) return;

  let x_range = xAxis.max - xAxis.min;
  let y_range = yAxis.max - yAxis.min;
  if (x_range <= 0) x_range = 1;
  if (y_range <= 0) y_range = 1;

  // pad_x = max(point_radius)，SGL默认 show_points=1, point_radius=3
  let pad_x = 0;
  for (let si = 0; si < seriesArr.length; si++) {
    const show_points = true; // 默认开启
    const point_radius = 3;   // 默认 3
    if (show_points && point_radius > pad_x) {
      pad_x = point_radius;
    }
  }

  let plot_x1 = plot_rect.x1;
  let plot_x2 = plot_rect.x2;
  if (pad_x > 0 && (plot_w > (pad_x * 2))) {
    plot_x1 = plot_x1 + pad_x;
    plot_x2 = plot_x2 - pad_x;
    plot_w  = plot_x2 - plot_x1;
  }

  const baseline_y = plot_rect.y2; /* baseline at axis minimum */

  for (let si = 0; si < seriesArr.length; si++) {
    const vals = seriesArr[si];
    const point_count = vals.length;
    if (point_count === 0) continue;

    const line_color = R.hexToColor(seriesColors[si] || seriesColors[0] || '#FFFFFF');
    let line_alpha = seriesLineAlpha[si] || 255;
    if (line_alpha === 0) line_alpha = 255;
    let mix = Math.floor(line_alpha * base_alpha / 255);
    if (mix === 0) mix = line_alpha;
    const eff_line_alpha = mix;

    const fill_alpha = 0; // 默认 fill_under 关闭
    const line_width = seriesLineWidth[si] || 2;
    const show_line = true;
    const show_points = true;
    const point_radius = 3;
    const point_shape = 0; // SGL_LINECHART_POINT_SHAPE_CIRCLE

    let prev_x = 0, prev_y = 0;
    let prev_valid = false;

    for (let i = 0; i < point_count; i++) {
      let vx = i; // x_data = NULL 时用索引
      let vy = vals[i];

      // clamp to axis range to avoid overflow
      if (vx < xAxis.min) vx = xAxis.min;
      if (vx > xAxis.max) vx = xAxis.max;
      if (vy < yAxis.min) vy = yAxis.min;
      if (vy > yAxis.max) vy = yAxis.max;

      let x = plot_x1 + Math.floor((vx - xAxis.min) * plot_w / x_range);
      let y = plot_rect.y2 - Math.floor((vy - yAxis.min) * plot_h / y_range);

      if (prev_valid) {
        if (show_line) {
          // SGL line_width 映射: 1→4, 2→8, n→n*4
          let effWidth;
          if (line_width <= 1) effWidth = 4;
          else if (line_width === 2) effWidth = 8;
          else effWidth = Math.min(255, line_width * 4);

          R.drawLine(surf, prev_x, prev_y, x, y, effWidth, line_color, eff_line_alpha);
        }
      }

      if (show_points) {
        R.drawFillCircle(surf, x, y, point_radius, line_color, eff_line_alpha);
      }

      prev_x = x;
      prev_y = y;
      prev_valid = true;
    }
  }
}

// 柱状图渲染（移植 sgl_barchart_construct_cb）
function _drawBarchart(surf, w, R, opts, overlays) {
  const alpha = opts.alpha;
  const objX1 = 0, objY1 = 0, objX2 = w.width - 1, objY2 = w.height - 1;
  const fullRect = { x1: objX1, y1: objY1, x2: objX2, y2: objY2 };

  const bgColor = R.hexToColor(w.bgColor || '#000000');
  const bgAlpha = w.bgAlpha != null ? w.bgAlpha : 255;
  const borderColor = R.hexToColor(w.borderColor || '#000000');
  const borderWidth = w.borderWidth != null ? w.borderWidth : 2;
  const radius = w.radius || 0;

  // 1. 绘制背景 + 边框
  R.drawRect(surf, objX1, objY1, objX2, objY2, {
    alpha: bgAlpha, border: borderWidth, border_alpha: alpha, border_mask: 0,
    color: bgColor, radius: radius, border_color: borderColor
  });

  // 2. 解析序列数据
  const seriesArr = _chartParseSeriesData(w);
  const seriesColors = (w.seriesColors || '#FFFFFF').split(';').map(s => s.trim());

  // 3. 轴配置
  const showLabels = w.showYLabels !== undefined && w.showYLabels !== null ? w.showYLabels : true;
  const autoScale = w.autoScale !== undefined && w.autoScale !== null ? w.autoScale : true;
  const orientation = w.orientation || 0;
  const barGap = w.barSpacing != null ? w.barSpacing : 4;
  const categoryGap = 10;

  let xAxis = { min: 0, max: 5, step: 1, auto_divisions: 4 };
  let yAxis = { min: 0, max: 100, step: 0, auto_divisions: 4 };

  _chartUpdateAxisAuto(seriesArr, xAxis, yAxis, false, autoScale, true);

  // 4. 计算 plot_rect（barchart使用layout margins）
  // SGL: x_font = label_font ? label_font : sgl_get_system_font()
  // 仿真器中 sgl_system.font = NULL，所以无自定义字体时 x_font = NULL
  // show_labels && x_font 为 false，bottom 保持 layout_bottom_margin(24)
  const chartFontHeightB = opts.fontHeight || opts.fontSize;
  let bottomMargin = 24;
  if (showLabels && opts.hasFont) {
    let fontH = chartFontHeightB + 4;
    if (bottomMargin < fontH) bottomMargin = fontH;
  }

  let plotRect = {
    x1: fullRect.x1 + 44,
    y1: fullRect.y1 + 4,
    x2: fullRect.x2 - 4,
    y2: fullRect.y2 - bottomMargin
  };

  if (plotRect.x1 < fullRect.x1) plotRect.x1 = fullRect.x1;
  if (plotRect.y1 < fullRect.y1) plotRect.y1 = fullRect.y1;
  if (plotRect.x2 > fullRect.x2) plotRect.x2 = fullRect.x2;
  if (plotRect.y2 > fullRect.y2) plotRect.y2 = fullRect.y2;

  if (plotRect.x1 >= plotRect.x2 || plotRect.y1 >= plotRect.y2) return;

  let baseAlpha = alpha ? alpha : 255;

  // 5. 绘制网格和标签
  _drawChartGridAndLabels(surf, w, R, opts, overlays, plotRect, fullRect, xAxis, yAxis, baseAlpha, true);

  // 6. 绘制柱条
  let plotW = plotRect.x2 - plotRect.x1 + 1;
  let plotH = plotRect.y2 - plotRect.y1 + 1;
  let xRange = xAxis.max - xAxis.min;
  let yRange = yAxis.max - yAxis.min;

  let pointCount = 0;
  for (let i = 0; i < seriesArr.length; i++) {
    if (seriesArr[i].length > pointCount) pointCount = seriesArr[i].length;
  }
  if (pointCount === 0) return;

  let categoryW = Math.floor(plotW / pointCount);
  if (categoryW <= 0) return;
  let usableW = categoryW - categoryGap;
  if (usableW < seriesArr.length) usableW = seriesArr.length;
  let barW = usableW;
  if (seriesArr.length > 0) {
    barW = Math.floor((usableW - (seriesArr.length - 1) * barGap) / seriesArr.length);
  }
  if (barW < 1) barW = 1;

  for (let point = 0; point < pointCount; point++) {
    for (let si = 0; si < seriesArr.length; si++) {
      if (point >= seriesArr[si].length) continue;

      const col = R.hexToColor(seriesColors[si] || seriesColors[0] || '#FFFFFF');
      let sAlpha = 255;
      let mixAlpha = Math.floor(sAlpha * baseAlpha / 255);
      if (mixAlpha === 0) mixAlpha = sAlpha;

      let value = seriesArr[si][point];

      if (orientation === 1) {
        // HORIZONTAL
        if (xRange <= 0) continue;
        let baselineValue = Math.max(xAxis.min, Math.min(xAxis.max, 0));
        value = Math.max(xAxis.min, Math.min(xAxis.max, value));

        let catY1 = plotRect.y1 + point * categoryW + Math.floor(categoryGap / 2);
        let y1 = catY1 + si * (barW + barGap);
        let y2 = y1 + barW - 1;
        let baselineX = plotRect.x1 + Math.floor((baselineValue - xAxis.min) * plotW / xRange);
        let valueX = plotRect.x1 + Math.floor((value - xAxis.min) * plotW / xRange);

        let bx1 = Math.min(valueX, baselineX);
        let bx2 = Math.max(valueX, baselineX);
        R.drawFillRect(surf, bx1, y1, bx2, y2, 0, col, mixAlpha);
      } else {
        // VERTICAL
        if (yRange <= 0) continue;
        let baselineValue = Math.max(yAxis.min, Math.min(yAxis.max, 0));
        value = Math.max(yAxis.min, Math.min(yAxis.max, value));

        let catX1 = plotRect.x1 + point * categoryW + Math.floor(categoryGap / 2);
        let x1 = catX1 + si * (barW + barGap);
        let x2 = x1 + barW - 1;
        let baselineY = plotRect.y2 - Math.floor((baselineValue - yAxis.min) * plotH / yRange);
        let valueY = plotRect.y2 - Math.floor((value - yAxis.min) * plotH / yRange);

        let by1 = Math.min(valueY, baselineY);
        let by2 = Math.max(valueY, baselineY);
        R.drawFillRect(surf, x1, by1, x2, by2, 0, col, mixAlpha);
      }
    }
  }
}

// chart 控件渲染入口（严格移植 SGL 算法）
// opts: { alpha, fontSize, fontFamily, hasFont }
// 返回 overlays 数组: [{ text, color, fontSize, fontFamily, x, y }]
function drawChart(surf, w, R, opts) {
  const overlays = [];
  const chartType = w.chartType || 'linechart';

  if (chartType === 'piechart') {
    _drawPiechart(surf, w, R, opts, overlays);
  } else if (chartType === 'barchart') {
    _drawBarchart(surf, w, R, opts, overlays);
  } else {
    _drawLinechart(surf, w, R, opts, overlays);
  }

  return overlays;
}

// ============================================================
// 字体辅助（近似 SGL 字模）
// ============================================================
function fontHeight(fontSize) {
  return fontSize || 12;
}

function stringWidth(text, fontSize) {
  return estimateTextWidth(text, fontSize);
}

// ============================================================
// sgl_get_align_pos - 对齐位置计算
// 移植自 sgl_core.c
// type: 0=CENTER,1=TOP_MID,2=TOP_LEFT,3=TOP_RIGHT,
//       4=BOT_MID,5=BOT_LEFT,6=BOT_RIGHT,7=LEFT_MID,8=RIGHT_MID
// ============================================================
function getAlignPos(parentW, parentH, textW, textH, type) {
  let x = 0, y = 0;
  switch (type) {
    case 0: x = (parentW - textW) / 2; y = (parentH - textH) / 2; break;
    case 1: x = (parentW - textW) / 2; y = 0; break;
    case 2: x = 0; y = 0; break;
    case 3: x = parentW - textW; y = 0; break;
    case 4: x = (parentW - textW) / 2; y = parentH - textH; break;
    case 5: x = 0; y = parentH - textH; break;
    case 6: x = parentW - textW; y = parentH - textH; break;
    case 7: x = 0; y = (parentH - textH) / 2; break;
    case 8: x = parentW - textW; y = (parentH - textH) / 2; break;
  }
  return { x, y };
}

// ============================================================
// 导出 API
// ============================================================

const SGLRenderer = {
  // 颜色
  hexToColor,
  colorToHex,
  colorMixer,
  sglRgb,
  // Surface
  createSurface,
  flushSurface,
  // 基础绘制
  drawFillRect,
  drawFillRectBorder,
  drawFillRichRect,
  drawFillRectBorderRich,
  drawRect,
  drawFillCircle,
  drawFillCircleBorder,
  drawCircle,
  drawFillRing,
  drawFillArc,
  drawHLine,
  drawVLine,
  drawLine,
  drawLineSlanted,
  // SGL 定点三角函数（移植自 sgl_math）
  sglSin,
  sglCos,
  sglMod360,
  SGL_SIN_FIXED_ONE,
  sglSqrt,
  drawString,
  drawStringMultiLine,
  draw2dBall,
  drawLed,
  drawFillPolygon,
  drawPolygonBorder,
  // 文本辅助
  getTextPos,
  estimateTextWidth,
  fontHeight,
  stringWidth,
  getAlignPos,
  // 实时字模渲染（Canvas 光栅化 + bpp 量化 + SGL 混合）
  measureTextWidth,
  getTextPosRealtime,
  drawStringRealtime,
  // SGL 字模位图渲染（移植自 sgl_draw_text.c，可选）
  parseFontCFile,
  registerFontData,
  getFontData,
  fontDataKey,
  searchUnicodeChIndex,
  fontGetStringWidth,
  fontGetHeight,
  drawCharacter,
  drawStringSGL,
  getTextPosSGL,
  // 线框/图标/虚线
  drawWireframe,
  drawIcon,
  drawDashedLine,
  // 位图绘制（按 pixmapFormat 量化）
  drawPixmap,
  // SGL ext_img 专用渲染（严格移植 sgl_img_ext_construct_cb）
  drawExtImg,
  // SGL img 控件渲染（移植自 sgl_img.c，支持全部12种格式）
  drawImg,
  // SGL arc_label 控件渲染（移植自 sgl_arc_label.c，支持旋转文本）
  drawArcLabel,
  // SGL sprite 专用渲染（严格移植 sgl_sprite.c，不缩放，RGB565 混合）
  drawSprite,
  // SGL qrcode 渲染（严格移植 sgl_qrcode.c）
  drawQrcode,
  // SGL chart 渲染（严格移植 sgl_piechart.c / sgl_linechart.c / sgl_barchart.c）
  drawChart,
  DROPDOWN_ICON,
  CHECKBOX_UNCHECKED_ICON,
  CHECKBOX_CHECKED_ICON,
  NUMBERKBD_ENTER_ICON,
  NUMBERKBD_BACKSPACE_ICON,
  KEYBOARD_BACKSPACE_ICON,
  KEYBOARD_ENTER_ICON,
  KEYBOARD_KEYBD_ICON,
  KEYBOARD_NEWLINE_ICON,
  KEYBOARD_LEFT_ICON,
  KEYBOARD_RIGHT_ICON,
  // keyboard 数据表和辅助函数
  KEYBD_BTN_MAP,
  KEYBD_BTN_WIDTH,
  KEYBOARD_BTN_COUNT,
  KEYBD_BTN_HEIGHT,
  KEYBOARD_ICON_META,
  keyindexIsIcon,
  drawKeyboardIcon,
  // 布局
  splitLen,
  // 像素
  setPixel,
  getPixel,
  // 裁剪
  areaClip,
  // 主题常量
  SGL_THEME_COLOR,
  SGL_THEME_BG_COLOR,
  SGL_THEME_BORDER_COLOR,
  SGL_THEME_TEXT_COLOR,
  SGL_THEME_BORDER_WIDTH,
  SGL_THEME_ALPHA,
  SGL_THEME_RADIUS,
  SGL_COLOR_RED,
  SGL_COLOR_WHITE,
  SGL_COLOR_BLACK,
  // 常量
  SGL_ALPHA_MAX,
  SGL_ALPHA_MIN,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SGLRenderer;
}
if (typeof window !== 'undefined') {
  window.SGLRenderer = SGLRenderer;
}
