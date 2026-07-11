import { AppState, navigate, initNav, escapeHtml, setupUpdateChecker, setupWindowControls } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_DEFAULTS, getWidgetVarName } from './sgl_api.js';
import { getCheckboxIconDataUrl } from './checkbox_icon.js';
import { invoke } from '@tauri-apps/api/core';
import {
  setFontLoadCallback, getCssFontStack, getFontBppCss, applyBppFilter,
  mixColors, hexToRgba, getWidgetAbsPos, sortWidgetsByHierarchy, flexAlign,
  toAssetUrl, pixmapFormatHasAlpha, getOpaqueImageUrl,
  getCachedPixmapImageData, preloadPixmapImage, getSglFontData, loadSglFontData,
  preloadProjectFonts
} from './render_common.js';
import qrcodeGenerator from 'qrcode-generator';

initNav('preview');
setupWindowControls();
setupUpdateChecker();
AppState.init();
setFontLoadCallback(() => render());

// 递归收集控件及其子控件需要生成的字模字符
function collectWidgetFontChars(w, fontTextMap) {
  const fam = w.fontFamily;
  if (fam && fam !== 'default') {
    const sz = w.fontSize || 14;
    const bpp = w.fontBpp || 4;
    const key = `${fam}|${sz}|${bpp}`;
    if (!fontTextMap.has(key)) fontTextMap.set(key, new Set());
    const chars = fontTextMap.get(key);
    const texts = [w.text, w.titleText, w.options, w.leftSlots, w.rightSlots];
    for (const t of texts) {
      if (t) for (const ch of String(t)) { if (ch.charCodeAt(0) >= 0x20) chars.add(ch); }
    }
  }
  for (const child of (w.widgets || [])) {
    collectWidgetFontChars(child, fontTextMap);
  }
}

// 预加载项目所有字体的 SGL 字模数据（用于像素级 WYSIWYG 文本渲染）
// 收集所有页面所有控件（含子控件）的文本字符作为 symbols，确保字模覆盖所有文本
// 返回 Promise，所有字体加载完成后 resolve，避免多次触发 render 导致卡顿
async function preloadSglFontData() {
  if (!window.SGLRenderer || !window.SGLRenderer.parseFontCFile) return;
  const project = AppState.project;
  if (!project || !project.pages) return;
  const fontTextMap = new Map();
  for (const page of project.pages) {
    for (const w of (page.widgets || [])) {
      collectWidgetFontChars(w, fontTextMap);
    }
  }
  const promises = [];
  for (const [key, charSet] of fontTextMap) {
    if (!window.SGLRenderer.getFontData(key)) {
      const [fam, sz, bpp] = key.split('|');
      const symbols = Array.from(charSet).join('');
      promises.push(loadSglFontData(fam, parseInt(sz), parseInt(bpp), symbols));
    }
  }
  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

// 项目加载后预加载字体资源，然后渲染
preloadProjectFonts(AppState.project.resources?.fonts).then(async () => {
  await preloadSglFontData();
  render();
});

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
function createWidgetCanvas(el, w, z, renderSize) {
  const R = getR();
  // 清除原有子元素
  el.innerHTML = '';
  // 移除可能残留的背景/边框样式（避免与 canvas 重叠）
  el.style.background = 'transparent';
  el.style.border = 'none';
  el.style.borderRadius = '0';
  // scroll 绑定对象时用重算的渲染尺寸
  const cw = renderSize ? renderSize.domW : w.width;
  const ch = renderSize ? renderSize.domH : w.height;
  const canvas = document.createElement('canvas');
  const surf = R.createSurface(canvas, cw, ch, z);
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
    let absPos = getWidgetAbsPos(w, page);

    // scroll 绑定对象时，SGL 运行时强制重置 scroll 坐标贴到目标边缘
    // 设计器模拟此行为以实现 WYSIWYG（垂直贴右侧，水平贴底部）
    // 注意：scroll 的 width 属性是滚动条宽度，不能覆盖，只重算 DOM 尺寸
    let domW = w.width;
    let domH = w.height;
    // 2dball 控件：SGL circle_zoom 将控件尺寸改为 2*radius，DOM 尺寸跟随球体
    if (w.type === '2dball' && w.radius != null && w.radius > 0) {
      domW = w.radius * 2;
      domH = w.radius * 2;
    }
    // arc_label 旋转模式：el 用原始 w×h，整体旋转（与 editor.js 一致）
    // SGL obj->coords 中心 = 原始 w×h 中心，所以 el 旋转中心 = SGL 旋转中心
    // domW/domH 保持原始 w×h，不调整
    if (w.type === 'scroll' && w.bindTarget) {
      const bindWidget = page.widgets.find(wt => getWidgetVarName(wt) === w.bindTarget);
      if (bindWidget) {
        const bindAbs = getWidgetAbsPos(bindWidget, page);
        const scDirect = w.direct != null ? w.direct : 1;
        const scWidth = w.width != null ? w.width : 10;
        // 仿真效果：scroll 完全位于绑定目标边框内部，四边均不覆盖目标边框
        const bindBorder = bindWidget.borderWidth != null ? bindWidget.borderWidth : 1;
        if (scDirect === 1) {
          absPos = { x: bindAbs.x + bindWidget.width - scWidth - bindBorder, y: bindAbs.y + bindBorder };
          domW = scWidth;
          domH = bindWidget.height - 2 * bindBorder;
        } else {
          absPos = { x: bindAbs.x + bindBorder, y: bindAbs.y + bindWidget.height - scWidth - bindBorder };
          domW = bindWidget.width - 2 * bindBorder;
          domH = scWidth;
        }
      }
    }

    el.style.left = (absPos.x * z) + 'px';
    el.style.top = (absPos.y * z) + 'px';
    // SGL 闭区间坐标缩放，与 createSurface 一致，避免 cv 溢出 el 被 overflow:hidden 裁切
    el.style.width = (Math.round((domW - 1) * z) + 1) + 'px';
    el.style.height = (Math.round((domH - 1) * z) + 1) + 'px';
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

    renderPreviewWidget(el, w, z, { domW, domH }, page);

    frame.appendChild(el);
  });

  $('status-current-page').textContent = '页面 ' + (currentIndex + 1) + ' / ' + pages.length;
  $('status-page-name').textContent = page.name;
  $('status-page-size').textContent = page.width + '×' + page.height;
}

