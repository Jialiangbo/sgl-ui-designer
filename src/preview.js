import { AppState, navigate, initNav, escapeHtml } from './app.js';
import { SGL_WIDGET_TYPES } from './sgl_api.js';

initNav('preview');
AppState.init();

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
  frame.style.background = page.bg_color || '#1e1e2e';
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
    case 'rect':
      el.style.background = w.color || '#FFFFFF';
      el.style.border = `${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'}`;
      el.style.borderRadius = ((w.radius || 0) * z) + 'px';
      break;

    case 'circle':
      el.style.background = w.color || '#FFFFFF';
      el.style.border = `${(w.borderWidth != null ? w.borderWidth : 2) * z}px solid ${w.borderColor || '#000000'}`;
      el.style.borderRadius = '50%';
      if (w.xOffset || w.yOffset) {
        el.style.transform = `translate(${(w.xOffset || 0) * z}px, ${(w.yOffset || 0) * z}px)`;
      }
      break;

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
      el.style.background = w.fillColor || '#8b5cf6';
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
      el.style.background = w.bgColor || '#8b5cf6';
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
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 15) * z) + 'px';
      if (w.status) el.style.background = w.color || '#8b5cf6';
      const knobR = (w.knobRadius || 10) * z;
      const margin = (w.knobMargin || 2) * z;
      const trackW = w.width * z;
      const pos = w.status ? trackW - knobR - margin : margin;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;top:50%;left:${pos}px;transform:translateY(-50%);width:${knobR}px;height:${knobR}px;border-radius:50%;background:${w.knobColor || '#ffffff'};box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      el.appendChild(knob);
      break;
    }

    case 'checkbox': {
      el.style.background = 'transparent';
      const boxSize = Math.min(w.height * z, 18 * z);
      const box = document.createElement('div');
      box.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${boxSize}px;height:${boxSize}px;border:${1 * z}px solid ${w.color || '#8b5cf6'};border-radius:${(w.radius || 4) * z}px;font-size:${boxSize * 0.7}px;color:${w.color || '#8b5cf6'};margin-right:${6 * z}px;flex-shrink:0;`;
      if (w.status) box.textContent = '✓';
      const text = document.createElement('span');
      text.textContent = w.text || '';
      text.style.color = w.color || '#e4e4e7';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      const inner = document.createElement('div');
      inner.style.cssText = `display:flex;align-items:center;width:100%;height:100%;padding:0 ${4 * z}px;`;
      inner.appendChild(box);
      inner.appendChild(text);
      el.appendChild(inner);
      break;
    }

    case 'slider': {
      const isHoriz = w.direct !== 1;
      el.style.background = w.trackColor || '#313149';
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const fill = document.createElement('div');
      if (isHoriz) fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${w.value || 0}%;background:${w.fillColor || '#8b5cf6'};border-radius:${(w.radius || 4) * z}px;`;
      else fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${w.value || 0}%;background:${w.fillColor || '#8b5cf6'};border-radius:${(w.radius || 4) * z}px;`;
      el.appendChild(fill);
      const knobSize = Math.max(12, (w.thickness || 8) + 6) * z;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;${isHoriz ? 'top:50%;left:' + (w.value || 0) + '%' : 'left:50%;bottom:' + (w.value || 0) + '%'};transform:translate(-50%,-50%);width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${w.knobColor || '#ffffff'};box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
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
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${w.value || 50}%;background:${w.color || '#8b5cf6'};`;
      el.appendChild(fill);
      break;
    }

    case 'gauge': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = '50%';
      const cx = w.width / 2, cy = w.height / 2, r = Math.min(w.width, w.height) / 2 - (w.borderWidth || 2);
      const arc = document.createElement('div');
      arc.style.cssText = `position:absolute;top:${(cy - r) * z}px;left:${(cx - r) * z}px;width:${r * 2 * z}px;height:${r * 2 * z}px;border:${(w.borderWidth || 4) * z}px solid ${w.color || '#8b5cf6'};border-radius:50%;border-right-color:transparent;border-bottom-color:transparent;transform:rotate(${-45 + ((w.value || 0) / 100) * 270}deg);`;
      el.appendChild(arc);
      const valText = document.createElement('div');
      valText.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${12 * z}px;color:${w.color || '#8b5cf6'};`;
      valText.textContent = w.value || 0;
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
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      const pct = w.value || 80;
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${pct}%;background:${pct > 20 ? (w.color || '#22c55e') : '#ef4444'};border-radius:${(w.radius || 4) * z}px;`;
      el.appendChild(fill);
      const cap = document.createElement('div');
      cap.style.cssText = `position:absolute;right:${-3 * z}px;top:50%;transform:translateY(-50%);width:${3 * z}px;height:50%;background:${w.borderColor || '#3d3d5c'};border-radius:0 ${3 * z}px ${3 * z}px 0;`;
      el.appendChild(cap);
      break;
    }

    case 'dropdown': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4) * z) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.padding = '0 ' + (8 * z) + 'px';
      const text = document.createElement('span');
      text.textContent = w.text || '请选择';
      text.style.color = w.textColor || '#e4e4e7';
      text.style.fontSize = ((w.fontSize || 14) * z) + 'px';
      text.style.flex = '1';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      const arrow = document.createElement('span');
      arrow.textContent = '▼';
      arrow.style.fontSize = (8 * z) + 'px';
      arrow.style.color = w.textColor || '#a1a1aa';
      el.appendChild(text);
      el.appendChild(arrow);
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
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2) * z}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = '50%';
      const cx = w.width / 2, cy = w.height / 2, r = Math.min(w.width, w.height) / 2 - (w.borderWidth || 2);
      const acCol = w.color || '#8b5cf6';
      const hourHand = document.createElement('div');
      hourHand.style.cssText = `position:absolute;top:${cy * z}px;left:${cx * z}px;width:${2 * z}px;height:${r * 0.4 * z}px;background:${acCol};transform-origin:bottom center;transform:translateX(-50%) rotate(120deg);border-radius:1px;`;
      el.appendChild(hourHand);
      const minHand = document.createElement('div');
      minHand.style.cssText = `position:absolute;top:${cy * z}px;left:${cx * z}px;width:${1.5 * z}px;height:${r * 0.6 * z}px;background:${acCol};transform-origin:bottom center;transform:translateX(-50%) rotate(45deg);border-radius:1px;`;
      el.appendChild(minHand);
      const dot = document.createElement('div');
      dot.style.cssText = `position:absolute;top:${(cy - 2) * z}px;left:${(cx - 2) * z}px;width:${4 * z}px;height:${4 * z}px;background:${acCol};border-radius:50%;transform:translateY(-50%);`;
      el.appendChild(dot);
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
