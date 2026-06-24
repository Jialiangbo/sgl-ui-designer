import { AppState, navigate, initNav, escapeHtml } from './app.js';
import { SGL_WIDGET_TYPES } from './sgl_api.js';
import { getCheckboxIconDataUrl } from './checkbox_icon.js';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

initNav('preview');
AppState.init();

// ============ 字体文件名 → 浏览器可用字体栈 映射（预览页简化版） ============
const SGL_FONT_MAP = {
  'simhei.ttf': '"SimHei", "Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  'simsun.ttc': '"SimSun", "宋体", "Songti SC", serif',
  'simkai.ttf': '"KaiTi", "楷体", "STKaiti", serif',
  'simsunb.ttf': '"SimSun", "宋体", "NSimSun", serif',
  'msyh.ttf': '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  'arial.ttf': 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  'DejaVuSans.ttf': '"DejaVu Sans", "Bitstream Vera Sans", sans-serif',
  'sourcehansans.ttf': '"Source Han Sans CN", "Noto Sans CJK SC", "PingFang SC", sans-serif',
  'notosanscjk.ttf': '"Noto Sans CJK SC", "Source Han Sans CN", sans-serif',
  'default': 'system-ui, -apple-system, "Segoe UI", sans-serif'
};

function getCssFontStack(family) {
  if (!family || family === 'default') return SGL_FONT_MAP['default'];
  if (SGL_FONT_MAP[family]) return SGL_FONT_MAP[family];
  const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
  if (SGL_FONT_MAP[fileName]) return SGL_FONT_MAP[fileName];
  return SGL_FONT_MAP['default'];
}

// 将本地资源路径转换为 Tauri 可访问的 asset URL
function toAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('asset://') || path.startsWith('file://')) return path;
  return convertFileSrc(path);
}

function pixmapFormatHasAlpha(fmt) {
  return /^ARGB/i.test(fmt || 'RGB565');
}

const opaqueImageCache = new Map();

async function getOpaqueImageUrl(originalPath, fillColor) {
  const key = originalPath + '|' + (fillColor || '#000000');
  if (opaqueImageCache.has(key)) {
    return opaqueImageCache.get(key);
  }
  try {
    const dataUrl = await invoke('get_opaque_image_data_url', {
      path: originalPath,
      fillColor: fillColor || '#000000'
    });
    opaqueImageCache.set(key, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('getOpaqueImageUrl error:', err);
    return toAssetUrl(originalPath);
  }
}

function mixColors(c1, c2, ratio = 0.5) {
  const hex1 = (c1 && c1.startsWith('#') && c1.length >= 7) ? c1 : '#000000';
  const hex2 = (c2 && c2.startsWith('#') && c2.length >= 7) ? c2 : '#000000';
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) * (1 - ratio) + parseInt(hex2.slice(1, 3), 16) * ratio);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) * (1 - ratio) + parseInt(hex2.slice(3, 5), 16) * ratio);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) * (1 - ratio) + parseInt(hex2.slice(5, 7), 16) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

let currentIndex = 0;

// 计算控件的绝对位置（考虑父对象）
function getWidgetAbsPos(w, page) {
  const widgetMap = new Map();
  page.widgets.forEach(pw => widgetMap.set(pw.id, pw));
  let x = w.x, y = w.y;
  let current = w;
  while (current.parentId && widgetMap.has(current.parentId)) {
    current = widgetMap.get(current.parentId);
    x += current.x;
    y += current.y;
  }
  return { x, y };
}