function renderPreviewWidget(el, w, z, renderSize, page) {
  // renderSize: scroll 绑定对象时的实际渲染尺寸 { domW, domH }，其他控件为 undefined
  // page: 当前页面（用于 scroll 查找绑定对象）
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
          R.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, Math.min(alpha, mainAlpha));
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
          R.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, alpha);
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
          R.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, alpha);
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
          R.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, alpha);
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
      // SGL gauge: 严格移植自 sgl_gauge.c（全部使用 SGL 整数算法）
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const gValue = w.value || 0;
      const startAngle = w.startAngle != null ? w.startAngle : 30;
      const endAngle = w.endAngle != null ? w.endAngle : 330;
      const scaleAngle = Math.max(1, w.scaleAngle || 15);
      const scaleStep = Math.max(1, w.scaleStep || 10);
      const scaleStart = w.scaleStart || 0;
      const scaleLen = Math.max(w.scaleLength || 0, 4);
      const arcW = w.arcWidth || 2;
      const scaleW = w.scaleWidth || 1;
      const ptrW = w.pointerWidth || 2;
      const bgCol = R.hexToColor(w.bgColor || '#000000');
      const arcCol = R.hexToColor(w.arcColor || '#FFFFFF');
      const scaleCol = R.hexToColor(w.scaleColor || '#FFFFFF');
      const ptrCol = R.hexToColor(w.pointerColor || '#FF0000');
      const textCol = w.textColor || '#FFFFFF';
      const hubCol = R.hexToColor(w.hubColor || '#FFFFFF');
      const redCol = R.SGL_COLOR_RED;
      const fontSize = w.fontSize || 12;
      const fontBpp = w.fontBpp != null ? w.fontBpp : 4;

      // 获取 SGL 字模数据
      const gFontFamily = w.fontFamily || '';
      const sglFont = getSglFontData(gFontFamily, fontSize, fontBpp);
      const sglFontH = sglFont ? R.fontGetHeight(sglFont) : fontSize;
      const sglStrWidth = (text) => {
        if (sglFont) return R.fontGetStringWidth(text, sglFont);
        return R.stringWidth(text, fontSize);
      };

      // SGL: cx = (x1 + x2) / 2, 整数除法
      const cx = Math.floor((0 + (w.width - 1)) / 2);
      const cy = Math.floor((0 + (w.height - 1)) / 2);
      // SGL: r = sgl_max(radius, width / 2 - 1), 整数除法
      const r = Math.max(w.radius || 0, Math.floor(w.width / 2) - 1);
      const hubRz = Math.max(Math.floor((r + 8) / 8), w.hubRadius || 0);
      const scaleOut = arcW + 6;
      const scaleIn = scaleOut + scaleLen;
      const textCr = r - scaleIn - Math.floor(sglFontH / 2) - 4;
      const ptrStart = scaleIn + 4 + ptrW;
      const ptrEnd = r - hubRz - ptrW;

      // 1. 背景圆
      R.drawFillCircle(surf, cx, cy, r, bgCol, alpha);
      // 2. 中心轴圆
      R.drawFillCircle(surf, cx, cy, Math.max(1, hubRz), hubCol, alpha);
      // 3. 外圈弧
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
      // 4. 刻度线 - SGL: sglSin/sglCos 定点整数
      const textInterval = w.textInterval != null ? w.textInterval : 3;
      const scaleWarning = w.scaleWarning != null ? w.scaleWarning : 32767;
      let scaleMask = scaleStart;
      let count = 0;
      const majorTexts = [];
      for (let angle = startAngle; angle <= endAngle + 0.01; angle += scaleAngle) {
        const isMajor = (count & textInterval) === 0;
        const sc = scaleMask < scaleWarning ? scaleCol : redCol;
        const calcAngle = angle + 90;
        const sinVal = R.sglSin(calcAngle);
        const cosVal = R.sglCos(calcAngle);
        const xOut = Math.floor((r - scaleOut) * cosVal / R.SGL_SIN_FIXED_ONE) + cx;
        const yOut = Math.floor((r - scaleOut) * sinVal / R.SGL_SIN_FIXED_ONE) + cy;
        const xIn = Math.floor((r - scaleIn) * cosVal / R.SGL_SIN_FIXED_ONE) + cx;
        const yIn = Math.floor((r - scaleIn) * sinVal / R.SGL_SIN_FIXED_ONE) + cy;
        R.drawLine(surf, xOut, yOut, xIn, yIn, isMajor ? scaleW * 2 : scaleW, sc, alpha);
        if (isMajor && (angle - startAngle) < 360) {
          const tx = Math.floor(textCr * cosVal / R.SGL_SIN_FIXED_ONE) + cx;
          const ty = Math.floor(textCr * sinVal / R.SGL_SIN_FIXED_ONE) + cy;
          majorTexts.push({ tx, ty, text: String(scaleMask) });
        }
        scaleMask += scaleStep;
        count++;
      }
      // 5. 指针 - SGL: sgl_mod360 + 整数除法
      const needleAngle = R.sglMod360(90 + startAngle + Math.floor(gValue * scaleAngle / scaleStep));
      const nSin = R.sglSin(needleAngle);
      const nCos = R.sglSin(needleAngle + 90);
      const px = Math.floor((r - ptrStart) * nCos / R.SGL_SIN_FIXED_ONE) + cx + 1;
      const py = Math.floor((r - ptrStart) * nSin / R.SGL_SIN_FIXED_ONE) + cy + 1;
      const nx = Math.floor((r - ptrEnd) * nCos / R.SGL_SIN_FIXED_ONE) + cx + 1;
      const ny = Math.floor((r - ptrEnd) * nSin / R.SGL_SIN_FIXED_ONE) + cy + 1;
      if (ptrEnd > 0) {
        R.drawLine(surf, px, py, nx, ny, Math.max(1, ptrW), ptrCol, alpha);
      }
      flushWidget(surf);
      // 6. 刻度数字
      majorTexts.forEach(mt => {
        const textLen = sglStrWidth(mt.text);
        const txtX = mt.tx - Math.floor(textLen / 2) - 2;
        const txtY = mt.ty - Math.floor(sglFontH / 2);
        overlayTextAt({ text: mt.text, color: textCol, fontSize, fontFamily: gFontFamily, x: txtX, y: txtY, align: 'CENTER' });
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
      // SGL win: 严格移植自 sgl_win.c sgl_win_construct_cb
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const winFontSize = w.fontSize != null ? w.fontSize : 14;
      const winFontBppVal = w.fontBpp || 4;
      const winFontFamilyVal = w.fontFamily || '';
      const winBorder = w.borderWidth != null ? w.borderWidth : 0;
      const winRadius = w.radius || 0;
      const winW = w.width;
      const winH = w.height;
      const winBg = R.hexToColor(w.bgColor || '#FFFFFF');
      const winBorderCol = R.hexToColor(w.borderColor || '#000000');
      // SGL: title_h = sgl_max3(obj->radius, win->title_h, sgl_font_get_height(win->title_font))
      // 必须优先使用已加载的真实字模 font_height，否则设计器与仿真 title_h 不一致会导致文本错位
      const winSglFontForMetrics = getSglFontData(winFontFamilyVal, winFontSize, winFontBppVal);
      const winFontHeight = winSglFontForMetrics ? winSglFontForMetrics.font_height : winFontSize;
      const winTitleH = Math.max(winRadius, w.titleHeight || 0, winFontHeight);
      const winTitleTextCol = R.hexToColor(w.titleTextColor || '#000000');
      const winCloseCol = R.hexToColor(w.closeBtnColor || '#FF5A50');

      // pixmap 背景图片
      const winPixmapPath = w.pixmap || '';
      const winPixmapFormat = w.pixmapFormat || 'RGB565';
      let winPixmapImg = null;
      if (winPixmapPath) {
        winPixmapImg = getCachedPixmapImageData(winPixmapPath);
        if (!winPixmapImg) {
          preloadPixmapImage(winPixmapPath, () => render());
        }
      }

      // SGL: body_area = {x1, y1+title_h, x2, y2}
      // 1. 主体背景（标题栏以下区域，使用 bg.color 和 bg.pixmap）
      R.drawRect(surf, 0, winTitleH, winW - 1, winH - 1, {
        alpha: alpha, border: winBorder, border_alpha: alpha, border_mask: 0,
        color: winBg, border_color: winBorderCol, radius: winRadius,
        pixmap: winPixmapImg, pixmapFormat: winPixmapFormat
      });
      // SGL: title_area = {x1, y1, x2, y1+title_h}
      // SGL: desc.color = win->title_bg_color（直接使用，不再混合）, pixmap = NULL
      // 2. 标题栏背景（直接使用 titleBgColor）
      if (winTitleH > 0) {
        R.drawRect(surf, 0, 0, winW - 1, winTitleH, {
          alpha: alpha, border: winBorder, border_alpha: alpha, border_mask: 0,
          color: R.hexToColor(w.titleBgColor || '#808080'), border_color: winBorderCol, radius: winRadius,
          pixmap: null, pixmapFormat: winPixmapFormat
        });
      }
      // SGL: close_r = title_h/3, close_cx = x2 - border - title_h/2, close_cy = y1 + title_h/2 + border/2
      // 3. 关闭按钮
      const winCloseR = Math.floor(winTitleH / 3);
      const winCloseCx = winW - 1 - winBorder - Math.floor(winTitleH / 2);
      const winCloseCy = Math.floor(winTitleH / 2) + Math.floor(winBorder / 2);
      if (winCloseR > 0) {
        R.drawFillCircle(surf, winCloseCx, winCloseCy, winCloseR, winCloseCol, alpha);
      }
      // 4. 标题文本
      // SGL: title_area 内缩 border, LEFT_MID 时 align_pos.x += radius, 绘制 y = align_pos.y + border
      const winTitleAlign = w.titleAlign || 'LEFT_MID';
      const titleStr = w.titleText || '窗口标题';
      const winHasFont = widgetHasFont(w);
      const winCssFamily = getCssFontStack(winFontFamilyVal);

      if (winHasFont && titleStr) {
        // 有字体：使用 SGL 字模数据像素级渲染（真正 WYSIWYG）
        // SGL win.c: title_area.x1+=border, title_area.x2-=border（不减 title_h）
        const titleTextCoords = {
          x1: winBorder, y1: 0,
          x2: winW - 1 - winBorder, y2: winTitleH
        };
        const titleAlignId = alignStrToNum(winTitleAlign);
        // 复用前面计算 title_h 时获取的字模数据
        const winSglFont = winSglFontForMetrics || getSglFontData(winFontFamilyVal, winFontSize, winFontBppVal);
        let titleDrawX, titleDrawY;
        if (winSglFont) {
          // 使用真实字模宽高计算位置 + 字模数据渲染
          const titlePos = R.getTextPosSGL(titleTextCoords, titleStr, winSglFont, 0, titleAlignId);
          titleDrawX = titlePos.x;
          if (winTitleAlign === 'LEFT_MID') titleDrawX += winRadius;
          titleDrawY = titlePos.y + winBorder;
          R.drawStringSGL(surf, titleDrawX, titleDrawY, titleStr,
            winTitleTextCol, alpha, winSglFont);
        } else {
          // fallback: 字模数据未加载时用 Canvas fillText 近似
          const titlePos = R.getTextPosRealtime(titleTextCoords, titleStr, winFontSize, winCssFamily, 0, titleAlignId);
          titleDrawX = titlePos.x;
          if (winTitleAlign === 'LEFT_MID') titleDrawX += winRadius;
          titleDrawY = titlePos.y + winBorder;
          R.drawString(surf, titleDrawX, titleDrawY, titleStr,
            winTitleTextCol, alpha, winFontSize, winCssFamily, winFontBppVal);
        }
      }

      flushWidget(surf);

      if (!winHasFont) {
        // 无字体：DOM 叠加（系统默认字体）
        const winTitlePad = winTitleAlign === 'LEFT_MID' ? winRadius : 0;
        overlayText({ text: titleStr, color: (w.titleTextColor || '#000000'), fontSize: winFontSize, fontFamily: winFontFamilyVal, align: winTitleAlign, x: winBorder + winTitlePad, y: winBorder, w: winW - 1 - winBorder - winTitleH - (winBorder + winTitlePad), h: winTitleH });
      }
      break;
    }

    case 'msgbox': {
      // SGL msgbox: 严格移植自 sgl_msgbox.c sgl_msgbox_construct_cb
      // 坐标系: x1=0, y1=0, x2=W-1, y2=H-1 (闭区间)
      // font_height = fontSize + 8
      // button_coords = {x1, x2, y2-font_height, y2}  (整个按钮带, 作为 clip)
      // left_coords  = {x1+border, (x1+x2)/2-border/2-1, y2-2*font_height, y2-border}
      // right_coords = {(x1+x2)/2+border/2+1, x2-border, y2-2*font_height, y2-border}
      // 分隔线: sgl_draw_fill_hline(y=y1+title_height+4, x1=x1+border, x2=x2-border, width=border)
      // 按钮: sgl_draw_fill_rect(clip=button_coords, rect=left/right_coords, radius=obj->radius)
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
      const mbTitleH = (w.titleHeight || 0) || mbFontHeight;
      const mbMsgOffsetX = w.msgOffsetX || 0;
      const mbMsgOffsetY = w.msgOffsetY || 0;
      const mbLineMargin = w.msgLineMargin != null ? w.msgLineMargin : 1;
      // SGL 默认按钮颜色 mixer(白,黑,200)
      const mbDefBtnCol = R.colorMixer(R.hexToColor('#FFFFFF'), R.hexToColor('#000000'), 200);
      const mbLeftBtnCol = w.leftBtnColor ? R.hexToColor(w.leftBtnColor) : mbDefBtnCol;
      const mbRightBtnCol = w.rightBtnColor ? R.hexToColor(w.rightBtnColor) : mbDefBtnCol;

      // SGL 整数除法: (x1+x2)/2, x1=0, x2=width-1
      const mbMidX = Math.trunc((0 + (mbW - 1)) / 2);

      // 1. 主体背景 + 边框 (SGL: sgl_draw_rect)
      R.drawRect(surf, 0, 0, mbW - 1, mbH - 1, {
        alpha: alpha, border: mbBorder, border_alpha: alpha, border_mask: 0,
        color: mbBg, border_color: mbBorderCol, radius: mbRadius
      });

      // 2. 标题分隔线 (SGL: sgl_draw_fill_hline)
      //    y = y1 + title_height + 4, x1 = x1+border, x2 = x2-border, width = border
      const mbSepY = mbTitleH + 4;
      R.drawHLine(surf, mbBorder, (mbW - 1) - mbBorder, mbSepY, mbBorder, mbBorderCol, alpha);

      // 3. 左右按钮背景 (SGL: sgl_draw_fill_rect 带 button_coords clip 和 obj->radius 圆角)
      //    button_coords = {x1=0, x2=width-1, y1=height-1-font_height, y2=height-1}
      //    left_coords  = {x1=border, x2=midX-border/2-1, y1=height-1-2*font_height, y2=height-1-border}
      //    right_coords = {x1=midX+border/2+1, x2=width-1-border, y1=height-1-2*font_height, y2=height-1-border}
      const mbBtnTop = (mbH - 1) - 2 * mbFontHeight;
      const mbBtnBottom = (mbH - 1) - mbBorder;
      const mbBtnClipY1 = (mbH - 1) - mbFontHeight;
      const mbLeftBtnX1 = mbBorder;
      const mbLeftBtnX2 = mbMidX - Math.trunc(mbBorder / 2) - 1;
      const mbRightBtnX1 = mbMidX + Math.trunc(mbBorder / 2) + 1;
      const mbRightBtnX2 = (mbW - 1) - mbBorder;

      // 保存原始 clip, 临时设置 button_coords 作为 clip (SGL: sgl_draw_fill_rect 的 area 参数)
      const mbOldClip = surf.clip;
      const mbBtnClip = {
        x1: Math.round(0 * z),
        y1: Math.round(mbBtnClipY1 * z),
        x2: Math.round((mbW - 1) * z),
        y2: Math.round((mbH - 1) * z),
      };
      mbBtnClip.x1 = Math.max(mbBtnClip.x1, mbOldClip.x1);
      mbBtnClip.y1 = Math.max(mbBtnClip.y1, mbOldClip.y1);
      mbBtnClip.x2 = Math.min(mbBtnClip.x2, mbOldClip.x2);
      mbBtnClip.y2 = Math.min(mbBtnClip.y2, mbOldClip.y2);

      if (mbLeftBtnX2 >= mbLeftBtnX1) {
        surf.clip = mbBtnClip;
        R.drawFillRect(surf, mbLeftBtnX1, mbBtnTop, mbLeftBtnX2, mbBtnBottom, mbRadius, mbLeftBtnCol, alpha);
        surf.clip = mbOldClip;
      }
      if (mbRightBtnX2 >= mbRightBtnX1) {
        surf.clip = mbBtnClip;
        R.drawFillRect(surf, mbRightBtnX1, mbBtnTop, mbRightBtnX2, mbBtnBottom, mbRadius, mbRightBtnCol, alpha);
        surf.clip = mbOldClip;
      }
      flushWidget(surf);

      // 4. 标题文本（居中）
      //    SGL: title_coords x1=border+2, x2=x2-border+2, y1=1, y2=title_h+border
      const titleStr = w.titleText || 'Message Box';
      overlayText({ text: titleStr, color: (w.titleTextColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: mbBorder + 2, y: 1, w: (mbW - 1) - mbBorder + 2 - (mbBorder + 2) + 1, h: mbTitleH + mbBorder });

      // 5. 消息文本（多行左对齐）
      //    SGL: text_coords x1=border+2+offsetX, x2=x2-border-2, y1=title_h+border+offsetY, y2=y2-(font_height+border)
      //    sgl_draw_string_mult_line(x=text_coords.x1, y=text_coords.y1+2)
      const mbMsgTop = mbTitleH + mbBorder + mbMsgOffsetY + 2;
      const mbMsgLeft = mbBorder + 2 + mbMsgOffsetX;
      const mbMsgRight = (mbW - 1) - mbBorder - 2;
      const mbMsgBottom = (mbH - 1) - (mbFontHeight + mbBorder);
      const mbMsgText = w.msgText || 'NULL';
      if (mbMsgText && mbMsgText !== 'NULL') {
        overlayText({ text: mbMsgText, color: (w.msgColor || w.textColor || '#000000'), fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), x: mbMsgLeft, y: mbMsgTop, w: mbMsgRight - mbMsgLeft + 1, h: mbMsgBottom - mbMsgTop + 1, multiline: true, lineMargin: mbLineMargin, maxWidth: mbMsgRight - mbMsgLeft + 1, align: 'LEFT_MID' });
      }

      // 6. 左右按钮文本
      //    SGL: msgbox_draw_text(coords, font, text, 0, SGL_ALIGN_CENTER, y_offset=font_height/2)
      //    offY = SGL文本中心 - 按钮中心 (整数除法)
      const leftTxt = w.leftBtnText || 'YES';
      const rightTxt = w.rightBtnText || 'NO';
      const mkBtnTextPv = (x1, x2, txt, col) => {
        const coordsW = x2 - x1 + 1;
        const coordsH = mbBtnBottom - mbBtnTop + 1;
        const sglOffY = Math.trunc((coordsH - mbFontSize) / 2) + Math.trunc(mbFontHeight / 2) + Math.trunc(mbFontSize / 2) - Math.trunc(coordsH / 2);
        overlayText({ text: txt, color: col, fontSize: mbFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: x1, y: mbBtnTop, w: coordsW, h: coordsH, offY: sglOffY });
      };
      if (mbLeftBtnX2 >= mbLeftBtnX1) {
        mkBtnTextPv(mbLeftBtnX1, mbLeftBtnX2, leftTxt, (w.leftBtnTextColor || '#000000'));
      }
      if (mbRightBtnX2 >= mbRightBtnX1) {
        mkBtnTextPv(mbRightBtnX1, mbRightBtnX2, rightTxt, (w.rightBtnTextColor || '#000000'));
      }
      break;
    }

    case 'scroll': {
      // SGL scroll: 严格移植自 sgl_scroll.c
      // direct: 0=水平, 1=垂直 (SGL_DIRECT_HORIZONTAL=0, SGL_DIRECT_VERTICAL=1)
      // track=整个控件区域, 滑块颜色=mixer(color, BG黑, 128), 滑块圆角=radius-border
      const { surf, R } = createWidgetCanvas(el, w, z, renderSize);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const scDirect = w.direct != null ? w.direct : 1; // 默认垂直
      const scValue = w.value != null ? w.value : 0;
      const scWidth = w.width != null ? w.width : 10; // SGL_SCROLL_DEFAULT_WIDTH（滚动条宽度属性）
      const scColor = R.hexToColor(w.color || '#FFFFFF'); // SGL_THEME_COLOR
      const scBorderColor = R.hexToColor(w.borderColor || '#000000'); // SGL_THEME_BORDER_COLOR
      const scBorder = w.borderWidth != null ? w.borderWidth : 2;
      const scRadius = Math.min(w.radius != null ? w.radius : 0, Math.floor(scWidth / 2));

      // 绑定对象时用重算的渲染尺寸，否则用控件自身尺寸
      const rw = renderSize ? renderSize.domW : w.width;
      const rh = renderSize ? renderSize.domH : w.height;

      // 绑定对象时,scroll 应视觉上融入绑定目标,与仿真图片一致:
      // track 颜色 = 目标背景色,不显示 scroll 自己的独立边框,只保留滑块
      // 未绑定时,scroll 作为独立控件画完整 track(含边框、填充)
      const bindWidget = (w.bindTarget && page && page.widgets) ? page.widgets.find(wt => getWidgetVarName(wt) === w.bindTarget) : null;

      if (bindWidget) {
        // 融入目标:用目标背景色填充整个 scroll 区域,覆盖目标右侧/底侧边框
        const trackColor = R.hexToColor(bindWidget.bgColor || bindWidget.color || '#FFFFFF');
        R.drawFillRect(surf, 0, 0, rw - 1, rh - 1, scRadius, trackColor, alpha);
      } else {
        // 未绑定:画完整 track（含边框、填充）
        R.drawRect(surf, 0, 0, rw - 1, rh - 1, {
          alpha: alpha, border: scBorder, border_alpha: alpha, border_mask: 0,
          color: scColor, border_color: scBorderColor, radius: scRadius
        });
      }

      // 滑块: 颜色 = sgl_color_mixer(color, SGL_THEME_BG_COLOR(黑), 128)
      const thumbCol = R.colorMixer(scColor, R.hexToColor('#000000'), 128);
      // 绑定时滑块占满整个 scroll 区域,未绑定时按 SGL 逻辑缩进 border
      const thumbBorder = bindWidget ? 0 : scBorder;
      const thumbRadius = Math.max(0, scRadius - thumbBorder);
      let len, pos, fx1, fy1, fx2, fy2;
      if (scDirect === 1) {
        // 垂直: 长度方向 = y
        len = Math.max(Math.floor(rh / 8), scRadius * 2 + 1);
        pos = Math.floor(scValue * (rh - len) / 100);
        fx1 = thumbBorder;
        fx2 = rw - 1 - thumbBorder;
        fy1 = pos + thumbBorder;
        fy2 = pos + len - thumbBorder;
      } else {
        // 水平: 长度方向 = x
        len = Math.max(Math.floor(rw / 8), scRadius * 2 + 1);
        pos = Math.floor(scValue * (rw - len) / 100);
        fy1 = thumbBorder;
        fy2 = rh - 1 - thumbBorder;
        fx1 = pos + thumbBorder;
        fx2 = pos + len - thumbBorder;
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
      // SGL 核心：box 默认 focus=1，渲染完控件后额外画绿色焦点 wireframe
      // SGL_FOCUSED_COLOR = sgl_rgb(0x00, 0xFF, 0x00)，SGL_FOCUSED_WIDTH = 1
      R.drawWireframe(surf, 0, 0, w.width - 1, w.height - 1, boxRadius, 1, R.hexToColor('#00FF00'), 255);

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
      const alpha = w.alpha != null ? w.alpha : 255;
      const COL = 4, ROW = 5;
      const nkMargin = w.btnMargin != null ? w.btnMargin : 5;
      // SGL DRAW_INIT: 根据初始尺寸算出 box_w/box_h，再重算精确尺寸
      // SGL: obj->coords.x2 = x1 + new_width (闭区间), body_w = new_width + 1
      const rawBoxW = Math.floor((w.width - (COL + 1) * nkMargin) / COL);
      const rawBoxH = Math.floor((w.height - (ROW + 1) * nkMargin) / ROW);
      const bodyW = rawBoxW * COL + (COL + 1) * nkMargin + 1;
      const bodyH = rawBoxH * ROW + (ROW + 1) * nkMargin + 1;
      const boxW = rawBoxW;
      const boxH = rawBoxH;
      // 用 DRAW_INIT 后的精确尺寸创建 surface，而非 w.width/w.height
      const { surf, R } = createWidgetCanvas(el, w, z, { domW: bodyW, domH: bodyH });
      el.style.opacity = 1;
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
      // SGL: body_desc.border_alpha 未设置(memset=0)，边框完全透明不可见
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: alpha, border: nkBorderW, border_alpha: 0, border_mask: 0,
        color: nkCellCol, border_color: nkBorderCol, radius: nkRadius
      });
      // 2. 各按钮（背景+边框）+ 4bpp 图标（buf32，flush 前）
      //    SGL: btn.x2 = btn.x1 + box_w (闭区间，width = box_w + 1), btn.y2 = btn.y1 + box_h
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
          // SGL: btn.x2 = btn.x1 + box_w, btn.y2 = btn.y1 + box_h (闭区间 width=box_w+1)
          const bx2 = bx + boxW;
          const by2 = isOk ? (by + 2 * boxH + nkMargin) : (by + boxH);
          // SGL: btn_desc.border_alpha 未设置(memset=0)，边框完全透明不可见
          R.drawRect(surf, bx, by, bx2, by2, {
            alpha: alpha, border: nkBtnBorderW, border_alpha: 0, border_mask: 0,
            color: nkBtnCol, border_color: nkBtnBorderCol, radius: nkBtnRadius
          });
          if (isBack) {
            // backspace icon 30×13: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (boxH - 13 + 1) / 2
            const iconX = bx + Math.floor((boxW - R.NUMBERKBD_BACKSPACE_ICON.width) / 2);
            const iconY = by + Math.floor((boxH - R.NUMBERKBD_BACKSPACE_ICON.height + 1) / 2);
            R.drawIcon(surf, iconX, iconY, nkTextCol, alpha, R.NUMBERKBD_BACKSPACE_ICON);
          } else if (isOk) {
            // enter icon 30×20: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (2*boxH - 20) / 2
            const iconX = bx + Math.floor((boxW - R.NUMBERKBD_ENTER_ICON.width) / 2);
            const iconY = by + Math.floor((2 * boxH - R.NUMBERKBD_ENTER_ICON.height) / 2);
            R.drawIcon(surf, iconX, iconY, nkTextCol, alpha, R.NUMBERKBD_ENTER_ICON);
          } else {
            // 文字按钮：记录位置，flush 后用 "0" 宽度居中绘制
            const ch = kbdDigits[r][c];
            textBtns.push({ x1: bx, y1: by, ch: ch });
          }
        }
      }
      // 3. 文字按钮文本
      //    SGL: text_x = btn.x1 + (boxW - font_width("0")) / 2  ← 用 "0" 宽度居中
      //         text_y = btn.y1 + (boxH - font_height) / 2
      //    有字体时用 SGL drawString 像素级渲染到 buf32（flush 前），与 SGL 仿真一致
      //    无字体时用 DOM span 叠加（flush 后），使用系统默认字体
      const nkHasFont = widgetHasFont(w);
      const nkFontBpp = w.fontBpp != null ? w.fontBpp : 4;
      const zeroWidth = R.measureTextWidth('0', nkFontSize, nkFontFamily);
      const fontHeight = nkFontSize;
      const textOffsetX = Math.floor((boxW - zeroWidth) / 2);
      const textOffsetY = Math.floor((boxH - fontHeight) / 2);

      // 有字体：SGL drawString 像素级渲染到 buf32（flush 前）
      if (nkHasFont) {
        for (const btn of textBtns) {
          const tx = btn.x1 + textOffsetX;
          const ty = btn.y1 + textOffsetY;
          R.drawString(surf, tx, ty, btn.ch, nkTextCol, alpha, nkFontSize, nkFontFamily, nkFontBpp);
        }
      }

      flushWidget(surf);

      // 无字体：DOM span 叠加（flush 后），使用系统默认字体
      if (!nkHasFont) {
        for (const btn of textBtns) {
          const tx = btn.x1 + textOffsetX;
          const ty = btn.y1 + textOffsetY;
          overlayTextAt({ text: btn.ch, color: (w.textColor || '#000000'), fontSize: nkFontSize, fontFamily: (w.fontFamily || ''), x: tx, y: ty, align: 'LEFT' });
        }
      }
      break;
    }

    case 'keyboard': {
      // SGL keyboard 严格移植自 sgl_keyboard.c DRAW_MAIN
      // 默认展示 LOWER 模式 (key_mode=1, layout_mode=0)
      // 1. splitLen 计算行高和列宽
      // 2. icon 按键 (backspace/enter/newline/keybd/left/right) 用 drawIcon 渲染
      // 3. 文字按键: 有字体时用 drawString 像素级渲染, 无字体时 DOM span 叠加
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
      const kbTextCol = R.hexToColor(w.textColor || '#000000');
      const kbFontSize = w.fontSize || 14;
      const kbFontBpp = w.fontBpp != null ? w.fontBpp : 4;
      const kbFontFamily = getCssFontStack(w.fontFamily || '');
      const bodyW = w.width, bodyH = w.height;
      // SGL DRAW_INIT: key_margin = max(body_w/128, 1) if 0; btn_radius = max(key_margin, 2) if 0
      let kbKeyMargin = w.btnMargin != null ? w.btnMargin : 0;
      if (kbKeyMargin === 0) kbKeyMargin = Math.max(Math.floor(bodyW / 128), 1);
      let kbBtnRadius = w.btnRadius || 0;
      if (kbBtnRadius === 0) kbBtnRadius = Math.max(kbKeyMargin, 2);
      // 默认 LOWER 模式
      const kbKeyMode = 1;
      const kbLayoutMode = kbKeyMode >> 1;  // 0 = upper/lower layout
      const kbHasFont = widgetHasFont(w);
      const kbCssFamily = kbHasFont ? kbFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';

      // 1. 主体背景 + 边框
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: Math.min(alpha, kbMainAlpha), border: kbBorderW, border_alpha: Math.min(alpha, kbBorderAlpha), border_mask: 0,
        color: kbCellCol, border_color: kbBorderCol, radius: kbRadius
      });

      // 2. splitLen 计算行高
      const btnHeight = new Array(4);
      R.splitLen(R.KEYBD_BTN_HEIGHT, 4, bodyH, kbKeyMargin, btnHeight);

      // 3. 遍历 4 行按键
      let btnIndex = 0;
      const textBtns = [];
      let btnY1 = 0;
      for (let i = 0; i < 4; i++) {
        const btnWidth = new Array(12);
        const rowCount = R.KEYBOARD_BTN_COUNT[kbLayoutMode][i];
        R.splitLen(R.KEYBD_BTN_WIDTH[kbLayoutMode][i], rowCount, bodyW, kbKeyMargin, btnWidth);

        btnY1 += kbKeyMargin;
        const btnY2 = btnY1 + btnHeight[i] - 1;
        let btnX1 = 0;

        for (let j = 0; j < rowCount; j++) {
          btnX1 += kbKeyMargin;
          const btnX2 = btnX1 + btnWidth[j] - 1;

          // 画按键矩形
          R.drawRect(surf, btnX1, btnY1, btnX2, btnY2, {
            alpha: alpha, border: kbBtnBorderW, border_alpha: Math.min(alpha, kbBtnBorderAlpha), border_mask: 0,
            color: kbBtnCol, border_color: kbBtnBorderCol, radius: kbBtnRadius
          });

          // 判断是否为 icon
          const iconName = R.keyindexIsIcon(kbKeyMode, btnIndex);
          if (iconName) {
            // icon 按键: 用 drawKeyboardIcon 渲染（严格移植 sgl_draw_character）
            const meta = R.KEYBOARD_ICON_META[iconName];
            const textX = btnX1 + Math.floor((btnWidth[j] - meta.advW) / 2);
            const textY = btnY1 + Math.floor((btnHeight[i] - meta.fontHeight) / 2);
            R.drawKeyboardIcon(surf, textX, textY, kbTextCol, R.SGL_ALPHA_MAX, meta);
          } else {
            // 文字按键: 记录位置
            const text = R.KEYBD_BTN_MAP[kbKeyMode][btnIndex];
            textBtns.push({ x1: btnX1, y1: btnY1, w: btnWidth[j], h: btnHeight[i], text: text });
          }

          btnX1 += btnWidth[j];
          btnIndex++;
        }
        btnY1 = btnY2 + 1;
      }

      // 有字体: drawString 像素级渲染到 buf32（flush 前）
      if (kbHasFont) {
        for (const btn of textBtns) {
          const textW = R.measureTextWidth(btn.text, kbFontSize, kbCssFamily);
          const textX = btn.x1 + Math.floor((btn.w - textW) / 2);
          const textY = btn.y1 + Math.floor((btn.h - kbFontSize) / 2);
          R.drawString(surf, textX, textY, btn.text, kbTextCol, alpha, kbFontSize, kbCssFamily, kbFontBpp);
        }
      }

      flushWidget(surf);

      // 无字体: DOM span 叠加（flush 后）
      if (!kbHasFont) {
        for (const btn of textBtns) {
          const textW = R.measureTextWidth(btn.text, kbFontSize, kbCssFamily);
          const textX = btn.x1 + Math.floor((btn.w - textW) / 2);
          const textY = btn.y1 + Math.floor((btn.h - kbFontSize) / 2);
          overlayTextAt({ text: btn.text, color: (w.textColor || '#000000'), fontSize: kbFontSize, fontFamily: (w.fontFamily || ''), x: textX, y: textY });
        }
      }
      break;
    }

    case 'scope': {
      // SGL scope: 严格移植自 sgl_scope.c scope_construct_cb
      // 默认: bg=黑, grid=(50,50,50), border_width=0, waveform=绿(0,255,0), line_width=2
      // 网格: 中心十字线 + 9 条垂直 + 9 条水平网格线 (i=1..9)
      // 波形: 从右向左画, Y 轴反转 (y = y2 - (value-min)*height/(max-min))
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const scBgCol = R.hexToColor(w.bgColor || '#000000');
      const scBorderCol = R.hexToColor(w.borderColor || '#969696');
      const scBorderW = w.borderWidth != null ? w.borderWidth : 0;
      const scGridCol = R.hexToColor(w.gridColor || '#323232');
      const scLineW = w.lineWidth != null ? w.lineWidth : 2;
      // SGL grid_style: 0=实线, >0=虚线 (gap 长度, dash=gap, 周期 2*gap)
      const scGridStyle = w.gridLine != null ? w.gridLine : 0;
      const scRangeMin = Number(w.rangeMin != null ? w.rangeMin : 0);
      const scRangeMax = Number(w.rangeMax != null ? w.rangeMax : 65535);
      const scShowYLabels = w.showYLabels != null ? w.showYLabels : false;
      const scYLabelColor = w.yLabelColor || '#FFFFFF';
      const bodyW = w.width, bodyH = w.height;

      // 1. 主体背景 + 边框（radius=0）
      R.drawRect(surf, 0, 0, bodyW - 1, bodyH - 1, {
        alpha: alpha, border: scBorderW, border_alpha: alpha, border_mask: 0,
        color: scBgCol, border_color: scBorderCol, radius: 0
      });

      // SGL 坐标系: x1=0, y1=0, x2=bodyW-1, y2=bodyH-1 (闭区间)
      const x1 = 0, y1 = 0, x2 = bodyW - 1, y2 = bodyH - 1;
      const width = x2 - x1;     // SGL: width = x2 - x1
      const height = y2 - y1;    // SGL: height = y2 - y1

      // 2. display_min / display_max (设计时无真实数据, 用 range)
      const displayMin = scRangeMin;
      const displayMax = scRangeMax;
      const actualMin = displayMin;
      const actualMax = displayMax;
      const rangeSpan = Math.max(1, displayMax - displayMin);

      // 3. 中心十字线 (SGL: x_center=(x1+x2)/2, y_center 按 display 中点)
      //    y_center = y1 + (height * (display_max - (min+max)/2)) / (max-min)
      const xCenter = Math.trunc((x1 + x2) / 2);
      const yCenter = y1 + Math.trunc((height * (displayMax - Math.trunc((displayMin + displayMax) / 2))) / rangeSpan);
      if (scGridStyle > 0) {
        R.drawDashedLine(surf, x1, yCenter, x2, yCenter, scGridStyle, scGridStyle, scGridCol, alpha);
        R.drawDashedLine(surf, xCenter, y1, xCenter, y2, scGridStyle, scGridStyle, scGridCol, alpha);
      } else {
        R.drawHLine(surf, x1, x2, yCenter, 1, scGridCol, alpha);
        R.drawVLine(surf, xCenter, y1, y2, 1, scGridCol, alpha);
      }

      // 4. 9 条垂直网格线 (SGL: i=1..9, x_pos = x1 + width*i/10, 整数除法)
      for (let i = 1; i < 10; i++) {
        const xPos = x1 + Math.trunc(width * i / 10);
        if (scGridStyle > 0) {
          R.drawDashedLine(surf, xPos, y1, xPos, y2, scGridStyle, scGridStyle, scGridCol, alpha);
        } else {
          R.drawVLine(surf, xPos, y1, y2, 1, scGridCol, alpha);
        }
      }

      // 5. 9 条水平网格线 (SGL: i=1..9, y_pos = y1 + height*i/10, 整数除法)
      for (let i = 1; i < 10; i++) {
        const yPos = y1 + Math.trunc(height * i / 10);
        if (scGridStyle > 0) {
          R.drawDashedLine(surf, x1, yPos, x2, yPos, scGridStyle, scGridStyle, scGridCol, alpha);
        } else {
          R.drawHLine(surf, x1, x2, yPos, 1, scGridCol, alpha);
        }
      }

      // 6. 波形: 从右向左画, 多通道, Y 轴反转
      // SGL: start.x = x2, start.y = y2 - (value-min)*height/(max-min)
      //      end.x = x2 - i*width/(data_points-1)
      const chBufStr = w.channelBuffers || '';
      const chColStr = w.channelWaveformColors || '#00FF00';
      const channels = chBufStr ? chBufStr.split('|') : [];
      const chCols = chColStr.split(';').map(s => s.trim()).filter(s => s);
      // SGL 默认通道颜色: ch0=绿, ch1=红, ch2=蓝, ch3=黄
      const defaultChCols = ['#00FF00', '#FF0000', '#0000FF', '#FFFF00'];

      if (channels.length > 0) {
        // 有用户数据: 按用户数据绘制
        channels.forEach((bufStr, ci) => {
          const points = bufStr.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
          if (points.length < 2) return;
          const col = R.hexToColor(chCols[ci] || defaultChCols[ci] || '#00FF00');
          const n = points.length;
          let prevX = x2;
          let prevV = Math.max(displayMin, Math.min(displayMax, points[n - 1]));
          let prevY = y2 - Math.trunc((prevV - displayMin) * height / rangeSpan);
          for (let i = 1; i < n; i++) {
            const idx = n - 1 - i;
            const curV = Math.max(displayMin, Math.min(displayMax, points[idx]));
            const curX = x2 - Math.trunc(i * width / (n - 1));
            const curY = y2 - Math.trunc((curV - displayMin) * height / rangeSpan);
            R.drawLine(surf, prevX, prevY, curX, curY, scLineW, col, alpha);
            prevX = curX;
            prevY = curY;
          }
        });
      } else {
        // 无用户数据: 模拟正弦波 (值域映射到 [displayMin, displayMax])
        const dataPoints = Math.min(bodyW, 64);
        const pts = [];
        for (let i = 0; i < dataPoints; i++) {
          const norm = Math.sin(i * 0.2) * 0.4 + 0.5;
          const v = Math.trunc(displayMin + norm * rangeSpan);
          const px = x2 - Math.trunc(i * width / (dataPoints - 1));
          const py = y2 - Math.trunc((v - displayMin) * height / rangeSpan);
          pts.push({ x: px, y: py });
        }
        const col = R.hexToColor(chCols[0] || defaultChCols[0] || '#00FF00');
        for (let i = 1; i < pts.length; i++) {
          R.drawLine(surf, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, scLineW, col, alpha);
        }
      }
      flushWidget(surf);

      // 7. Y 轴标签 (SGL: showYLabels && y_label_font 时画 max/min/mid)
      // 预览时用 DOM span 模拟 (有字用字体, 无字用系统默认)
      if (scShowYLabels) {
        const hasFont = widgetHasFont(w);
        const cssFamily = hasFont ? getCssFontStack(w.fontFamily || '') : 'system-ui, -apple-system, "Segoe UI", sans-serif';
        const fs = Math.max(8, Math.round(11 * z));
        const labelColor = scYLabelColor || '#FFFFFF';
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute;left:${2 * z}px;top:0;width:${50 * z}px;height:${bodyH * z}px;pointer-events:none;box-sizing:border-box;overflow:hidden;`;
        const top = document.createElement('span');
        top.style.cssText = `position:absolute;left:0;top:${2 * z}px;color:${labelColor};font-size:${fs}px;font-family:${cssFamily};white-space:nowrap;`;
        top.textContent = String(actualMax);
        const mid = document.createElement('span');
        mid.style.cssText = `position:absolute;left:0;top:${Math.trunc((yCenter - 6) * z)}px;color:${labelColor};font-size:${fs}px;font-family:${cssFamily};white-space:nowrap;`;
        mid.textContent = String(Math.trunc((actualMax + actualMin) / 2));
        const bot = document.createElement('span');
        bot.style.cssText = `position:absolute;left:0;bottom:${2 * z}px;color:${labelColor};font-size:${fs}px;font-family:${cssFamily};white-space:nowrap;`;
        bot.textContent = String(actualMin);
        wrap.appendChild(top);
        wrap.appendChild(mid);
        wrap.appendChild(bot);
        el.appendChild(wrap);
      }
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
      // SGL qrcode: 严格移植自 sgl_qrcode.c
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const qrText = String(w.qrText || 'hello');
      const qrVersion = w.version || 5;
      const qrEcc = w.ecc || 0;
      const qrScale = w.scale || 4;
      const qrZone = w.zone != null ? w.zone : 1;
      const qrCellRadius = w.cellRadius || 0;
      const qrObjRadius = w.radius || 0;
      const qrBgCol = R.hexToColor(w.bgColor || '#ffffff');
      const qrCellCol = R.hexToColor(w.cellColor || '#000000');
      const qrLogoPath = w.logo || '';

      // SGL ecc 0-3 → qrcode-generator 'L'/'M'/'Q'/'H'
      const eccMap = ['L', 'M', 'Q', 'H'];
      const eccLevel = eccMap[qrEcc] || 'L';

      let qrSize = 0;
      let isDark = () => false;
      try {
        const qr = qrcodeGenerator(qrVersion, eccLevel);
        qr.addData(qrText || ' ');
        qr.make();
        qrSize = qr.getModuleCount();
        isDark = (x, y) => qr.isDark(y, x);
      } catch (e) {
        qrSize = 4 * qrVersion + 17;
        isDark = () => false;
      }

      // logo 图片：已缓存则同步渲染，未缓存则异步加载后重绘
      let logoImg = null;
      const qrLogoFormat = w.pixmapFormat || 'RGB565';
      if (qrLogoPath) {
        logoImg = getCachedPixmapImageData(qrLogoPath);
        if (!logoImg) {
          preloadPixmapImage(qrLogoPath, () => render());
        }
      }

      R.drawQrcode(surf, 0, 0, w.width, w.height, {
        qrSize, isDark, scale: qrScale, zone: qrZone,
        cellRadius: qrCellRadius, bgColor: qrBgCol, cellColor: qrCellCol,
        alpha: alpha, objRadius: qrObjRadius, ecc: qrEcc, logoImg, logoFormat: qrLogoFormat
      });
      flushWidget(surf);
      break;
    }

    case 'chart': {
      // SGL chart: 严格移植 SGL 算法，用 SGLRenderer 像素级渲染
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const chFontFamily = w.fontFamily || '';
      // 当未设置字体时，SGL使用系统字体(consolas14, font_height=14)，设计器需与之匹配
      const chFontSize = chFontFamily ? (w.fontSize || 12) : 14;
      const overlays = R.drawChart(surf, w, R, {
        alpha: alpha,
        fontSize: chFontSize,
        fontFamily: chFontFamily,
        hasFont: widgetHasFont(w)
      });
      flushWidget(surf);
      // 文本叠加（坐标轴标签、图例文本）
      for (const o of overlays) {
        overlayTextAt({
          text: o.text, color: o.color, fontSize: o.fontSize,
          fontFamily: o.fontFamily, x: o.x, y: o.y
        });
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
      // SGL analogclock: 严格移植自 sgl_analogclock.c sgl_analogclock_construct_cb
      // 坐标系: x1=0, y1=0, x2=W-1, y2=H-1 (闭区间)
      // cx=(x1+x2)/2, cy=(y1+y2)/2, r=max(obj.radius, width/2 - 1) (整数除法)
      // 指针长度: h_len=inner_r/2, m_len=inner_r*160/256,
      //   s_len_1=inner_r*217/256, s_len_2=inner_r*39/256
      // 两段式指针: 粗头(尾部→前端, hour/min_ptr_width) + 细柄(中心→尾部, sec_ptr_width)
      //   尾部细柄颜色 = 前端颜色 (hour_ptr_color / min_ptr_color)
      // 秒针: 反向尾部 -s_len_2 → 前端 s_len_1
      // hub 三层内凹 (坐标 cx-1, cy-1):
      //   第一层 hub_r+1 min_ptr_color (秒针前画)
      //   第二层 hub_r hub_color (秒针后画)
      //   第三层 hub_r-2 bg_color (内凹)
      // 刻度: 60 个, j 计数器, j==5 时主刻度(scale_color)并 j=0, 其余次刻度(sub_scale_color)
      //   所有刻度宽度都是 scale_width (主刻度不翻倍)
      //   j==0 时画数字 (i==0 显示 12, 其余 i/5)
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
      const acFontH = acFontSize + 8;
      const hour = w.hour || 0, minute = w.minute || 0, second = w.second || 0;

      // SGL: cx=(x1+x2)/2, cy=(y1+y2)/2, r=max(radius, width/2 - 1) 整数除法
      const cx = Math.trunc((0 + (w.width - 1)) / 2);
      const cy = Math.trunc((0 + (w.height - 1)) / 2);
      const r = Math.max(0, Math.max((w.radius || 0), Math.trunc(w.width / 2) - 1));
      const acBorderW = Math.min((w.borderWidth || 0), r);
      const innerR = Math.max(0, r - acBorderW);
      const scaleOut = Math.max(0, innerR - 2);
      const scaleIn = Math.max(0, scaleOut - acScaleLen);
      const hLen = Math.trunc(innerR / 2);
      const mLen = (innerR * 160) >> 8;
      const sLen1 = (innerR * 217) >> 8;
      const sLen2 = (innerR * 39) >> 8;
      const subScaleCol = R.colorMixer(acScaleCol, acBg, 128);

      // 1. 背景圆
      R.drawFillCircle(surf, cx, cy, r, acBg, alpha);
      // 2. 边框环 (SGL: border_w>0 时画 ring, 颜色=bg_color)
      if (acBorderW > 0) {
        R.drawFillRing(surf, cx, cy, innerR, r, acBg, alpha);
      }

      // SGL 用定点整数三角函数 sgl_sin/sgl_cos (SGL_SIN_FIXED_ONE=32768)
      // 坐标计算: (len * sin_val) / SGL_SIN_FIXED_ONE + cx (整数除法向零截断)
      const SIN_FIXED = R.SGL_SIN_FIXED_ONE;

      // 3. 60 刻度 + 数字 (SGL: 同一循环, 顺序: 画刻度 → if(j==5)j=0 → if(j==0)画数字 → j++)
      //    j==5 时主刻度(scale_color)并 j=0, 其余次刻度(sub_scale_color)
      //    j==0 时画数字 (i==0 显示 12, 其余 i/5)
      //    所有刻度宽度都是 scale_width (主/次只是颜色不同)
      const textR = Math.max(0, scaleIn - acFontH - 2);
      let j = 0;
      for (let i = 0; i < 60; i++) {
        const angle = i * 6 - 90;
        const sinVal = R.sglSin(angle);
        const cosVal = R.sglCos(angle);
        // SGL C 整数运算: (scale_out * cos_val) / SGL_SIN_FIXED_ONE + cx
        // 必须先做整数除法 (向零截断), 再加 cx, 不能先加 cx 再截断
        const xo = Math.trunc((scaleOut * cosVal) / SIN_FIXED) + cx;
        const yo = Math.trunc((scaleOut * sinVal) / SIN_FIXED) + cy;
        const xi = Math.trunc((scaleIn * cosVal) / SIN_FIXED) + cx;
        const yi = Math.trunc((scaleIn * sinVal) / SIN_FIXED) + cy;

        // 1. 画刻度
        if (j === 5) {
          R.drawLine(surf, xo, yo, xi, yi, acScaleW, acScaleCol, alpha);
          j = 0;
        } else {
          R.drawLine(surf, xo, yo, xi, yi, acScaleW, subScaleCol, alpha);
        }

        // 2. j==0 时画数字 (SGL: if (clock->font && j == 0))
        //    SGL 中只有设置了字体(clock->font != NULL)才画数字, 否则不画
        //    设计器匹配此行为: 未设置字体时不画数字, 实现所见即所得
        if (j === 0 && widgetHasFont(w)) {
          const text = i === 0 ? '12' : String(Math.trunc(i / 5));
          const tx = Math.trunc((textR * cosVal) / SIN_FIXED) + cx;
          const ty = Math.trunc((textR * sinVal) / SIN_FIXED) + cy;
          const tw = R.stringWidth(text, acFontSize);
          const th = R.fontHeight(acFontSize);
          overlayTextAt({ text, color: (w.textColor || '#FFFFFF'), fontSize: acFontSize, fontFamily: (w.fontFamily || ''), x: Math.trunc(tx - tw / 2), y: Math.trunc(ty - th / 2), align: 'CENTER' });
        }

        j++;
      }

      // 4. 时针、分针 (两段式: 粗头 尾部→前端 + 细柄 中心→尾部)
      //    SGL: 尾部细柄颜色 = 前端颜色 (不是 sec_ptr_color)
      //    SGL: 尾部细柄无条件绘制 (sgl_draw_line_fill_slanted 两次调用)
      const hAngle = ((hour % 12) * 30 + Math.trunc(minute / 2)) - 90;
      const mAngle = (minute * 6) - 90;
      const sAngle = (second * 6) - 90;
      function drawHand(angleDeg, tailLen, tipLen, mainWidth, tailWidth, color) {
        const sinVal = R.sglSin(angleDeg);
        const cosVal = R.sglCos(angleDeg);
        // SGL C 整数运算: 先整数除法, 再加 cx/cy
        const sx = cx + Math.trunc((tailLen * cosVal) / SIN_FIXED);
        const sy = cy + Math.trunc((tailLen * sinVal) / SIN_FIXED);
        const px = Math.trunc((tipLen * cosVal) / SIN_FIXED) + cx;
        const py = Math.trunc((tipLen * sinVal) / SIN_FIXED) + cy;
        // SGL: 先画前端粗头 (sx,sy)→(px,py), 宽度 mainWidth
        R.drawLine(surf, sx, sy, px, py, mainWidth, color, alpha);
        // SGL: 再画尾部细柄 (cx,cy)→(sx,sy), 宽度 tailWidth (无条件)
        R.drawLine(surf, cx, cy, sx, sy, tailWidth, color, alpha);
      }
      drawHand(hAngle, sLen2, hLen, acHourW, acSecW, acHourCol);
      drawHand(mAngle, sLen2, mLen, acMinW, acSecW, acMinCol);

      // 5. hub 第一层 (minPtrColor, hub_r+1, 坐标 cx-1, cy-1) - 秒针前画
      R.drawFillCircle(surf, cx - 1, cy - 1, acHubR + 1, acMinCol, alpha);

      // 6. 秒针 (反向尾部 -s_len_2 → 前端 s_len_1)
      {
        const sinVal = R.sglSin(sAngle);
        const cosVal = R.sglCos(sAngle);
        const sx = cx - Math.trunc((sLen2 * cosVal) / SIN_FIXED);
        const sy = cy - Math.trunc((sLen2 * sinVal) / SIN_FIXED);
        const px = Math.trunc((sLen1 * cosVal) / SIN_FIXED) + cx;
        const py = Math.trunc((sLen1 * sinVal) / SIN_FIXED) + cy;
        R.drawLine(surf, sx, sy, px, py, acSecW, acSecCol, alpha);
      }

      // 7. hub 第二层 (hubColor, hub_r) + 第三层 (bgColor, hub_r-2) - 秒针后画
      R.drawFillCircle(surf, cx - 1, cy - 1, acHubR, acHubCol, alpha);
      if (acHubR - 2 > 0) {
        R.drawFillCircle(surf, cx - 1, cy - 1, acHubR - 2, acBg, alpha);
      }

      flushWidget(surf);
      break;
    }

    case '2dball': {
      // SGL 2dball: 严格移植自 sgl_2dball.c
      // SGL: sgl_2dball_set_radius 调用 sgl_obj_circle_zoom，控件 coords 改为 2*radius
      // 设计器用 w.radius 属性，不用 w.width/2
      const ballRadius = w.radius || 20;
      const ballSize = ballRadius * 2;
      const { surf, R } = createWidgetCanvas(el, w, z, { domW: ballSize, domH: ballSize });
      el.style.opacity = 1;
      const alpha = w.alpha != null ? w.alpha : 255;
      const cx = Math.floor((ballSize - 1) / 2);
      const cy = Math.floor((ballSize - 1) / 2);
      const bgCol = R.hexToColor(w.bgColor || '#000000');
      const ballCol = R.hexToColor(w.color || '#FFFFFF');
      R.draw2dBall(surf, cx, cy, ballRadius, ballCol, bgCol, alpha);
      flushWidget(surf);
      break;
    }

    case 'icon': {
      // SGL icon: 4bpp alpha 蒙版图标，用 color 颜色混合绘制
      // 移植自 sgl_icon.c → sgl_get_icon_pos + sgl_draw_icon
      const iconPath = w.icon || '';
      const iconColor = (w.color || '#000000');
      const iconAlign = (w.align || 'CENTER');
      const iconAlpha = w.alpha != null ? w.alpha : 255;
      if (iconPath) {
        const imgData = getCachedPixmapImageData(iconPath);
        if (imgData) {
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          // 构造 4bpp alpha 蒙版（每字节2像素，高4位为偶数像素，低4位为奇数像素）
          const iw = imgData.width;
          const ih = imgData.height;
          const bytesPerRow = (iw + 1) >> 1;
          const bitmap = new Uint8Array(bytesPerRow * ih);
          for (let yy = 0; yy < ih; yy++) {
            for (let xx = 0; xx < iw; xx++) {
              const alphaVal = imgData.data[(yy * iw + xx) * 4 + 3] >> 4;
              const byteIdx = yy * bytesPerRow + (xx >> 1);
              if (xx & 1) {
                bitmap[byteIdx] |= alphaVal;
              } else {
                bitmap[byteIdx] |= alphaVal << 4;
              }
            }
          }
          const iconObj = { width: iw, height: ih, bitmap };
          // 按 SGL sgl_get_align_pos 算法计算 icon 在控件内的位置
          const pw = w.width;
          const ph = w.height;
          let ix = 0, iy = 0;
          switch (iconAlign) {
            case 'CENTER':       ix = (pw - iw) / 2;       iy = (ph - ih) / 2;       break;
            case 'TOP_MID':      ix = (pw - iw) / 2;       iy = 0;                    break;
            case 'TOP_LEFT':     ix = 0;                    iy = 0;                    break;
            case 'TOP_RIGHT':    ix = pw - iw;              iy = 0;                    break;
            case 'BOT_MID':      ix = (pw - iw) / 2;       iy = ph - ih;              break;
            case 'BOT_LEFT':     ix = 0;                    iy = ph - ih;              break;
            case 'BOT_RIGHT':    ix = pw - iw;              iy = ph - ih;              break;
            case 'LEFT_MID':     ix = 0;                    iy = (ph - ih) / 2;       break;
            case 'RIGHT_MID':    ix = pw - iw;              iy = (ph - ih) / 2;       break;
          }
          R.drawIcon(surf, ix, iy, R.hexToColor(iconColor), iconAlpha, iconObj);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载，加载完成后重绘
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          flushWidget(surf);
          preloadPixmapImage(iconPath, () => render());
        }
      } else {
        // 无图片时显示占位符
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        flushWidget(surf);
        const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
        if (iconFontSize > 0) {
          overlayText({ text: '★', color: (w.color || '#8b5cf6'), fontSize: iconFontSize, fontFamily: '', align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
        }
      }
      break;
    }

    case 'sprite': {
      // SGL sprite: 严格移植自 sgl_sprite.c，只支持 ARGB4444，不缩放，与现有帧缓冲混合
      const spPixmap = w.pixmap || '';
      const spAlpha = w.alpha != null ? w.alpha : 255;
      if (spPixmap) {
        const imgData = getCachedPixmapImageData(spPixmap);
        if (imgData) {
          const { surf, R } = createWidgetCanvas(el, w, z);
          el.style.opacity = 1;
          R.drawSprite(surf, imgData, spAlpha);
          flushWidget(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          el.style.backgroundImage = `url('${toAssetUrl(spPixmap)}')`;
          el.style.backgroundSize = '100% 100%';
          preloadPixmapImage(spPixmap, () => render());
        }
      } else {
        // 无图片时显示占位符
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = 1;
        flushWidget(surf);
        const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
        if (iconFontSize > 0) {
          overlayText({ text: '◆', color: '#8b5cf6', fontSize: iconFontSize, fontFamily: '', align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
        }
      }
      break;
    }

    case 'ext_img': {
      // SGL ext_img WYSIWYG 渲染：按 SGL 算法居中/旋转/缩放绘制图片
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const eiAlpha = w.alpha != null ? w.alpha : 255;
      const eiPixmap = w.pixmap;

      function drawExtImgPlaceholderPreview() {
        const eiBg = R.hexToColor('#313149');
        const eiBorderCol = R.hexToColor('#3d3d5c');
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: eiAlpha, border: 1, border_alpha: eiAlpha, border_mask: 0,
          color: eiBg, border_color: eiBorderCol, radius: 4
        });
        flushWidget(surf);
        const eiText = 'IMG';
        const eiFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
        const eiAlphaEff = Math.round(eiAlpha * 0.4);
        overlayText({ text: eiText, color: `rgba(139,92,246,${eiAlphaEff / 255})`, fontSize: eiFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
      }

      if (eiPixmap) {
        const imgData = getCachedPixmapImageData(eiPixmap);
        if (imgData) {
          // 使用严格移植的 SGL ext_img 像素级渲染算法
          // SGL ext_img 设置 pixmap 后 coords 会被强制设为图片尺寸，绘制区域由图片决定
          R.drawExtImg(surf, imgData, imgData.width, imgData.height, w.rotation, w.scaleUniform, w.pivotX, w.pivotY, eiAlpha, w.pixmapFormat);
          flushWidget(surf);
        } else {
          preloadPixmapImage(eiPixmap, () => render());
          drawExtImgPlaceholderPreview();
        }
      } else {
        drawExtImgPlaceholderPreview();
      }
      break;
    }

    case 'img': {
      // SGL img WYSIWYG 渲染：1:1像素映射，按pixmap格式解码
      const { surf, R } = createWidgetCanvas(el, w, z);
      el.style.opacity = 1;
      const imgAlpha = w.alpha != null ? w.alpha : 255;
      const imgPixmap = w.pixmap;

      function drawImgPlaceholderPreview() {
        const imgBg = R.hexToColor('#313149');
        const imgBorderCol = R.hexToColor('#3d3d5c');
        R.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: imgAlpha, border: 1, border_alpha: imgAlpha, border_mask: 0,
          color: imgBg, border_color: imgBorderCol, radius: 4
        });
        flushWidget(surf);
        const imgText = 'IMG';
        const imgFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
        const imgAlphaEff = Math.round(imgAlpha * 0.4);
        overlayText({ text: imgText, color: `rgba(139,92,246,${imgAlphaEff / 255})`, fontSize: imgFontSize, fontFamily: (w.fontFamily || ''), align: 'CENTER', x: 0, y: 0, w: w.width, h: w.height });
      }

      if (imgPixmap) {
        const imgData = getCachedPixmapImageData(imgPixmap);
        if (imgData) {
          R.drawImg(surf, 0, 0, imgData, w.pixmapFormat, imgAlpha);
          flushWidget(surf);
        } else {
          preloadPixmapImage(imgPixmap, () => render());
          drawImgPlaceholderPreview();
        }
      } else {
        drawImgPlaceholderPreview();
      }
      break;
    }

    case 'arc_label': {
      // SGL arc_label WYSIWYG 渲染：文本绘制 + 旋转
      const alText = w.text || '标签';
      const alTextColor = w.textColor || '#000000';
      const alBgFlag = w.bgFlag === true;
      const alBgColor = w.bgColor || '#FFFFFF';
      const alRadius = w.radius != null ? w.radius : 0;
      const alAlign = w.align || 'CENTER';
      const alFontSize = w.fontSize || 14;
      const alFontFamily = w.fontFamily || '';
      const alFontBpp = w.fontBpp || 4;
      const alAngle = w.angle || 0;
      const alOffsetX = w.offsetX || 0;
      const alOffsetY = w.offsetY || 0;
      const alAlpha = w.alpha != null ? w.alpha : 255;
      const alHasFont = widgetHasFont(w);
      const alCssFamily = getCssFontStack(alFontFamily);

      if (alAngle && alAngle !== 0) {
        // SGL arc_label 旋转模式渲染（与 editor.js 一致）
        // el 用原始 w×h 并整体旋转，选中框、背景、文本块都跟着旋转
        const R = getR();

        // el 整体旋转
        el.style.transform = `rotate(${alAngle}deg)`;
        el.style.transformOrigin = 'center center';
        el.style.opacity = alAlpha / 255;

        // 1. 背景矩形（如果 bg_flag）：画在原始 w×h 上，跟着 el 旋转
        const { surf } = createWidgetCanvas(el, w, z);
        if (alBgFlag) {
          R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, alRadius, R.hexToColor(alBgColor), alAlpha);
        }
        flushWidget(surf);

        // 2. 临时缓冲（文本块）
        const alMeasureFamily = alHasFont ? alCssFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
        const alTextWidth = Math.ceil(R.measureTextWidth(alText, alFontSize, alMeasureFamily));
        const alTextHeight = alFontSize;
        const alMargin = alTextHeight * 2;
        const alBufW = alTextWidth + alMargin * 2;
        const alBufH = alTextHeight + alMargin * 2;

        // 3. 创建内部 div（文本块），居中放置，跟着 el 旋转
        const alTextBlock = document.createElement('div');
        alTextBlock.style.cssText = `position:absolute;left:50%;top:50%;width:${alBufW*z}px;height:${alBufH*z}px;transform:translate(-50%,-50%);pointer-events:none;overflow:hidden;`;
        // SGL: 旋转模式临时缓冲总是用 bg_color 填充（不管 bg_flag）
        alTextBlock.style.background = alBgColor;

        // 4. 在文本块上画文本
        if (alHasFont) {
          const alTbCanvas = document.createElement('canvas');
          const alTbSurf = R.createSurface(alTbCanvas, alBufW, alBufH, z);
          alTbCanvas.style.cssText = `position:absolute;left:0;top:0;width:${alTbSurf.w}px;height:${alTbSurf.h}px;pointer-events:none;`;
          R.drawString(alTbSurf, alMargin, alMargin, alText, R.hexToColor(alTextColor), alAlpha, alFontSize, alCssFamily, alFontBpp);
          R.flushSurface(alTbSurf);
          alTextBlock.appendChild(alTbCanvas);
        } else {
          const alTbSpan = document.createElement('span');
          alTbSpan.textContent = alText;
          alTbSpan.style.cssText = `position:absolute;left:${alMargin*z}px;top:${alMargin*z}px;color:${alTextColor};font-size:${alFontSize*z}px;white-space:nowrap;line-height:${alFontSize*z}px;`;
          alTbSpan.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", sans-serif';
          if (alAlpha < 255) alTbSpan.style.opacity = alAlpha / 255;
          alTextBlock.appendChild(alTbSpan);
        }
        el.appendChild(alTextBlock);
      } else {
        // 无旋转模式：与 label 控件一致的渲染方式
        const { surf, R } = createWidgetCanvas(el, w, z);
        el.style.opacity = alAlpha / 255;
        if (alBgFlag) {
          R.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, alRadius, R.hexToColor(alBgColor), alAlpha);
        }
        if (alHasFont) {
          const coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
          const pos = R.getTextPosRealtime(coords, alText, alFontSize, alCssFamily, 0, alignStrToNum(alAlign));
          R.drawString(surf, pos.x + alOffsetX, pos.y + alOffsetY, alText, R.hexToColor(alTextColor), alAlpha, alFontSize, alCssFamily, alFontBpp);
        }
        flushWidget(surf);
        if (!alHasFont) {
          overlayText({
            text: alText,
            color: alTextColor,
            fontSize: alFontSize,
            fontFamily: alFontFamily,
            align: alAlign,
            x: 0, y: 0, w: w.width, h: w.height,
            offX: alOffsetX,
            offY: alOffsetY
          });
        }
      }
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
