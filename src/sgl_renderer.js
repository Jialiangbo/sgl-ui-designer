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
  const cw = Math.max(1, Math.ceil(w * scale));
  const ch = Math.max(1, Math.ceil(h * scale));
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

  // 先画填充（内部矩形缩进 border）
  if (desc.alpha > 0) {
    const fillRadius = Math.max(Math.round((desc.radius || 0) * z) - pb, 0);
    drawFillRect(surf, x1 + (desc.border || 0), y1 + (desc.border || 0),
                 x2 - (desc.border || 0), y2 - (desc.border || 0),
                 fillRadius / z, desc.color, desc.alpha);
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
  const px1 = Math.round(x1 * z);
  const py1 = Math.round(y1 * z);
  const px2 = Math.round(x2 * z);
  const py2 = Math.round(y2 * z);
  const pw = Math.round(width * z);

  if (px1 === px2) { drawVLine(surf, x1, y1, y2, width, color, alpha); return; }
  if (py1 === py2) { drawHLine(surf, x1, x2, y1, width, color, alpha); return; }

  const bax = px2 - px1;
  const bay = py2 - py1;
  const b_sqd = bax * bax + bay * bay;
  const inv_len = Math.floor((65536 + Math.sqrt(b_sqd) / 2) / Math.sqrt(b_sqd));
  const inner_limit = (pw - 1) << 8;
  const outer_limit = pw << 8;
  const aa_range = outer_limit - inner_limit;
  const cap_r = pw + 1;
  const cap_r2 = cap_r * cap_r;

  // 包围盒
  const minX = Math.max(surf.clip.x1, Math.min(px1, px2) - cap_r);
  const maxX = Math.min(surf.clip.x2, Math.max(px1, px2) + cap_r);
  const minY = Math.max(surf.clip.y1, Math.min(py1, py2) - cap_r);
  const maxY = Math.min(surf.clip.y2, Math.max(py1, py2) + cap_r);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const ddx = x - px1;
      const ddy = y - py1;
      const dot = ddx * bax + ddy * bay;
      const cross = ddx * bay - ddy * bax;

      let dist_q8;
      if (dot >= 0 && dot <= b_sqd) {
        dist_q8 = Math.floor(Math.abs(cross) * inv_len / 256);
      } else {
        // 端点外
        if (dot < 0) {
          dist_q8 = Math.floor(Math.sqrt(ddx * ddx + ddy * ddy) * inv_len / 256);
        } else {
          const ex = x - px2;
          const ey = y - py2;
          dist_q8 = Math.floor(Math.sqrt(ex * ex + ey * ey) * inv_len / 256);
        }
      }

      if (dist_q8 < inner_limit) {
        setPixel(surf, x, y, color, alpha);
      } else if (dist_q8 < outer_limit) {
        const aa = Math.floor((outer_limit - dist_q8) * 255 / aa_range);
        const mixed = colorMixer(color, getPixel(surf, x, y), aa);
        setPixel(surf, x, y, colorMixer(mixed, getPixel(surf, x, y), alpha), 255);
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
  const bitmapMatch = content.match(/uint8_t\s+\w+_bitmap\[\]\s*=\s*\{([\s\S]*?)\}/);
  if (!bitmapMatch) throw new Error('解析字模失败: 未找到 bitmap 数组');
  const bitmapStr = bitmapMatch[1];
  const bitmapNums = [];
  const bitmapRe = /0x([0-9a-fA-F]{1,2})|(\d+)/g;
  let m;
  while ((m = bitmapRe.exec(bitmapStr)) !== null) {
    bitmapNums.push(m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2], 10));
  }
  const bitmap = new Uint8Array(bitmapNums);

  const tableMatch = content.match(/sgl_font_table_t\s+\w+_tab\[\]\s*=\s*\{([\s\S]*?)\};/);
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

  const unicodeLists = {};
  const listRe = /uint16_t\s+(unicode_list_\d+)\[\]\s*=\s*\{([\s\S]*?)\}/g;
  while ((m = listRe.exec(content)) !== null) {
    const nums = [];
    const numRe = /0x([0-9a-fA-F]+)|(\d+)/g;
    let lm;
    while ((lm = numRe.exec(m[2])) !== null) {
      nums.push(lm[1] !== undefined ? parseInt(lm[1], 16) : parseInt(lm[2], 10));
    }
    unicodeLists[m[1]] = nums;
  }

  const unicode = [];
  const uniRe = /\{\s*\.offset\s*=\s*(\d+)\s*,\s*\.len\s*=\s*(\d+)\s*,\s*\.list\s*=\s*(\w+)\s*,\s*\.tab_offset\s*=\s*(\d+)\s*,?\s*\}/g;
  while ((m = uniRe.exec(content)) !== null) {
    const listName = m[3];
    unicode.push({
      offset: parseInt(m[1], 10),
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
  for (let py = cy1; py <= cy2; py++) {
    const rel_y = py - py1;
    for (let px = cx1; px <= cx2; px++) {
      const rel_x = px - px1;
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
 */
function getTextPosSGL(coords, text, font, offset, align) {
  const parentW = coords.x2 - coords.x1 + 1;
  const parentH = coords.y2 - coords.y1 + 1;
  const textW = fontGetStringWidth(text, font) + offset;
  const textH = fontGetHeight(font);
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
 * 移植自 sgl_2dball.c
 */
function draw2dBall(surf, cx, cy, radius, color, bgColor, alpha) {
  // SGL 2dball: r2=(diameter-3)^2, ds_alpha=dx2*256/r2 (线性曲线)
  if (alpha <= 0 || radius <= 0) return;
  const z = surf.scale;
  const pcx = Math.round(cx * z);
  const pcy = Math.round(cy * z);
  const pr = Math.round(radius * z);

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
        // 边缘抗锯齿
        const edge_alpha = Math.floor(((r2_max - dx2) * r2_fix_diff) >> 15);
        const colorMix = colorMixer(bgColor, getPixel(surf, x, y), edge_alpha);
        setPixel(surf, x, y, colorMixer(colorMix, getPixel(surf, x, y), alpha), 255);
      } else {
        // 内部线性径向渐变 SGL: ds_alpha = dx2 * 256 / r2
        const ds_alpha = Math.floor((dx2 * 256) / r2);
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
// sgl_draw_fill_polygon - 多边形扫描线填充
// 移植自 sgl_draw_polygon.c（扫描线算法，半开半闭边穿越判定）
// ============================================================

/**
 * @param {object} surf - 绘制表面
 * @param {Array<{x,y}>} points - 顶点数组（逻辑坐标）
 * @param {{r,g,b}} color - 填充色
 * @param {number} alpha - 透明度 0-255
 */
function drawFillPolygon(surf, points, color, alpha) {
  if (alpha <= 0 || !points || points.length < 3) return;
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
    const xs = [];
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      // 半开半闭：边端点 y 较小者包含，较大者不包含，避免重复计数
      let y0, y1, x0, x1;
      if (p1.y < p2.y) { y0 = p1.y; y1 = p2.y; x0 = p1.x; x1 = p2.x; }
      else if (p1.y > p2.y) { y0 = p2.y; y1 = p1.y; x0 = p2.x; x1 = p1.x; }
      else continue; // 水平边跳过
      if (y >= y0 && y < y1) {
        // 线性插值求 x
        const t = (y - y0) / (y1 - y0);
        xs.push(x0 + t * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const sx1 = Math.max(Math.ceil(xs[i] - 0.5), surf.clip.x1);
      const sx2 = Math.min(Math.floor(xs[i + 1] + 0.5), surf.clip.x2);
      for (let x = sx1; x <= sx2; x++) {
        setPixel(surf, x, y, color, alpha);
      }
    }
  }
}

// ============================================================
// sgl_draw_polygon_border - 多边形边框（连接各顶点）
// ============================================================

/**
 * @param {number} border - 边框宽度
 */
function drawPolygonBorder(surf, points, borderColor, border, alpha) {
  if (border <= 0 || alpha <= 0 || !points || points.length < 2) return;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    drawLine(surf, p1.x, p1.y, p2.x, p2.y, border, borderColor, alpha);
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
  drawHLine(surf, x1, x2, y1, border, color, alpha);
  drawHLine(surf, x1, x2, y2, border, color, alpha);
  drawVLine(surf, x1, y1, y2, border, color, alpha);
  drawVLine(surf, x2, y1, y2, border, color, alpha);
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
  const bytesPerRow = w >> 1; // 4bpp: 每字节 2 像素
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
          const bg = getPixel(surf, cx + dx, cy + dy);
          // sgl_draw_icon: *buf = sgl_color_mixer(color, *buf, alpha_dot)
          // 若整体 alpha < 255，再与背景混合一次
          let mixed = colorMixer(color, bg, alpha_dot);
          if (alpha < 255) {
            mixed = colorMixer(mixed, bg, alpha);
          }
          setPixel(surf, cx + dx, cy + dy, mixed, 255);
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
// sgl_split_len - 按权重切分长度（键盘布局用）
// 移植自 sgl_core.c
// ============================================================
function splitLen(weights, n, total, margin, out) {
  const totalMargin = (n - 1) * margin;
  const available = Math.max(0, total - totalMargin);
  let totalWeight = 0;
  for (let i = 0; i < n; i++) totalWeight += Math.max(0, weights[i]);
  if (totalWeight <= 0) {
    for (let i = 0; i < n; i++) out[i] = Math.floor(available / n);
    return;
  }
  let used = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.floor(available * weights[i] / totalWeight);
    used += out[i];
  }
  if (n > 0) out[n - 1] += available - used;
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
  DROPDOWN_ICON,
  CHECKBOX_UNCHECKED_ICON,
  CHECKBOX_CHECKED_ICON,
  NUMBERKBD_ENTER_ICON,
  NUMBERKBD_BACKSPACE_ICON,
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
