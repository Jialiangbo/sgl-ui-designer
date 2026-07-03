import { AppState, navigate, initNav, escapeHtml } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_DEFAULTS } from './sgl_api.js';
import { getCheckboxIconDataUrl } from './checkbox_icon.js';
import { invoke } from '@tauri-apps/api/core';
import {
  setFontLoadCallback, getCssFontStack, getFontBppCss, applyBppFilter,
  mixColors, hexToRgba, getWidgetAbsPos, sortWidgetsByHierarchy, flexAlign,
  toAssetUrl, pixmapFormatHasAlpha, getOpaqueImageUrl,
  getCachedPixmapImageData, preloadPixmapImage
} from './render_common.js';

initNav('preview');
AppState.init();
setFontLoadCallback(() => render());

let currentIndex = 0;

// ============================================================
// SGLRenderer 像素级渲染辅助
// ============================================================

/** 获取 SGLRenderer 实例 */
function getR() {
  return window.SGLRenderer;
}

/** 字符串对齐 → SGL 数字对齐 (0=CENTER,1=TOP_MID,2=TOP_LEFT,3=TOP_RIGHT,4=BOT_MID,5=BOT_LEFT,6=BOT_RIGHT,7=LEFT_MID,8=RIGHT_MID) */
function alignStrToNum(align) {
  const m = {
    CENTER: 0, TOP_MID: 1, TOP_LEFT: 2, TOP_RIGHT: 3,
    BOT_MID: 4, BOT_LEFT: 5, BOT_RIGHT: 6,
    LEFT_MID: 7, RIGHT_MID: 8
  };
  return m[align] != null ? m[align] : 0;
}

/** 颜色取值并转 {r,g,b} */
function colorOr(w, prop, def) {
  const R = getR();
  const v = w[prop] != null ? w[prop] : def;
  return R.hexToColor(v || def);
}