// 层级组排序：根祖先及其子孙作为整体，组之间按根祖先的 zOrder 排序，组内按深度排序
function sortWidgetsByHierarchy(widgets) {
  const widgetMap = new Map();
  widgets.forEach(w => widgetMap.set(w.id, w));

  // 找到每个控件的根祖先（组标识）
  const rootMap = new Map();
  function getRoot(w) {
    if (rootMap.has(w.id)) return rootMap.get(w.id);
    if (!w.parentId || !widgetMap.has(w.parentId)) {
      rootMap.set(w.id, w.id);
      return w.id;
    }
    const parent = widgetMap.get(w.parentId);
    const root = getRoot(parent);
    rootMap.set(w.id, root);
    return root;
  }
  widgets.forEach(w => getRoot(w));

  // 计算深度
  const depthMap = new Map();
  function getDepth(w) {
    if (depthMap.has(w.id)) return depthMap.get(w.id);
    if (!w.parentId || !widgetMap.has(w.parentId)) {
      depthMap.set(w.id, 0);
      return 0;
    }
    const parent = widgetMap.get(w.parentId);
    const depth = getDepth(parent) + 1;
    depthMap.set(w.id, depth);
    return depth;
  }
  widgets.forEach(w => getDepth(w));

  // 先按组的 zOrder 排序（组之间的顺序），组内按深度排序
  return [...widgets].sort((a, b) => {
    const rootA = rootMap.get(a.id);
    const rootB = rootMap.get(b.id);
    const rootAObj = widgetMap.get(rootA);
    const rootBObj = widgetMap.get(rootB);
    const zA = rootAObj?.zOrder != null ? rootAObj.zOrder : 0;
    const zB = rootBObj?.zOrder != null ? rootBObj.zOrder : 0;
    if (zA !== zB) return zA - zB;
    return depthMap.get(a.id) - depthMap.get(b.id);
  });
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
  frame.style.width = (page.width * z) + 'px';
  frame.style.height = (page.height * z) + 'px';
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
    el.style.width = (w.width * z) + 'px';
    el.style.height = (w.height * z) + 'px';
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';

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
  switch (w.type) {
    case 'rect': {
      const rectRadius = ((w.radius || 0) * z);
      if (w.pixmap) {
        const imgPath = toAssetUrl(w.pixmap);
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        // 支持 Alpha 的格式：图片透明区域与控件底色混合；否则按黑色填充并去掉 alpha 通道
        el.style.backgroundColor = hasAlpha ? (w.color || '#FFFFFF') : '#000000';
        const imgEl = document.createElement('div');
        const mainAlpha = w.mainAlpha != null ? w.mainAlpha : 255;
        imgEl.style.cssText = `position:absolute;inset:0;background-size:100% 100%;background-position:0 0;border-radius:${rectRadius}px;opacity:${mainAlpha < 255 ? mainAlpha / 255 : 1};`;
        el.appendChild(imgEl);
        if (hasAlpha) {
          imgEl.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(w.pixmap, '#000000').then(url => { imgEl.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        el.style.background = w.color || '#FFFFFF';
      }
      el.style.border = `${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'}`;
      el.style.borderRadius = rectRadius + 'px';
      break;
    }

    case 'circle': {
      // SGL 圆形半径 = width/2，圆心在控件中心
      const dia = w.width * z;
      const circleEl = document.createElement('div');
      const xOff = (w.xOffset || 0) * z;
      const yOff = (w.yOffset || 0) * z;
      circleEl.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)${xOff || yOff ? ` translate(${xOff}px, ${yOff}px)` : ''};width:${dia}px;height:${dia}px;border-radius:50%;border:${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'};box-sizing:border-box;`;
      if (w.pixmap) {
        const imgPath = toAssetUrl(w.pixmap);
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        circleEl.style.backgroundColor = hasAlpha ? (w.color || '#FFFFFF') : '#000000';
        circleEl.style.backgroundSize = '100% 100%';
        if (hasAlpha) {
          circleEl.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(w.pixmap, '#000000').then(url => { circleEl.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        circleEl.style.background = w.color || '#FFFFFF';
      }
      el.appendChild(circleEl);
      break;
    }

    case 'line': {
      el.style.background = 'transparent';
      const p = (prop, def) => w[prop] != null ? w[prop] : def;
      const lineH = Math.max(1, p('lineWidth', 1)) * z;
      const lineCol = p('color', '#000000');

      // line 控件的 x1/y1 就是控件位置，x2/y2 默认由 x1+width/y1+height 计算
      const absX1 = w.x1 != null ? w.x1 : w.x;
      const absY1 = w.y1 != null ? w.y1 : w.y;
      const absX2 = w.x2 != null ? w.x2 : (w.x + w.width);
      const absY2 = w.y2 != null ? w.y2 : (w.y + w.height);

      // 转换为相对于控件容器的位置
      const relX1 = absX1 - w.x;
      const relY1 = absY1 - w.y;
      const relX2 = absX2 - w.x;
      const relY2 = absY2 - w.y;
      const lineLen = Math.sqrt(Math.pow(relX2 - relX1, 2) + Math.pow(relY2 - relY1, 2));
      const minX = Math.min(relX1, relX2);
      const minY = Math.min(relY1, relY2);

      const lineEl = document.createElement('div');
      lineEl.style.cssText = `position:absolute;left:${minX * z}px;top:${minY * z}px;width:${Math.max(lineLen * z, 1)}px;height:${lineH}px;background:${lineCol};border-radius:${lineH / 2}px;transform-origin:left top;`;

      // 处理斜线
      if (relY1 !== relY2 && Math.abs(relX2 - relX1) > 0) {
        const angle = Math.atan2(relY2 - relY1, relX2 - relX1) * 180 / Math.PI;
        lineEl.style.transform = `rotate(${angle}deg)`;
      }

      // 处理虚线
      if (w.dashed) {
        const dLen = w.dashLen || 10;
        const gLen = w.gapLen || 5;
        lineEl.style.background = `repeating-linear-gradient(90deg, ${lineCol} 0, ${lineCol} ${dLen * z}px, transparent ${dLen * z}px, transparent ${(dLen + gLen) * z}px)`;
      }

      el.appendChild(lineEl);
      break;
    }

    case 'ring': {
      el.style.background = 'transparent';
      let radiusInVal, radiusOutVal;
      const ringDiameter = Math.min(w.width, w.height);
      if (w.radiusOut != null && w.radiusOut > 0) {
        radiusOutVal = w.radiusOut;
      } else {
        radiusOutVal = ringDiameter / 2;
      }
      if (w.radiusIn != null && w.radiusIn > 0 && w.radiusIn < radiusOutVal) {
        radiusInVal = w.radiusIn;
      } else {
        radiusInVal = radiusOutVal - 2;
      }
      const ringWidth = radiusOutVal - radiusInVal;
      // 如果显式设置了 radiusOut，调整元素尺寸
      if (w.radiusOut != null && w.radiusOut > 0) {
        el.style.width = (w.radiusOut * 2 * z) + 'px';
        el.style.height = (w.radiusOut * 2 * z) + 'px';
      }
      el.style.border = `${ringWidth * z}px solid ${w.color || '#FFFFFF'}`;
      el.style.borderRadius = '50%';
      break;
    }

    case 'arc': {
      let arcRadiusInVal, arcRadiusOutVal;
      const arcDiameter = Math.min(w.width, w.height);
      if (w.radiusOut == null || w.radiusOut <= 0) {
        arcRadiusOutVal = Math.round(arcDiameter / 2);
      } else {
        arcRadiusOutVal = w.radiusOut;
      }
      if (w.radiusIn == null || w.radiusIn <= 0) {
        arcRadiusInVal = arcRadiusOutVal - 2;
      } else {
        arcRadiusInVal = (w.radiusIn < arcRadiusOutVal) ? w.radiusIn : arcRadiusOutVal - 2;
      }
      const arcMode = Number(w.mode || 0);
      const startAngle = Number(w.startAngle != null ? w.startAngle : 0);
      const endAngle = Number(w.endAngle != null ? w.endAngle : 360);
      const arcColor = w.color || '#000000';
      const bgColor = w.bgColor || '#FFFFFF';

      let arcAngle = endAngle - startAngle;
      while (arcAngle < 0) arcAngle += 360;
      while (arcAngle > 360) arcAngle -= 360;

      const elemW = w.width * z;
      const elemH = w.height * z;
      const cx = elemW / 2;
      const cy = elemH / 2;
      const rOut = arcRadiusOutVal * z;
      const rIn = arcRadiusInVal * z;

      el.style.width = elemW + 'px';
      el.style.height = elemH + 'px';
      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.mask = '';
      el.style.webkitMask = '';

      // 0度=6点钟方向，顺时针为正。SVG 0度=3点钟方向。SVG角度 = 我们的度数 + 90
      let svgContent = '';
      const isFullCircle = (startAngle === 0 && endAngle === 360) || arcAngle >= 360;

      if (isFullCircle) {
        const rMid = (rOut + rIn) / 2;
        const strokeW = rOut - rIn;
        svgContent += `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="${arcColor}" stroke-width="${strokeW}" />`;
      } else {
        const largeArc = arcAngle > 180 ? 1 : 0;
        const a1 = (startAngle + 90) * Math.PI / 180;
        const a2 = (endAngle + 90) * Math.PI / 180;
        const x1Out = cx + rOut * Math.cos(a1);
        const y1Out = cy + rOut * Math.sin(a1);
        const x2Out = cx + rOut * Math.cos(a2);
        const y2Out = cy + rOut * Math.sin(a2);
        const x1In = cx + rIn * Math.cos(a1);
        const y1In = cy + rIn * Math.sin(a1);
        const x2In = cx + rIn * Math.cos(a2);
        const y2In = cy + rIn * Math.sin(a2);

        if (arcMode === 0 || arcMode === 2) {
          const pathD = `M ${x1Out} ${y1Out} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2Out} ${y2Out} L ${x2In} ${y2In} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x1In} ${y1In} Z`;
          svgContent += `<path d="${pathD}" fill="${arcColor}" />`;
        } else if (arcMode === 1 || arcMode === 3) {
          const rMid = (rOut + rIn) / 2;
          const strokeW = rOut - rIn;
          svgContent += `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="${bgColor}" stroke-width="${strokeW}" />`;
          const pathD = `M ${x1Out} ${y1Out} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2Out} ${y2Out} L ${x2In} ${y2In} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x1In} ${y1In} Z`;
          svgContent += `<path d="${pathD}" fill="${arcColor}" />`;
        }
      }

      el.innerHTML = `<svg width="${elemW}" height="${elemH}" style="position:absolute;top:0;left:0;">${svgContent}</svg>`;
      break;
    }

    case 'polygon': {
      if (w.pixmap) {
        const imgPath = toAssetUrl(w.pixmap);
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        el.style.background = '';
        el.style.backgroundColor = hasAlpha ? (w.fillColor || '#8b5cf6') : '#000000';
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundPosition = '0 0';
        if (hasAlpha) {
          el.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(w.pixmap, '#000000').then(url => { el.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        el.style.background = w.fillColor || '#8b5cf6';
      }
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#7c3aed'}`;

      const vertices = w.vertices || '0,0;50,100;100,0';
      const coords = vertices.split(';').map(p => p.trim()).filter(p => p);
      if (coords.length >= 3) {
        const clipPoints = coords.map(c => {
          const [x, y] = c.split(',').map(v => parseInt(v.trim()) || 0);
          return `${(x / w.width * 100)}% ${(y / w.height * 100)}%`;
        }).join(', ');
        el.style.clipPath = `polygon(${clipPoints})`;
      } else {
        el.style.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
      }
      
      if (w.text) {
        const textSpan = document.createElement('span');
        textSpan.textContent = w.text;
        textSpan.style.cssText = `
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          color:${w.textColor || '#ffffff'};
          font-size:${((w.fontSize || 14) * z)}px;
          pointer-events:none;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          max-width:90%;
        `;
        el.appendChild(textSpan);
      }
      break;
    }

    case 'button': {
      if (w.pixmap) {
        const imgPath = toAssetUrl(w.pixmap);
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        // 支持 Alpha 的格式：图片透明区域与控件底色混合；否则按黑色填充并去掉 alpha 通道
        el.style.backgroundColor = hasAlpha ? (w.bgColor || w.color || '#8b5cf6') : '#000000';
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundPosition = '0 0';
        if (hasAlpha) {
          el.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(w.pixmap, '#000000').then(url => { el.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        el.style.background = w.bgColor || w.color || '#8b5cf6';
      }
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#7c3aed'}`;
      el.style.borderRadius = ((w.radius || 8) * z) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = justifyContent(w.align);
      el.style.padding = (4 * z) + 'px ' + (8 * z) + 'px';
      const text = document.createElement('span');
      text.textContent = w.text || '按钮';
      text.style.color = w.textColor || '#ffffff';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      el.appendChild(text);
      break;
    }

    case 'label': {
      el.style.background = w.bgColor && w.bgColor !== 'transparent' ? w.bgColor : 'transparent';
      el.style.borderRadius = ((w.radius || 0) * z) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = justifyContent(w.align);
      el.style.padding = (2 * z) + 'px ' + (4 * z) + 'px';
      const text = document.createElement('span');
      text.textContent = w.text || '标签';
      text.style.color = w.textColor || w.color || '#e4e4e7';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      if (w.textRotation) text.style.transform = `rotate(${w.textRotation}deg)`;
      el.appendChild(text);
      break;
    }

    case 'textbox': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 6) * z) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.padding = '0 ' + (8 * z) + 'px';
      const text = document.createElement('span');
      text.textContent = w.text || '';
      text.style.color = w.textColor || '#e4e4e7';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      text.style.opacity = 0.7;
      el.appendChild(text);
      break;
    }

    case 'switch': {
      const swRadius = (w.radius || 15) * z;
      const swMargin = (w.knobMargin || 2) * z;
      const trackH = w.height * z;
      const trackW = w.width * z;
      const swOn = w.status || false;
      const swPixmap = w.pixmap || '';

      if (swPixmap) {
        const imgPath = toAssetUrl(swPixmap);
        const pixmapFormat = w.pixmapFormat || 'RGB565';
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        // 支持 Alpha 的格式：图片透明区域与控件底色混合；否则按黑色填充并去掉 alpha 通道
        el.style.backgroundColor = hasAlpha ? (swOn ? (w.onColor || '#8b5cf6') : (w.bgColor || '#313149')) : '#000000';
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundPosition = '0 0';
        if (hasAlpha) {
          el.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(swPixmap, '#000000').then(url => { el.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        el.style.background = swOn ? (w.onColor || '#8b5cf6') : (w.bgColor || '#313149');
      }
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = swRadius + 'px';

      const knobSize = trackH - 2 * swMargin;
      const maxCorner = Math.max(0, swRadius - swMargin);
      const knobCorner = Math.min(maxCorner, (w.knobRadius || 255) * z);
      const pos = swOn ? trackW - knobSize - swMargin : swMargin;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;top:50%;left:${pos}px;transform:translateY(-50%);width:${knobSize}px;height:${knobSize}px;border-radius:${knobCorner}px;background:${w.knobColor || '#ffffff'};box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      el.appendChild(knob);
      break;
    }

    case 'checkbox': {
      // SGL checkbox: 使用内置 26x22 图标，图标+文本颜色统一为 color，整体居中
      const cbCol = w.color || w.onColor || w.textColor || '#000000';
      const cbStatus = w.status || false;
      const cbText = w.text || '';
      const cbFontSize = (w.fontSize || 14) * z;
      const iconW = 26 * z;
      const iconH = 22 * z;

      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = ((w.radius || 0) * z) + 'px';
      el.style.overflow = 'hidden';

      const inner = document.createElement('div');
      inner.style.cssText = `display:flex;align-items:center;justify-content:center;gap:${2 * z}px;width:100%;height:100%;padding:0 ${2 * z}px;box-sizing:border-box;pointer-events:none;`;

      const icon = document.createElement('div');
      icon.style.cssText = `flex-shrink:0;width:${iconW}px;height:${iconH}px;background-image:url('${getCheckboxIconDataUrl(cbStatus, cbCol)}');background-size:contain;background-repeat:no-repeat;background-position:center;image-rendering:pixelated;position:relative;top:${z}px;`;
      inner.appendChild(icon);

      if (cbText) {
        const text = document.createElement('span');
        text.textContent = cbText;
        text.style.cssText = `color:${cbCol};font-size:${cbFontSize}px;font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;`;
        inner.appendChild(text);
      }

      el.appendChild(inner);
      break;
    }

    case 'slider': {
      const isHoriz = w.direct !== 1;
      const slValue = w.value || 0;
      const wPx = w.width * z;
      const hPx = w.height * z;
      const knobR = Math.max(1, (isHoriz ? hPx : wPx) / 2 - z);
      const thicknessPx = (w.thickness || 8) * z;
      const barThickness = Math.min(thicknessPx, knobR);
      const radius = Math.min(barThickness / 2, (w.radius || 4) * z);

      const bar = document.createElement('div');
      if (isHoriz) {
        bar.style.cssText = `position:absolute;left:${knobR}px;top:${(hPx - barThickness) / 2}px;width:${Math.max(0, wPx - 2 * knobR)}px;height:${barThickness}px;border-radius:${radius}px;background:${w.trackColor || '#313149'};overflow:hidden;`;
      } else {
        bar.style.cssText = `position:absolute;left:${(wPx - barThickness) / 2}px;top:${knobR}px;width:${barThickness}px;height:${Math.max(0, hPx - 2 * knobR)}px;border-radius:${radius}px;background:${w.trackColor || '#313149'};overflow:hidden;`;
      }

      const fill = document.createElement('div');
      if (isHoriz) fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${slValue}%;background:${w.fillColor || '#8b5cf6'};`;
      else fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${slValue}%;background:${w.fillColor || '#8b5cf6'};`;
      bar.appendChild(fill);
      el.appendChild(bar);

      const knobSize = knobR * 2;
      const knob = document.createElement('div');
      if (isHoriz) {
        knob.style.cssText = `position:absolute;top:50%;left:${knobR + Math.max(0, wPx - 2 * knobR) * slValue / 100}px;transform:translate(-50%,-50%);width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${w.knobColor || '#ffffff'};`;
      } else {
        knob.style.cssText = `position:absolute;left:50%;top:${hPx - knobR - Math.max(0, hPx - 2 * knobR) * slValue / 100}px;transform:translate(-50%,-50%);width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${w.knobColor || '#ffffff'};`;
      }
      el.appendChild(knob);
      break;
    }

    case 'progress': {
      el.style.background = w.trackColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${w.value || 0}%;background:${w.fillColor || '#22c55e'};border-radius:${(w.radius || 4) * z}px;`;
      el.appendChild(fill);
      break;
    }

    case 'bar': {
      // SGL bar: direct=0 水平（左 fill，右 track），direct=1 垂直（下 fill，上 track）
      const barDirect = w.direct || 0;
      const barValue = w.value || 50;
      el.style.background = w.bgColor || '#FFFFFF';
      el.style.border = `${(w.borderWidth != null ? w.borderWidth : 1) * z}px solid ${w.borderColor || '#000000'}`;
      el.style.borderRadius = ((w.radius || 0) * z) + 'px';
      const fill = document.createElement('div');
      if (barDirect === 0) {
        fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${barValue}%;background:${w.barColor || '#000000'};border-radius:inherit;`;
      } else {
        fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${barValue}%;background:${w.barColor || '#000000'};border-radius:inherit;`;
      }
      el.appendChild(fill);
      break;
    }

    case 'gauge': {
      // SGL gauge: 圆心中心，半径 = max(radius, width/2-1)，默认角度 30~330 度
      const gValue = w.value || 0;
      const startAngle = w.startAngle != null ? w.startAngle : 30;
      const endAngle = w.endAngle != null ? w.endAngle : 330;
      const scaleAngle = w.scaleAngle || 15;
      const scaleStep = w.scaleStep || 10;
      const scaleStart = w.scaleStart || 0;
      const scaleLen = Math.max(w.scaleLength || 0, 4);
      const arcW = w.arcWidth || 2;
      const scaleW = w.scaleWidth || 1;
      const ptrW = w.pointerWidth || 2;
      const hubR = Math.max((Math.min(w.width, w.height) / 2 - 1 + 8) / 8, w.hubRadius || 0);
      const bgCol = w.bgColor || '#000000';
      const arcCol = w.arcColor || '#FFFFFF';
      const scaleCol = w.scaleColor || '#FFFFFF';
      const ptrCol = w.pointerColor || '#FF0000';
      const textCol = w.textColor || '#FFFFFF';
      const hubCol = w.hubColor || '#FFFFFF';
      const borderW = (w.borderWidth || 0) * z;

      const wPx = w.width * z;
      const hPx = w.height * z;
      const cx = wPx / 2;
      const cy = hPx / 2;
      const r = Math.max((w.radius || 0) * z, wPx / 2 - z);
      const scaleOut = arcW * z + 6 * z;
      const scaleIn = scaleOut + scaleLen * z;
      const ptrStart = scaleIn + 4 * z + ptrW * z;
      const ptrEnd = r - hubR * z - ptrW * z;

      el.style.background = bgCol;
      el.style.border = `${borderW}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = '50%';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', wPx);
      svg.setAttribute('height', hPx);
      svg.style.position = 'absolute';
      svg.style.top = '0';
      svg.style.left = '0';

      const deg2rad = d => (d - 90) * Math.PI / 180;

      const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bgCircle.setAttribute('cx', cx);
      bgCircle.setAttribute('cy', cy);
      bgCircle.setAttribute('r', r);
      bgCircle.setAttribute('fill', bgCol);
      svg.appendChild(bgCircle);

      const arcR = (r - 1 + r - arcW * z - 1) / 2;
      const arcStroke = Math.max(1, r - 1 - (r - arcW * z - 1));
      const arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const arcAng = endAngle - startAngle;
      const largeArc = arcAng > 180 ? 1 : 0;
      const x1 = cx + arcR * Math.cos(deg2rad(startAngle));
      const y1 = cy + arcR * Math.sin(deg2rad(startAngle));
      const x2 = cx + arcR * Math.cos(deg2rad(endAngle));
      const y2 = cy + arcR * Math.sin(deg2rad(endAngle));
      arcPath.setAttribute('d', `M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${x2} ${y2}`);
      arcPath.setAttribute('fill', 'none');
      arcPath.setAttribute('stroke', arcCol);
      arcPath.setAttribute('stroke-width', arcStroke);
      svg.appendChild(arcPath);

      const textInterval = w.textInterval != null ? w.textInterval : 3;
      const scaleWarning = w.scaleWarning != null ? w.scaleWarning : 32767;
      let scaleMask = scaleStart;
      let count = 0;
      for (let angle = startAngle; angle <= endAngle; angle += scaleAngle) {
        const sc = scaleMask < scaleWarning ? scaleCol : '#FF0000';
        const rad = deg2rad(angle);
        const xo = cx + (r - scaleOut) * Math.cos(rad);
        const yo = cy + (r - scaleOut) * Math.sin(rad);
        const xi = cx + (r - scaleIn) * Math.cos(rad);
        const yi = cy + (r - scaleIn) * Math.sin(rad);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', xo);
        line.setAttribute('y1', yo);
        line.setAttribute('x2', xi);
        line.setAttribute('y2', yi);
        line.setAttribute('stroke', sc);
        line.setAttribute('stroke-width', (count & textInterval) === 0 ? scaleW * 2 * z : scaleW * z);
        svg.appendChild(line);

        if ((count & textInterval) === 0) {
          const textCr = r - scaleIn - 6 * z;
          const tx = cx + textCr * Math.cos(rad);
          const ty = cy + textCr * Math.sin(rad);
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', tx);
          txt.setAttribute('y', ty);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('dominant-baseline', 'central');
          txt.setAttribute('fill', textCol);
          txt.setAttribute('font-size', Math.max(8 * z, 8));
          txt.textContent = scaleMask;
          svg.appendChild(txt);
        }
        scaleMask += scaleStep;
        count++;
      }

      const needleAngle = 90 + startAngle + gValue * scaleAngle / scaleStep;
      const nRad = deg2rad(needleAngle);
      const nCos = Math.cos(nRad);
      const nSin = Math.sin(nRad);
      const px = cx + (r - ptrStart) * nCos;
      const py = cy + (r - ptrStart) * nSin;
      const nx = cx + (r - ptrEnd) * nCos;
      const ny = cy + (r - ptrEnd) * nSin;
      const needle = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      needle.setAttribute('x1', px);
      needle.setAttribute('y1', py);
      needle.setAttribute('x2', nx);
      needle.setAttribute('y2', ny);
      needle.setAttribute('stroke', ptrCol);
      needle.setAttribute('stroke-width', Math.max(1, ptrW * z));
      svg.appendChild(needle);

      const hub = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hub.setAttribute('cx', cx);
      hub.setAttribute('cy', cy);
      hub.setAttribute('r', Math.max(1, hubR * z));
      hub.setAttribute('fill', hubCol);
      svg.appendChild(hub);

      const valText = document.createElement('div');
      valText.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${Math.max(10 * z, 10)}px;color:${textCol};pointer-events:none;`;
      valText.textContent = gValue;

      el.appendChild(svg);
      el.appendChild(valText);
      break;
    }

    case 'led': {
      el.style.background = w.status ? w.color : (w.bgColor || '#313149');
      el.style.border = (1 * z) + 'px solid ' + (w.borderColor || '#3d3d5c');
      el.style.borderRadius = '50%';
      if (w.status) el.style.boxShadow = '0 0 ' + (6 * z) + 'px ' + (w.color || '#22c55e');
      break;
    }

    case 'battery': {
      // SGL battery: 支持水平/垂直方向、电池帽位置、分段填充
      const bLevel = w.level != null ? w.level : (w.value || 80);
      const bDir = w.direction || 0;
      const bCapPos = w.capPos || 0;
      const bCapSize = (w.capSize || 4) * z;
      const bNumCells = w.numCells || 6;
      const bLowCol = w.lowColor || '#FF0000';
      const bMedCol = w.mediumColor || '#FFA500';
      const bHighCol = w.highColor || '#00FF00';
      const bFillCol = bLevel < 20 ? bLowCol : (bLevel < 50 ? bMedCol : bHighCol);
      const bBorderCol = w.borderColor || '#FFFFFF';
      const bBorderW = Math.max(1, (w.borderWidth != null ? w.borderWidth : 1)) * z;
      const bRadius = (w.radius || 4) * z;
      const wPx = w.width * z;
      const hPx = w.height * z;

      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = '0';

      let batteryW, batteryH, batteryX, batteryY, capW, capH, capX, capY;
      if (bDir === 0) {
        batteryW = wPx - bCapSize;
        batteryH = hPx - Math.floor(hPx / 5);
        capW = bCapSize;
        capH = batteryH / 3;
        if (bCapPos === 1) {
          batteryX = bCapSize;
          batteryY = (hPx - batteryH) / 2;
          capX = 0;
        } else {
          batteryX = 0;
          batteryY = (hPx - batteryH) / 2;
          capX = batteryW;
        }
        capY = batteryY + (batteryH - capH) / 2;
      } else {
        batteryH = hPx - bCapSize;
        batteryW = wPx - Math.floor(wPx / 5);
        capH = bCapSize;
        capW = batteryW / 3;
        batteryY = bCapSize;
        batteryX = (wPx - batteryW) / 2;
        capX = batteryX + (batteryW - capW) / 2;
        capY = 0;
      }

      const shell = document.createElement('div');
      shell.style.cssText = `position:absolute;left:${batteryX}px;top:${batteryY}px;width:${batteryW}px;height:${batteryH}px;border:${bBorderW}px solid ${bBorderCol};border-radius:${bRadius}px;box-sizing:border-box;overflow:hidden;`;

      const cap = document.createElement('div');
      cap.style.cssText = `position:absolute;left:${capX}px;top:${capY}px;width:${capW}px;height:${capH}px;background:${bBorderCol};border-radius:${Math.max(0, bRadius - 1)}px;`;

      const bg = document.createElement('div');
      bg.style.cssText = `position:absolute;left:${bBorderW}px;top:${bBorderW}px;right:${bBorderW}px;bottom:${bBorderW}px;background:${w.bgColor || '#1E1E1E'};border-radius:${Math.max(0, bRadius - bBorderW)}px;`;
      shell.appendChild(bg);

      if (bLevel > 0) {
        const activeCells = Math.min(bNumCells, Math.max(1, Math.floor((bLevel * bNumCells + 99) / 100)));
        const padding = 2 * z;
        const fillX = bBorderW + padding;
        const fillY = bBorderW + padding;
        const fillW = batteryW - 2 * bBorderW - 2 * padding;
        const fillH = batteryH - 2 * bBorderW - 2 * padding;
        if (bDir === 0) {
          const minGap = 2 * z;
          let totalGap = (bNumCells - 1) * minGap;
          if (totalGap >= fillW) totalGap = (bNumCells - 1) * z;
          const cellW = Math.max(z, Math.floor((fillW - totalGap) / bNumCells));
          const usedW = cellW * bNumCells + totalGap;
          const remainW = fillW - usedW;
          const cellH = fillH;
          const startX = bCapPos === 1 ? (fillX + fillW - usedW) : fillX;
          for (let i = 0; i < activeCells; i++) {
            let curW = cellW;
            if (bCapPos === 1 ? (i >= bNumCells - remainW / z) : (i < remainW / z)) curW += z;
            const cx = bCapPos === 1 ? (startX + (activeCells - 1 - i) * (cellW + (i < activeCells - 1 ? minGap : 0))) : (startX + i * (cellW + minGap));
            const cell = document.createElement('div');
            cell.style.cssText = `position:absolute;left:${cx}px;top:${fillY}px;width:${curW}px;height:${cellH}px;background:${bFillCol};border-radius:${Math.max(0, bRadius - bBorderW - padding)}px;`;
            shell.appendChild(cell);
          }
        } else {
          const minGap = 2 * z;
          let totalGap = (bNumCells - 1) * minGap;
          if (totalGap >= fillH) totalGap = (bNumCells - 1) * z;
          const cellH = Math.max(z, Math.floor((fillH - totalGap) / bNumCells));
          const usedH = cellH * bNumCells + totalGap;
          const startY = fillY + fillH - usedH;
          for (let i = 0; i < activeCells; i++) {
            const cy = startY + (bNumCells - 1 - i) * (cellH + minGap);
            const cell = document.createElement('div');
            cell.style.cssText = `position:absolute;left:${fillX}px;top:${cy}px;width:${fillW}px;height:${cellH}px;background:${bFillCol};border-radius:${Math.max(0, bRadius - bBorderW - padding)}px;`;
            shell.appendChild(cell);
          }
        }
      }

      if (w.charging) {
        const charge = document.createElement('div');
        charge.style.cssText = `position:absolute;left:${batteryX + batteryW / 2 - 4 * z}px;top:${batteryY + batteryH / 2 - 6 * z}px;width:0;height:0;border-left:${3 * z}px solid transparent;border-right:${3 * z}px solid transparent;border-top:${6 * z}px solid ${w.chargingColor || '#FFFF00'};transform:rotate(15deg);`;
        shell.appendChild(charge);
      }

      el.appendChild(shell);
      el.appendChild(cap);

      if (w.showPercentage) {
        const pct = document.createElement('div');
        pct.textContent = bLevel + '%';
        pct.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${Math.min(12 * z, hPx * 0.4)}px;color:${w.textColor || '#000000'};pointer-events:none;font-family:${getCssFontStack(w.fontFamily || 'simsun.ttc')};`;
        el.appendChild(pct);
      }
      break;
    }

    case 'dropdown': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      el.style.overflow = 'hidden';
      const ddOptions = (w.options || '').split('\n').filter(o => o.length > 0);
      const ddFontSize = w.fontSize || 14;
      const ddTextColor = w.textColor || '#e4e4e7';
      const ddFontFamily = getCssFontStack(w.fontFamily || 'simhei.ttf');
      const ddRadius = (w.radius || 4) * z;
      const ddBorderW = (w.borderWidth || 1) * z;
      // SGL dropdown (closed): item_pad = max(radius, border + 3), text centered vertically
      const ddItemPad = Math.max(ddRadius, ddBorderW + 3 * z);
      const ddTextX = ddItemPad;
      const ddArrowW = Math.max(18, Math.round(ddFontSize * z * 0.9));
      const ddArrowH = Math.max(10, Math.round(ddArrowW * 10 / 18));
      const ddInner = document.createElement('div');
      ddInner.style.cssText = `position:absolute;inset:${ddBorderW}px ${ddBorderW}px;display:flex;align-items:center;`;
      const ddText = document.createElement('span');
      ddText.textContent = ddOptions.length > 0 ? ddOptions[0] : '请选择';
      ddText.style.color = ddTextColor;
      ddText.style.fontSize = (ddFontSize * z) + 'px';
      ddText.style.fontFamily = ddFontFamily;
      ddText.style.flex = '1';
      ddText.style.marginLeft = (ddTextX - ddBorderW) + 'px';
      ddText.style.marginRight = (ddArrowW + 4 * z) + 'px';
      ddText.style.overflow = 'hidden';
      ddText.style.textOverflow = 'ellipsis';
      ddText.style.whiteSpace = 'nowrap';
      const ddArrow = document.createElement('span');
      ddArrow.innerHTML = `<svg width="${ddArrowW}" height="${ddArrowH}" viewBox="0 0 24 24" fill="currentColor" style="display:block;"><polygon points="12 18 4 8 20 8"/></svg>`;
      ddArrow.style.color = ddTextColor;
      ddArrow.style.position = 'absolute';
      ddArrow.style.right = (ddItemPad - ddBorderW) + 'px';
      ddArrow.style.top = '50%';
      ddArrow.style.transform = 'translateY(-50%)';
      ddArrow.style.display = 'flex';
      ddArrow.style.alignItems = 'center';
      ddArrow.style.justifyContent = 'center';
      ddInner.appendChild(ddText);
      ddInner.appendChild(ddArrow);
      el.appendChild(ddInner);
      break;
    }

    case 'roller': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      el.style.overflow = 'hidden';
      el.style.position = 'relative';
      const rOptions = (w.options || '').split('\n').filter(o => o.length > 0);
      const rFontSize = w.fontSize || 14;
      const rTextColor = w.textColor || '#e4e4e7';
      const rSelectedColor = w.selectedColor || '#8b5cf6';
      const rFontFamily = getCssFontStack(w.fontFamily || 'simhei.ttf');
      const rRadius = (w.radius || 4) * z;
      const rBorderW = (w.borderWidth || 1) * z;
      // SGL roller: item_h ≈ font_height + 6; use fontSize as practical approx.
      const rItemH = rFontSize * z;
      const rWidgetH = w.height * z;
      // selected band vertically centered in widget area
      const rBandY1 = (rWidgetH - rItemH) / 2;
      const rTextX = rRadius + 2 * z;
      // draw rows around the band; default scroll_y=0 so item 0 aligns with band
      for (let i = 0; i < rOptions.length; i++) {
        const itemY = rBandY1 + i * rItemH;
        const row = document.createElement('div');
        row.style.cssText = `position:absolute;left:${rTextX}px;top:${itemY}px;width:${(w.width * z) - rTextX - rBorderW}px;height:${rItemH}px;display:flex;align-items:center;justify-content:flex-start;box-sizing:border-box;color:${rTextColor};font-size:${rFontSize * z}px;font-family:${rFontFamily};background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        row.textContent = rOptions[i] || '';
        el.appendChild(row);
      }
      // selected band overlay
      const band = document.createElement('div');
      band.style.cssText = `position:absolute;left:${rBorderW}px;top:${rBandY1}px;width:${(w.width * z) - rBorderW * 2}px;height:${rItemH}px;background:${rSelectedColor};pointer-events:none;`;
      el.appendChild(band);
      break;
    }

    case 'textline':
    case 'textlist':
    case 'viewlist': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      if (w.text) {
        const text = document.createElement('span');
        text.textContent = w.text;
        text.style.color = w.color || w.textColor || '#e4e4e7';
        text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
        text.style.padding = (4 * z) + 'px ' + (8 * z) + 'px';
        text.style.display = 'block';
        el.appendChild(text);
      }
      break;
    }

    case 'win': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 8) * z) + 'px';
      const titleBar = document.createElement('div');
      titleBar.style.cssText = `height:${Math.max(24, (w.fontSize || 14) * 2) * z}px;background:${w.color || '#8b5cf6'};display:flex;align-items:center;padding:0 ${8 * z}px;border-radius:${(w.radius || 8) * z}px ${(w.radius || 8) * z}px 0 0;`;
      const titleText = document.createElement('span');
      titleText.textContent = w.text || '窗口';
      titleText.style.color = w.textColor || '#ffffff';
      titleText.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      titleBar.appendChild(titleText);
      el.appendChild(titleBar);
      break;
    }

    case 'msgbox': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 8) * z) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      const text = document.createElement('span');
      text.textContent = w.text || '提示信息';
      text.style.color = w.textColor || '#ffffff';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      text.style.textAlign = 'center';
      text.style.padding = (8 * z) + 'px';
      el.appendChild(text);
      break;
    }

    case 'scroll': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const scCol = w.color || '#8b5cf6';
      const sb = document.createElement('div');
      sb.style.cssText = `position:absolute;right:${2 * z}px;top:${4 * z}px;width:${4 * z}px;bottom:${4 * z}px;background:rgba(255,255,255,0.1);border-radius:${2 * z}px;`;
      const thumb = document.createElement('div');
      thumb.style.cssText = `position:absolute;left:0;top:20%;width:100%;height:40%;background:${scCol};opacity:0.6;border-radius:inherit;`;
      sb.appendChild(thumb);
      el.appendChild(sb);
      break;
    }

    case 'box': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const bxCol = w.color || '#8b5cf6';
      const innerBorder = document.createElement('div');
      innerBorder.style.cssText = `position:absolute;inset:${((w.borderWidth || 2) + 4) * z}px;border:1px solid ${bxCol};opacity:0.2;border-radius:${Math.max(0, ((w.radius || 4) - 4) * z)}px;pointer-events:none;`;
      el.appendChild(innerBorder);
      break;
    }

    case 'numberkbd': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 8) * z) + 'px';
      const cols = 3, rows = 4;
      const btnW = (w.width * z - (cols + 1) * 4 * z) / cols;
      const btnH = (w.height * z - (rows + 1) * 4 * z) / rows;
      const nkCol = w.color || '#313149';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const num = r * cols + c + 1;
          const btn = document.createElement('div');
          btn.style.cssText = `position:absolute;left:${4 * z + c * (btnW + 4 * z)}px;top:${4 * z + r * (btnH + 4 * z)}px;width:${btnW}px;height:${btnH}px;background:${num === 12 ? '#ef4444' : (num === 11 ? '#22c55e' : nkCol)};border-radius:${(w.radius || 8) * z}px;display:flex;align-items:center;justify-content:center;font-size:${(w.fontSize || 16) * z}px;color:#fff;`;
          btn.textContent = num <= 9 ? num : (num === 10 ? '取消' : num === 11 ? '0' : '确认');
          el.appendChild(btn);
        }
      }
      break;
    }

    case 'keyboard': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 6) * z) + 'px';
      const keys = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM⌫'];
      const keySize = (w.width * z) / 11;
      const rowGap = 3 * z;
      keys.forEach((row, ri) => {
        for (let ci = 0; ci < row.length; ci++) {
          const key = document.createElement('div');
          const offset = ri === 1 ? keySize / 2 : 0;
          key.style.cssText = `position:absolute;left:${ci * (keySize + 2 * z) + offset}px;top:${ri * (keySize * 0.6 + rowGap) + 4 * z}px;width:${keySize}px;height:${keySize * 0.6}px;background:${w.color || '#313149'};border-radius:${2 * z}px;display:flex;align-items:center;justify-content:center;font-size:${keySize * 0.4}px;color:#fff;`;
          key.textContent = row[ci];
          el.appendChild(key);
        }
      });
      break;
    }

    case 'scope': {
      el.style.background = w.bgColor || '#0f1a0f';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      for (let i = 1; i < 4; i++) {
        const hLine = document.createElement('div');
        hLine.style.cssText = `position:absolute;left:0;right:0;top:${i * 25}%;height:1px;background:rgba(34,197,94,0.2);`;
        el.appendChild(hLine);
      }
      const wave = document.createElement('div');
      wave.style.cssText = `position:absolute;left:0;right:0;top:0;bottom:0;border-bottom:${2 * z}px solid ${w.color || '#22c55e'};border-left:${2 * z}px solid transparent;`;
      el.appendChild(wave);
      break;
    }

    case 'spectrum': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const bars = 12;
      const spCol = w.color || '#8b5cf6';
      for (let i = 0; i < bars; i++) {
        const bar = document.createElement('div');
        const h = (0.3 + (i % 5) * 0.15) * (w.height * z);
        bar.style.cssText = `position:absolute;bottom:0;left:${i * (w.width * z / bars)}px;width:${(w.width * z / bars) - 2 * z}px;height:${h}px;background:${spCol};opacity:${0.6 + i * 0.03};border-radius:1px 1px 0 0;`;
        el.appendChild(bar);
      }
      break;
    }

    case 'qrcode': {
      el.style.background = w.bgColor || '#ffffff';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#000000'}`;
      const grid = 7;
      const qrCol = w.color || '#000000';
      const seed = 42;
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          if ((r * 7 + c + seed) % 3 !== 0) {
            const cell = document.createElement('div');
            cell.style.cssText = `position:absolute;left:${c * (w.width * z / grid)}px;top:${r * (w.height * z / grid)}px;width:${(w.width * z / grid) - 1}px;height:${(w.height * z / grid) - 1}px;background:${qrCol};`;
            el.appendChild(cell);
          }
        }
      }
      break;
    }

    case 'chart': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const pts = [[0.2, 0.8], [0.4, 0.3], [0.6, 0.6], [0.8, 0.2], [1.0, 0.5]];
      const chartCol = w.color || '#8b5cf6';
      const wpx = w.width * z, hpx = w.height * z;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', wpx); svg.setAttribute('height', hpx);
      svg.style.cssText = 'position:absolute;inset:0;';
      const polyEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const pointsStr = pts.map(([x, y]) => `${x * wpx},${(1 - y) * hpx}`).join(' ');
      polyEl.setAttribute('points', pointsStr);
      polyEl.setAttribute('fill', chartCol);
      polyEl.setAttribute('opacity', '0.5');
      svg.appendChild(polyEl);
      el.appendChild(svg);
      break;
    }

    case 'canvas': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const cvCol = w.color || '#8b5cf6';
      for (let x = 0; x < w.width * z; x += 10 * z) {
        const vLine = document.createElement('div');
        vLine.style.cssText = `position:absolute;left:${x}px;top:0;width:1px;height:100%;background:${cvCol};opacity:0.1;`;
        el.appendChild(vLine);
      }
      for (let y = 0; y < w.height * z; y += 10 * z) {
        const hLine = document.createElement('div');
        hLine.style.cssText = `position:absolute;top:${y}px;left:0;height:1px;width:100%;background:${cvCol};opacity:0.1;`;
        el.appendChild(hLine);
      }
      break;
    }

    case 'analogclock': {
      // SGL analogclock: r = max(radius, width/2 - 1); border not drawn as colored ring
      const acBg = w.bgColor || '#000000';
      const acScaleCol = w.scaleColor || '#FFFFFF';
      const acTextCol = w.textColor || '#FFFFFF';
      const acHourCol = w.hourPtrColor || '#ffffff';
      const acMinCol = w.minPtrColor || '#FFFFFF';
      const acSecCol = w.secPtrColor || '#FF0000';
      const acHubCol = w.hubColor || '#FF0000';
      const acBorderW = (w.borderWidth || 0) * z;
      const acScaleW = (w.scaleWidth || 1) * z;
      const acScaleLen = Math.max(w.scaleLength || 8, 4) * z;
      const acHourW = (w.hourPtrWidth || 5) * z;
      const acMinW = (w.minPtrWidth || 5) * z;
      const acSecW = (w.secPtrWidth || 2) * z;
      const acHubR = Math.max(5 * z, (w.hubRadius || 6) * z);
      const hour = w.hour || 0, minute = w.minute || 0, second = w.second || 0;

      const wPx = w.width * z;
      const hPx = w.height * z;
      const cx = wPx / 2;
      const cy = hPx / 2;
      const r = Math.max(0, Math.floor(w.width / 2 - 1) * z);
      const innerR = Math.max(0, r - acBorderW);
      const scaleOut = Math.max(0, innerR - 2 * z);
      const scaleIn = Math.max(0, scaleOut - acScaleLen);
      const hLen = innerR / 2;
      const mLen = (innerR * 160) >> 8;
      const sLen1 = (innerR * 217) >> 8;
      const sLen2 = (innerR * 39) >> 8;
      const subScaleCol = mixColors(acScaleCol, acBg, 0.5);

      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = '0';
      el.style.overflow = 'visible';

      const bgCircle = document.createElement('div');
      bgCircle.style.cssText = `position:absolute;left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${acBg};`;
      el.appendChild(bgCircle);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', wPx);
      svg.setAttribute('height', hPx);
      svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;pointer-events:none;';

      const deg2rad = d => d * Math.PI / 180;

      for (let i = 0; i < 60; i++) {
        const angle = i * 6 - 90;
        const rad = deg2rad(angle);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const xo = cx + scaleOut * cos;
        const yo = cy + scaleOut * sin;
        const xi = cx + scaleIn * cos;
        const yi = cy + scaleIn * sin;
        const isMain = (i % 5 === 0);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', xo);
        line.setAttribute('y1', yo);
        line.setAttribute('x2', xi);
        line.setAttribute('y2', yi);
        line.setAttribute('stroke', isMain ? acScaleCol : subScaleCol);
        line.setAttribute('stroke-width', isMain ? acScaleW * 2 : acScaleW);
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);

        if (isMain) {
          const text = i === 0 ? '12' : String(i / 5);
          const fontH = Math.max(8 * z, (w.fontSize || 12) * z);
          const textR = Math.max(0, scaleIn - fontH - 2 * z);
          const tx = cx + textR * cos;
          const ty = cy + textR * sin;
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', tx);
          txt.setAttribute('y', ty);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('dominant-baseline', 'central');
          txt.setAttribute('fill', acTextCol);
          txt.setAttribute('font-size', fontH);
          txt.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
          txt.textContent = text;
          svg.appendChild(txt);
        }
      }

      function drawHand(angleDeg, tailLen, tipLen, mainWidth, tailWidth, color) {
        const rad = deg2rad(angleDeg);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const sx = cx + tailLen * cos;
        const sy = cy + tailLen * sin;
        const px = cx + tipLen * cos;
        const py = cy + tipLen * sin;
        if (tailWidth > 0 && tailLen > 0) {
          const tail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          tail.setAttribute('x1', cx); tail.setAttribute('y1', cy);
          tail.setAttribute('x2', sx); tail.setAttribute('y2', sy);
          tail.setAttribute('stroke', color);
          tail.setAttribute('stroke-width', tailWidth);
          tail.setAttribute('stroke-linecap', 'round');
          svg.appendChild(tail);
        }
        const main = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        main.setAttribute('x1', sx); main.setAttribute('y1', sy);
        main.setAttribute('x2', px); main.setAttribute('y2', py);
        main.setAttribute('stroke', color);
        main.setAttribute('stroke-width', mainWidth);
        main.setAttribute('stroke-linecap', 'round');
        svg.appendChild(main);
      }

      const hAngle = ((hour % 12) * 30 + Math.floor(minute / 2)) - 90;
      const mAngle = (minute * 6) - 90;
      const sAngle = (second * 6) - 90;
      drawHand(hAngle, sLen2, hLen, acHourW, acSecW, acHourCol);
      drawHand(mAngle, sLen2, mLen, acMinW, acSecW, acMinCol);

      const sRad = deg2rad(sAngle);
      const sCos = Math.cos(sRad), sSin = Math.sin(sRad);
      const secLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      secLine.setAttribute('x1', cx - sLen2 * sCos);
      secLine.setAttribute('y1', cy - sLen2 * sSin);
      secLine.setAttribute('x2', cx + sLen1 * sCos);
      secLine.setAttribute('y2', cy + sLen1 * sSin);
      secLine.setAttribute('stroke', acSecCol);
      secLine.setAttribute('stroke-width', acSecW);
      secLine.setAttribute('stroke-linecap', 'round');
      svg.appendChild(secLine);

      if (acHubR + 1 > 0) {
        const hubMin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hubMin.setAttribute('cx', cx); hubMin.setAttribute('cy', cy); hubMin.setAttribute('r', acHubR + 1);
        hubMin.setAttribute('fill', acMinCol);
        svg.appendChild(hubMin);
      }
      if (acHubR > 0) {
        const hubMain = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hubMain.setAttribute('cx', cx); hubMain.setAttribute('cy', cy); hubMain.setAttribute('r', acHubR);
        hubMain.setAttribute('fill', acHubCol);
        svg.appendChild(hubMain);
      }
      if (acHubR - 2 > 0) {
        const hubInner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hubInner.setAttribute('cx', cx); hubInner.setAttribute('cy', cy); hubInner.setAttribute('r', acHubR - 2);
        hubInner.setAttribute('fill', acBg);
        svg.appendChild(hubInner);
      }

      el.appendChild(svg);
      break;
    }

    case 'icon':
    case 'sprite':
    case '2dball': {
      el.style.background = w.bgColor || 'transparent';
      el.style.border = `${(w.borderWidth || 0) * z}px solid ${w.borderColor || 'transparent'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const iconInner = document.createElement('div');
      iconInner.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w.width, w.height) * 0.5 * z}px;`;
      const iconMap = { 'icon': '⭐', 'sprite': '🎮', '2dball': '⚽' };
      iconInner.textContent = iconMap[w.type] || '●';
      iconInner.style.color = w.color || '#8b5cf6';
      el.appendChild(iconInner);
      break;
    }

    case 'ext_img': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const imgPlaceholder = document.createElement('div');
      imgPlaceholder.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w.width, w.height) * 0.3 * z}px;opacity:0.3;color:${w.color || '#8b5cf6'};`;
      imgPlaceholder.textContent = '🖼';
      el.appendChild(imgPlaceholder);
      break;
    }

    default: {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
      const text = document.createElement('span');
      text.textContent = w.text || typeInfo?.name || w.type;
      text.style.color = w.color || '#8b5cf6';
      text.style.fontSize = (12 * z) + 'px';
      text.style.display = 'flex';
      text.style.alignItems = 'center';
      text.style.justifyContent = 'center';
      text.style.width = '100%';
      text.style.height = '100%';
      el.appendChild(text);
    }
  }
}

function justifyContent(align) {
  if (align === 'CENTER') return 'center';
  if (align === 'RIGHT') return 'flex-end';
  return 'flex-start';
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