/** 创建控件 canvas + surface，自动挂到 el 上 */
function createWidgetCanvas(el, w, z) {
  const R = getR();
  // 清除原有子元素
  el.innerHTML = '';
  // 移除可能残留的背景/边框样式（避免与 canvas 重叠）
  el.style.background = 'transparent';
  el.style.border = 'none';
  el.style.borderRadius = '0';
  const canvas = document.createElement('canvas');
  const surf = R.createSurface(canvas, w.width, w.height, z);
  // CSS 尺寸 = 像素尺寸，1:1 显示，避免 CSS 缩放导致右边框/下边框像素被压缩或丢失（与 editor.js sglSurface 一致）
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${surf.w}px;height:${surf.h}px;display:block;pointer-events:none;`;
  el.appendChild(canvas);
  return { canvas, surf, R };
}

/** 刷新 surface 到 canvas */
function flushWidget(surf) {
  getR().flushSurface(surf);
}



function render() {
  const pages = AppState.project.pages;
  if (!pages || pages.length === 0) return;
  if (currentIndex >= pages.length) currentIndex = 0;
  if (currentIndex < 0) currentIndex = pages.length - 1;

  const page = pages[currentIndex];
  const frame = document.getElementById('preview-frame');
  const container = document.getElementById('preview-container');

  // 计算自适应缩放比例，让页面完整显示在容器中
  const containerRect = container.getBoundingClientRect();
  const padding = 48; // 容器内边距
  const availW = containerRect.width - padding;
  const availH = containerRect.height - padding;
  const z = Math.min(availW / page.width, availH / page.height, 1); // 不放大，只缩小

  // 手动缩放所有尺寸（不用transform:scale，避免边框亚像素渲染变粗）
  // SGL 闭区间坐标缩放：像素宽度 = round((dim-1)*z) + 1，与 createSurface 一致
  frame.style.width = (Math.round((page.width - 1) * z) + 1) + 'px';
  frame.style.height = (Math.round((page.height - 1) * z) + 1) + 'px';
  frame.style.background = '';
  frame.style.backgroundImage = '';
  frame.style.backgroundSize = '';
  frame.style.backgroundPosition = '';
  if (page.pixmap) {
    const imgPath = toAssetUrl(page.pixmap);
    const pagePixmapFormat = page.pixmapFormat || 'RGB565';
    const pageHasAlpha = pixmapFormatHasAlpha(pagePixmapFormat);
    // 页面背景图片：非 Alpha 格式时透明区域按黑色填充，与设备渲染一致
    frame.style.backgroundColor = page.bg_color || '#1e1e2e';
    frame.style.backgroundSize = '100% 100%';
    frame.style.backgroundPosition = '0 0';
    if (pageHasAlpha) {
      frame.style.backgroundImage = `url('${imgPath}')`;
    } else {
      getOpaqueImageUrl(page.pixmap, '#000000').then(url => { frame.style.backgroundImage = `url('${url}')`; });
    }
  } else {
    frame.style.background = page.bg_color || '#1e1e2e';
  }
  frame.style.position = 'relative';
  frame.style.transform = 'none';
  frame.style.borderRadius = (AppState.project.screen_shape === 'circle') ? '50%' : '0';
  frame.innerHTML = '';

  const widgetMap = new Map();
  page.widgets.forEach(pw => widgetMap.set(pw.id, pw));

  // 按层级组排序：根祖先及其子孙作为整体，组之间按 zOrder 排序
  const sortedWidgets = sortWidgetsByHierarchy(page.widgets);

  sortedWidgets.forEach(w => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    // 使用绝对位置（累加父控件位置），乘以缩放因子
    const absPos = getWidgetAbsPos(w, page);
    el.style.left = (absPos.x * z) + 'px';
    el.style.top = (absPos.y * z) + 'px';
    // SGL 闭区间坐标缩放，与 createSurface 一致，避免 cv 溢出 el 被 overflow:hidden 裁切
    el.style.width = (Math.round((w.width - 1) * z) + 1) + 'px';
    el.style.height = (Math.round((w.height - 1) * z) + 1) + 'px';
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';

    // 根据 fontBpp 设置文本抗锯齿样式（继承到子文本元素）
    const bpp = w.fontBpp != null ? w.fontBpp : (WIDGET_DEFAULTS[w.type] && WIDGET_DEFAULTS[w.type].fontBpp) || 4;
    applyBppFilter(el, bpp);

    const alpha = w.alpha != null ? w.alpha : 255;
    el.style.opacity = alpha < 255 ? alpha / 255 : 1;

    // 如果有父对象，裁剪超出父区域的部分
    if (w.parentId) {
      const parent = widgetMap.get(w.parentId);
      if (parent) {
        const clipTop = w.y < 0 ? (-w.y) : 0;
        const clipLeft = w.x < 0 ? (-w.x) : 0;
        const clipRight = (w.x + w.width) > parent.width ? (w.x + w.width - parent.width) : 0;
        const clipBottom = (w.y + w.height) > parent.height ? (w.y + w.height - parent.height) : 0;
        if (clipTop > 0 || clipLeft > 0 || clipRight > 0 || clipBottom > 0) {
          el.style.clipPath = `inset(${clipTop * z}px ${clipRight * z}px ${clipBottom * z}px ${clipLeft * z}px)`;
        }
      }
    }

    renderPreviewWidget(el, w, z);

    frame.appendChild(el);
  });

  $('status-current-page').textContent = '页面 ' + (currentIndex + 1) + ' / ' + pages.length;
  $('status-page-name').textContent = page.name;
  $('status-page-size').textContent = page.width + '×' + page.height;
}

function renderPreviewWidget(el, w, z) {
  // 检查控件是否选择了有效字体（项目已添加该字体且控件 fontFamily 非空非 default）
  function widgetHasFont(widget) {
    const fonts = (AppState.project.resources && AppState.project.resources.fonts) || [];
    if (fonts.length === 0) return false;
    const family = widget.fontFamily;
    if (!family || family === 'default') return false;
    const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
    return fonts.some(f => f.path === family || f.name === fileName);
  }

  // 通用 DOM 文本叠加：在 el 上叠加一个 span 显示文本
  // 有字体时用 FontFace 注册的 SGL 字体，无字体时用系统默认字体
  // opts: { text, color, fontSize, fontFamily, align, x, y, w, h, offX, offY, lineMargin, multiline, maxWidth }
  function overlayText(opts) {
    const { text, color, fontSize, fontFamily, align, x = 0, y = 0, w: tw = w.width, h: th = w.height, offX = 0, offY = 0, lineMargin = 0, multiline = false, maxWidth } = opts;
    if (!text) return;
    const hasFont = widgetHasFont(w);
    const cssFamily = hasFont ? getCssFontStack(fontFamily || '') : 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const fs = Math.max(1, Math.round(fontSize * z));
    const wrap = document.createElement('div');
    const left = (x + offX) * z;
    const top = (y + offY) * z;
    const width = tw * z;
    const height = th * z;
    wrap.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;display:flex;pointer-events:none;box-sizing:border-box;overflow:hidden;`;
    Object.assign(wrap.style, flexAlign(align || 'CENTER'));
    const span = document.createElement(multiline ? 'div' : 'span');
    if (multiline) {
      span.style.cssText = `width:100%;color:${color};font-size:${fs}px;font-family:${cssFamily};line-height:${fs + lineMargin}px;white-space:pre-wrap;word-break:break-all;overflow:hidden;filter:var(--sgl-bpp-filter,none);`;
      span.textContent = text;
    } else {
      span.style.cssText = `color:${color};font-size:${fs}px;font-family:${cssFamily};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
      span.textContent = text;
    }
    wrap.appendChild(span);
    el.appendChild(wrap);
  }

  // 循环内单点文本叠加：在指定坐标画一个文本（用于 gauge/roller/textlist/numberkbd/keyboard 等）
  // (x, y) 为文本左上角坐标，与 SGL drawString 语义一致
  // opts: { text, color, fontSize, fontFamily, x, y }
  function overlayTextAt(opts) {
    const { text, color, fontSize, fontFamily, x, y, w: tw, h: th, align } = opts;
    if (!text) return;
    const hasFont = widgetHasFont(w);
    const cssFamily = hasFont ? getCssFontStack(fontFamily || '') : 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const fs = Math.max(1, Math.round(fontSize * z));
    if (tw != null && th != null && align) {
      // flex 布局：在 (x, y, tw, th) 区域内按 align 对齐
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;left:${x * z}px;top:${y * z}px;width:${tw * z}px;height:${th * z}px;display:flex;pointer-events:none;box-sizing:border-box;overflow:hidden;`;
      Object.assign(wrap.style, flexAlign(align));
      const span = document.createElement('span');
      span.style.cssText = `color:${color};font-size:${fs}px;font-family:${cssFamily};white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
      span.textContent = text;
      wrap.appendChild(span);
      el.appendChild(wrap);
    } else {
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;left:${x * z}px;top:${y * z}px;color:${color};font-size:${fs}px;font-family:${cssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
      span.textContent = text;
      el.appendChild(span);
    }
  }

  // 模拟 SGL sgl_font_get_string_height 的行数计算（与 editor.js 一致）
  function calcSglTextLines(text, fontSize, availWidth) {
    if (!text || availWidth <= 0) return 1;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    let lines = 1;
    let offset_x = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        lines++;
        offset_x = 0;
        continue;
      }
      const chWidth = ctx.measureText(ch).width;
      if (offset_x + chWidth >= availWidth) {
        offset_x = 0;
        lines++;
      }
      offset_x += chWidth;
    }
    return Math.max(1, lines);
  }

  switch (w.type) {
    case 'rect': {
      if (w.pixmap) {
        // 按 pixmapFormat 像素级量化渲染（WYSIWYG 色彩降级）
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const mainAlpha = w.mainAlpha != null ? w.mainAlpha : 255;
        const alpha = w.alpha != null ? w.alpha : 255;
        const imgData = getCachedPixmapImageData(w.pixmap);
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          const bgColor = hasAlpha ? R.hexToColor(w.color || '#FFFFFF') : R.hexToColor('#000000');
          R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, w.radius || 0, bgColor, 255);
          R.drawPixmap(surf, 0, 0, surf.w, surf.h, imgData, pixmapFormat, Math.min(alpha, mainAlpha));
          R.drawFillRectBorder(surf, 0, 0, w.width - 1, w.height - 1, w.radius || 0, R.hexToColor(w.borderColor || '#000000'), w.borderWidth != null ? w.borderWidth : 2, alpha);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          const rectRadius = ((w.radius || 0) * z);
          el.style.backgroundColor = hasAlpha ? (w.color || '#FFFFFF') : '#000000';
          const imgEl = document.createElement('div');
          imgEl.style.cssText = `position:absolute;inset:0;background-size:100% 100%;background-position:0 0;border-radius:${rectRadius}px;opacity:${mainAlpha < 255 ? mainAlpha / 255 : 1};background-image:url('${toAssetUrl(w.pixmap)}');`;
          el.appendChild(imgEl);
          el.style.border = `${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'}`;
          el.style.borderRadius = rectRadius + 'px';
          preloadPixmapImage(w.pixmap, () => render());
        }
      } else {
        // SGLRenderer 像素级渲染
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        const alpha = w.alpha != null ? w.alpha : 255;
        const mainAlpha = w.mainAlpha != null ? w.mainAlpha : 255;
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: Math.min(alpha, mainAlpha),
          border: w.borderWidth != null ? w.borderWidth : 2,
          border_alpha: alpha,
          border_mask: 0,
          color: R.hexToColor(w.color || '#FFFFFF'),
          border_color: R.hexToColor(w.borderColor || '#000000'),
          radius: w.radius || 0
        });
        flushWidget(surf);
      }
      break;
    }

    case 'circle': {
      // SGL 圆形：实际渲染半径 = width / 2（radius 属性只影响对象尺寸，不影响渲染半径）
      if (w.pixmap) {
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const alpha = w.alpha != null ? w.alpha : 255;
        const imgData = getCachedPixmapImageData(w.pixmap);
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染 + 圆形裁剪
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          const pcx = Math.floor((surf.w - 1) / 2) + Math.round((w.xOffset || 0) * z);
          const pcy = Math.floor((surf.h - 1) / 2) + Math.round((w.yOffset || 0) * z);
          const pr = Math.floor(Math.min(surf.w, surf.h) / 2);
          const bgColor = hasAlpha ? R.hexToColor(w.color || '#FFFFFF') : R.hexToColor('#000000');
          R.drawFillCircle(surf, pcx, pcy, pr, bgColor, 255);
          R.drawPixmap(surf, 0, 0, surf.w, surf.h, imgData, pixmapFormat, alpha);
          // 清除圆外像素
          const r2 = pr * pr;
          for (let yy = 0; yy < surf.h; yy++) {
            for (let xx = 0; xx < surf.w; xx++) {
              const ddx = xx - pcx;
              const ddy = yy - pcy;
              if (ddx * ddx + ddy * ddy > r2) {
                surf.buf32[yy * surf.w + xx] = 0;
              }
            }
          }
          R.drawFillCircleBorder(surf, pcx, pcy, pr, R.hexToColor(w.borderColor || '#000000'), w.borderWidth != null ? w.borderWidth : 2, alpha);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          const dia = w.width * z;
          const circleEl = document.createElement('div');
          const xOff = (w.xOffset || 0) * z;
          const yOff = (w.yOffset || 0) * z;
          circleEl.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)${xOff || yOff ? ` translate(${xOff}px, ${yOff}px)` : ''};width:${dia}px;height:${dia}px;border-radius:50%;border:${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'};box-sizing:border-box;background-color:${hasAlpha ? (w.color || '#FFFFFF') : '#000000'};background-size:100% 100%;background-image:url('${toAssetUrl(w.pixmap)}');`;
          el.appendChild(circleEl);
          preloadPixmapImage(w.pixmap, () => render());
        }
      } else {
        // SGLRenderer 像素级渲染
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        const alpha = w.alpha != null ? w.alpha : 255;
        const cx = w.width / 2 + (w.xOffset || 0);
        const cy = w.height / 2 + (w.yOffset || 0);
        const radius = w.width / 2;
        R.drawCircle(surf, cx, cy, radius, {
          alpha: alpha,
          border: w.borderWidth != null ? w.borderWidth : 2,
          border_alpha: alpha,
          color: R.hexToColor(w.color || '#FFFFFF'),
          border_color: R.hexToColor(w.borderColor || '#000000')
        });
        flushWidget(surf);
      }
      break;
    }

    case 'line': {
      // SGLRenderer 像素级渲染（虚线分段绘制）
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const lineW = Math.max(1, w.lineWidth != null ? w.lineWidth : 1);
      const lineCol = R.hexToColor(w.color || '#000000');

      // line 控件：x1/y1, x2/y2 是中心线端点坐标（SGL 语义）
      const absX1 = w.x1 != null ? w.x1 : w.x;
      const absY1 = w.y1 != null ? w.y1 : w.y;
      const absX2 = w.x2 != null ? w.x2 : (w.x + w.width - 1);
      const absY2 = w.y2 != null ? w.y2 : (w.y + w.height - 1);

      // 转换为相对于控件容器的位置
      const relX1 = absX1 - w.x;
      const relY1 = absY1 - w.y;
      const relX2 = absX2 - w.x;
      const relY2 = absY2 - w.y;

      if (w.dashed) {
        // 虚线：按 SGL 风格分段
        const dLen = w.dashLen || 10;
        const gLen = w.gapLen || 5;
        const totalLen = Math.sqrt((relX2 - relX1) ** 2 + (relY2 - relY1) ** 2);
        if (totalLen > 0) {
          const ux = (relX2 - relX1) / totalLen;
          const uy = (relY2 - relY1) / totalLen;
          let pos = 0;
          while (pos < totalLen) {
            const segEnd = Math.min(pos + dLen, totalLen);
            R.drawLine(surf,
              relX1 + ux * pos, relY1 + uy * pos,
              relX1 + ux * segEnd, relY1 + uy * segEnd,
              lineW, lineCol, alpha);
            pos += dLen + gLen;
          }
        }
      } else {
        R.drawLine(surf, relX1, relY1, relX2, relY2, lineW, lineCol, alpha);
      }
      flushWidget(surf);
      break;
    }

    case 'ring': {
      // SGLRenderer 像素级渲染：圆环
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cx = w.width / 2;
      const cy = w.height / 2;
      const rOut = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut : (w.width / 2);
      const rIn = (w.radiusIn != null && w.radiusIn > 0) ? w.radiusIn : (rOut - 2);
      R.drawFillRing(surf, cx, cy, Math.max(0, rIn), Math.max(1, rOut),
        R.hexToColor(w.color || '#FFFFFF'), alpha);
      flushWidget(surf);
      break;
    }

    case 'arc': {
      // SGLRenderer 像素级渲染：圆弧
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cx = w.width / 2;
      const cy = w.height / 2;
      const rOut = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut : (w.width / 2);
      const rIn = (w.radiusIn != null && w.radiusIn > 0) ? w.radiusIn : (rOut - 2);
      const startAngle = Number(w.startAngle != null ? w.startAngle : 0);
      const endAngle = Number(w.endAngle != null ? w.endAngle : 360);
      const arcMode = Number(w.mode || 0);
      R.drawFillArc(surf, {
        cx, cy,
        radius_in: Math.max(0, rIn),
        radius_out: Math.max(1, rOut),
        start_angle: startAngle,
        end_angle: endAngle,
        mode: arcMode,
        color: R.hexToColor(w.color || '#000000'),
        bg_color: R.hexToColor(w.bgColor || '#FFFFFF'),
        alpha: alpha
      });
      flushWidget(surf);
      break;
    }

    case 'polygon': {
      // SGLRenderer 像素级渲染：扫描线填充 + 边框 + 居中文本
      const vertices = w.vertices || '0,0;50,100;100,0';
      const coords = vertices.split(';').map(s => s.trim()).filter(s => s);
      const polyPts = coords.length >= 3
        ? coords.map(s => {
            const [x, y] = s.split(',').map(v => parseInt(v.trim()) || 0);
            return { x, y };
          })
        : [{x:25,y:0},{x:75,y:0},{x:100,y:50},{x:75,y:100},{x:25,y:100},{x:0,y:50}];

      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const fillColor = R.hexToColor(w.fillColor || '#8b5cf6');
      const borderColor = R.hexToColor(w.borderColor || '#7c3aed');
      const borderWidth = w.borderWidth != null ? w.borderWidth : 2;
      R.drawFillPolygon(surf, polyPts, fillColor, alpha);
      if (borderWidth > 0) {
        R.drawPolygonBorder(surf, polyPts, borderColor, borderWidth, alpha);
      }
      flushWidget(surf);
      if (w.text) {
        const textColor = R.hexToColor(w.textColor || '#ffffff');
        const fontSize = w.fontSize || 14;
        const fontFamily = w.fontFamily || '';
        const tw = R.stringWidth(w.text, fontSize);
        const th = R.fontHeight(fontSize);
        const tx = Math.round((w.width - tw) / 2);
        const ty = Math.round((w.height - th) / 2);
        overlayText({ text: w.text, color: (w.textColor || '#ffffff'), fontSize, fontFamily, align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
      }
      break;
    }

    case 'button': {
      if (w.pixmap) {
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const alpha = w.alpha != null ? w.alpha : 255;
        const imgData = getCachedPixmapImageData(w.pixmap);
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          const bgColor = hasAlpha ? R.hexToColor(w.bgColor || w.color || '#8b5cf6') : R.hexToColor('#000000');
          R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, w.radius != null ? w.radius : 8, bgColor, 255);
          R.drawPixmap(surf, 0, 0, surf.w, surf.h, imgData, pixmapFormat, alpha);
          R.drawFillRectBorder(surf, 0, 0, w.width - 1, w.height - 1, w.radius != null ? w.radius : 8, R.hexToColor(w.borderColor || '#7c3aed'), w.borderWidth != null ? w.borderWidth : 1, alpha);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          el.style.backgroundColor = hasAlpha ? (w.bgColor || w.color || '#8b5cf6') : '#000000';
          el.style.backgroundSize = '100% 100%';
          el.style.backgroundImage = `url('${toAssetUrl(w.pixmap)}')`;
          el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#7c3aed'}`;
          el.style.borderRadius = ((w.radius || 8) * z) + 'px';
          preloadPixmapImage(w.pixmap, () => render());
        }
        // 文本叠加
        el.style.display = 'flex';
        Object.assign(el.style, flexAlign(w.align));
        el.style.padding = (4 * z) + 'px ' + (8 * z) + 'px';
        const text = document.createElement('span');
        text.textContent = w.text || '按钮';
        text.style.color = w.textColor || '#ffffff';
        text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
        text.style.overflow = 'hidden';
        text.style.textOverflow = 'ellipsis';
        text.style.whiteSpace = 'nowrap';
        text.style.filter = 'var(--sgl-bpp-filter,none)';
        el.appendChild(text);
      } else {
        // SGLRenderer 像素级渲染：背景矩形 + 居中文本
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        const alpha = w.alpha != null ? w.alpha : 255;
        const bgCol = R.hexToColor(w.bgColor || w.color || '#8b5cf6');
        const borderCol = R.hexToColor(w.borderColor || '#7c3aed');
        const textCol = R.hexToColor(w.textColor || '#ffffff');
        const fontSize = w.fontSize || 14;
        const fontBpp = w.fontBpp || 4;
        const fontFamily = getCssFontStack(w.fontFamily || 'simhei.ttf');
        // 背景
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha,
          border: w.borderWidth != null ? w.borderWidth : 1,
          border_alpha: alpha,
          border_mask: 0,
          color: bgCol,
          border_color: borderCol,
          radius: w.radius != null ? w.radius : 8
        });
        flushWidget(surf);
        // 文本实时渲染（fillText 直接画到 canvas + bpp 量化后处理）
        const txt = w.text || '按钮';
        const coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
        const align = alignStrToNum(w.align || 'CENTER');
        const pos = R.getTextPosRealtime(coords, txt, fontSize, fontFamily, 4, align);
        overlayText({ text: txt, color: (w.textColor || '#ffffff'), fontSize, fontFamily: (w.fontFamily || 'simhei.ttf'), align: (w.align || 'CENTER'), x: 0, y: 0, w: w.width, h: w.height });
      }
      break;
    }

    case 'label': {
      // SGL pixel render: optional bg + text (font: SGL drawString, no font: DOM span)
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const lblBg = w.bgColor;
      const fontSize = w.fontSize || 14;
      const fontBpp = w.fontBpp || 4;
      const fontFamily = w.fontFamily || '';
      const cssFamily = getCssFontStack(fontFamily);
      // bg
      if (lblBg && lblBg !== 'transparent') {
        R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1,
          w.radius || 0, R.hexToColor(lblBg), alpha);
      }
      // text
      const txt = w.text || '标签';
      const txtCol = R.hexToColor(w.textColor || w.color || '#000000');
      const hasFont = widgetHasFont(w);
      if (hasFont) {
        // SGL drawString to buf32 (before flushWidget)
        const coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
        const align = alignStrToNum(w.align || 'CENTER');
        const pos = R.getTextPosRealtime(coords, txt, fontSize, cssFamily, 4, align);
        R.drawString(surf, pos.x, pos.y, txt, txtCol, alpha, fontSize, cssFamily, fontBpp);
      }
      flushWidget(surf);
      if (!hasFont) {
        // no font: DOM span (system default)
        overlayText({ text: txt, color: (w.textColor || w.color || '#000000'), fontSize, fontFamily: fontFamily, align: (w.align || 'CENTER'), x: 0, y: 0, w: w.width, h: w.height });
      }
      break;
    }

    case 'textbox': {
      // SGLRenderer 像素级渲染：背景圆角矩形 + 多行文本
      // 严格移植自 sgl_textbox.c: focus=1 时 border_mask=1 不画边框，scroll_enable=0 默认不画滚动条
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const tbBorder = w.borderWidth != null ? w.borderWidth : 1;
      const tbRadius = w.radius != null ? w.radius : 10;
      const tbBg = w.bgColor || '#FFFFFF';
      const tbBorderCol = w.borderColor || '#000000';
      const tbTextColor = w.textColor || '#000000';
      const tbLineMargin = w.lineMargin != null ? w.lineMargin : 1;
      const tbFontSize = w.fontSize != null ? w.fontSize : 14;
      const tbFontFamily = getCssFontStack(w.fontFamily || '');
      const scCol = R.hexToColor(tbTextColor);
      // 1. 背景圆角矩形（focus=1 → border_mask=1，不画边框，与 SGL 运行时默认一致）
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: tbBorder, border_alpha: alpha, border_mask: 1,
        color: R.hexToColor(tbBg), border_color: R.hexToColor(tbBorderCol), radius: tbRadius
      });
      // SGL 核心：textbox 默认 focus=1，渲染完控件后额外画绿色焦点 wireframe
      // SGL_FOCUSED_COLOR = sgl_rgb(0x00, 0xFF, 0x00)，SGL_FOCUSED_WIDTH = 1
      R.drawWireframe(surf, 0, 0, w.width - 1, w.height - 1, tbRadius, 1, R.hexToColor('#00FF00'), 255);
      // 2. 多行文本（fillText 直接画到 canvas + bpp 量化后处理）
      // SGL: 文本区内缩 bg.radius（tbRadius），起始 (x1+radius, y1+radius)
      flushWidget(surf);
      const tbText = w.text || '';
      const pad = tbRadius;
      const tbFontBpp = w.fontBpp || 4;
      if (tbText) {
        overlayText({ text: tbText, color: tbTextColor, fontSize: tbFontSize, fontFamily: (w.fontFamily || ''), x: pad, y: pad, w: w.width - 2 * pad, h: w.height - 2 * pad, multiline: true, lineMargin: tbLineMargin, maxWidth: w.width - 2 * pad, align: 'LEFT_MID' });
      }
      break;
    }

    case 'switch': {
      // SGL switch: margin = knob_margin + border
      const swOn = w.status || false;
      const swPixmap = w.pixmap || '';
      if (swPixmap) {
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const alpha = w.alpha != null ? w.alpha : 255;
        const imgData = getCachedPixmapImageData(swPixmap);
        const swBorderW = (w.borderWidth || 2) * z;
        const swRadius = (w.radius || 0) * z;
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          const bgColor = hasAlpha ? R.hexToColor(swOn ? (w.onColor || '#FFFFFF') : (w.bgColor || '#000000')) : R.hexToColor('#000000');
          R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, w.radius || 0, bgColor, 255);
          R.drawPixmap(surf, 0, 0, surf.w, surf.h, imgData, pixmapFormat, alpha);
          R.drawFillRectBorder(surf, 0, 0, w.width - 1, w.height - 1, w.radius || 0, R.hexToColor(w.borderColor || '#000000'), w.borderWidth != null ? w.borderWidth : 2, alpha);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          el.style.backgroundColor = hasAlpha ? (swOn ? (w.onColor || '#FFFFFF') : (w.bgColor || '#000000')) : '#000000';
          el.style.backgroundSize = '100% 100%';
          el.style.backgroundImage = `url('${toAssetUrl(swPixmap)}')`;
          el.style.border = `${swBorderW}px solid ${w.borderColor || '#000000'}`;
          el.style.borderRadius = swRadius + 'px';
          preloadPixmapImage(swPixmap, () => render());
        }
        // knob 用 div 绘制（无论图片是否缓存）
        const swMargin = ((w.knobMargin != null ? w.knobMargin : 0) + (w.borderWidth || 2)) * z;
        const trackH = w.height * z, trackW = w.width * z;
        const swKnobRadius = (w.knobRadius || 255) * z;
        const knobSize = Math.max(0, trackH - 2 * swMargin);
        const knobCorner = Math.min(Math.max(0, swRadius - swMargin), swKnobRadius);
        const knobY = swMargin;
        const knobX = swOn ? trackW - knobSize - swMargin : swMargin;
        const knob = document.createElement('div');
        knob.style.cssText = `position:absolute;left:${knobX}px;top:${knobY}px;width:${knobSize}px;height:${knobSize}px;border-radius:${knobCorner}px;background:${w.knobColor || '#808080'};`;
        el.appendChild(knob);
      } else {
        // SGLRenderer 像素级渲染：背景矩形 + knob 矩形
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        const alpha = w.alpha != null ? w.alpha : 255;
        const swBorderW = w.borderWidth != null ? w.borderWidth : 2;
        const swRadius = w.radius != null ? w.radius : 0;
        const swMargin = (w.knobMargin != null ? w.knobMargin : 0) + swBorderW;
        const swKnobRadius = w.knobRadius != null ? w.knobRadius : 255;
        // 背景：status=true 用 onColor(白)，false 用 bgColor(黑)
        const bgCol = R.hexToColor(swOn ? (w.onColor || '#FFFFFF') : (w.bgColor || '#000000'));
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: swBorderW, border_alpha: alpha, border_mask: 0,
          color: bgCol,
          border_color: R.hexToColor(w.borderColor || '#000000'),
          radius: swRadius
        });
        // knob：正方形，圆角（margin = knob_margin + border, knob 宽 = h - 2*margin）
        const knobSize = Math.max(0, w.height - 2 * swMargin);
        const knobCorner = Math.min(Math.max(0, swRadius - swMargin), swKnobRadius);
        const knobY1 = swMargin;
        const knobX1 = swOn ? (w.width - knobSize - swMargin) : swMargin;
        if (knobSize > 0) {
          R.drawFillRect(surf, knobX1, knobY1, knobX1 + knobSize - 1, knobY1 + knobSize - 1,
            knobCorner, R.hexToColor(w.knobColor || '#808080'), alpha);
        }
        flushWidget(surf);
      }
      break;
    }

    case 'checkbox': {
      // SGL checkbox 新版矢量渲染（移植自 sgl_checkbox.c）
      // box_w = font_h - 2，icon 矩形 + 圆角 + 勾线，文字 LEFT_MID 对齐
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cbStatus = w.status || false;
      const cbText = w.text || '';
      const cbFontSize = w.fontSize || 14;
      // 三色：text_color / box_color / check_color
      const cbTextColor = (w.textColor || w.color || '#000000');
      const cbBoxColor = (w.boxColor || '#2196F3');
      const cbCheckColor = (w.checkColor || '#FFFFFF');

      // SGL: font_h = sgl_font_get_height(font) ≈ fontSize
      const fontH = cbFontSize;
      // SGL: box_w = font_h - 2
      const boxW = fontH - 2;
      // SGL: align_pos = sgl_get_text_pos(coords, font, text, 0, SGL_ALIGN_LEFT_MID)
      //   LEFT_MID: x = coords.x1, y = coords.y1 + (widgetH - fontH) / 2
      const alignY = Math.floor((w.height - fontH) / 2);
      // SGL: icon rect
      const iconX1 = 1;
      const iconY1 = alignY + 1;
      const iconX2 = boxW - 2;
      const iconY2 = alignY + boxW - 2;
      // SGL: radius = box_w / 4
      const boxRadius = Math.floor(boxW / 4);

      if (cbStatus) {
        // 选中：填充圆角矩形（box_color）
        R.drawFillRect(surf, iconX1, iconY1, iconX2, iconY2, boxRadius, R.hexToColor(cbBoxColor), alpha);
        // 画勾（两条斜线，check_color）
        const baseX = iconX1;
        const baseY = iconY1;
        const bw = boxW;
        const off20 = (bw * 205) >> 10;
        const off50 = bw >> 1;
        const off40 = (bw * 410) >> 10;
        const off72 = (bw * 737) >> 10;
        const off26 = (bw * 266) >> 10;
        const ax1 = baseX + off20, ay1 = baseY + off50;
        const ax2 = baseX + off40, ay2 = baseY + off72;
        const ax3 = baseX + off72, ay3 = baseY + off26;
        let lw = boxW >> 3;
        if (lw < 1) lw = 1;
        R.drawLineSlanted(surf, ax1, ay1, ax2, ay2, lw, R.hexToColor(cbCheckColor), alpha);
        R.drawLineSlanted(surf, ax2, ay2, ax3, ay3, lw, R.hexToColor(cbCheckColor), alpha);
      } else {
        // 未选中：带边框矩形（box_color，边框宽度 2）
        R.drawFillRectBorder(surf, iconX1, iconY1, iconX2, iconY2, boxRadius, R.hexToColor(cbBoxColor), 2, alpha);
      }

      flushWidget(surf);
      // 文字（DOM 叠加）
      // SGL: sgl_draw_string 从 (align_pos.x + box_w + 2, align_pos.y) 左对齐画
      const textX = boxW + 2;
      if (cbText) {
        overlayText({ text: cbText, color: cbTextColor, fontSize: cbFontSize, fontFamily: (w.fontFamily || ''), align: 'LEFT_MID', x: textX, y: 0, w: w.width - textX, h: w.height });
      }
      break;
    }

    case 'slider': {
      // SGLRenderer 像素级渲染：track + fill + knob
      // 移植自 sgl_slider.c：knob_r = (isHoriz ? h : w)/2 - 1, thickness = min(thickness, knob_r)
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const isHoriz = w.direct !== 1;
      const slValue = w.value || 0;
      const border = w.borderWidth != null ? w.borderWidth : 2;
      const knobR = Math.max(1, (isHoriz ? w.height : w.width) / 2 - 1);
      // SGL: thickness = min(slider->thickness, knob_r)，默认 255 被 knob_r 钳制
      const thickness = Math.min(w.thickness != null ? w.thickness : 255, knobR);
      const barRadius = Math.min(thickness / 2, w.radius != null ? w.radius : 4);
      const trackCol = R.hexToColor(w.trackColor || '#808080');
      const fillCol = R.hexToColor(w.fillColor || '#000000');
      const knobCol = R.hexToColor(w.knobColor || '#000000');

      if (isHoriz) {
        // SGL: bar.x1=x1+knob_r, bar.x2=x2-knob_r, bar.y 居中
        const barLeft = knobR;
        const barWidth = Math.max(0, w.width - 2 * knobR);
        const barTop = (w.height - thickness) / 2;
        // SGL: fill_pos = x1 + w * value / 100 - border, clamp to [bar.x1, bar.x2]
        let fillPos = w.width * slValue / 100 - border;
        fillPos = Math.max(barLeft, Math.min(fillPos, barLeft + barWidth));
        // track 段（整条）
        R.drawFillRect(surf, barLeft, barTop, barLeft + Math.max(0, barWidth - 1), barTop + thickness - 1, barRadius, trackCol, alpha);
        // fill 段（从 bar.x1 到 fill_pos）
        if (fillPos > barLeft) {
          R.drawFillRect(surf, barLeft, barTop, fillPos - 1, barTop + thickness - 1, barRadius, fillCol, alpha);
        }
        // knob 圆: 在 (fill_pos, mid(bar.y1, bar.y2))
        R.drawFillCircle(surf, fillPos, barTop + thickness / 2, knobR, knobCol, alpha);
      } else {
        // SGL: bar.y1=y1+knob_r, bar.y2=y2-knob_r, bar.x 居中
        const barTop = knobR;
        const barHeight = Math.max(0, w.height - 2 * knobR);
        const barLeft = (w.width - thickness) / 2;
        // SGL: fill_pos = y2 - h * value / 100 + border, clamp to [bar.y1, bar.y2]
        let fillPos = w.height - w.height * slValue / 100 + border;
        fillPos = Math.max(barTop, Math.min(fillPos, barTop + barHeight));
        // track 段（整条）
        R.drawFillRect(surf, barLeft, barTop, barLeft + thickness - 1, barTop + Math.max(0, barHeight - 1), barRadius, trackCol, alpha);
        // fill 段（从 fill_pos 到 bar.y2，即底部）
        if (barTop + barHeight > fillPos) {
          R.drawFillRect(surf, barLeft, fillPos, barLeft + thickness - 1, barTop + barHeight - 1, barRadius, fillCol, alpha);
        }
        // knob 圆: 在 (mid(bar.x1, bar.x2), fill_pos)
        R.drawFillCircle(surf, barLeft + thickness / 2, fillPos, knobR, knobCol, alpha);
      }
      flushWidget(surf);
      break;
    }

    case 'progress': {
      // SGL progress: 严格移植自 sgl_progress.c
      // SGL: knob.x1 = x1 + radius/2 + border (clip 起始)
      // SGL: knob.x2 = x1 - radius/2 - 2 + w * value / 100 - (border - 1)
      // SGL: rect.y1 = y1 + border + 1, rect.y2 = y2 - border - 1
      // SGL: rect.x1 起始 = x1 - interval*2 + border + 1
      // SGL: 循环 while (rect.x2 <= knob.x2)，rect.x2 = rect.x1 + knob_width
      // SGL: sgl_draw_fill_rect(surf, &knob, &rect, fill_radius, ...) 第一个参数是 knob 作为 clip area
      // SGL: fill_radius = min(obj->radius, knob_radius, knob_width/2)
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const prValue = w.value || 0;
      const prFillCol = R.hexToColor(w.fillColor || '#FFFFFF');
      const prGap = w.fillGap != null ? w.fillGap : 4;
      const prFillRadius = w.fillRadius != null ? w.fillRadius : 0;
      const prFillWidth = w.fillWidth != null ? w.fillWidth : 4;
      const prBorder = w.borderWidth != null ? w.borderWidth : 2;
      const prRadius = w.radius != null ? w.radius : 0;
      const knobX2 = w.width * prValue / 100 - prRadius / 2 - 2 - (prBorder - 1);
      const knobX1 = prRadius / 2 + prBorder;
      const fillR = Math.min(prRadius, prFillRadius, Math.floor(prFillWidth / 2));
      const rectY1 = prBorder + 1;
      const rectY2 = w.height - 1 - prBorder - 1;
      let rectX1 = -prGap * 2 + prBorder + 1;
      let rectX2 = 0;

      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        color: R.hexToColor(w.trackColor || '#000000'),
        alpha: alpha,
        border: prBorder,
        border_color: R.hexToColor(w.borderColor || '#000000'),
        border_alpha: alpha,
        border_mask: 0,
        radius: prRadius,
      });
      while (rectX2 <= knobX2) {
        rectX2 = rectX1 + prFillWidth;
        const oldClip = surf.clip;
        const kx1 = Math.max(0, Math.round(knobX1 * z));
        const kx2 = Math.min(surf.w - 1, Math.round(knobX2 * z));
        if (kx2 >= kx1) {
          surf.clip = { x1: kx1, y1: 0, x2: kx2, y2: surf.h - 1 };
          R.drawFillRect(surf, rectX1, rectY1, rectX2, rectY2, fillR, prFillCol, alpha);
        }
        surf.clip = oldClip;
        rectX1 = rectX2 + prGap;
      }
      flushWidget(surf);
      break;
    }

    case 'bar': {
      // SGL bar: 严格移植自 sgl_bar.c
      // SGL: sgl_draw_rect(surf, &desc_area, &obj->coords, &desc)
      // desc_area 是裁剪区域，obj->coords 是绘制区域（整个控件）
      // 边框和圆角基于整个 obj->coords 画，填充颜色被 desc_area 裁剪
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const barDirect = w.direct || 0;
      const barValue = w.value || 50;
      const barBorder = w.borderWidth != null ? w.borderWidth : 2;
      const barRadius = w.radius != null ? w.radius : 0;
      const barFillCol = R.hexToColor(w.barColor || '#000000');
      const barTrackCol = R.hexToColor(w.bgColor || '#FFFFFF');
      const barBorderCol = R.hexToColor(w.borderColor || '#000000');

      if (barDirect === 0) {
        // 水平：knob_pos = x1 + w * value / 100 - border
        const knobPos = w.width * barValue / 100 - barBorder;
        const oldClip = surf.clip;
        const kp = Math.round(Math.min(knobPos, w.width - 1) * z);
        surf.clip = { x1: 0, y1: 0, x2: kp, y2: surf.h - 1 };
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = { x1: Math.max(0, kp), y1: 0, x2: surf.w - 1, y2: surf.h - 1 };
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = oldClip;
      } else {
        // 垂直：knob_pos = y2 - h * value / 100 + border
        const knobPos = w.height - w.height * barValue / 100 + barBorder;
        const oldClip = surf.clip;
        const kp = Math.round(Math.max(knobPos, 0) * z);
        surf.clip = { x1: 0, y1: kp, x2: surf.w - 1, y2: surf.h - 1 };
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = { x1: 0, y1: 0, x2: surf.w - 1, y2: Math.min(surf.h - 1, kp) };
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = oldClip;
      }
      flushWidget(surf);
      break;
    }

    case 'gauge': {
      // SGL gauge: 严格移植自 sgl_gauge.c
      // 角度系统：sgl_draw_fill_arc 使用 0°=上顺时针；sgl_sin/sgl_cos 使用 0°=右顺时针
      //   弧用原始 angle_start/angle_end（0°=上系统）
      //   刻度/指针用 calc_angle = angle + 90（转为 0°=右系统）
      // 指针坐标 +1 偏移（SGL: +cx+1, +cy+1）
      // text 位置：txt_x = tx - text_len/2 - 2, txt_y = ty - font_h/2
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const gValue = w.value || 0;
      const startAngle = w.startAngle != null ? w.startAngle : 30;
      const endAngle = w.endAngle != null ? w.endAngle : 330;
      const scaleAngle = Math.max(1, w.scaleAngle || 15);
      const scaleStep = w.scaleStep || 10;
      const scaleStart = w.scaleStart || 0;
      const scaleLen = Math.max(w.scaleLength || 0, 4);
      const arcW = w.arcWidth || 2;
      const scaleW = w.scaleWidth || 1;
      const ptrW = w.pointerWidth || 2;
      const bgCol = R.hexToColor(w.bgColor || '#000000');
      const arcCol = R.hexToColor(w.arcColor || '#FFFFFF');
      const scaleCol = R.hexToColor(w.scaleColor || '#FFFFFF');
      const ptrCol = R.hexToColor(w.pointerColor || '#FF0000');
      const textCol = R.hexToColor(w.textColor || '#FFFFFF');
      const hubCol = R.hexToColor(w.hubColor || '#FFFFFF');
      const redCol = R.SGL_COLOR_RED;
      const fontSize = w.fontSize || 12;
      const fontHeight = fontSize + 8; // SGL sgl_font_get_height
      const fontFamily = getCssFontStack(w.fontFamily || '');

      const cx = w.width / 2;
      const cy = w.height / 2;
      const r = Math.max(w.radius || 0, w.width / 2 - 1);
      const hubRz = Math.max((r + 8) / 8, w.hubRadius || 0);
      const scaleOut = arcW + 6;
      const scaleIn = scaleOut + scaleLen;
      const textCr = r - scaleIn - fontHeight / 2 - 4;
      const ptrStart = scaleIn + 4 + ptrW;
      const ptrEnd = r - hubRz - ptrW;

      // deg2rad: 0°=右系统（与 Math.sin/cos 一致，SGL sgl_sin/sgl_cos 同此）
      const deg2rad = d => d * Math.PI / 180;

      // 1. 背景圆
      R.drawFillCircle(surf, cx, cy, r, bgCol, alpha);
      // 2. 中心轴圆（hubColor）
      R.drawFillCircle(surf, cx, cy, Math.max(1, hubRz), hubCol, alpha);
      // 3. 外圈弧（arcColor）- 使用 0°=上系统，与 SGL drawFillArc 一致
      R.drawFillArc(surf, {
        cx, cy,
        radius_in: Math.max(0, r - arcW - 1),
        radius_out: Math.max(1, r - 1),
        start_angle: startAngle,
        end_angle: endAngle,
        mode: 0,
        color: arcCol,
        bg_color: bgCol,
        alpha: alpha
      });
      // 4. 刻度线 - SGL: calc_angle = angle + 90（转为 0°=右系统）
      const textInterval = w.textInterval != null ? w.textInterval : 3;
      const scaleWarning = w.scaleWarning != null ? w.scaleWarning : 32767;
      let scaleMask = scaleStart;
      let count = 0;
      const majorTexts = [];
      for (let angle = startAngle; angle <= endAngle + 0.01; angle += scaleAngle) {
        const isMajor = (count & textInterval) === 0;
        const sc = scaleMask < scaleWarning ? scaleCol : redCol;
        const rad = deg2rad(angle + 90);
        const cosA = Math.cos(rad), sinA = Math.sin(rad);
        const xo = cx + (r - scaleOut) * cosA;
        const yo = cy + (r - scaleOut) * sinA;
        const xi = cx + (r - scaleIn) * cosA;
        const yi = cy + (r - scaleIn) * sinA;
        R.drawLine(surf, xo, yo, xi, yi, isMajor ? scaleW * 2 : scaleW, sc, alpha);
        if (isMajor && (angle - startAngle) < 360) {
          majorTexts.push({
            x: cx + textCr * cosA,
            y: cy + textCr * sinA,
            text: String(scaleMask),
          });
        }
        scaleMask += scaleStep;
        count++;
      }
      // 5. 指针 - SGL: needle_angle = 90 + angle_start + value * scale_angle / scale_step
      const needleAngle = ((90 + startAngle + gValue * scaleAngle / scaleStep) % 360 + 360) % 360;
      const nRad = deg2rad(needleAngle);
      const nCos = Math.cos(nRad), nSin = Math.sin(nRad);
      // SGL: +cx+1, +cy+1 偏移
      const px = cx + (r - ptrStart) * nCos + 1;
      const py = cy + (r - ptrStart) * nSin + 1;
      const nx = cx + (r - ptrEnd) * nCos + 1;
      const ny = cy + (r - ptrEnd) * nSin + 1;
      if (ptrEnd > 0) {
        R.drawLine(surf, px, py, nx, ny, Math.max(1, ptrW), ptrCol, alpha);
      }
      flushWidget(surf);
      // 6. 刻度数字（必须在 flush 之后）
      // SGL: txt_x = tx - text_len/2 - 2, txt_y = ty - font_h/2
      const fH = R.fontHeight(fontSize);
      majorTexts.forEach(mt => {
        const tw = R.stringWidth(mt.text, fontSize);
        overlayTextAt({ text: mt.text, color: (w.textColor || '#FFFFFF'), fontSize, fontFamily: (w.fontFamily || ''), x: mt.x - tw / 2 - 2, y: mt.y - fH / 2, align: 'CENTER' });
      });
      break;
    }

    case 'led': {
      // SGL led: 平方曲线渐变，SGL 默认 on=白/off=黑/bg=黑, radius=width/2
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const isOn = !!w.status;
      const bgCol = R.hexToColor(w.bgColor || '#000000');
      const ledCol = R.hexToColor(isOn ? (w.onColor || w.color || '#FFFFFF') : (w.offColor || '#000000'));
      // SGL 整数除法语义: cx=(x1+x2)/2=(width-1)/2, radius=width/2
      const cx = Math.floor((w.width - 1) / 2);
      const cy = Math.floor((w.height - 1) / 2);
      const radius = Math.floor(w.width / 2);
      // LED 平方曲线渐变
      R.drawLed(surf, cx, cy, radius, ledCol, bgCol, alpha);
      // 边框（SGL LED 默认无边框）
      const borderW = w.borderWidth != null ? w.borderWidth : 0;
      if (borderW > 0) {
        R.drawFillCircleBorder(surf, cx, cy, radius,
          R.hexToColor(w.borderColor || '#000000'), borderW, alpha);
      }
      flushWidget(surf);
      break;
    }

    case 'battery': {
      // SGL battery: 严格移植自 sgl_battery.c
      // SGL 结构: 外壳实心填充(border_color, radius=3) + 盖帽实心填充(border_color, radius=0)
      //          + 内部背景实心填充(bg_color, radius=1, 缩进 border_width=2)
      //          + 电芯实心填充(fill_color, radius=1, 缩进 border_width+padding=4)
      // SGL: active_cells=(level*num_cells+99)/100, 充电闪电 6 段多边形 line_width=4
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const bLevel = Math.min(100, w.level != null ? w.level : (w.value || 80));
      const bDir = w.direction || 0;
      const bCapPos = w.capPos || 0;
      const bCapSize = w.capSize || 4;
      const bNumCells = w.numCells || 6;
      const bLowCol = w.lowColor || '#FF0000';
      const bMedCol = w.mediumColor || '#FFA500';
      const bHighCol = w.highColor || '#00FF00';
      const bFillCol = bLevel < 20 ? bLowCol : (bLevel < 50 ? bMedCol : bHighCol);
      const bBorderCol = w.borderColor || '#FFFFFF';
      const bBgCol = w.bgColor || '#1E1E1E';
      const bBorderW = 2;
      const bPadding = 2;
      const bShellRadius = 3;
      const bInnerRadius = 1;
      const borderColObj = R.hexToColor(bBorderCol);
      const bgColObj = R.hexToColor(bBgCol);
      // SGL: width = x2 - x1, height = y2 - y1 (非闭区间，差 1)
      const sglW = w.width - 1;
      const sglH = w.height - 1;

      let batteryW, batteryH, batteryX, batteryY, capW, capH, capX, capY;
      if (bDir === 0) {
        batteryW = sglW - bCapSize;
        batteryH = sglH - Math.floor(sglH / 5);
        capW = bCapSize;
        capH = Math.floor(batteryH / 3);
        if (bCapPos === 1) {
          batteryX = bCapSize;
          batteryY = Math.floor((sglH - batteryH) / 2);
          capX = 0;
          capY = batteryY + Math.floor((batteryH - capH) / 2);
        } else {
          batteryX = 0;
          batteryY = Math.floor((sglH - batteryH) / 2);
          capX = batteryW;
          capY = batteryY + Math.floor((batteryH - capH) / 2);
        }
      } else {
        batteryH = sglH - bCapSize;
        batteryW = sglW - Math.floor(sglW / 5);
        capH = bCapSize;
        capW = Math.floor(batteryW / 3);
        batteryX = Math.floor((sglW - batteryW) / 2);
        batteryY = bCapSize;
        capX = batteryX + Math.floor((batteryW - capW) / 2);
        capY = 0;
      }

      const fillX = batteryX + bBorderW + bPadding;
      const fillY = batteryY + bBorderW + bPadding;
      const fillW = batteryW - 2 * bBorderW - 2 * bPadding;
      const fillH = batteryH - 2 * bBorderW - 2 * bPadding;
      const bgX = batteryX + bBorderW;
      const bgY = batteryY + bBorderW;
      const bgW = batteryW - 2 * bBorderW;
      const bgH = batteryH - 2 * bBorderW;

      // 1. 外壳实心填充
      R.drawFillRect(surf, batteryX, batteryY, batteryX + batteryW, batteryY + batteryH, bShellRadius, borderColObj, alpha);
      // 2. 盖帽实心填充
      if (capW > 0 && capH > 0) {
        R.drawFillRect(surf, capX, capY, capX + capW, capY + capH, 0, borderColObj, alpha);
      }
      // 3. 内部背景实心填充
      if (bgW > 0 && bgH > 0) {
        R.drawFillRect(surf, bgX, bgY, bgX + bgW, bgY + bgH, bInnerRadius, bgColObj, alpha);
      }
      // 4. 电芯
      if (bLevel > 0 && bNumCells > 0 && fillW > 0 && fillH > 0) {
        const activeCells = Math.min(bNumCells, Math.floor((bLevel * bNumCells + 99) / 100));
        const fillColObj = R.hexToColor(bFillCol);
        if (bDir === 0) {
          let minGap = 2;
          let totalMinGap = (bNumCells - 1) * minGap;
          if (totalMinGap >= fillW) { minGap = 1; totalMinGap = bNumCells - 1; }
          const cellW = Math.max(1, Math.floor((fillW - totalMinGap) / bNumCells));
          const usedW = cellW * bNumCells + totalMinGap;
          const remainingW = fillW - usedW;
          if (bCapPos === 1) {
            let posX = fillX + fillW;
            for (let i = 0; i < activeCells; i++) {
              let curW = cellW + (i < remainingW ? 1 : 0);
              posX -= curW;
              R.drawFillRect(surf, posX, fillY, posX + curW, fillY + fillH, bInnerRadius, fillColObj, alpha);
              if (i < bNumCells - 1) posX -= minGap;
            }
          } else {
            let posX = fillX;
            for (let i = 0; i < activeCells; i++) {
              let curW = cellW + (i < remainingW ? 1 : 0);
              R.drawFillRect(surf, posX, fillY, posX + curW, fillY + fillH, bInnerRadius, fillColObj, alpha);
              if (i < bNumCells - 1) posX += curW + minGap;
            }
          }
        } else {
          let minGap = 2;
          let totalMinGap = (bNumCells - 1) * minGap;
          if (totalMinGap >= fillH) { minGap = 1; totalMinGap = bNumCells - 1; }
          const cellH = Math.max(1, Math.floor((fillH - totalMinGap) / bNumCells));
          const usedH = cellH * bNumCells + totalMinGap;
          const remainingH = fillH - usedH;
          let posY = fillY;
          for (let i = bNumCells - 1; i >= 0; i--) {
            const curH = cellH + (i < remainingH ? 1 : 0);
            if (i < activeCells) {
              R.drawFillRect(surf, fillX, posY, fillX + fillW, posY + curH, bInnerRadius, fillColObj, alpha);
            }
            posY += curH + minGap;
          }
        }
      }
      // 5. 充电闪电 SGL: 6 段直线多边形, line_width=4
      if (w.charging) {
        const chCol = R.hexToColor(w.chargingColor || '#FFFF00');
        const chCx = batteryX + Math.floor(batteryW / 2);
        const chCy = batteryY + Math.floor(batteryH / 2);
        const chH = Math.floor(batteryH / 2);
        const chW = Math.floor(batteryW / 6);
        let p1x,p1y,p2x,p2y,p3x,p3y,p4x,p4y,p5x,p5y,p6x,p6y;
        if (bDir === 0) {
          p1x = chCx - Math.floor(chW/2); p1y = chCy - Math.floor(chH/2);
          p2x = chCx + chW*2;             p2y = chCy + Math.floor(chH/9);
          p3x = chCx + Math.floor(chW/4); p3y = chCy - Math.floor(chH/8);
          p4x = chCx + Math.floor(chW/2); p4y = chCy + Math.floor(chH/2);
          p5x = chCx - chW*2;             p5y = chCy - Math.floor(chH/9);
          p6x = chCx - Math.floor(chW/4); p6y = chCy + Math.floor(chH/8);
        } else {
          p1x = chCx + Math.floor(chW/2); p1y = chCy - Math.floor(chH/2);
          p2x = chCx - Math.floor(chW/2); p2y = chCy - Math.floor(chH/15);
          p3x = chCx + chW*2;             p3y = chCy - Math.floor(chH/9);
          p4x = chCx - Math.floor(chW/2); p4y = chCy + Math.floor(chH/2);
          p5x = chCx + Math.floor(chW/2); p5y = chCy + Math.floor(chH/15);
          p6x = chCx - chW*2;             p6y = chCy + Math.floor(chH/9);
        }
        const chLW = 4;
        R.drawLine(surf, p1x, p1y, p2x, p2y, chLW, chCol, alpha);
        R.drawLine(surf, p2x, p2y, p3x, p3y, chLW, chCol, alpha);
        R.drawLine(surf, p3x, p3y, p4x, p4y, chLW, chCol, alpha);
        R.drawLine(surf, p4x, p4y, p5x, p5y, chLW, chCol, alpha);
        R.drawLine(surf, p5x, p5y, p6x, p6y, chLW, chCol, alpha);
        R.drawLine(surf, p6x, p6y, p1x, p1y, chLW, chCol, alpha);
      }
      flushWidget(surf);
      // 6. 百分比文本 SGL: x_offset 根据 cap_pos, font_height=fontSize+8
      if (w.showPercentage) {
        const pctStr = bLevel + '%';
        const fs = w.fontSize || 12;
        let xOffset = 0, yOffset = 0;
        if (bCapPos === 0) xOffset = -bCapSize;
        else if (bCapPos === 1) xOffset = bCapSize;
        else if (bCapPos === 2) yOffset = bCapSize;
        overlayText({ text: pctStr, color: (w.textColor || '#FFFFFF'), fontSize: fs, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height, offX: xOffset, offY: yOffset });
      }
      break;
    }

    case 'dropdown': {
      // SGLRenderer 像素级渲染：头部矩形 + 4bpp 箭头位图 + 选中项文本
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const ddOptions = (w.options || '').split('\n').filter(o => o.length > 0);
      const ddFontSize = w.fontSize || 14;
      const ddFontHeight = ddFontSize;
      const ddTextCol = R.hexToColor(w.textColor || '#000000');
      const ddFontFamily = getCssFontStack(w.fontFamily || '');
      const ddRadius = w.radius != null ? w.radius : 0;
      const ddBorderW = w.borderWidth != null ? w.borderWidth : 1;
      const ddItemH = ddFontHeight + 6;
      const ddItemPad = Math.max(ddRadius, ddBorderW + 3);
      const ddOptionH = w.height; // 关闭状态头部高度
      // 1. 头部矩形（背景+边框，圆角）
      R.drawRect(surf, 0, 0, w.width - 1, ddOptionH - 1, {
        alpha: alpha, border: ddBorderW, border_alpha: alpha, border_mask: 0,
        color: R.hexToColor(w.bgColor || '#FFFFFF'),
        border_color: R.hexToColor(w.borderColor || '#000000'),
        radius: ddRadius
      });
      // 2. 下拉箭头位图（18×10, 4bpp）- 必须在 flushWidget 之前
      const ddIconW = 18, ddIconH = 10;
      const ddIconX = w.width - ddIconW - ddRadius;
      const ddIconY = (ddItemH - ddIconH + 1) / 2;
      R.drawIcon(surf, ddIconX, ddIconY, ddTextCol, alpha, R.DROPDOWN_ICON);
      flushWidget(surf);
      // 3. 选中项文本（flush 之后，用 fillText 直接画到 canvas）
      const ddTextX = ddItemPad;
      const ddTextY = Math.round((ddOptionH - ddFontHeight + 1) / 2);
      const ddText = ddOptions.length > 0 ? ddOptions[0] : '';
      if (ddText) {
        overlayText({ text: ddText, color: (w.textColor || '#000000'), fontSize: ddFontSize, fontFamily: (w.fontFamily || ''), align: 'LEFT_MID', x: ddTextX, y: 0, w: w.width - ddTextX - ddIconW - ddRadius, h: ddOptionH });
      }
      break;
    }

    case 'roller': {
      // SGL roller: 严格移植自 sgl_roller.c
      // item_h = sgl_font_get_height(font) + 6
      // draw_h = max(widget_h, 3 * item_h)
      // band_y1 = (widget_h - item_h) / 2 (垂直居中)
      // band_area.y1 = max(band_y1, coords.y1=border), y2 = min(band_y2, coords.y2=height-1-border)
      // text_x = coords.x1 + radius + 2 = border + radius + 2
      // text_y_off = (item_h - font_h) / 2
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const rOptions = (w.options || '').split('\n').filter(o => o.length > 0);
      const rFontSize = w.fontSize || 14;
      // sgl_font_get_height: 字体文件中 font_height 通常等于 fontSize
      const rFontHeight = rFontSize;
      const rSelCol = R.hexToColor(w.selectedColor || '#808080');
      const rFontFamily = getCssFontStack(w.fontFamily || '');
      const rRadius = w.radius || 4;
      const rBorderW = w.borderWidth != null ? w.borderWidth : 1;
      // item_h = font_height + 6
      const rItemH = rFontHeight + 6;
      // draw_h = max(widget_h, 3 * item_h)
      const rDrawH = Math.max(w.height, 3 * rItemH);
      const rWidgetH = w.height;
      const rWidgetW = w.width;
      // 选中带：band_y1 = (widget_h - item_h) / 2 (垂直居中)
      const rBandY1 = Math.floor((rWidgetH - rItemH) / 2);
      const rBandY2 = rBandY1 + rItemH - 1;
      // SGL: band_area.y1 = max(band_y1, border), y2 = min(band_y2, height-1-border)
      const rBandClipY1 = Math.max(rBandY1, rBorderW);
      const rBandClipY2 = Math.min(rBandY2, rWidgetH - 1 - rBorderW);
      // text_x = border + radius + 2
      const rTextX = rBorderW + rRadius + 2;
      // text_y_off = (item_h - font_h) / 2
      const rTextYOff = Math.floor((rItemH - rFontHeight) / 2);
      // selected = 0, scroll_y = 0
      const rScrollY = 0;
      // 1. 背景
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: rBorderW, border_alpha: alpha, border_mask: 0,
        color: R.hexToColor(w.bgColor || '#FFFFFF'),
        border_color: R.hexToColor(w.borderColor || '#000000'),
        radius: rRadius
      });
      // 2. 选中带（x 范围 0~width-1，y 被 clip 到 coords 内）
      if (rBandClipY1 <= rBandClipY2) {
        R.drawFillRect(surf, 0, rBandClipY1, rWidgetW - 1, rBandClipY2, 0, rSelCol, alpha);
      }
      flushWidget(surf);
      // 3. 各选项文本（flush 之后，用 flex 在 item 区域内垂直居中）
      // SGL: item_draw_y = band_y1 + scroll_y + i * item_h
      const rItemW = rWidgetW - rTextX - (rBorderW + rRadius);
      for (let i = 0; i < rOptions.length; i++) {
        const itemDrawY = rBandY1 + rScrollY + i * rItemH;
        if (itemDrawY + rItemH < 0) continue;
        if (itemDrawY > rDrawH - 1) break;
        overlayTextAt({ text: (rOptions[i] || ''), color: (w.textColor || '#000000'), fontSize: rFontSize, fontFamily: (w.fontFamily || ''), x: rTextX, y: itemDrawY, w: rItemW, h: rItemH, align: 'LEFT_MID' });
      }
      break;
    }

    case 'textline': {
      // SGL textline 严格移植自 sgl_textline.c（与 editor.js 一致）
      // 1. 高度自动计算: y2 = y1 + (sgl_font_get_string_height(width-2*radius, text, font, line_margin) + 2*radius) - 1
      // 2. 背景条件渲染 (bg_flag)
      // 3. 文本区域 (x1+radius, y1+radius) ~ (x2-radius, y2-radius)
      // 4. 文本起始位置 (x1+radius, y1+radius)，TOP_LEFT 对齐
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const tlFontSize = w.fontSize != null ? w.fontSize : 14;
      const tlRadius = w.radius || 0;
      const tlBgTransparent = w.bgTransparent || false;
      const tlBg = w.bgColor || '#FFFFFF';
      const tlLineMargin = w.lineMargin != null ? w.lineMargin : 1;
      const tlText = w.text || '';

      // 计算 SGL 实际高度（模拟 sgl_font_get_string_height）
      const tlAvailWidth = w.width - 2 * tlRadius;
      const tlLines = calcSglTextLines(tlText, tlFontSize, tlAvailWidth);
      const tlActualHeight = tlLines * (tlFontSize + tlLineMargin) + 2 * tlRadius;

      // 1. 背景：按 SGL 实际高度画（不是 w.height）
      if (!tlBgTransparent) {
        R.drawFillRect(surf, 0, 0, w.width - 1, tlActualHeight - 1, tlRadius, R.hexToColor(tlBg), alpha);
      }
      flushWidget(surf);
      // 2. 多行文本（DOM 叠加），文本区域 (radius, radius) ~ (width-radius, actualHeight-radius)
      if (tlText) {
        overlayText({
          text: tlText,
          color: (w.textColor || w.color || '#000000'),
          fontSize: tlFontSize,
          fontFamily: (w.fontFamily || ''),
          align: 'TOP_LEFT',
          x: tlRadius, y: tlRadius,
          w: w.width - 2 * tlRadius,
          h: tlActualHeight - 2 * tlRadius,
          multiline: true,
          lineMargin: tlLineMargin,
          maxWidth: w.width - 2 * tlRadius
        });
      }
      break;
    }
    case 'textlist': {
      // SGL textlist: 严格移植自 sgl_textlist.c
      // item_height = sgl_font_get_height(font) + 2 * ITEM_SPACE = font_height + 6
      // item_pad = max(radius, border + ITEM_PAD)
      // text_pos_y 初始 = ITEM_SPACE, 选中高亮 y1 = text_pos_y - ITEM_SPACE = i*item_height
      // 分隔线颜色 = item_text_color（文本色），不是边框色
      // 选中高亮三分支: select.y1 <= (area.y1 + radius) 为顶部项，area.y1 相对控件 = 0
      // SGL 默认 item_selected = -1，未选中任何项
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const tlFontSize = w.fontSize || 12;
      const ITEM_SPACE = 3;
      const ITEM_PAD = 3;
      const tlItemHeight = tlFontSize + 2 * ITEM_SPACE;
      const tlBorder = w.borderWidth || 1;
      const tlRadius = w.radius || 0;
      const tlItemPad = Math.max(tlRadius, tlBorder + ITEM_PAD);
      const tlBg = R.hexToColor(w.bgColor || '#FFFFFF');
      const tlBorderCol = R.hexToColor(w.borderColor || '#000000');
      const tlTextColor = R.hexToColor(w.textColor || '#000000');
      const tlSelectedColor = R.hexToColor(w.selectedColor || '#808080');
      const tlFontFamily = getCssFontStack(w.fontFamily || '');
      const tlOptions = (w.options || '').split('\n').filter(o => o.length > 0);

      // 1. 背景圆角矩形 + 边框（buf32，flush 前）
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: tlBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: tlBg,
        radius: tlRadius,
        border_color: tlBorderCol,
      });

      let tlVisibleCount = 0;
      if (tlOptions.length > 0) {
        const tlSelected = -1; // SGL 默认 item_selected = -1，未选中任何项
        const tlInnerH = w.height - 2 * tlBorder;
        tlVisibleCount = Math.min(tlOptions.length, Math.max(1, Math.floor(tlInnerH / tlItemHeight)));

        // 顶部分隔线 (y = 0, x = item_pad ~ width-1-item_pad, 颜色 = 文本色)
        R.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, 0, 1, tlTextColor, alpha);

        // 遍历可见项：选中高亮 + 底部分隔线（buf32，flush 前）
        for (let i = 0; i < tlVisibleCount; i++) {
          const itemY = i * tlItemHeight; // SGL: text_pos_y - SPACE = i*item_height (从 0 开始)

          // 选中项高亮（三分支圆角策略）
          if (i === tlSelected) {
            const selX1 = tlBorder;
            const selX2 = w.width - 1 - tlBorder;
            const selY1 = itemY;
            const selY2 = itemY + tlItemHeight - 1;
            const r = tlRadius;
            if (r > 0) {
              const isTop = selY1 <= r;
              const isBottom = selY2 >= w.height - 1 - r;
              if (isTop) {
                const scY1 = tlBorder;
                const scY2 = selY1 + tlItemHeight + r + 1;
                const oldClip = surf.clip;
                surf.clip = {
                  x1: Math.round(selX1 * z), y1: Math.round(selY1 * z),
                  x2: Math.round(selX2 * z), y2: Math.round(selY2 * z)
                };
                R.drawFillRect(surf, selX1, scY1, selX2, scY2, r, tlSelectedColor, alpha);
                surf.clip = oldClip;
              } else if (isBottom) {
                const scY1 = selY1 - tlItemHeight - r - 1;
                const scY2 = w.height - 1 - tlBorder;
                const oldClip = surf.clip;
                surf.clip = {
                  x1: Math.round(selX1 * z), y1: Math.round(selY1 * z),
                  x2: Math.round(selX2 * z), y2: Math.round(selY2 * z)
                };
                R.drawFillRect(surf, selX1, scY1, selX2, scY2, r, tlSelectedColor, alpha);
                surf.clip = oldClip;
              } else {
                R.drawFillRect(surf, selX1, selY1, selX2, selY2, 0, tlSelectedColor, alpha);
              }
            } else {
              R.drawFillRect(surf, selX1, selY1, selX2, selY2, 0, tlSelectedColor, alpha);
            }
          }

          // 底部分隔线 (y = (i+1)*item_height, x = item_pad ~ width-1-item_pad, 颜色 = 文本色)
          const botSepY = (i + 1) * tlItemHeight;
          if (botSepY < w.height - tlBorder - 1) {
            R.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, botSepY, 1, tlTextColor, alpha);
          }
        }
      }

      flushWidget(surf);

      // 文本（flush 后绘制）
      // SGL: sgl_draw_string(surf, area, text_pos_x1, text_pos_y, ...)
      // y 依赖字体度量(base_line/ofs_y)，仿真中文本恰好在 item 内垂直居中
      // 预览用 flex 布局 LEFT_MID 实现相同效果，与设计器一致
      if (tlOptions.length > 0 && tlVisibleCount > 0) {
        for (let i = 0; i < tlVisibleCount; i++) {
          overlayTextAt({
            text: (tlOptions[i] || ''),
            color: (w.textColor || '#000000'),
            fontSize: tlFontSize,
            fontFamily: (w.fontFamily || ''),
            x: tlItemPad,
            y: i * tlItemHeight,
            w: w.width - 2 * tlItemPad,
            h: tlItemHeight,
            align: 'LEFT_MID'
          });
        }
      }
      break;
    }
    case 'viewlist': {
      // SGLRenderer 像素级渲染：背景矩形 + 边框
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const radius = w.radius != null ? w.radius : 4;
      const borderW = w.borderWidth != null ? w.borderWidth : 1;
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: borderW, border_alpha: alpha, border_mask: 0,
        color: R.hexToColor(w.bgColor || '#1e1e2e'),
        border_color: R.hexToColor(w.borderColor || '#3d3d5c'),
        radius: radius
      });
      flushWidget(surf);
      break;
    }

    case 'win': {
      // SGLRenderer 像素级渲染：主体 + 标题栏 + 关闭按钮 + 标题文字
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const winFontSize = w.fontSize != null ? w.fontSize : 14;
      const winFontHeight = winFontSize + 8;
      const winBorder = w.borderWidth != null ? w.borderWidth : 0;
      const winRadius = w.radius || 0;
      const winW = w.width;
      const winH = w.height;
      const winBg = R.hexToColor(w.bgColor || '#FFFFFF');
      const winBorderCol = R.hexToColor(w.borderColor || '#000000');
      const winFontFamily = getCssFontStack(w.fontFamily || '');
      const winTitleH = Math.max(winRadius, w.titleHeight || 0, winFontHeight);
      const winTitleBg = R.colorMixer(R.hexToColor(w.titleBgColor || '#808080'), winBg, 128);
      const winTitleTextCol = R.hexToColor(w.titleTextColor || '#000000');
      const winCloseCol = R.hexToColor(w.closeBtnColor || '#FF5A50');
      // 1. 主体背景 + 边框
      R.drawRect(surf, 0, 0, winW - 1, winH - 1, {
        alpha: alpha, border: winBorder, border_alpha: alpha, border_mask: 0,
        color: winBg, border_color: winBorderCol, radius: winRadius
      });
      // 2. 标题栏背景（混合色，从对象顶部覆盖到 title_h，含边框区域）
      if (winTitleH > 0) {
        R.drawFillRect(surf, 0, 0, winW - 1, winTitleH - 1, winRadius, winTitleBg, alpha);
      }
      // 3. 关闭按钮（红色实心圆）SGL: close_cx=x2-border-title_h/2, close_cy=y1+title_h/2+border/2
      const winCloseR = winTitleH / 3;
      const winCloseCx = winW - 1 - winBorder - winTitleH / 2;
      const winCloseCy = winTitleH / 2 + winBorder / 2;
      if (winCloseR > 0) {
        R.drawFillCircle(surf, winCloseCx, winCloseCy, winCloseR, winCloseCol, alpha);
      }
      flushWidget(surf);
      // 4. 标题文本（flush 之后，默认 LEFT_MID）
      // SGL: title_area.x1+=border, LEFT_MID 时 align_pos.x+=radius, 绘制 y+=border
      const winTitleAlign = w.titleAlign || 'LEFT_MID';
      const winTitlePad = winTitleAlign === 'LEFT_MID' ? winRadius : 0;
      const titleStr = w.titleText || '窗口标题';
      const coords = { x1: winBorder + winTitlePad, y1: winBorder, x2: winW - 1 - winBorder - winTitleH, y2: winBorder + winTitleH - 1 };
      const pos = R.getTextPos(coords, titleStr, winFontSize, 4, alignStrToNum(winTitleAlign));
      overlayText({ text: titleStr, color: (w.titleTextColor || '#000000'), fontSize: winFontSize, fontFamily: (w.fontFamily || ''), align: winTitleAlign, x: winBorder + winTitlePad, y: winBorder, w: w.width - 1 - winBorder - winTitleH - (winBorder + winTitlePad), h: winTitleH });
      break;
    }

    case 'msgbox': {
      // SGLRenderer 像素级渲染：主体 + 分隔线 + 左右按钮 + 标题/消息/按钮文本
      // SGL: font_height = fontSize + 8, lbtn_color = mixer(白,黑,200) = #C7C7C7
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const mbFontSize = w.fontSize != null ? w.fontSize : 14;
      const mbFontHeight = mbFontSize + 8;
      const mbBorder = w.borderWidth != null ? w.borderWidth : 2;
      const mbRadius = w.radius || 0;
      const mbW = w.width;
      const mbH = w.height;
      const mbBg = R.hexToColor(w.bgColor || '#FFFFFF');
      const mbBorderCol = R.hexToColor(w.borderColor || '#000000');
      const mbFontFamily = getCssFontStack(w.fontFamily || '');
      const mbTitleH = (w.titleHeight || 0) || mbFontHeight;
      const mbTitleTextCol = R.hexToColor(w.titleTextColor || '#000000');
      const mbMsgCol = R.hexToColor(w.msgColor || w.textColor || '#000000');
      const mbLineMargin = w.msgLineMargin != null ? w.msgLineMargin : 1;
      const mbMsgOffsetX = w.msgOffsetX || 0;
      const mbMsgOffsetY = w.msgOffsetY || 0;
      // SGL 默认按钮颜色 mixer(白,黑,200)=#C7C7C7
      const mbDefBtnCol = R.colorMixer(R.hexToColor('#FFFFFF'), R.hexToColor('#000000'), 200);
      const mbLeftBtnCol = w.leftBtnColor ? R.hexToColor(w.leftBtnColor) : mbDefBtnCol;
      const mbLeftBtnTextCol = R.hexToColor(w.leftBtnTextColor || '#000000');
      const mbRightBtnCol = w.rightBtnColor ? R.hexToColor(w.rightBtnColor) : mbDefBtnCol;
      const mbRightBtnTextCol = R.hexToColor(w.rightBtnTextColor || '#000000');
      // 1. 主体背景 + 边框
      R.drawRect(surf, 0, 0, mbW - 1, mbH - 1, {
        alpha: alpha, border: mbBorder, border_alpha: alpha, border_mask: 0,
        color: mbBg, border_color: mbBorderCol, radius: mbRadius
      });
      // 2. 分隔线 SGL: y=title_h+4, x1=border, x2=width-1-border, width=border
      const mbSepY = mbTitleH + 4;
      R.drawHLine(surf, mbBorder, mbW - 1 - mbBorder, mbSepY, Math.max(1, mbBorder), mbBorderCol, alpha);
      // 3. 左右按钮背景 SGL: y1=height-2*font_height, y2=height-1-border
      const mbBtnTop = mbH - 2 * mbFontHeight;
      const mbBtnBottom = mbH - 1 - mbBorder;
      const mbMidX = mbW / 2;
      const mbLeftBtnX1 = mbBorder;
      const mbLeftBtnX2 = Math.floor(mbMidX - mbBorder / 2 - 1);
      const mbRightBtnX1 = Math.floor(mbMidX + mbBorder / 2 + 1);
      const mbRightBtnX2 = mbW - 1 - mbBorder;
      if (mbLeftBtnX2 >= mbLeftBtnX1) {
        R.drawFillRect(surf, mbLeftBtnX1, mbBtnTop, mbLeftBtnX2, mbBtnBottom, 0, mbLeftBtnCol, alpha);
      }
      if (mbRightBtnX2 >= mbRightBtnX1) {
        R.drawFillRect(surf, mbRightBtnX1, mbBtnTop, mbRightBtnX2, mbBtnBottom, 0, mbRightBtnCol, alpha);
      }
      flushWidget(surf);
      // 4. 标题文本（居中，flush 之后）
      // SGL: title_coords x1=border+2, x2=width-1-border+2, y1=1, y2=title_h+border
      const titleStr = w.titleText || 'Message Box';
      const titleCoords = { x1: mbBorder + 2, y1: 1, x2: mbW - 1 - mbBorder + 2, y2: mbTitleH + mbBorder };
      const titlePos = R.getTextPos(titleCoords, titleStr, mbFontSize, 4, alignStrToNum('CENTER'));
      overlayText({ text: titleStr, color: (w.titleTextColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: mbBorder + 2, y: 1, w: w.width - 2 * mbBorder, h: mbTitleH + mbBorder });
      // 5. 消息文本（多行左对齐）SGL: x1=border+2+offsetX, y1=title_h+border+offsetY+2
      const mbMsgTop = mbTitleH + mbBorder + mbMsgOffsetY + 2;
      const mbMsgLeft = mbBorder + 2 + mbMsgOffsetX;
      const mbMsgText = w.msgText || 'NULL';
      if (mbMsgText && mbMsgText !== 'NULL') {
        overlayText({ text: mbMsgText, color: (w.msgColor || w.textColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), x: mbMsgLeft, y: mbMsgTop, w: mbW - 2 * mbBorder - 4, h: mbH - mbMsgTop - 2 * mbFontHeight, multiline: true, lineMargin: mbLineMargin, maxWidth: mbW - 2 * mbBorder - 4, align: 'LEFT_MID' });
      }
      // 6. 左右按钮文本（居中）SGL: y_offset = font_height/2
      const leftTxt = w.leftBtnText || 'YES';
      const rightTxt = w.rightBtnText || 'NO';
      if (mbLeftBtnX2 >= mbLeftBtnX1) {
        const leftCoords = { x1: mbLeftBtnX1, y1: mbBtnTop, x2: mbLeftBtnX2, y2: mbBtnBottom };
        const leftPos = R.getTextPos(leftCoords, leftTxt, mbFontSize, 4, alignStrToNum('CENTER'));
        overlayText({ text: leftTxt, color: (w.leftBtnTextColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: mbLeftBtnX1, y: mbBtnTop, w: mbLeftBtnX2 - mbLeftBtnX1 + 1, h: mbBtnBottom - mbBtnTop + 1 });
      }
      if (mbRightBtnX2 >= mbRightBtnX1) {
        const rightCoords = { x1: mbRightBtnX1, y1: mbBtnTop, x2: mbRightBtnX2, y2: mbBtnBottom };
        const rightPos = R.getTextPos(rightCoords, rightTxt, mbFontSize, 4, alignStrToNum('CENTER'));
        overlayText({ text: rightTxt, color: (w.rightBtnTextColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: mbRightBtnX1, y: mbBtnTop, w: mbRightBtnX2 - mbRightBtnX1 + 1, h: mbBtnBottom - mbBtnTop + 1 });
      }
      break;
    }

    case 'scroll': {
      // SGL scroll: 严格移植自 sgl_scroll.c
      // direct: 0=水平, 1=垂直 (SGL_DIRECT_HORIZONTAL=0, SGL_DIRECT_VERTICAL=1)
      // track=整个控件区域, 滑块颜色=mixer(color, BG黑, 128), 滑块圆角=radius-border
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const scDirect = w.direct != null ? w.direct : 1; // 默认垂直
      const scValue = w.value != null ? w.value : 0;
      const scWidth = w.width != null ? w.width : 10; // SGL_SCROLL_DEFAULT_WIDTH
      const scColor = R.hexToColor(w.color || '#FFFFFF'); // SGL_THEME_COLOR
      const scBorderColor = R.hexToColor(w.borderColor || '#000000'); // SGL_THEME_BORDER_COLOR
      const scBorder = w.borderWidth != null ? w.borderWidth : 2;
      const scRadius = Math.min(w.radius != null ? w.radius : 0, Math.floor(scWidth / 2));

      // 1. track: 整个控件区域（含边框、填充）
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: scBorder, border_alpha: alpha, border_mask: 0,
        color: scColor, border_color: scBorderColor, radius: scRadius
      });

      // 2. 滑块: 颜色 = sgl_color_mixer(color, SGL_THEME_BG_COLOR(黑), 128)
      const thumbCol = R.colorMixer(scColor, R.hexToColor('#000000'), 128);
      const thumbRadius = Math.max(0, scRadius - scBorder);
      let len, pos, fx1, fy1, fx2, fy2;
      if (scDirect === 1) {
        // 垂直: 长度方向 = y
        len = Math.max(Math.floor(w.height / 8), scRadius * 2 + 1);
        pos = Math.floor(scValue * (w.height - len) / 100);
        fx1 = scBorder;
        fx2 = w.width - 1 - scBorder;
        fy1 = pos + scBorder;
        fy2 = pos + len - scBorder;
      } else {
        // 水平: 长度方向 = x
        len = Math.max(Math.floor(w.width / 8), scRadius * 2 + 1);
        pos = Math.floor(scValue * (w.width - len) / 100);
        fy1 = scBorder;
        fy2 = w.height - 1 - scBorder;
        fx1 = pos + scBorder;
        fx2 = pos + len - scBorder;
      }
      R.drawFillRect(surf, fx1, fy1, fx2, fy2, thumbRadius, thumbCol, alpha);
      flushWidget(surf);
      break;
    }

    case 'box': {
      // SGL box: 严格移植自 sgl_box.c
      // 默认: bg.color=SGL_THEME_COLOR(白), border=1, radius=0
      //       scroll_color=SGL_THEME_SCROLL_FG_COLOR(200,200,200)
      // 滚动条: SGL_BOX_SCROLL_WIDTH=4, alpha=128, 圆角=2
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const boxBg = R.hexToColor(w.bgColor || '#FFFFFF'); // SGL_THEME_COLOR
      const boxBorderCol = R.hexToColor(w.borderColor || '#000000'); // SGL_THEME_BORDER_COLOR
      const boxBorderW = w.borderWidth != null ? w.borderWidth : 1; // SGL box 默认 border=1
      const boxRadius = w.radius != null ? w.radius : 0;
      const boxScrollColor = R.hexToColor(w.scrollColor || '#C8C8C8'); // SGL_THEME_SCROLL_FG_COLOR
      const showV = w.showVScrollbar != null ? w.showVScrollbar : 1;
      const showH = w.showHScrollbar != null ? w.showHScrollbar : 1;
      const scrollEnable = w.scrollEnable != null ? w.scrollEnable : 1;
      // scroll_mode: 1=VERTICAL_ONLY, 2=HORIZONTAL_ONLY, 3=BOTH
      const scrollMode = w.scrollMode != null ? w.scrollMode : 3;
      const SCROLL_W = 4;

      // 1. 背景 + 边框
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: boxBorderW, border_alpha: alpha, border_mask: 0,
        color: boxBg, border_color: boxBorderCol, radius: boxRadius
      });

      // 2. 滚动条
      if (scrollEnable && scrollMode) {
        const innerH = w.height - 2 * boxRadius;
        const innerW = w.width - 2 * boxRadius;
        const scrollH = Math.max(Math.floor(innerH / 8), SCROLL_W);
        const scrollRadius = Math.floor(SCROLL_W / 2);

        // 垂直滚动条
        if ((scrollMode & 1) && showV) {
          const vx1 = w.width - 1 - SCROLL_W - boxRadius;
          const vy1 = boxRadius;
          const vx2 = w.width - 1 - boxRadius;
          const vy2 = vy1 + scrollH;
          R.drawFillRect(surf, vx1, vy1, vx2, vy2, scrollRadius, boxScrollColor, 128);
        }

        // 水平滚动条
        if ((scrollMode & 2) && showH) {
          const hy1 = w.height - 1 - SCROLL_W - boxRadius;
          const hy2 = w.height - 1 - boxRadius;
          const hx1 = boxRadius;
          const hx2 = ((scrollMode & 1) && showV)
            ? (w.width - 1 - SCROLL_W - boxRadius)
            : (w.width - 1 - boxRadius);
          R.drawFillRect(surf, hx1, hy1, hx2, hy2, scrollRadius, boxScrollColor, 128);
        }
      }
      flushWidget(surf);
      break;
    }

    case 'numberkbd': {
      // SGLRenderer 像素级渲染：主体 + 各按钮 + 4bpp 图标 + 文字
      // 严格移植自 sgl_numberkbd.c: enter/backspace 使用 4bpp 位图，icon 在 flush 前，文字在 flush 后
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const COL = 4, ROW = 5;
      const nkMargin = w.btnMargin != null ? w.btnMargin : 5;
      const bodyW = w.width, bodyH = w.height;
      const boxW = (bodyW - (COL + 1) * nkMargin) / COL;
      const boxH = (bodyH - (ROW + 1) * nkMargin) / ROW;
      const nkCellCol = R.hexToColor(w.cellColor || '#FFFFFF');
      const nkBorderCol = R.hexToColor(w.borderColor || '#000000');
      const nkBorderW = w.borderWidth != null ? w.borderWidth : 2;
      const nkRadius = w.radius || 0;
      const nkBtnCol = R.hexToColor(w.btnColor || '#FFFFFF');
      const nkTextCol = R.hexToColor(w.textColor || '#000000');
      const nkBtnBorderW = w.btnBorderWidth != null ? w.btnBorderWidth : 1;
      const nkBtnBorderCol = R.hexToColor(w.btnBorderColor || '#000000');
      const nkBtnRadius = w.btnRadius || 0;
      const nkFontSize = w.fontSize || 14;
      const nkFontFamily = getCssFontStack(w.fontFamily || '');
      // SGL 按键字符表 kbd_digits[5][4]，OK 用 ASCII 13
      const kbdDigits = [
        ['+', '-', '*', '/'],
        ['7', '8', '9', '='],
        ['4', '5', '6', '\b'],
        ['1', '2', '3', '\r'],
        ['.', '0', '%', '\r']
      ];
      // 1. 主体背景 + 边框（buf32，flush 前）
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: alpha, border: nkBorderW, border_alpha: alpha, border_mask: 0,
        color: nkCellCol, border_color: nkBorderCol, radius: nkRadius
      });
      // 2. 各按钮（背景+边框）+ 4bpp 图标（buf32，flush 前）
      //    SGL: btn_col==3 && btn_row==2 → backspace_icon
      //         btn_col==3 && btn_row==3 → btn.y2 += margin+box_h, enter_icon（跨 row3+row4）
      //         btn_col==3 && btn_row==4 → 跳过（已合并到 enter）
      const textBtns = [];
      for (let r = 0; r < ROW; r++) {
        for (let c = 0; c < COL; c++) {
          if (r === 4 && c === 3) continue;
          const isBack = (r === 2 && c === 3);
          const isOk = (r === 3 && c === 3);
          const bx = nkMargin + c * (boxW + nkMargin);
          const by = nkMargin + r * (boxH + nkMargin);
          const bw = boxW;
          const bh = isOk ? (2 * boxH + nkMargin) : boxH;
          R.drawRect(surf, bx, by, bx + bw - 1, by + bh - 1, {
            alpha: alpha, border: nkBtnBorderW, border_alpha: alpha, border_mask: 0,
            color: nkBtnCol, border_color: nkBtnBorderCol, radius: nkBtnRadius
          });
          if (isBack) {
            // backspace icon 30×13: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (boxH - 13 + 1) / 2
            const iconX = bx + Math.floor((bw - R.NUMBERKBD_BACKSPACE_ICON.width) / 2);
            const iconY = by + Math.floor((boxH - R.NUMBERKBD_BACKSPACE_ICON.height + 1) / 2);
            R.drawIcon(surf, iconX, iconY, nkTextCol, alpha, R.NUMBERKBD_BACKSPACE_ICON);
          } else if (isOk) {
            // enter icon 30×20: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (2*boxH - 20) / 2
            const iconX = bx + Math.floor((bw - R.NUMBERKBD_ENTER_ICON.width) / 2);
            const iconY = by + Math.floor((2 * boxH - R.NUMBERKBD_ENTER_ICON.height) / 2);
            R.drawIcon(surf, iconX, iconY, nkTextCol, alpha, R.NUMBERKBD_ENTER_ICON);
          } else {
            // 文字按钮：用 "0" 字符宽度居中
            const ch = kbdDigits[r][c];
            textBtns.push({ x1: bx, y1: by, x2: bx + bw - 1, y2: by + bh - 1, ch: ch });
          }
        }
      }
      flushWidget(surf);
      // 3. 文字按钮文本（drawString，flush 之后，居中）
      for (const btn of textBtns) {
        const coords = { x1: btn.x1, y1: btn.y1, x2: btn.x2, y2: btn.y2 };
        const pos = R.getTextPos(coords, btn.ch, nkFontSize, 4, alignStrToNum('CENTER'));
        overlayTextAt({ text: btn.ch, color: (w.textColor || '#000000'), fontSize: nkFontSize, fontFamily: (w.fontFamily || ''), x: pos.x, y: pos.y, align: 'CENTER' });
      }
      break;
    }

    case 'keyboard': {
      // SGLRenderer 像素级渲染：主体 + 4 行按键 + 按键文字（用 splitLen 切分）
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const kbMainAlpha = w.mainAlpha != null ? w.mainAlpha : 255;
      const kbBorderAlpha = w.borderAlpha != null ? w.borderAlpha : 255;
      const kbCellCol = R.hexToColor(w.cellColor || '#FFFFFF');
      const kbBorderCol = R.hexToColor(w.borderColor || '#000000');
      const kbBorderW = w.borderWidth != null ? w.borderWidth : 1;
      const kbRadius = w.radius || 0;
      const kbBtnCol = R.hexToColor(w.btnColor || '#404040');
      const kbBtnBorderCol = R.hexToColor(w.btnBorderColor || '#000000');
      const kbBtnBorderW = w.btnBorderWidth != null ? w.btnBorderWidth : 0;
      const kbBtnBorderAlpha = w.btnBorderAlpha != null ? w.btnBorderAlpha : 255;
      const kbBtnRadius = w.btnRadius || 0;
      const kbTextCol = R.hexToColor(w.textColor || '#000000');
      const kbFontSize = w.fontSize || 14;
      const kbFontFamily = getCssFontStack(w.fontFamily || '');
      const bodyW = w.width, bodyH = w.height;
      const kbMargin = 2;     // 按键之间以及与主体边的间距
      const kbRowGap = 2;     // 行间距
      const kbRows = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M','⌫']
      ];
      const ROW = kbRows.length;
      const rowH = (bodyH - kbBorderW * 2 - (ROW + 1) * kbRowGap) / ROW;
      // 1. 主体背景 + 边框
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: Math.min(alpha, kbMainAlpha), border: kbBorderW, border_alpha: Math.min(alpha, kbBorderAlpha), border_mask: 0,
        color: kbCellCol, border_color: kbBorderCol, radius: kbRadius
      });
      // 2. 各按键（用 splitLen 按等权切分宽度）
      const btnRects = [];
      const innerX1 = kbBorderW + kbMargin;
      const innerX2 = bodyW - 1 - kbBorderW - kbMargin;
      const innerW = innerX2 - innerX1 + 1;
      for (let r = 0; r < ROW; r++) {
        const row = kbRows[r];
        const n = row.length;
        const widths = new Array(n);
        const weights = new Array(n).fill(1);
        R.splitLen(weights, n, innerW, kbMargin, widths);
        const by = kbBorderW + kbMargin + r * (rowH + kbRowGap);
        let bx = innerX1;
        for (let c = 0; c < n; c++) {
          const bw = widths[c];
          R.drawRect(surf, bx, by, bx + bw - 1, by + rowH - 1, {
            alpha: alpha, border: kbBtnBorderW, border_alpha: Math.min(alpha, kbBtnBorderAlpha), border_mask: 0,
            color: kbBtnCol, border_color: kbBtnBorderCol, radius: kbBtnRadius
          });
          btnRects.push({ x1: bx, y1: by, x2: bx + bw - 1, y2: by + rowH - 1, text: row[c] });
          bx += bw + kbMargin;
        }
      }
      flushWidget(surf);
      // 3. 按键文字（flush 之后，居中）
      for (const btn of btnRects) {
        const coords = { x1: btn.x1, y1: btn.y1, x2: btn.x2, y2: btn.y2 };
        const pos = R.getTextPos(coords, btn.text, kbFontSize, 4, alignStrToNum('CENTER'));
        overlayTextAt({ text: btn.text, color: (w.textColor || '#000000'), fontSize: kbFontSize, fontFamily: (w.fontFamily || ''), x: pos.x, y: pos.y, align: 'CENTER' });
      }
      break;
    }

    case 'scope': {
      // SGL scope: 严格移植自 sgl_scope.c
      // 默认: bg=黑, grid=(50,50,50), border_width=0, waveform=绿(0,255,0), line_width=2
      // 网格: 中心十字线 + 10 条垂直 + 10 条水平网格线 (i=1..9)
      // 波形: 从右向左画, Y 轴反转 (y = y2 - (value-min)*height/(max-min))
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const scBgCol = R.hexToColor(w.bgColor || '#000000'); // SGL: (0,0,0)
      const scBorderCol = R.hexToColor(w.borderColor || '#969696'); // SGL: (150,150,150)
      const scBorderW = w.borderWidth != null ? w.borderWidth : 0;
      const scGridCol = R.hexToColor(w.gridColor || '#323232'); // SGL: (50,50,50)
      const scLineW = w.lineWidth != null ? w.lineWidth : 2;
      const scGridStyle = w.gridStyle != null ? w.gridStyle : 0; // 0=实线, >0=虚线
      const bodyW = w.width, bodyH = w.height;

      // 1. 主体背景 + 边框（radius=0）
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: alpha, border: scBorderW, border_alpha: alpha, border_mask: 0,
        color: scBgCol, border_color: scBorderCol, radius: 0
      });

      // 2. 中心十字线
      const xCenter = Math.floor((bodyW - 1) / 2);
      const yCenter = Math.floor((bodyH - 1) / 2);
      if (scGridStyle > 0) {
        R.drawDashedLine(surf, 0, yCenter, bodyW - 1, yCenter, scGridStyle, scGridStyle, scGridCol, alpha);
        R.drawDashedLine(surf, xCenter, 0, xCenter, bodyH - 1, scGridStyle, scGridStyle, scGridCol, alpha);
      } else {
        R.drawHLine(surf, 0, bodyW - 1, yCenter, 1, scGridCol, alpha);
        R.drawVLine(surf, xCenter, 0, bodyH - 1, 1, scGridCol, alpha);
      }

      // 3. 10 条垂直网格线 (i=1..9)
      for (let i = 1; i < 10; i++) {
        const x = Math.floor(bodyW * i / 10);
        if (scGridStyle > 0) {
          R.drawDashedLine(surf, x, 0, x, bodyH - 1, scGridStyle, scGridStyle, scGridCol, alpha);
        } else {
          R.drawVLine(surf, x, 0, bodyH - 1, 1, scGridCol, alpha);
        }
      }

      // 4. 10 条水平网格线 (i=1..9)
      for (let i = 1; i < 10; i++) {
        const y = Math.floor(bodyH * i / 10);
        if (scGridStyle > 0) {
          R.drawDashedLine(surf, 0, y, bodyW - 1, y, scGridStyle, scGridStyle, scGridCol, alpha);
        } else {
          R.drawHLine(surf, 0, bodyW - 1, y, 1, scGridCol, alpha);
        }
      }

      // 5. 波形: 从右向左画, Y 轴反转
      // SGL: start.x = x2; start.y = y2 - (value-min)*height/(max-min)
      //      end.x = x2 - i*width/(data_points-1)
      // 解析通道数据
      const chBufStr = w.channelBuffers || '';
      const chColStr = w.channelWaveformColors || '#00FF00';
      const channels = chBufStr ? chBufStr.split('|') : [];
      const chCols = chColStr.split(';').map(s => s.trim()).filter(s => s);
      const rangeMin = Number(w.rangeMin != null ? w.rangeMin : 0);
      const rangeMax = Number(w.rangeMax != null ? w.rangeMax : 65535);
      const rangeSpan = Math.max(1, rangeMax - rangeMin);
      if (channels.length > 0) {
        // 有用户数据时按用户数据绘制
        channels.forEach((bufStr, ci) => {
          const points = bufStr.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
          if (points.length < 2) return;
          const col = R.hexToColor(chCols[ci] || chCols[0] || '#00FF00');
          const n = points.length;
          // SGL: start.x = x2, 然后逐步向左
          //      end.x = x2 - i*width/(data_points-1)
          let prevX = bodyW - 1;
          let prevV = Math.max(rangeMin, Math.min(rangeMax, points[n - 1]));
          let prevY = (bodyH - 1) - Math.round((bodyH - 1) * (prevV - rangeMin) / rangeSpan);
          for (let i = 1; i < n; i++) {
            // 当前点 (从倒数第二个开始)
            const idx = n - 1 - i;
            const curV = Math.max(rangeMin, Math.min(rangeMax, points[idx]));
            const curX = (bodyW - 1) - Math.floor(i * (bodyW - 1) / (n - 1));
            const curY = (bodyH - 1) - Math.round((bodyH - 1) * (curV - rangeMin) / rangeSpan);
            R.drawLine(surf, prevX, prevY, curX, curY, scLineW, col, alpha);
            prevX = curX;
            prevY = curY;
          }
        });
      } else {
        // 无用户数据, 模拟正弦波
        const dataPoints = Math.min(bodyW, 64);
        const pts = [];
        for (let i = 0; i < dataPoints; i++) {
          const v = Math.floor((Math.sin(i * 0.2) * 0.4 + 0.5) * (bodyH - 1));
          const px = bodyW - 1 - Math.floor(i * (bodyW - 1) / (dataPoints - 1));
          const py = (bodyH - 1) - v;
          pts.push({ x: px, y: py });
        }
        const col = R.hexToColor(chCols[0] || '#00FF00');
        for (let i = 1; i < pts.length; i++) {
          R.drawLine(surf, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, scLineW, col, alpha);
        }
      }
      flushWidget(surf);
      break;
    }

    case 'spectrum': {
      // SGL spectrum: 严格移植自 sgl_spectrum.c
      // bar_width = obj_width / (bar_num + 1)
      // BAR 模式: rect.y1 = y2 - bar_value[i], 连续填充
      // BLOCK 模式: 每隔 (bar_hat_height + 1) 像素画一个 block
      // HAT 模式: rect_hat.y1 = min(y2 - bar_hat[i], rect.y1 - bar_hat_height)
      // bar 间距: rect.x1 += (bar_width + 1)
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const spBarCol = R.hexToColor(w.barColor || '#000000'); // SGL: SGL_THEME_BG_COLOR
      const spHatCol = R.hexToColor(w.barHatColor || '#808080'); // SGL: mixer(黑, 白, 128)
      const spHatH = w.barHatHeight != null ? w.barHatHeight : 3;
      // mode: 1=BAR, 2=BLOCK, 5=BAR_HAT, 6=BLOCK_HAT
      const spMode = w.barMode != null ? w.barMode : 2; // SGL 默认 BLOCK
      const hasHat = (spMode & 4) !== 0;
      const isBlock = (spMode & 2) !== 0;
      const isBar = (spMode & 1) !== 0;
      const bodyW = w.width, bodyH = w.height;

      // 解析 barValues（; 分隔的 0-100 百分比值）
      const valStr = w.barValues || '';
      let vals = valStr ? valStr.split(';').map(s => parseFloat(s.trim())).filter(v => !isNaN(v)) : [];
      let n = w.barNum && w.barNum > 0 ? w.barNum : vals.length;
      if (n <= 0) n = 12;
      while (vals.length < n) vals.push(20 + (vals.length * 13) % 70);

      // bar_width = obj_width / (bar_num + 1)
      const barW = Math.max(1, Math.floor(bodyW / (n + 1)));
      // hat 值 (峰值跟随), 简化为 0
      const hatVals = new Array(n).fill(0);

      // SGL: rect.x1 = obj->coords.x1, rect.y2 = obj->coords.y2
      let rectX1 = 0;
      const objY2 = bodyH - 1;

      if (isBar) {
        // BAR 模式: 连续填充
        for (let i = 0; i < n; i++) {
          const v = Math.max(0, Math.min(100, vals[i] || 0));
          const bh = Math.max(0, Math.round(bodyH * v / 100));
          const rectX2 = rectX1 + barW - 1;
          const rectY1 = objY2 - bh;
          R.drawFillRect(surf, rectX1, rectY1, rectX2, objY2, 0, spBarCol, alpha);
          if (hasHat) {
            const hatY1 = Math.min(objY2 - hatVals[i], rectY1 - spHatH);
            const hatY2 = hatY1 + spHatH - 1;
            R.drawFillRect(surf, rectX1, hatY1, rectX2, hatY2, 0, spHatCol, alpha);
          }
          rectX1 += (barW + 1);
        }
      } else if (isBlock) {
        // BLOCK 模式: 每隔 (bar_hat_height + 1) 像素画一个 block
        for (let i = 0; i < n; i++) {
          const v = Math.max(0, Math.min(100, vals[i] || 0));
          const bh = Math.max(0, Math.round(bodyH * v / 100));
          const pos = objY2 - bh;
          const rectX2 = rectX1 + barW - 1;
          let lastRectY1 = objY2;
          for (let curY2 = objY2; curY2 > pos; curY2 -= (spHatH + 1)) {
            const curY1 = curY2 - spHatH + 1;
            R.drawFillRect(surf, rectX1, curY1, rectX2, curY2, 0, spBarCol, alpha);
            lastRectY1 = curY1;
          }
          if (hasHat) {
            const hatY1 = Math.min(objY2 - hatVals[i], lastRectY1 - spHatH);
            const hatY2 = hatY1 + spHatH - 1;
            R.drawFillRect(surf, rectX1, hatY1, rectX2, hatY2, 0, spHatCol, alpha);
          }
          rectX1 += (barW + 1);
        }
      }
      flushWidget(surf);
      break;
    }

    case 'qrcode': {
      // SGLRenderer 像素级渲染：白底 + 黑色单元格 + 三角定位标记（简化模拟）
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const qrBgCol = R.hexToColor(w.bgColor || '#ffffff');
      const qrCellCol = R.hexToColor(w.cellColor || '#000000');
      const qrScale = w.scale || 4;
      const bodyW = w.width, bodyH = w.height;
      // 1. 白底
      R.drawFillRect(surf, 0, 0, bodyW - 1, bodyH - 1, 0, qrBgCol, alpha);
      // 2. 用 qrText 生成确定性伪随机位图
      const qrText = String(w.qrText || 'hello');
      let hash = 5381;
      for (let i = 0; i < qrText.length; i++) hash = ((hash << 5) + hash + qrText.charCodeAt(i)) >>> 0;
      // 总单元格数（按 scale 切分）
      const cellsX = Math.max(7, Math.floor(bodyW / qrScale));
      const cellsY = Math.max(7, Math.floor(bodyH / qrScale));
      const grid = [];
      for (let r = 0; r < cellsY; r++) {
        grid.push([]);
        for (let c = 0; c < cellsX; c++) {
          hash = ((hash << 5) + hash + (r * 31 + c)) >>> 0;
          grid[r].push((hash & 1) === 1);
        }
      }
      // 3. 三个定位标记（7x7，外框 + 3x3 中心）
      const finder = (grid, gr, gc) => {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const isOuter = (r === 0 || r === 6 || c === 0 || c === 6);
            const isInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            grid[gr + r][gc + c] = isOuter || isInner;
          }
        }
      };
      if (cellsX >= 7 && cellsY >= 7) {
        finder(grid, 0, 0);
        finder(grid, 0, cellsX - 7);
        finder(grid, cellsY - 7, 0);
      }
      // 4. 绘制单元格
      for (let r = 0; r < cellsY; r++) {
        for (let c = 0; c < cellsX; c++) {
          if (grid[r][c]) {
            const x1 = c * qrScale;
            const y1 = r * qrScale;
            R.drawFillRect(surf, x1, y1, x1 + qrScale - 1, y1 + qrScale - 1, 0, qrCellCol, alpha);
          }
        }
      }
      flushWidget(surf);
      break;
    }

    case 'chart': {
      // SGLRenderer 像素级渲染：背景 + 网格 + 折线/柱形/饼图
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const chBgCol = R.hexToColor(w.bgColor || '#000000');
      const chBorderCol = R.hexToColor(w.borderColor || '#000000');
      const chBorderW = w.borderWidth != null ? w.borderWidth : 0;
      const chGridCol = R.hexToColor(w.gridColor || '#3C3C3C');
      const chTextCol = R.hexToColor(w.textColor || '#000000');
      const chFontSize = w.fontSize || 12;
      const chFontFamily = getCssFontStack(w.fontFamily || '');
      const chType = w.chartType || 'linechart';
      const bodyW = w.width, bodyH = w.height;
      // 1. 主体背景 + 边框
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: alpha, border: chBorderW, border_alpha: alpha, border_mask: 0,
        color: chBgCol, border_color: chBorderCol, radius: 0
      });
      const inX1 = chBorderW + 2, inY1 = chBorderW + 2;
      const inX2 = bodyW - 1 - chBorderW - 2, inY2 = bodyH - 1 - chBorderW - 2;
      const inW = Math.max(1, inX2 - inX1 + 1);
      const inH = Math.max(1, inY2 - inY1 + 1);

      if (chType === 'piechart') {
        // 饼图：从 startAngle 起按 sliceValues 切分
        const sliceVals = (w.sliceValues || '30;50;20').split(';').map(s => parseFloat(s.trim()) || 0);
        const sliceCols = (w.sliceColors || '#ff0000;#00ff00;#0000ff').split(';').map(s => s.trim());
        const sliceLabs = (w.sliceLabels || 'A;B;C').split(';').map(s => s.trim());
        let total = sliceVals.reduce((a, b) => a + b, 0);
        if (total <= 0) total = 1;
        const cx = bodyW / 2, cy = bodyH / 2;
        const rOut = w.radius && w.radius > 0 ? w.radius : Math.min(bodyW, bodyH) / 2 - 1;
        const rIn = w.innerRadiusRate > 0 ? Math.round(rOut * w.innerRadiusRate / 100) : 0;
        let curAng = w.startAngle || 0;
        const labelRects = [];
        for (let i = 0; i < sliceVals.length; i++) {
          const span = sliceVals[i] * 360 / total;
          const endAng = curAng + span;
          const col = R.hexToColor(sliceCols[i] || sliceCols[0] || '#FFFFFF');
          R.drawFillArc(surf, {
            cx, cy, radius_in: rIn, radius_out: rOut,
            start_angle: curAng, end_angle: endAng, mode: 0,
            color: col, bg_color: col, alpha: alpha
          });
          // 标签位置（在扇形中部偏外）
          const midAng = (curAng + endAng) / 2;
          const rad = midAng * Math.PI / 180;
          const lx = cx + (rOut * 0.7) * Math.sin(rad);
          const ly = cy - (rOut * 0.7) * Math.cos(rad);
          labelRects.push({ x: lx, y: ly, text: sliceLabs[i] || '' });
          curAng = endAng;
        }
        flushWidget(surf);
        // 文字（flush 之后）
        for (const lbl of labelRects) {
          if (lbl.text) {
            const coords = { x1: lbl.x - chFontSize, y1: lbl.y - chFontSize / 2, x2: lbl.x + chFontSize, y2: lbl.y + chFontSize / 2 };
            const pos = R.getTextPos(coords, lbl.text, chFontSize, 1, alignStrToNum('CENTER'));
            overlayTextAt({ text: lbl.text, color: (w.textColor || '#000000'), fontSize: chFontSize, fontFamily: (w.fontFamily || ''), x: pos.x, y: pos.y, align: 'CENTER' });
          }
        }
      } else {
        // linechart / barchart 共用坐标轴
        // 网格（4 横 4 竖）
        const gridN = 4;
        for (let i = 1; i < gridN; i++) {
          const gy = inY1 + Math.round(inH * i / gridN);
          R.drawHLine(surf, inX1, inX2, gy, 1, chGridCol, alpha);
        }
        for (let i = 1; i < gridN; i++) {
          const gx = inX1 + Math.round(inW * i / gridN);
          R.drawVLine(surf, gx, inY1, inY2, 1, chGridCol, alpha);
        }
        // 解析序列数据
        const seriesArr = (w.seriesData || '').split(';').filter(s => s.length > 0);
        const seriesCols = (w.seriesColors || '#FFFFFF').split(';').map(s => s.trim());
        const valMin = Number(w.minValue != null ? w.minValue : 0);
        const valMax = Number(w.maxValue != null ? w.maxValue : 100);
        const valSpan = Math.max(1, valMax - valMin);
        if (chType === 'barchart') {
          // 柱形图：每条序列在每个 x 位置画一组柱形
          const groupCount = seriesArr.length > 0 ? seriesArr[0].split(',').filter(s => s !== '').length : 0;
          const seriesCount = seriesArr.length;
          if (groupCount > 0 && seriesCount > 0) {
            const groupW = inW / groupCount;
            const barW = Math.max(1, Math.floor(groupW * 0.8 / seriesCount));
            for (let gi = 0; gi < groupCount; gi++) {
              const groupX = inX1 + Math.round(groupW * (gi + 0.5));
              const barsStartX = groupX - Math.round(barW * seriesCount / 2);
              for (let si = 0; si < seriesCount; si++) {
                const vals = seriesArr[si].split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
                const v = Math.max(valMin, Math.min(valMax, vals[gi] || 0));
                const bh = Math.max(1, Math.round(inH * (v - valMin) / valSpan));
                const bx = barsStartX + si * barW;
                const by = inY2 - bh;
                const col = R.hexToColor(seriesCols[si] || seriesCols[0] || '#FFFFFF');
                R.drawFillRect(surf, bx, by, bx + barW - 1, inY2, 0, col, alpha);
              }
            }
          }
        } else {
          // linechart：每条序列画折线
          for (let si = 0; si < seriesArr.length; si++) {
            const vals = seriesArr[si].split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
            if (vals.length < 1) continue;
            const col = R.hexToColor(seriesCols[si] || seriesCols[0] || '#FFFFFF');
            const n = vals.length;
            for (let i = 0; i < n - 1; i++) {
              const x1 = inX1 + Math.round(inW * i / Math.max(1, n - 1));
              const x2 = inX1 + Math.round(inW * (i + 1) / Math.max(1, n - 1));
              const v1 = Math.max(valMin, Math.min(valMax, vals[i]));
              const v2 = Math.max(valMin, Math.min(valMax, vals[i + 1]));
              const y1 = inY2 - Math.round(inH * (v1 - valMin) / valSpan);
              const y2 = inY2 - Math.round(inH * (v2 - valMin) / valSpan);
              R.drawLine(surf, x1, y1, x2, y2, 2, col, alpha);
            }
          }
        }
        flushWidget(surf);
        // X 轴标签
        const xLabels = (w.xLabels || '').split(';').map(s => s.trim()).filter(s => s);
        if (xLabels.length > 0) {
          const n = xLabels.length;
          for (let i = 0; i < n; i++) {
            const lx = inX1 + Math.round(inW * (i + 0.5) / n);
            const ly = inY2 + 2;
            const coords = { x1: lx - 20, y1: ly, x2: lx + 20, y2: ly + chFontSize + 2 };
            const pos = R.getTextPos(coords, xLabels[i], chFontSize, 1, alignStrToNum('CENTER'));
            overlayTextAt({ text: xLabels[i], color: (w.textColor || '#000000'), fontSize: chFontSize, fontFamily: (w.fontFamily || ''), x: pos.x, y: pos.y, align: 'CENTER' });
          }
        }
      }
      break;
    }

    case 'canvas': {
      // SGLRenderer 像素级渲染：背景 + 边框 + 网格线
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cvBg = R.hexToColor(w.bgColor || '#1e1e2e');
      const cvBorderCol = R.hexToColor(w.borderColor || '#3d3d5c');
      const cvBorderW = w.borderWidth != null ? w.borderWidth : 1;
      const cvRadius = w.radius != null ? w.radius : 4;
      const cvGridCol = R.hexToColor(w.color || '#8b5cf6');
      // 背景 + 边框
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: cvBorderW, border_alpha: alpha, border_mask: 0,
        color: cvBg, border_color: cvBorderCol, radius: cvRadius
      });
      // 网格线（透明度 0.1 ≈ 26）
      const gridAlpha = Math.round(alpha * 0.1);
      const step = 10;
      for (let x = step; x < w.width; x += step) {
        R.drawVLine(surf, x, 0, w.height - 1, 1, cvGridCol, gridAlpha);
      }
      for (let y = step; y < w.height; y += step) {
        R.drawHLine(surf, 0, w.width - 1, y, 1, cvGridCol, gridAlpha);
      }
      flushWidget(surf);
      break;
    }

    case 'analogclock': {
      // SGL analogclock: 严格移植自 sgl_analogclock.c
      // 角度系统：所有角度 -90（转为 0°=右系统，与 sgl_sin/sgl_cos 一致）
      // 指针长度：时针 h_len=inner_r/2, 分针 m_len=inner_r*160/256
      //   秒针前端 s_len_1=inner_r*217/256, 尾部 s_len_2=inner_r*39/256
      // 两段式指针：细柄(中心→尾部, sec_ptr_width) + 粗头(尾部→前端, hour/min_ptr_width)
      // 秒针：反向尾部 -s_len_2 → 前端 s_len_1
      // hub 三层内凹（坐标 cx-1, cy-1）：r+1 min_ptr_color, r hub_color, r-2 bg_color
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const acBg = R.hexToColor(w.bgColor || '#000000');
      const acScaleCol = R.hexToColor(w.scaleColor || '#FFFFFF');
      const acTextCol = R.hexToColor(w.textColor || '#FFFFFF');
      const acHourCol = R.hexToColor(w.hourPtrColor || '#FFFFFF');
      const acMinCol = R.hexToColor(w.minPtrColor || '#FFFFFF');
      const acSecCol = R.hexToColor(w.secPtrColor || '#FF0000');
      const acHubCol = R.hexToColor(w.hubColor || '#FF0000');
      const acScaleW = w.scaleWidth != null ? w.scaleWidth : 1;
      const acScaleLen = Math.max(w.scaleLength != null ? w.scaleLength : 8, 4);
      const acHourW = w.hourPtrWidth != null ? w.hourPtrWidth : 5;
      const acMinW = w.minPtrWidth != null ? w.minPtrWidth : 5;
      const acSecW = w.secPtrWidth != null ? w.secPtrWidth : 2;
      const acHubR = Math.max(5, w.hubRadius != null ? w.hubRadius : 6);
      const acFontSize = w.fontSize || 12;
      const acFontH = acFontSize + 8; // SGL sgl_font_get_height
      const acFontFamily = getCssFontStack(w.fontFamily || '');
      const hour = w.hour || 0, minute = w.minute || 0, second = w.second || 0;

      const cx = w.width / 2;
      const cy = w.height / 2;
      const r = Math.max(0, Math.max((w.radius || 0), w.width / 2 - 1));
      const acBorderW = Math.min((w.borderWidth || 0), r);
      const innerR = Math.max(0, r - acBorderW);
      const scaleOut = Math.max(0, innerR - 2);
      const scaleIn = Math.max(0, scaleOut - acScaleLen);
      // SGL: h_len=inner_r/2, m_len=inner_r*160/256, s_len_1=inner_r*217/256, s_len_2=inner_r*39/256
      const hLen = innerR / 2;
      const mLen = (innerR * 160) >> 8;
      const sLen1 = (innerR * 217) >> 8;
      const sLen2 = (innerR * 39) >> 8;
      const subScaleCol = R.colorMixer(acScaleCol, acBg, 128);

      // deg2rad: 0°=右系统（与 Math.sin/cos 一致，SGL sgl_sin/sgl_cos 同此）
      const deg2rad = d => d * Math.PI / 180;

      // 1. 背景圆
      R.drawFillCircle(surf, cx, cy, r, acBg, alpha);
      // 2. 边框环（如 borderWidth > 0）
      if (acBorderW > 0) {
        R.drawFillRing(surf, cx, cy, innerR, r, acBg, alpha);
      }

      // 3. 60 刻度 - SGL: calc_angle = i*6 - 90
      for (let i = 0; i < 60; i++) {
        const angle = i * 6 - 90;
        const rad = deg2rad(angle);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const xo = cx + scaleOut * cos;
        const yo = cy + scaleOut * sin;
        const xi = cx + scaleIn * cos;
        const yi = cy + scaleIn * sin;
        const isMain = (i % 5 === 0);
        R.drawLine(surf, xo, yo, xi, yi, isMain ? acScaleW * 2 : acScaleW,
                   isMain ? acScaleCol : subScaleCol, alpha);
      }

      // 4. 时针、分针（两段式：粗头 尾部→前端 + 细柄 中心→尾部）
      const hAngle = ((hour % 12) * 30 + Math.floor(minute / 2)) - 90;
      const mAngle = (minute * 6) - 90;
      const sAngle = (second * 6) - 90;
      function drawHand(angleDeg, tailLen, tipLen, mainWidth, tailWidth, color) {
        const rad = deg2rad(angleDeg);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const sx = cx + tailLen * cos;
        const sy = cy + tailLen * sin;
        const px = cx + tipLen * cos;
        const py = cy + tipLen * sin;
        // SGL: 先画 尾部→前端（粗），再画 中心→尾部（细）
        R.drawLine(surf, sx, sy, px, py, mainWidth, color, alpha);
        if (tailWidth > 0 && tailLen > 0) {
          R.drawLine(surf, cx, cy, sx, sy, tailWidth, color, alpha);
        }
      }
      drawHand(hAngle, sLen2, hLen, acHourW, acSecW, acHourCol);
      drawHand(mAngle, sLen2, mLen, acMinW, acSecW, acMinCol);

      // 5. hub 第一层（minPtrColor, hub_r+1，坐标 cx-1, cy-1）- 在秒针前画
      R.drawFillCircle(surf, cx - 1, cy - 1, acHubR + 1, acMinCol, alpha);

      // 6. 秒针（反向尾部 -s_len_2 → 前端 s_len_1）
      {
        const rad = deg2rad(sAngle);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        R.drawLine(surf, cx - sLen2 * cos, cy - sLen2 * sin, cx + sLen1 * cos, cy + sLen1 * sin, acSecW, acSecCol, alpha);
      }

      // 7. hub 第二层（hubColor, hub_r，坐标 cx-1, cy-1）- 在秒针后画
      R.drawFillCircle(surf, cx - 1, cy - 1, acHubR, acHubCol, alpha);
      // 8. hub 第三层（bgColor, hub_r-2，坐标 cx-1, cy-1）- 内凹效果
      if (acHubR - 2 > 0) {
        R.drawFillCircle(surf, cx - 1, cy - 1, acHubR - 2, acBg, alpha);
      }

      flushWidget(surf);

      // 9. 数字（flush 后绘制）- SGL: i==0 显示 12, 其他显示 i/5
      const textR = Math.max(0, scaleIn - acFontH - 2);
      for (let i = 0; i < 60; i++) {
        if (i % 5 !== 0) continue;
        const angle = i * 6 - 90;
        const rad = deg2rad(angle);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const tx = cx + textR * cos;
        const ty = cy + textR * sin;
        const text = i === 0 ? '12' : String(i / 5);
        const tw = R.stringWidth(text, acFontSize);
        const th = R.fontHeight(acFontSize);
        overlayTextAt({ text, color: (w.textColor || '#FFFFFF'), fontSize: acFontSize, fontFamily: (w.fontFamily || ''), x: Math.round(tx - tw / 2), y: Math.round(ty - th / 2), align: 'CENTER' });
      }
      break;
    }

    case '2dball': {
      // SGL 2dball: 线性渐变球体, SGL 默认 color=白, bg=黑, radius=width/2
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cx = w.width / 2;
      const cy = w.height / 2;
      // SGL: radius = sgl_obj_get_width(obj) / 2
      const radius = w.width / 2;
      const bgCol = R.hexToColor(w.bgColor || '#000000');
      const ballCol = R.hexToColor(w.color || '#FFFFFF');
      // 球体线性渐变
      R.draw2dBall(surf, cx, cy, radius, ballCol, bgCol, alpha);
      flushWidget(surf);
      break;
    }

    case 'icon':
    case 'sprite': {
      // SGLRenderer 像素级渲染：背景 + 边框 + 居中占位文本
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const iconBg = R.hexToColor(w.bgColor || '#000000');
      const iconBorderCol = R.hexToColor(w.borderColor || '#000000');
      const iconBorderW = w.borderWidth != null ? w.borderWidth : 0;
      const iconRadius = w.radius != null ? w.radius : 4;
      const iconColor = R.hexToColor(w.color || '#8b5cf6');
      // 背景 + 边框
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: iconBorderW, border_alpha: alpha, border_mask: 0,
        color: iconBg, border_color: iconBorderCol, radius: iconRadius
      });
      flushWidget(surf);
      // 占位文本居中绘制
      const iconMap = { 'icon': '★', 'sprite': '◆' };
      const iconText = iconMap[w.type] || '●';
      const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
      if (iconFontSize > 0) {
        const tw = R.stringWidth(iconText, iconFontSize);
        const th = R.fontHeight(iconFontSize);
        const tx = Math.round((w.width - tw) / 2);
        const ty = Math.round((w.height - th) / 2);
        overlayText({ text: iconText, color: (w.color || '#8b5cf6'), fontSize: iconFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
      }
      break;
    }

    case 'ext_img': {
      // SGLRenderer 像素级渲染：背景 + 边框 + 居中占位文本
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const eiBg = R.hexToColor('#313149');
      const eiBorderCol = R.hexToColor('#3d3d5c');
      // 背景 + 边框
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: 1, border_alpha: alpha, border_mask: 0,
        color: eiBg, border_color: eiBorderCol, radius: 4
      });
      flushWidget(surf);
      // 占位文本（rotation/scale 在像素级渲染中无法直接应用，仅绘制居中图标）
      const eiText = 'IMG';
      const eiFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
      const eiColor = R.hexToColor('#8b5cf6');
      const eiAlphaEff = Math.round(alpha * 0.4);
      const tw = R.stringWidth(eiText, eiFontSize);
      const th = R.fontHeight(eiFontSize);
      const tx = Math.round((w.width - tw) / 2);
      const ty = Math.round((w.height - th) / 2);
      overlayText({ text: eiText, color: `rgba(139,92,246,${eiAlphaEff / 255})`, fontSize: eiFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
      break;
    }

    default: {
      // SGLRenderer 像素级渲染：背景 + 边框 + 居中类型名
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const defBg = R.hexToColor(w.bgColor || '#313149');
      const defBorderCol = R.hexToColor(w.borderColor || '#8b5cf6');
      const defBorderW = w.borderWidth != null ? w.borderWidth : 1;
      const defRadius = w.radius != null ? w.radius : 4;
      R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: defBorderW, border_alpha: alpha, border_mask: 0,
        color: defBg, border_color: defBorderCol, radius: defRadius
      });
      flushWidget(surf);
      const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
      const defText = w.text || typeInfo?.name || w.type || '';
      const defColor = R.hexToColor(w.color || '#8b5cf6');
      const defFontSize = 12;
      const tw = R.stringWidth(defText, defFontSize);
      const th = R.fontHeight(defFontSize);
      const tx = Math.round((w.width - tw) / 2);
      const ty = Math.round((w.height - th) / 2);
      overlayText({ text: defText, color: (w.color || '#8b5cf6'), fontSize: defFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
    }
  }
}

function $(id) { return document.getElementById(id); }

document.getElementById('btn-prev-page').addEventListener('click', () => { currentIndex--; render(); });
document.getElementById('btn-next-page').addEventListener('click', () => { currentIndex++; render(); });

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { currentIndex--; render(); }
  if (e.key === 'ArrowRight') { currentIndex++; render(); }
});

render();
