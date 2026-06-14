import { AppState, navigate, showToast, initNav, downloadFile, escapeHtml, escapeAttr } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_CATEGORIES, PROP_META } from './sgl_api.js';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

initNav('editor');
AppState.init();

// ============ 全局状态 ============
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let dragStart = { x: 0, y: 0, wx: 0, wy: 0, ww: 0, wh: 0 };
let draggingFromPalette = null;

// 对齐辅助线状态
let snapLines = []; // { axis: 'x'|'y', value: number }
const SNAP_THRESHOLD = 3; // 画布坐标单位，接近3px以内时显示辅助线

// 复制粘贴剪贴板
let clipboardWidgets = []; // 支持多选复制

// ============ SGL 字体文件名 → 浏览器可用字体栈 映射 ============
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
  // 自定义字体可能是完整路径，提取文件名来匹配内置映射
  const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
  if (SGL_FONT_MAP[fileName]) return SGL_FONT_MAP[fileName];
  // 无法匹配的字体：使用文件名作为字体栈
  return `"${fileName}", ${SGL_FONT_MAP['default']}`;
}

// ============ DOM 引用 ============
const canvas = document.getElementById('canvas');
const canvasContainer = document.getElementById('canvas-container');
const widgetCategories = document.getElementById('widget-categories');
const pageTabs = document.getElementById('page-tabs');
const layerList = document.getElementById('layer-list');
const widgetPropContent = document.getElementById('widget-prop-content');
const logContent = document.getElementById('log-content');

// ============ 日志输出 ============
function logMessage(msg, type = 'info') {
  if (!logContent) return;
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  line.textContent = `[${time}] ${msg}`;
  logContent.appendChild(line);
  logContent.scrollTop = logContent.scrollHeight;
}
const widgetPropsPanel = document.getElementById('widget-props-panel');
const emptyProps = document.getElementById('empty-props');
const widgetTypeLabel = document.getElementById('widget-type-label');

// ============ 初始化组件库 ============
function renderPalette() {
  widgetCategories.innerHTML = '';
  WIDGET_CATEGORIES.forEach(cat => {
    const types = SGL_WIDGET_TYPES.filter(t => cat.types.includes(t.type));
    const section = document.createElement('div');
    section.className = 'widget-category';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.textContent = cat.name;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'widget-grid';

    types.forEach(item => {
      const el = document.createElement('div');
      el.className = 'widget-item';
      el.setAttribute('draggable', 'true');
      el.draggable = true;
      // 仅显示小图标，不显示名称；通过 title 属性实现鼠标悬停显示控件名
      el.innerHTML = `<div class="widget-icon">${item.icon}</div><div class="widget-type-name">${item.type}</div>`;
      el.dataset.type = item.type;
      el.title = item.type + '（双击添加到画布，或拖拽到画布）';

      // ===== 鼠标拖拽（更可靠）=====
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        draggingFromPalette = item.type;
        canvas.classList.add('drag-over');
        canvasContainer.classList.add('drag-over');

        const moveHandler = (ev) => {
          const rect = canvas.getBoundingClientRect();
          const inCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                           ev.clientY >= rect.top && ev.clientY <= rect.bottom;
          const inContainer = ev.clientX >= rect.left - 50 && ev.clientX <= rect.right + 50 &&
                             ev.clientY >= rect.top - 50 && ev.clientY <= rect.bottom + 50;
          if (inCanvas || inContainer) {
            canvas.classList.add('drag-over');
          } else {
            canvas.classList.remove('drag-over');
          }
        };

        const upHandler = (ev) => {
          document.removeEventListener('mousemove', moveHandler);
          document.removeEventListener('mouseup', upHandler);
          canvas.classList.remove('drag-over');
          canvasContainer.classList.remove('drag-over');

          const rect = canvas.getBoundingClientRect();
          const insideCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                               ev.clientY >= rect.top && ev.clientY <= rect.bottom;
          const insideContainer = ev.clientX >= rect.left - 50 && ev.clientX <= rect.right + 50 &&
                                 ev.clientY >= rect.top - 50 && ev.clientY <= rect.bottom + 50;

          if (insideCanvas || insideContainer) {
            const x = Math.max(0, (ev.clientX - rect.left) / AppState.zoom);
            const y = Math.max(0, (ev.clientY - rect.top) / AppState.zoom);
            const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === item.type);
            const [dw, dh] = typeInfo ? typeInfo.defaultSize : [80, 40];
            AppState.addWidget(item.type, x - dw / 2, y - dh / 2, dw, dh);
          }
          draggingFromPalette = null;
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
      });

      // ===== HTML5 拖拽（视觉反馈备选）=====
      el.addEventListener('dragstart', (e) => {
        draggingFromPalette = item.type;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', item.type);
      });
      el.addEventListener('dragend', () => {
        draggingFromPalette = null;
        canvas.classList.remove('drag-over');
        canvasContainer.classList.remove('drag-over');
      });

      // ===== 双击直接添加（居中）=====
      el.addEventListener('dblclick', () => {
        const page = AppState.getCurrentPage();
        if (!page) return;
        const [dw, dh] = item.defaultSize;
        const x = Math.max(0, (page.width - dw) / 2);
        const y = Math.max(0, (page.height - dh) / 2);
        AppState.addWidget(item.type, x, y, dw, dh);
        showToast('已添加：' + item.name);
      });
      grid.appendChild(el);
    });

    section.appendChild(grid);
    widgetCategories.appendChild(section);
  });
}

// ============ 渲染页面 Tabs ============
function renderPageTabs() {
  pageTabs.innerHTML = '';
  AppState.project.pages.forEach(page => {
    const tab = document.createElement('div');
    tab.className = 'page-tab' + (page.id === AppState.currentPageId ? ' active' : '');
    tab.innerHTML = `<span>${escapeHtml(page.name)}</span><span class="page-tab-close" title="删除页面">×</span>`;
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('page-tab-close')) {
        if (AppState.project.pages.length <= 1) { showToast('至少保留一个页面', 'error'); return; }
        if (confirm(`删除页面 "${page.name}" ?`)) AppState.removePage(page.id);
      } else {
        AppState.setCurrentPage(page.id);
      }
    });
    pageTabs.appendChild(tab);
  });
}

// ============ 画布平移状态 ============
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

function centerCanvas() {
  const viewport = document.getElementById('canvas-viewport');
  const page = AppState.getCurrentPage();
  if (!viewport || !page) return;
  const z = AppState.zoom;
  const cw = page.width * z;
  const ch = page.height * z;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  panOffset.x = Math.max(40, (vw - cw) / 2);
  panOffset.y = Math.max(40, (vh - ch) / 2);
}

// ============ 渲染画布 (WYSIWYG) ============
function renderCanvas() {
  const page = AppState.getCurrentPage();
  if (!page) return;

  const z = AppState.zoom;
  const cw = page.width * z;
  const ch = page.height * z;

  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.style.background = page.bg_color || '#1e1e2e';

  // 画布定位（居中 + 平移偏移）
  const viewport = document.getElementById('canvas-viewport');
  if (viewport) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    canvas.style.position = 'absolute';
    canvas.style.left = panOffset.x + 'px';
    canvas.style.top = panOffset.y + 'px';
  }

  canvas.querySelectorAll('.canvas-widget').forEach(el => el.remove());
  const hint = document.getElementById('canvas-hint');
  if (hint) hint.style.display = page.widgets.length === 0 ? 'flex' : 'none';

  page.widgets.forEach(w => drawWidget(w));

  // 绘制对齐辅助线
  renderSnapLines();

  // 绘制标尺
  renderRulers(page.width, page.height);
}

// ============ 对齐辅助线绘制 ============
function renderSnapLines() {
  canvas.querySelectorAll('.snap-line').forEach(el => el.remove());

  if (snapLines.length === 0) return;

  const z = AppState.zoom;
  const page = AppState.getCurrentPage();
  if (!page) return;

  snapLines.forEach(line => {
    const el = document.createElement('div');
    el.className = 'snap-line';
    if (line.axis === 'x') {
      // 垂直虚线（x坐标对齐）
      el.style.cssText = `position:absolute;left:${line.value * z}px;top:0;width:0;height:${page.height * z}px;border-left:1px dashed #00e5ff;pointer-events:none;z-index:9999;opacity:0.8;`;
    } else {
      // 水平虚线（y坐标对齐）
      el.style.cssText = `position:absolute;top:${line.value * z}px;left:0;height:0;width:${page.width * z}px;border-top:1px dashed #00e5ff;pointer-events:none;z-index:9999;opacity:0.8;`;
    }
    canvas.appendChild(el);
  });
}

// 计算控件间对齐辅助线及吸附偏移
function computeSnap(dragWidget, newX, newY) {
  const page = AppState.getCurrentPage();
  if (!page) return { lines: [], snapX: 0, snapY: 0 };

  const lines = [];
  const added = new Set();
  let snapX = 0, snapY = 0;
  let bestDx = SNAP_THRESHOLD, bestDy = SNAP_THRESHOLD;

  function addLine(axis, value) {
    const key = axis + ':' + Math.round(value * 100);
    if (!added.has(key)) {
      added.add(key);
      lines.push({ axis, value });
    }
  }

  // 当前拖动控件的关键点：[左, 右, 中心]
  const dragEdges = {
    x: [newX, newX + dragWidget.width, newX + dragWidget.width / 2],
    y: [newY, newY + dragWidget.height, newY + dragWidget.height / 2]
  };

  // 遍历其他控件
  page.widgets.forEach(w => {
    if (w.id === dragWidget.id) return;

    const otherEdges = {
      x: [w.x, w.x + w.width, w.x + w.width / 2],
      y: [w.y, w.y + w.height, w.y + w.height / 2]
    };

    // 检查 x 轴对齐
    dragEdges.x.forEach(dv => {
      otherEdges.x.forEach(ov => {
        const diff = Math.abs(dv - ov);
        if (diff < SNAP_THRESHOLD) {
          addLine('x', ov);
          // 找最小偏移用于吸附（优先吸附最近的）
          if (diff < bestDx) {
            bestDx = diff;
            snapX = ov - dv; // 需要修正的偏移量
          }
        }
      });
    });

    // 检查 y 轴对齐
    dragEdges.y.forEach(dv => {
      otherEdges.y.forEach(ov => {
        const diff = Math.abs(dv - ov);
        if (diff < SNAP_THRESHOLD) {
          addLine('y', ov);
          if (diff < bestDy) {
            bestDy = diff;
            snapY = ov - dv;
          }
        }
      });
    });
  });

  return { lines, snapX, snapY };
}

// ============ 标尺绘制 ============
function renderRulers(pageW, pageH) {
  const z = AppState.zoom;
  const rulerH = document.getElementById('ruler-h');
  const rulerV = document.getElementById('ruler-v');
  if (!rulerH || !rulerV) return;

  const canvasW = pageW * z;
  const canvasH = pageH * z;
  const RULER_SIZE = 20;

  // 画布在视口中的偏移
  const ox = panOffset.x;
  const oy = panOffset.y;

  // 水平标尺 - 宽度填满视口
  const viewport = document.getElementById('canvas-viewport');
  const vpW = viewport ? viewport.clientWidth : canvasW;
  const vpH = viewport ? viewport.clientHeight : canvasH;

  rulerH.width = vpW;
  rulerH.height = RULER_SIZE;
  rulerH.style.width = vpW + 'px';
  rulerH.style.height = RULER_SIZE + 'px';

  const ctxH = rulerH.getContext('2d');
  ctxH.clearRect(0, 0, vpW, RULER_SIZE);
  ctxH.fillStyle = '#1e1e2e';
  ctxH.fillRect(0, 0, vpW, RULER_SIZE);
  ctxH.strokeStyle = '#4b4b6b';
  ctxH.fillStyle = '#8888aa';
  ctxH.font = '9px sans-serif';
  ctxH.textAlign = 'center';

  const step = getRulerStep(z);
  const smallStep = step / 5;

  // 计算可见范围对应的画布坐标
  const startX = Math.max(0, -ox / z);
  const endX = Math.min(pageW, (vpW - ox) / z);
  // 对齐到小刻度
  const firstTick = Math.floor(startX / smallStep) * smallStep;

  for (let x = firstTick; x <= endX; x += smallStep) {
    const px = ox + x * z; // 屏幕像素位置
    if (px < 0 || px > vpW) continue;
    const isMajor = Math.abs(x % step) < 0.01 || Math.abs(x % step - step) < 0.01;
    if (isMajor) {
      ctxH.beginPath();
      ctxH.moveTo(px, RULER_SIZE);
      ctxH.lineTo(px, RULER_SIZE - 8);
      ctxH.stroke();
      ctxH.fillText(Math.round(x), px, 9);
    } else {
      ctxH.beginPath();
      ctxH.moveTo(px, RULER_SIZE);
      ctxH.lineTo(px, RULER_SIZE - 4);
      ctxH.stroke();
    }
  }

  // 垂直标尺
  rulerV.width = RULER_SIZE;
  rulerV.height = vpH;
  rulerV.style.width = RULER_SIZE + 'px';
  rulerV.style.height = vpH + 'px';

  const ctxV = rulerV.getContext('2d');
  ctxV.clearRect(0, 0, RULER_SIZE, vpH);
  ctxV.fillStyle = '#1e1e2e';
  ctxV.fillRect(0, 0, RULER_SIZE, vpH);
  ctxV.strokeStyle = '#4b4b6b';
  ctxV.fillStyle = '#8888aa';
  ctxV.font = '9px sans-serif';

  const startY = Math.max(0, -oy / z);
  const endY = Math.min(pageH, (vpH - oy) / z);
  const firstTickY = Math.floor(startY / smallStep) * smallStep;

  for (let y = firstTickY; y <= endY; y += smallStep) {
    const py = oy + y * z;
    if (py < 0 || py > vpH) continue;
    const isMajor = Math.abs(y % step) < 0.01 || Math.abs(y % step - step) < 0.01;
    if (isMajor) {
      ctxV.beginPath();
      ctxV.moveTo(RULER_SIZE, py);
      ctxV.lineTo(RULER_SIZE - 8, py);
      ctxV.stroke();
      ctxV.save();
      ctxV.translate(8, py);
      ctxV.rotate(-Math.PI / 2);
      ctxV.textAlign = 'center';
      ctxV.fillText(Math.round(y), 0, 0);
      ctxV.restore();
    } else {
      ctxV.beginPath();
      ctxV.moveTo(RULER_SIZE, py);
      ctxV.lineTo(RULER_SIZE - 4, py);
      ctxV.stroke();
    }
  }
}

function getRulerStep(zoom) {
  // 根据缩放级别选择合适的刻度间隔（像素单位）
  const pixelStep = 50 * zoom; // 期望屏幕上约50px一个主刻度
  if (pixelStep >= 100) return 10;
  if (pixelStep >= 50) return 20;
  if (pixelStep >= 25) return 50;
  if (pixelStep >= 12) return 100;
  return 200;
}

function drawWidget(w) {
  const el = document.createElement('div');
  el.className = 'canvas-widget';
  el.dataset.id = w.id;
  el.style.left = (w.x * AppState.zoom) + 'px';
  el.style.top = (w.y * AppState.zoom) + 'px';
  el.style.width = (w.width * AppState.zoom) + 'px';
  el.style.height = (w.height * AppState.zoom) + 'px';
  el.style.boxSizing = 'border-box';
  el.style.position = 'absolute';
  el.style.cursor = 'move';
  el.style.overflow = 'hidden';
  el.style.transition = 'border-color 0.1s';

  // 选中状态
  const isLocked = w.locked;
  if (AppState.selectedWidgetIds.has(w.id)) {
    el.classList.add('selected');
  }
  if (isLocked) {
    el.classList.add('locked-widget');
    // 锁定图标覆盖
    const lockIcon = document.createElement('div');
    lockIcon.style.cssText = 'position:absolute;top:4px;right:4px;width:16px;height:16px;background:rgba(0,0,0,0.5);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;pointer-events:none;z-index:10;';
    lockIcon.textContent = '🔒';
    el.appendChild(lockIcon);
  }

  // WYSIWYG 渲染
  renderWidgetVisual(el, w);

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    const isMultiSelect = e.ctrlKey || e.metaKey;
    const isAlreadySelected = AppState.selectedWidgetIds.has(w.id);

    if (isMultiSelect) {
      // Ctrl+Click: 切换选中状态
      AppState.selectWidget(w.id, true);
    } else if (!isAlreadySelected) {
      // 普通点击未选中的控件：单选
      AppState.selectWidget(w.id, false);
    }
    // 普通点击已选中的控件：不改变选择，允许拖动

    // 锁定控件不允许拖拽
    if (w.locked) return;
    isDragging = true;
    AppState.beginBatch(); // 拖动开始前保存快照
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    // 记录所有选中控件的起始位置
    dragStart.widgetPositions = [];
    AppState.selectedWidgetIds.forEach(id => {
      const ww = AppState.getWidget(id);
      if (ww && !ww.locked) {
        dragStart.widgetPositions.push({ id, x: ww.x, y: ww.y });
      }
    });
  });

  canvas.appendChild(el);
}

function renderWidgetVisual(el, w) {
  // 安全回退：只有 null/undefined 时才用默认值，保留用户设置的 0/''/false
  const p = (key, fb) => {
    const v = w[key];
    return (v === null || v === undefined) ? fb : v;
  };
  const alpha = p('alpha', 255);
  const alphaCss = alpha < 255 ? (alpha / 255) : 1;
  const z = AppState.zoom;

  // 清空内容
  el.innerHTML = '';

  switch (w.type) {
    case 'rect': {
      el.style.background = p('bgColor', 'transparent');
      el.style.border = `${p('borderWidth', 0) * z}px solid ${p('borderColor', 'transparent')}`;
      el.style.borderRadius = (p('radius', 0) * z) + 'px';
      el.style.opacity = alphaCss;
      const rectCol = p('color', '#8b5cf6');
      if (rectCol && rectCol !== 'transparent') {
        const inner = document.createElement('div');
        inner.style.cssText = 'position:absolute;inset:0;opacity:0.3;background:' + rectCol + ';border-radius:' + (p('radius', 0) * z) + 'px;';
        el.appendChild(inner);
      }
      break;
    }

    case 'circle': {
      const r = Math.min(w.width, w.height) / 2;
      const circleCol = p('color', '#8b5cf6');
      el.style.background = circleCol;
      el.style.border = `${p('borderWidth', 0) * z}px solid ${p('borderColor', 'transparent')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      const xOff = p('xOffset', 0) * z;
      const yOff = p('yOffset', 0) * z;
      if (xOff || yOff) {
        el.style.transform = `translate(${xOff}px, ${yOff}px)`;
      }
      if (circleCol && circleCol !== 'transparent') {
        const inner = document.createElement('div');
        inner.style.cssText = 'position:absolute;inset:0;opacity:0.3;border-radius:50%;background:' + circleCol + ';';
        el.appendChild(inner);
      }
      break;
    }

    case 'line': {
      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = '0';
      el.style.opacity = alphaCss;
      const lineEl = document.createElement('div');
      const lineH = Math.max(2, p('borderWidth', 2)) * z;
      const lineCol = p('color', '#8b5cf6');
      lineEl.style.cssText = `position:absolute;left:0;top:50%;transform:translateY(-50%);width:100%;height:${lineH}px;background:${lineCol};border-radius:${lineH / 2}px;`;
      if (p('dashed', false)) {
        const dLen = p('dashLen', 10);
        const gLen = p('gapLen', 5);
        lineEl.style.background = `repeating-linear-gradient(90deg, ${lineCol} 0, ${lineCol} ${dLen * z}px, transparent ${dLen * z}px, transparent ${(dLen + gLen) * z}px)`;
      }
      el.appendChild(lineEl);
      break;
    }

    case 'ring': {
      el.style.background = 'transparent';
      el.style.border = `${p('borderWidth', 4) * z}px solid ${p('color', '#8b5cf6')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      el.style.boxShadow = 'inset 0 0 ' + ((Math.min(w.width, w.height) / 2 - p('borderWidth', 4)) * z) + 'px rgba(0,0,0,0.9)';
      break;
    }

    case 'arc': {
      el.style.background = 'transparent';
      el.style.border = `${p('borderWidth', 4) * z}px solid ${p('color', '#8b5cf6')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      el.style.clipPath = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
      break;
    }

    case 'polygon': {
      el.style.background = p('color', '#8b5cf6');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', 'transparent')}`;
      el.style.opacity = alphaCss;
      el.style.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
      break;
    }

    case 'button': {
      el.style.background = p('bgColor', '#8b5cf6');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#7c3aed')}`;
      el.style.borderRadius = (p('radius', 8) * z) + 'px';
      el.style.opacity = alphaCss;
      const btnInner = document.createElement('div');
      btnInner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:4px 8px;pointer-events:none;';
      btnInner.style.justifyContent = justifyContent(p('align', 'CENTER'));
      const textSpan = document.createElement('span');
      textSpan.textContent = p('text', '按钮');
      textSpan.style.color = p('textColor', '#ffffff');
      textSpan.style.fontSize = (p('fontSize', 14) * z) + 'px';
      textSpan.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      textSpan.style.textAlign = (p('align', 'CENTER')).toLowerCase();
      textSpan.style.overflow = 'hidden';
      textSpan.style.textOverflow = 'ellipsis';
      textSpan.style.whiteSpace = 'nowrap';
      btnInner.appendChild(textSpan);
      el.appendChild(btnInner);
      break;
    }

    case 'label': {
      const labelBg = p('bgColor', 'transparent');
      el.style.background = labelBg !== 'transparent' ? labelBg : 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = (p('radius', 0) * z) + 'px';
      el.style.opacity = alphaCss;
      const labelInner = document.createElement('div');
      labelInner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;padding:2px 4px;pointer-events:none;';
      labelInner.style.justifyContent = justifyContent(p('align', 'CENTER'));
      const lblSpan = document.createElement('span');
      lblSpan.textContent = p('text', '标签文本');
      lblSpan.style.color = p('textColor', p('color', '#e4e4e7'));
      lblSpan.style.fontSize = (p('fontSize', 14) * z) + 'px';
      lblSpan.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      lblSpan.style.overflow = 'hidden';
      lblSpan.style.textOverflow = 'ellipsis';
      lblSpan.style.whiteSpace = 'nowrap';
      const lblRot = p('textRotation', 0);
      if (lblRot) lblSpan.style.transform = `rotate(${lblRot}deg)`;
      labelInner.appendChild(lblSpan);
      el.appendChild(labelInner);
      break;
    }

    case 'textbox': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 6) * z) + 'px';
      el.style.opacity = alphaCss;
      const tbInner = document.createElement('div');
      tbInner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;padding:0 8px;pointer-events:none;';
      const tbSpan = document.createElement('span');
      tbSpan.textContent = p('text', '');
      tbSpan.style.color = p('textColor', '#e4e4e7');
      tbSpan.style.fontSize = (p('fontSize', 14) * z) + 'px';
      tbSpan.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      tbSpan.style.opacity = 0.7;
      tbInner.appendChild(tbSpan);
      el.appendChild(tbInner);
      // 光标闪烁
      const cursor = document.createElement('div');
      cursor.style.cssText = 'position:absolute;left:' + (8 * z) + 'px;top:50%;transform:translateY(-50%);width:' + (2 * z) + 'px;height:' + (12 * z) + 'px;background:' + p('textColor', '#e4e4e7') + ';animation:blink 1s step-end infinite;';
      el.appendChild(cursor);
      break;
    }

    case 'switch': {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 15) * z) + 'px';
      el.style.opacity = alphaCss;
      const knobR = p('knobRadius', 10) * z;
      const margin = p('knobMargin', 2) * z;
      const trackW = w.width * z;
      const swOn = p('status', false);
      const pos = swOn ? trackW - knobR - margin : margin;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;top:50%;left:${pos}px;transform:translateY(-50%);width:${knobR}px;height:${knobR}px;border-radius:50%;background:${p('knobColor', '#ffffff')};box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      el.appendChild(knob);
      if (swOn) {
        el.style.background = p('color', '#8b5cf6');
      }
      break;
    }

    case 'checkbox': {
      el.style.background = p('bgColor', 'transparent');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', 'transparent')}`;
      el.style.borderRadius = (p('radius', 0) * z) + 'px';
      el.style.opacity = alphaCss;
      const cbInner = document.createElement('div');
      cbInner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;padding:0 4px;gap:' + (6 * z) + 'px;pointer-events:none;';
      const box = document.createElement('div');
      const boxSize = Math.min(w.height * z, 18 * z);
      const cbCol = p('color', '#8b5cf6');
      box.style.cssText = `flex-shrink:0;width:${boxSize}px;height:${boxSize}px;border:${p('borderWidth', 1) * z}px solid ${cbCol};border-radius:${p('radius', 4) * z}px;display:flex;align-items:center;justify-content:center;font-size:${boxSize * 0.7}px;`;
      if (p('status', false)) box.textContent = '✓';
      box.style.color = cbCol;
      const cbText = document.createElement('span');
      cbText.textContent = p('text', '');
      cbText.style.color = p('textColor', cbCol);
      cbText.style.fontSize = (p('fontSize', 14) * z) + 'px';
      cbText.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      cbText.style.overflow = 'hidden';
      cbText.style.textOverflow = 'ellipsis';
      cbText.style.whiteSpace = 'nowrap';
      cbInner.appendChild(box);
      cbInner.appendChild(cbText);
      el.appendChild(cbInner);
      break;
    }

    case 'slider': {
      const isHoriz = p('direct', 0) !== 1;
      el.style.background = p('trackColor', '#313149');
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const slValue = p('value', 50);
      const fill = document.createElement('div');
      if (isHoriz) {
        fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${slValue}%;background:${p('fillColor', '#8b5cf6')};border-radius:${p('radius', 4) * z}px;`;
      } else {
        fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${slValue}%;background:${p('fillColor', '#8b5cf6')};border-radius:${p('radius', 4) * z}px;`;
      }
      el.appendChild(fill);
      const knobSize = Math.max(12, p('thickness', 8) + 6) * z;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;${isHoriz ? 'top:50%;left:' + slValue + '%' : 'left:50%;bottom:' + slValue + '%'};transform:translate(-50%,-50%);width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${p('knobColor', '#ffffff')};box-shadow:0 1px 4px rgba(0,0,0,0.4);border:${z}px solid rgba(0,0,0,0.1);`;
      el.appendChild(knob);
      break;
    }

    case 'progress': {
      el.style.background = p('trackColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const prValue = p('value', 0);
      const prFillCol = p('fillColor', '#22c55e');
      const prGap = p('fillGap', 2);
      const prFillRadius = p('fillRadius', 2);
      const prFillWidth = p('fillWidth', 0);
      const fill = document.createElement('div');
      if (prFillWidth > 0) {
        fill.style.cssText = `position:absolute;left:${prGap * z}px;top:50%;transform:translateY(-50%);height:${prFillWidth * z}px;width:${Math.max(0, prValue - 1)}%;background:${prFillCol};border-radius:${prFillRadius * z}px;`;
      } else {
        fill.style.cssText = `position:absolute;left:${prGap * z}px;top:${prGap * z}px;height:calc(100% - ${2 * prGap * z}px);width:${Math.max(0, prValue - 1)}%;background:${prFillCol};border-radius:${prFillRadius * z}px;`;
      }
      el.appendChild(fill);
      break;
    }

    case 'bar': {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 2) * z) + 'px';
      el.style.opacity = alphaCss;
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${p('value', 50)}%;background:${p('color', '#8b5cf6')};`;
      el.appendChild(fill);
      break;
    }

    case 'gauge': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      const centerX = w.width / 2;
      const centerY = w.height / 2;
      const radius = Math.min(w.width, w.height) / 2 - p('borderWidth', 2);
      const gValue = p('value', 50);
      const percent = gValue / 100;
      const gCol = p('color', '#8b5cf6');
      const arc = document.createElement('div');
      arc.style.cssText = `position:absolute;top:${(centerY - radius) * z}px;left:${(centerX - radius) * z}px;width:${radius * 2 * z}px;height:${radius * 2 * z}px;border:${p('borderWidth', 4) * z}px solid ${gCol};border-radius:50%;border-right-color:transparent;border-bottom-color:transparent;transform:rotate(${-45 + percent * 270}deg);`;
      el.appendChild(arc);
      // 中心值
      const valText = document.createElement('div');
      valText.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${12 * z}px;color:${gCol};pointer-events:none;`;
      valText.textContent = gValue;
      el.appendChild(valText);
      break;
    }

    case 'led': {
      const isOn = p('status', false);
      const ledCol = p('color', '#22c55e');
      el.style.background = isOn ? ledCol : p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      if (isOn) {
        el.style.boxShadow = `0 0 ${6 * z}px ${ledCol}`;
      }
      break;
    }

    case 'battery': {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const bValue = p('value', 80);
      const bCol = p('color', '#22c55e');
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${bValue}%;background:${bValue > 20 ? bCol : '#ef4444'};border-radius:${p('radius', 4) * z}px;`;
      el.appendChild(fill);
      // 电池帽
      const cap = document.createElement('div');
      cap.style.cssText = `position:absolute;right:${-3 * z}px;top:50%;transform:translateY(-50%);width:${3 * z}px;height:${50 * z}%;background:${p('borderColor', '#3d3d5c')};border-radius:0 ${p('radius', 4) * z}px ${p('radius', 4) * z}px 0;`;
      el.appendChild(cap);
      break;
    }

    case 'msgbox':
    case 'win': {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#8b5cf6')}`;
      el.style.borderRadius = (p('radius', 8) * z) + 'px';
      el.style.opacity = alphaCss;
      const titleBar = document.createElement('div');
      titleBar.style.cssText = `height:${Math.max(24, (p('fontSize', 14)) * 2) * z}px;background:${p('color', '#8b5cf6')};display:flex;align-items:center;padding:0 ${6 * z}px;border-radius:${p('radius', 8) * z}px ${p('radius', 8) * z}px 0 0;`;
      const titleText = document.createElement('span');
      titleText.textContent = p('text', w.type === 'msgbox' ? '提示' : '窗口');
      titleText.style.color = p('textColor', '#ffffff');
      titleText.style.fontSize = (p('fontSize', 14) * z) + 'px';
      titleText.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      titleText.style.overflow = 'hidden';
      titleText.style.textOverflow = 'ellipsis';
      titleText.style.whiteSpace = 'nowrap';
      titleBar.appendChild(titleText);
      el.appendChild(titleBar);
      break;
    }

    case 'dropdown': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const ddInner = document.createElement('div');
      ddInner.style.cssText = `width:100%;height:100%;display:flex;align-items:center;padding:0 ${8 * z}px;gap:${8 * z}px;`;
      const ddText = document.createElement('span');
      ddText.textContent = p('text', '请选择');
      ddText.style.color = p('textColor', '#e4e4e7');
      ddText.style.fontSize = (p('fontSize', 14) * z) + 'px';
      ddText.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      ddText.style.flex = '1';
      ddText.style.overflow = 'hidden';
      ddText.style.textOverflow = 'ellipsis';
      ddText.style.whiteSpace = 'nowrap';
      const ddArrow = document.createElement('span');
      ddArrow.textContent = '▼';
      ddArrow.style.fontSize = (8 * z) + 'px';
      ddArrow.style.color = p('color', '#8b5cf6');
      ddInner.appendChild(ddText);
      ddInner.appendChild(ddArrow);
      el.appendChild(ddInner);
      break;
    }

    case 'textlist':
    case 'viewlist': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const tlCol = p('color', '#8b5cf6');
      const itemCount = Math.floor(w.height / (Math.max(20, p('fontSize', 12) + p('lineMargin', 4) * 2)));
      for (let i = 0; i < Math.min(itemCount, 4); i++) {
        const item = document.createElement('div');
        item.style.cssText = `height:${(p('fontSize', 12) + p('lineMargin', 4) * 2) * z}px;background:${i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'};margin:0 ${p('borderWidth', 1) * z}px;border-bottom:1px solid rgba(255,255,255,0.05);`;
        const itemText = document.createElement('span');
        itemText.style.cssText = `padding:${p('lineMargin', 4) * z}px;font-size:${p('fontSize', 12) * z}px;color:${tlCol};opacity:${0.85 - i * 0.05};font-family:${getCssFontStack(p('fontFamily', 'simhei.ttf'))};`;
        itemText.textContent = `列表项 ${i + 1}`;
        item.appendChild(itemText);
        el.appendChild(item);
      }
      break;
    }

    case 'scroll': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const scCol = p('color', '#8b5cf6');
      const sb = document.createElement('div');
      sb.style.cssText = `position:absolute;right:${2 * z}px;top:${4 * z}px;width:${4 * z}px;bottom:${4 * z}px;background:rgba(255,255,255,0.1);border-radius:${2 * z}px;`;
      const thumb = document.createElement('div');
      thumb.style.cssText = `position:absolute;left:0;top:20%;width:100%;height:40%;background:${scCol};opacity:0.6;border-radius:inherit;`;
      sb.appendChild(thumb);
      el.appendChild(sb);
      break;
    }

    case 'box': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#8b5cf6')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const bxCol = p('color', '#8b5cf6');
      const innerBorder = document.createElement('div');
      innerBorder.style.cssText = `position:absolute;inset:${(p('borderWidth', 2) + 4) * z}px;border:1px solid ${bxCol};opacity:0.2;border-radius:${Math.max(0, (p('radius', 4) - 4) * z)}px;pointer-events:none;`;
      el.appendChild(innerBorder);
      break;
    }

    case 'numberkbd': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#8b5cf6')}`;
      el.style.borderRadius = (p('radius', 8) * z) + 'px';
      el.style.opacity = alphaCss;
      const cols = 3, rows = 4;
      const btnW = (w.width * z - (cols + 1) * 4 * z) / cols;
      const btnH = (w.height * z - (rows + 1) * 4 * z) / rows;
      const nkCol = p('color', '#313149');
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const num = r * cols + c + 1;
          const btn = document.createElement('div');
          btn.style.cssText = `position:absolute;left:${4 * z + c * (btnW + 4 * z)}px;top:${4 * z + r * (btnH + 4 * z)}px;width:${btnW}px;height:${btnH}px;background:${num === 12 ? '#ef4444' : (num === 11 ? '#22c55e' : nkCol)};border-radius:${p('radius', 8) * z}px;display:flex;align-items:center;justify-content:center;font-size:${p('fontSize', 16) * z}px;font-family:${getCssFontStack(p('fontFamily', 'simhei.ttf'))};color:#fff;`;
          btn.textContent = num <= 9 ? num : (num === 10 ? '取消' : num === 11 ? '0' : '确认');
          el.appendChild(btn);
        }
      }
      break;
    }

    case 'keyboard': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#8b5cf6')}`;
      el.style.borderRadius = (p('radius', 6) * z) + 'px';
      el.style.opacity = alphaCss;
      const keys = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM⌫'];
      const keySize = (w.width * z) / 11;
      const rowGap = 3 * z;
      keys.forEach((row, ri) => {
        for (let ci = 0; ci < row.length; ci++) {
          const key = document.createElement('div');
          const offset = ri === 1 ? keySize / 2 : 0;
          key.style.cssText = `position:absolute;left:${ci * (keySize + 2 * z) + offset}px;top:${ri * (keySize * 0.6 + rowGap) + 4 * z}px;width:${keySize}px;height:${keySize * 0.6}px;background:${p('color', '#313149')};border-radius:${2 * z}px;display:flex;align-items:center;justify-content:center;font-size:${keySize * 0.4}px;font-family:${getCssFontStack(p('fontFamily', 'simhei.ttf'))};color:#fff;`;
          key.textContent = row[ci];
          el.appendChild(key);
        }
      });
      break;
    }

    case 'textline': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const tl = document.createElement('div');
      tl.style.cssText = `width:100%;height:100%;display:flex;align-items:center;padding:0 ${8 * z}px;`;
      const tlText = document.createElement('span');
      tlText.textContent = p('text', '');
      tlText.style.color = p('color', '#e4e4e7');
      tlText.style.fontSize = (p('fontSize', 14) * z) + 'px';
      tlText.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
      tlText.style.overflow = 'hidden';
      tlText.style.textOverflow = 'ellipsis';
      tl.appendChild(tlText);
      el.appendChild(tl);
      break;
    }

    case 'scope': {
      el.style.background = p('bgColor', '#0f1a0f');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      for (let i = 1; i < 4; i++) {
        const hLine = document.createElement('div');
        hLine.style.cssText = `position:absolute;left:0;right:0;top:${i * 25}%;height:1px;background:rgba(34,197,94,0.2);`;
        el.appendChild(hLine);
      }
      const wave = document.createElement('div');
      wave.style.cssText = `position:absolute;left:0;right:0;top:0;bottom:0;border-bottom:${2 * z}px solid ${p('color', '#22c55e')};border-left:${2 * z}px solid transparent;`;
      el.appendChild(wave);
      break;
    }

    case 'spectrum': {
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const bars = 12;
      const spCol = p('color', '#8b5cf6');
      for (let i = 0; i < bars; i++) {
        const bar = document.createElement('div');
        const h = (0.3 + (i % 5) * 0.15) * (w.height * z);
        bar.style.cssText = `position:absolute;bottom:0;left:${i * (w.width * z / bars)}px;width:${(w.width * z / bars) - 2 * z}px;height:${h}px;background:${spCol};opacity:${0.6 + i * 0.03};border-radius:1px 1px 0 0;`;
        el.appendChild(bar);
      }
      break;
    }

    case 'qrcode': {
      el.style.background = p('bgColor', '#ffffff');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#000000')}`;
      el.style.opacity = alphaCss;
      const grid = 7;
      const qrCol = p('color', '#000000');
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
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const pts = [[0.2, 0.8], [0.4, 0.3], [0.6, 0.6], [0.8, 0.2], [1.0, 0.5]];
      const poly = document.createElement('div');
      const wpx = w.width * z, hpx = w.height * z;
      const chartCol = p('color', '#8b5cf6');
      poly.style.cssText = 'position:absolute;inset:0;clip-path:polygon(0 0, 0 100%, 100% 100%, 100% 0);-webkit-clip-path:polygon(0 0, 0 100%, 100% 100%, 100% 0);';
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
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const cvCol = p('color', '#8b5cf6');
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
      el.style.background = p('bgColor', '#1e1e2e');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = '50%';
      el.style.opacity = alphaCss;
      const cx = w.width / 2, cy = w.height / 2, r = Math.min(w.width, w.height) / 2 - p('borderWidth', 2);
      const acCol = p('color', '#8b5cf6');
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
      el.style.background = p('bgColor', 'transparent');
      el.style.border = `${p('borderWidth', 0) * z}px solid ${p('borderColor', 'transparent')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const iconInner = document.createElement('div');
      iconInner.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w.width, w.height) * 0.5 * z}px;`;
      const iconMap = { 'icon': '⭐', 'sprite': '🎮', '2dball': '⚽' };
      iconInner.textContent = iconMap[w.type] || '●';
      iconInner.style.color = p('color', '#8b5cf6');
      el.appendChild(iconInner);
      break;
    }

    case 'ext_img': {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#3d3d5c')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const imgPlaceholder = document.createElement('div');
      imgPlaceholder.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.min(w.width, w.height) * 0.3 * z}px;opacity:0.3;color:${p('color', '#8b5cf6')};`;
      imgPlaceholder.textContent = '🖼';
      el.appendChild(imgPlaceholder);
      break;
    }

    default: {
      el.style.background = p('bgColor', '#313149');
      el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#8b5cf6')}`;
      el.style.borderRadius = (p('radius', 4) * z) + 'px';
      el.style.opacity = alphaCss;
      const def = document.createElement('div');
      def.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${12 * z}px;color:${p('color', '#8b5cf6')};opacity:0.7;`;
      def.textContent = w.type;
      el.appendChild(def);
    }
  }

  // 选中状态覆盖（仅虚线边框，已在 drawWidget 中通过 CSS class 添加）
}

function justifyContent(align) {
  if (align === 'CENTER') return 'center';
  if (align === 'RIGHT') return 'flex-end';
  return 'flex-start';
}

function addResizeHandles(widgetEl) {
  const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
  positions.forEach(pos => {
    const handle = document.createElement('div');
    handle.className = 'resize-handle ' + pos;
    handle.dataset.pos = pos;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      AppState.beginBatch(); // 调整大小开始前保存快照
      resizeHandle = pos;
      const w = AppState.getWidget(AppState.selectedWidgetId);
      if (!w) return;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      dragStart.wx = w.x;
      dragStart.wy = w.y;
      dragStart.ww = w.width;
      dragStart.wh = w.height;
    });
    widgetEl.appendChild(handle);
  });
}

// ============ 鼠标事件 ============
document.addEventListener('mousemove', (e) => {
  if (isDragging && AppState.selectedWidgetIds.size > 0) {
    const dx = (e.clientX - dragStart.x) / AppState.zoom;
    const dy = (e.clientY - dragStart.y) / AppState.zoom;

    // 多选拖动：移动所有选中控件
    if (dragStart.widgetPositions && dragStart.widgetPositions.length > 0) {
      // 用第一个未锁定控件计算吸附
      const firstPos = dragStart.widgetPositions.find(p => {
        const ww = AppState.getWidget(p.id);
        return ww && !ww.locked;
      });

      if (firstPos) {
        const w = AppState.getWidget(firstPos.id);
        const newX = firstPos.x + dx;
        const newY = firstPos.y + dy;
        const snap = computeSnap(w, newX, newY);
        snapLines = snap.lines;
        const sdx = dx + snap.snapX;
        const sdy = dy + snap.snapY;

        dragStart.widgetPositions.forEach(pos => {
          const ww = AppState.getWidget(pos.id);
          if (ww && !ww.locked) {
            AppState.moveWidget(pos.id, pos.x + sdx, pos.y + sdy);
          }
        });
      }
    }
  } else if (isResizing && AppState.selectedWidgetId && resizeHandle) {
    const w = AppState.getWidget(AppState.selectedWidgetId);
    if (!w || w.locked) return;
    const dx = (e.clientX - dragStart.x) / AppState.zoom;
    const dy = (e.clientY - dragStart.y) / AppState.zoom;
    let nx = dragStart.wx, ny = dragStart.wy, nw = dragStart.ww, nh = dragStart.wh;
    if (resizeHandle.includes('e')) nw = dragStart.ww + dx;
    if (resizeHandle.includes('s')) nh = dragStart.wh + dy;
    if (resizeHandle.includes('w')) { nw = dragStart.ww - dx; nx = dragStart.wx + dx; }
    if (resizeHandle.includes('n')) { nh = dragStart.wh - dy; ny = dragStart.wy + dy; }
    AppState.resizeWidget(AppState.selectedWidgetId, nx, ny, nw, nh);
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    AppState.endBatch(); // 拖动结束
    snapLines = [];
    renderSnapLines();
  }
  if (isResizing) {
    isResizing = false;
    AppState.endBatch(); // 调整大小结束
    resizeHandle = null;
  }
});

canvas.addEventListener('click', (e) => {
  if (e.target === canvas || e.target.id === 'canvas-hint') {
    AppState.selectWidget(null);
  }
});

// ============ 拖放 ============
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const type = draggingFromPalette || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
  if (!type) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / AppState.zoom;
  const y = (e.clientY - rect.top) / AppState.zoom;
  const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === type);
  const [dw, dh] = typeInfo ? typeInfo.defaultSize : [80, 40];
  AppState.addWidget(type, Math.max(0, x - dw / 2), Math.max(0, y - dh / 2), dw, dh);
  draggingFromPalette = null;
}

canvas.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
});

canvasContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

canvas.addEventListener('dragenter', () => canvas.classList.add('drag-over'));
canvasContainer.addEventListener('dragenter', () => canvas.classList.add('drag-over'));

canvas.addEventListener('dragleave', (e) => {
  if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('drag-over');
});
canvasContainer.addEventListener('dragleave', (e) => {
  if (!canvasContainer.contains(e.relatedTarget)) canvas.classList.remove('drag-over');
});

canvas.addEventListener('drop', handleDrop);
canvasContainer.addEventListener('drop', handleDrop);

// ============ 属性面板 ============
function renderWidgetProps() {
  const w = AppState.selectedWidgetId ? AppState.getWidget(AppState.selectedWidgetId) : null;
  const panelProject = document.getElementById('project-props');
  const panelPage = document.getElementById('page-props');

  if (!w) {
    // 未选中组件：显示项目 + 页面面板，隐藏组件面板
    widgetPropsPanel.style.display = 'none';
    emptyProps.style.display = 'block';
    if (panelProject) panelProject.style.display = 'block';
    if (panelPage) panelPage.style.display = 'block';
    return;
  }

  // 选中组件：只显示组件属性，隐藏项目/页面
  widgetPropsPanel.style.display = 'block';
  emptyProps.style.display = 'none';
  if (panelProject) panelProject.style.display = 'none';
  if (panelPage) panelPage.style.display = 'none';

  const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
  widgetTypeLabel.textContent = (typeInfo ? typeInfo.name : w.type) + ' · ' + w.id;

  // 获取该组件的属性列表（properties 数组）
  const propList = typeInfo ? (typeInfo.properties || []) : [];

  let html = '';

  // 位置与尺寸（通用）
  html += `<div class="form-group"><label class="form-label">位置与尺寸</label></div>`;
  html += `<div class="form-row"><div class="form-group"><label class="form-label">X</label><input type="number" class="form-input" data-prop="x" value="${w.x}" /></div><div class="form-group"><label class="form-label">Y</label><input type="number" class="form-input" data-prop="y" value="${w.y}" /></div></div>`;
  html += `<div class="form-row" style="margin-bottom:12px;"><div class="form-group"><label class="form-label">宽度</label><input type="number" class="form-input" data-prop="width" value="${w.width}" min="20" /></div><div class="form-group"><label class="form-label">高度</label><input type="number" class="form-input" data-prop="height" value="${w.height}" min="20" /></div></div>`;

  // 锁定控件开关（在最上面，位置与尺寸之后）
  const hasLocked = propList.includes('locked');
  if (hasLocked) {
    html += `<div class="form-group" style="margin-bottom:10px;"><label class="form-label">🔒 锁定控件</label><div class="switch-input ${w.locked ? 'on' : ''}" data-prop="locked" data-bool="1" style="cursor:pointer;"></div></div>`;
  }

  // 根据 properties 列表 + PROP_META 动态渲染属性（跳过 locked，已在上面显示）
  let inFontSection = false;
  propList.forEach(prop => {
    if (prop === 'locked') return;
    const meta = PROP_META[prop];
    if (!meta) return;

    // 字体属性分组标题
    const isFontProp = (prop === 'fontSize' || prop === 'fontFamily' || prop === 'fontBpp');
    if (isFontProp && !inFontSection) {
      inFontSection = true;
      html += `<div class="form-group" style="margin-top:10px;margin-bottom:4px;"><label class="form-label" style="font-weight:600;color:var(--accent);font-size:12px;">🔤 字体设置</label></div>`;
    }

    const rawVal = w[prop];
    const label = meta.label;

    if (meta.type === 'color') {
      const val = (typeof rawVal === 'string' && rawVal.startsWith('#')) ? rawVal : '#000000';
      const textVal = typeof rawVal === 'string' ? rawVal : val;
      html += `<div class="form-group"><label class="form-label">${label}</label><div style="display:flex;gap:6px;align-items:center;"><input type="color" style="width:36px;height:32px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px;background:var(--bg-primary);" data-prop="${prop}" data-clr="1" value="${val}" /><input type="text" class="form-input color-text" data-prop="${prop}" value="${escapeAttr(textVal)}" /></div></div>`;
    } else if (meta.type === 'bool') {
      html += `<div class="form-group"><label class="form-label">${label}</label><div class="switch-input ${rawVal ? 'on' : ''}" data-prop="${prop}" data-bool="1" style="cursor:pointer;"></div></div>`;
    } else if (meta.type === 'select') {
      if (prop === 'fontFamily') {
        // 字体选择：内置字体 + 项目资源字体 + "其他字体..."选项
        const knownFonts = [
          ['simsun.ttc', '宋体'],
          ['simhei.ttf', '黑体'],
          ['simkai.ttf', '楷体'],
          ['simsunb.ttf', '宋体加粗'],
          ['msyh.ttf', '微软雅黑'],
          ['arial.ttf', 'Arial'],
          ['DejaVuSans.ttf', 'DejaVu Sans'],
          ['sourcehansans.ttf', '思源黑体'],
          ['notosanscjk.ttf', 'Noto Sans CJK'],
          ['default', '默认字体']
        ];
        // 项目资源中的字体
        const projectFonts = (AppState.project.resources && AppState.project.resources.fonts) || [];
        const currentVal = rawVal || '';
        const isKnown = knownFonts.some(f => f[0] === currentVal);
        const isProjectFont = projectFonts.some(f => f.path === currentVal);
        const isCustom = !isKnown && !isProjectFont && currentVal;
        html += `<div class="form-group"><label class="form-label">${label}</label>`;
        html += `<select class="form-select" data-prop="fontFamily">`;
        knownFonts.forEach(([optVal, optLabel]) => {
          html += `<option value="${optVal}" ${currentVal === optVal ? 'selected' : ''}>${optLabel}</option>`;
        });
        // 项目资源字体
        if (projectFonts.length > 0) {
          html += `<optgroup label="项目字体">`;
          projectFonts.forEach(f => {
            html += `<option value="${escapeAttr(f.path)}" ${currentVal === f.path ? 'selected' : ''}>${escapeHtml(f.name)}</option>`;
          });
          html += `</optgroup>`;
        }
        // 自定义字体选项放在底部
        if (isCustom) {
          html += `<option value="${escapeAttr(currentVal)}" selected>${escapeHtml(currentVal)}</option>`;
        }
        html += `<option value="__custom__">其他字体...</option>`;
        html += `</select></div>`;
      } else {
        html += `<div class="form-group"><label class="form-label">${label}</label><select class="form-select" data-prop="${prop}">`;
        meta.options.forEach(([optVal, optLabel]) => {
          const optStr = String(optVal);
          const curStr = String(rawVal);
          html += `<option value="${optStr}" ${curStr === optStr ? 'selected' : ''}>${optLabel}</option>`;
        });
        html += `</select></div>`;
      }
    } else if (meta.type === 'text' || prop === 'text') {
      html += `<div class="form-group"><label class="form-label">${label}</label><input type="text" class="form-input" data-prop="${prop}" value="${escapeAttr(rawVal || '')}" /></div>`;
    } else {
      // number
      const minStr = meta.min != null ? ` min="${meta.min}"` : '';
      const maxStr = meta.max != null ? ` max="${meta.max}"` : '';
      html += `<div class="form-group"><label class="form-label">${label}</label><input type="number" class="form-input" data-prop="${prop}" value="${rawVal != null ? rawVal : 0}"${minStr}${maxStr} /></div>`;
    }
  });

  widgetPropContent.innerHTML = html;

  // 绑定事件
  widgetPropContent.querySelectorAll('[data-prop]').forEach(input => {
    const prop = input.dataset.prop;
    const isBool = input.dataset.bool === '1';
    const isColor = input.dataset.clr === '1';

    if (isBool) {
      input.addEventListener('click', () => {
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        AppState.updateWidget(AppState.selectedWidgetId, { [prop]: !wgt[prop] });
      });
      return;
    }

    input.addEventListener('input', () => {
      let val;
      if (input.type === 'number') val = parseFloat(input.value) || 0;
      else if (input.type === 'select-one') val = input.value;
      else val = input.value;

      // 直接更新控件数据，不触发属性面板重建（避免输入框丢失焦点）
      const w = AppState.getWidget(AppState.selectedWidgetId);
      if (w) {
        w[prop] = val;
        // 只刷新画布和图层，不重建属性面板
        renderCanvas();
        renderLayerList();
        renderStatus();
        AppState.save();
      }

      // 同步颜色输入
      if (isColor) {
        const txt = widgetPropContent.querySelector(`[data-prop="${prop}"]:not([data-clr])`);
        if (txt && /^#[0-9a-f]{6}$/i.test(val)) txt.value = val;
      } else if (widgetPropContent.querySelector(`[data-prop="${prop}"][data-clr]`)) {
        const clr = widgetPropContent.querySelector(`[data-prop="${prop}"][data-clr]`);
        if (/^#[0-9a-f]{6}$/i.test(val)) clr.value = val;
      }
    });

    // 失焦时完整刷新（同步最终值）
    input.addEventListener('blur', () => {
      let val;
      if (input.type === 'number') val = parseFloat(input.value) || 0;
      else if (input.type === 'select-one') val = input.value;
      else val = input.value;
      AppState.updateWidget(AppState.selectedWidgetId, { [prop]: val });
    });

    // select 用 change
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', async () => {
        let val = input.value;

        // 字体选择中的"其他字体..."：打开文件选择器
        if (prop === 'fontFamily' && val === '__custom__') {
          try {
            const wgt = AppState.getWidget(AppState.selectedWidgetId);
            const previousFont = wgt ? wgt.fontFamily : '';
            // 使用 Tauri 文件对话框选择字体文件
            const selected = await open({
              title: '选择字体文件',
              filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'ttc', 'woff', 'woff2'] }],
              multiple: false
            });
            if (selected) {
              // 保存完整路径
              AppState.updateWidget(AppState.selectedWidgetId, { fontFamily: selected });
              renderWidgetProps();
            } else {
              // 用户取消，保留上次选择
              renderWidgetProps();
            }
          } catch (err) {
            console.error('选择字体文件失败:', err);
            // 出错也恢复
            renderWidgetProps();
          }
          return;
        }

        if (!isNaN(parseFloat(val)) && isFinite(val)) val = parseFloat(val);
        AppState.updateWidget(AppState.selectedWidgetId, { [prop]: val });
      });
    }
  });
}

// ============ 图层列表：树形结构（页面为父节点，控件为子节点）============
const expandedPages = new Set();

function renderLayerList() {
  layerList.innerHTML = '';

  if (!AppState.project || !AppState.project.pages || AppState.project.pages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:16px 0;text-align:center;font-size:11px;color:var(--text-muted);';
    empty.innerHTML = '<div style="font-size:20px;opacity:0.3;margin-bottom:4px;">📄</div><div>暂无页面</div>';
    layerList.appendChild(empty);
    return;
  }

  const currentPageId = AppState.currentPageId;

  AppState.project.pages.forEach((page) => {
    // 默认展开当前页或已有控件的页
    if (page.id === currentPageId && page.widgets && page.widgets.length > 0) {
      expandedPages.add(page.id);
    }

    const pageNode = document.createElement('div');
    pageNode.className = 'tree-page';

    // 页面节点行：箭头 + 图标 + 名称
    const pageRow = document.createElement('div');
    pageRow.className = 'tree-row tree-page-row';
    if (page.id === currentPageId) pageRow.classList.add('active');

    const hasWidgets = page.widgets && page.widgets.length > 0;
    const isExpanded = expandedPages.has(page.id);

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow' + (isExpanded ? ' open' : '');
    if (!hasWidgets) arrow.style.visibility = 'hidden';
    arrow.textContent = '▶';
    pageRow.appendChild(arrow);

    const pageIcon = document.createElement('span');
    pageIcon.className = 'tree-icon';
    pageIcon.textContent = '📄';
    pageRow.appendChild(pageIcon);

    const pageName = document.createElement('span');
    pageName.className = 'tree-label';
    pageName.textContent = page.name;
    pageName.title = page.name + ' (' + (page.widgets ? page.widgets.length : 0) + ' 个控件)';
    pageRow.appendChild(pageName);

    // 点击箭头：展开/折叠
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedPages.has(page.id)) expandedPages.delete(page.id);
      else expandedPages.add(page.id);
      renderLayerList();
    });

    // 点击页面行：切换到该页
    pageRow.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tree-arrow')) {
        // 点击非箭头区域切换当前页
        if (AppState.currentPageId !== page.id) {
          AppState.setCurrentPage(page.id);
        }
        // 同时也切换展开状态
        if (hasWidgets) {
          if (expandedPages.has(page.id)) expandedPages.delete(page.id);
          else expandedPages.add(page.id);
          renderLayerList();
        }
      }
    });

    pageNode.appendChild(pageRow);

    // 控件子节点（仅当展开时显示）
    if (hasWidgets && isExpanded) {
      const children = document.createElement('div');
      children.className = 'tree-children';

      page.widgets.forEach((w) => {
        const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
        const widgetRow = document.createElement('div');
        widgetRow.className = 'tree-row tree-widget-row' + (AppState.selectedWidgetIds.has(w.id) ? ' active' : '');

        // 控件类型小图标
        const wIcon = document.createElement('span');
        wIcon.className = 'tree-icon-sm';
        wIcon.innerHTML = typeInfo?.icon || '';
        widgetRow.appendChild(wIcon);

        const wLabel = document.createElement('span');
        wLabel.className = 'tree-label';
        wLabel.textContent = w.id;
        wLabel.title = w.id + (w.text ? ' - ' + w.text : '');
        widgetRow.appendChild(wLabel);

        widgetRow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (AppState.currentPageId !== page.id) {
            AppState.setCurrentPage(page.id);
          }
          AppState.selectWidget(w.id, e.ctrlKey || e.metaKey);
        });

        children.appendChild(widgetRow);
      });

      pageNode.appendChild(children);
    }

    layerList.appendChild(pageNode);
  });
}

// ============ 项目/页面属性 ============
function renderProjectPanel() {
  const el = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  el('prop-project-name', AppState.project.name);
  el('prop-screen-w', AppState.project.screen_width);
  el('prop-screen-h', AppState.project.screen_height);
  el('prop-color-depth', AppState.project.color_depth);

  const page = AppState.getCurrentPage();
  if (page) {
    el('prop-page-name', page.name);
    el('prop-page-bgcolor', page.bg_color || '#1e1e2e');
    el('prop-page-bgcolor-text', page.bg_color || '#1e1e2e');
  }
}

function renderStatus() {
  const w = AppState.selectedWidgetId ? AppState.getWidget(AppState.selectedWidgetId) : null;
  const page = AppState.getCurrentPage();
  document.getElementById('status-project').textContent = '项目: ' + AppState.project.name;
  document.getElementById('status-size').textContent = '屏幕: ' + AppState.project.screen_width + '×' + AppState.project.screen_height;
  document.getElementById('status-widgets').textContent = '组件: ' + (page ? page.widgets.length : 0);
  document.getElementById('status-selection').textContent = w ? `选中: ${SGL_WIDGET_TYPES.find(t => t.type === w.type)?.name || w.type} @ (${w.x},${w.y})` : '未选中';
  document.getElementById('zoom-label').textContent = Math.round(AppState.zoom * 100) + '%';
}

// ============ 资源管理 ============
function renderResourceList() {
  const fontList = document.getElementById('font-list');
  const imageList = document.getElementById('image-list');
  if (!fontList || !imageList) return;

  const resources = AppState.project.resources || { fonts: [], images: [] };

  // 字体列表
  fontList.innerHTML = '';
  resources.fonts.forEach((font, idx) => {
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.innerHTML = `<span style="font-size:12px;">🔤</span><span class="resource-item-name" title="${escapeAttr(font.path)}">${escapeHtml(font.name)}</span><span class="resource-item-delete" data-idx="${idx}" title="删除">×</span>`;
    fontList.appendChild(item);
  });
  if (resources.fonts.length === 0) {
    fontList.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:8px 0;">暂无字体资源</div>';
  }

  // 图片列表
  imageList.innerHTML = '';
  resources.images.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.innerHTML = `<span style="font-size:12px;">🖼</span><span class="resource-item-name" title="${escapeAttr(img.path)}">${escapeHtml(img.name)}</span><span class="resource-item-delete" data-idx="${idx}" title="删除">×</span>`;
    imageList.appendChild(item);
  });
  if (resources.images.length === 0) {
    imageList.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:8px 0;">暂无图片资源</div>';
  }
}

// 资源标签页切换
document.querySelectorAll('.resource-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.resource-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.resTab;
    document.getElementById('resource-fonts').style.display = target === 'fonts' ? '' : 'none';
    document.getElementById('resource-images').style.display = target === 'images' ? '' : 'none';
  });
});

// 添加字体
document.getElementById('btn-add-font').addEventListener('click', async () => {
  try {
    const selected = await open({
      title: '选择字体文件',
      filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'ttc', 'woff', 'woff2'] }],
      multiple: true
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (!AppState.project.resources) AppState.project.resources = { fonts: [], images: [] };
    paths.forEach(p => {
      const name = p.replace(/[/\\]/g, '/').split('/').pop();
      // 去重
      if (!AppState.project.resources.fonts.some(f => f.path === p)) {
        AppState.project.resources.fonts.push({ name, path: p });
      }
    });
    AppState.notify();
    logMessage(`已添加 ${paths.length} 个字体资源`, 'success');
  } catch (err) {
    logMessage('添加字体失败: ' + err, 'error');
  }
});

// 添加图片
document.getElementById('btn-add-image').addEventListener('click', async () => {
  try {
    const selected = await open({
      title: '选择图片文件',
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }],
      multiple: true
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (!AppState.project.resources) AppState.project.resources = { fonts: [], images: [] };
    paths.forEach(p => {
      const name = p.replace(/[/\\]/g, '/').split('/').pop();
      if (!AppState.project.resources.images.some(f => f.path === p)) {
        AppState.project.resources.images.push({ name, path: p });
      }
    });
    AppState.notify();
    logMessage(`已添加 ${paths.length} 个图片资源`, 'success');
  } catch (err) {
    logMessage('添加图片失败: ' + err, 'error');
  }
});

// 删除资源（事件委托）
document.getElementById('font-list').addEventListener('click', (e) => {
  const del = e.target.closest('.resource-item-delete');
  if (!del) return;
  const idx = parseInt(del.dataset.idx);
  const resources = AppState.project.resources;
  if (resources && resources.fonts[idx]) {
    const name = resources.fonts[idx].name;
    resources.fonts.splice(idx, 1);
    AppState.notify();
    logMessage(`已删除字体: ${name}`, 'info');
  }
});

document.getElementById('image-list').addEventListener('click', (e) => {
  const del = e.target.closest('.resource-item-delete');
  if (!del) return;
  const idx = parseInt(del.dataset.idx);
  const resources = AppState.project.resources;
  if (resources && resources.images[idx]) {
    const name = resources.images[idx].name;
    resources.images.splice(idx, 1);
    AppState.notify();
    logMessage(`已删除图片: ${name}`, 'info');
  }
});

// ============ 事件绑定 ============
document.getElementById('btn-new-page').addEventListener('click', () => AppState.addPage('页面 ' + (AppState.project.pages.length + 1)));
document.getElementById('btn-delete-widget').addEventListener('click', () => { if (AppState.selectedWidgetIds.size > 0) AppState.removeSelectedWidgets(); });
document.getElementById('btn-clear-log').addEventListener('click', () => { if (logContent) logContent.innerHTML = ''; });

// 日志面板拖拽调整高度
const logResizer = document.getElementById('log-resizer');
const logPanel = document.getElementById('log-panel');
let isLogResizing = false;
let logResizeStartY = 0;
let logResizeStartH = 0;

logResizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isLogResizing = true;
  logResizeStartY = e.clientY;
  logResizeStartH = logPanel.offsetHeight;
  logResizer.classList.add('active');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isLogResizing) return;
  const dy = logResizeStartY - e.clientY;
  const newH = Math.max(32, Math.min(logResizeStartH + dy, window.innerHeight * 0.6));
  logPanel.style.height = newH + 'px';
  centerCanvas();
  const page = AppState.getCurrentPage();
  if (page) {
    canvas.style.left = panOffset.x + 'px';
    canvas.style.top = panOffset.y + 'px';
    renderRulers(page.width, page.height);
  }
});

document.addEventListener('mouseup', () => {
  if (isLogResizing) {
    isLogResizing = false;
    logResizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

document.getElementById('btn-zoom-in').addEventListener('click', () => { AppState.zoom = Math.min(4, AppState.zoom + 0.25); centerCanvas(); renderAll(); });
document.getElementById('btn-zoom-out').addEventListener('click', () => { AppState.zoom = Math.max(0.25, AppState.zoom - 0.25); centerCanvas(); renderAll(); });
document.getElementById('btn-zoom-fit').addEventListener('click', () => {
  const page = AppState.getCurrentPage();
  if (!page) return;
  const vp = document.getElementById('canvas-viewport');
  const cw = vp.clientWidth - 80;
  const ch = vp.clientHeight - 80;
  const z = Math.min(cw / page.width, ch / page.height, 1);
  AppState.zoom = Math.max(0.25, Math.round(z * 4) / 4);
  centerCanvas();
  renderAll();
});

// 鼠标滚轮缩放画布
document.getElementById('canvas-viewport').addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  AppState.zoom = Math.max(0.25, Math.min(4, Math.round((AppState.zoom + delta) * 20) / 20));
  document.getElementById('zoom-label').textContent = Math.round(AppState.zoom * 100) + '%';
  centerCanvas();
  renderAll();
}, { passive: false });

// 画布拖动平移（中键拖动 或 空格+左键拖动）
const viewport = document.getElementById('canvas-viewport');
let spaceDown = false;

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    spaceDown = true;
    viewport.style.cursor = 'grab';
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    if (!isPanning) viewport.style.cursor = '';
  }
});

viewport.addEventListener('mousedown', (e) => {
  // 中键 或 空格+左键 开始平移
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    viewport.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  panOffset.x = e.clientX - panStart.x;
  panOffset.y = e.clientY - panStart.y;
  canvas.style.left = panOffset.x + 'px';
  canvas.style.top = panOffset.y + 'px';
  // 实时更新标尺
  const page = AppState.getCurrentPage();
  if (page) renderRulers(page.width, page.height);
});

document.addEventListener('mouseup', (e) => {
  if (isPanning) {
    isPanning = false;
    viewport.style.cursor = spaceDown ? 'grab' : '';
  }
});

// 项目属性
document.getElementById('prop-project-name').addEventListener('change', e => { AppState.project.name = e.target.value; AppState.save(); renderStatus(); });
document.getElementById('prop-screen-w').addEventListener('change', e => { AppState.updateProject({ screen_width: parseInt(e.target.value) || 480 }); });
document.getElementById('prop-screen-h').addEventListener('change', e => { AppState.updateProject({ screen_height: parseInt(e.target.value) || 320 }); });
document.getElementById('prop-color-depth').addEventListener('change', e => { AppState.project.color_depth = e.target.value; AppState.save(); });

// 页面属性
document.getElementById('prop-page-name').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.name = e.target.value; AppState.save(); renderPageTabs(); }
});
document.getElementById('prop-page-bgcolor').addEventListener('input', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.bg_color = e.target.value; document.getElementById('prop-page-bgcolor-text').value = e.target.value; AppState.save(); renderCanvas(); }
});
document.getElementById('prop-page-bgcolor-text').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page && /^#[0-9a-f]{6}$/i.test(e.target.value)) {
    page.bg_color = e.target.value; document.getElementById('prop-page-bgcolor').value = e.target.value; AppState.save(); renderCanvas();
  }
});

// 保存与导出
document.getElementById('btn-open').addEventListener('click', async () => {
  const result = await AppState.openProject();
  if (result.ok) {
    showToast('项目已加载', 'success');
    logMessage('项目已加载: ' + result.path, 'success');
    panOffset = { x: 0, y: 0 };
    centerCanvas();
    renderPageTabs();
    renderCanvas();
    renderWidgetProps();
    renderLayerList();
  } else if (result.msg !== '取消打开') {
    showToast('打开失败: ' + result.msg, 'error');
    logMessage('打开失败: ' + result.msg, 'error');
  }
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const result = await AppState.saveProject();
  if (result.ok) {
    showToast('项目已保存到: ' + result.path.split(/[/\\]/).pop(), 'success');
    logMessage('项目已保存: ' + result.path, 'success');
  } else if (result.msg !== '取消保存') {
    showToast('保存失败: ' + result.msg, 'error');
    logMessage('保存失败: ' + result.msg, 'error');
  }
});

document.getElementById('btn-export').addEventListener('click', async () => {
  if (!AppState.projectPath) {
    showToast('请先保存项目，再导出代码', 'error');
    logMessage('导出失败: 请先保存项目', 'warn');
    return;
  }
  try {
    logMessage('正在导出代码...', 'info');
    const result = await AppState.exportCode();
    if (result.ok) {
      showToast('代码已导出到: ' + result.path.split(/[/\\]/).pop(), 'success');
      logMessage('代码已导出: ' + result.path, 'success');
    } else {
      showToast('导出失败: ' + result.msg, 'error');
      logMessage('导出失败: ' + result.msg, 'error');
    }
  } catch (e) {
    showToast('导出失败: ' + e, 'error');
    logMessage('导出失败: ' + e, 'error');
  }
});

// 键盘
document.addEventListener('keydown', (e) => {
  const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  // Ctrl+Z 撤销
  if (e.ctrlKey && !e.shiftKey && e.key === 'z' && !inInput) {
    e.preventDefault();
    AppState.undo();
    return;
  }
  // Ctrl+Y 或 Ctrl+Shift+Z 恢复
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z') && !inInput) {
    e.preventDefault();
    AppState.redo();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedWidgetIds.size > 0 && !inInput) {
    e.preventDefault();
    AppState.removeSelectedWidgets();
  }
  if (e.key === 'Escape') AppState.selectWidget(null);
  if (e.ctrlKey && e.key === 'a') {
    e.preventDefault();
    const page = AppState.getCurrentPage();
    if (page && page.widgets.length > 0) {
      AppState.selectedWidgetIds.clear();
      page.widgets.forEach(w => AppState.selectedWidgetIds.add(w.id));
      AppState.notify();
    }
  }
  // Ctrl+C 复制控件（支持多选）
  if (e.ctrlKey && e.key === 'c' && AppState.selectedWidgetIds.size > 0 && !inInput) {
    clipboardWidgets = [];
    AppState.selectedWidgetIds.forEach(id => {
      const w = AppState.getWidget(id);
      if (w) clipboardWidgets.push(JSON.parse(JSON.stringify(w)));
    });
  }
  // Ctrl+V 粘贴控件（支持多选）
  if (e.ctrlKey && e.key === 'v' && clipboardWidgets.length > 0 && !inInput) {
    e.preventDefault();
    const offset = 10;
    const newIds = [];
    clipboardWidgets.forEach(cw => {
      AppState.addWidget(
        cw.type,
        cw.x + offset,
        cw.y + offset,
        cw.width,
        cw.height
      );
      const page = AppState.getCurrentPage();
      if (page) {
        const newWidget = page.widgets[page.widgets.length - 1];
        if (newWidget) {
          const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === cw.type);
          const props = typeInfo ? (typeInfo.properties || []) : [];
          props.forEach(prop => {
            if (prop !== 'locked' && cw[prop] !== undefined) {
              newWidget[prop] = JSON.parse(JSON.stringify(cw[prop]));
            }
          });
          newIds.push(newWidget.id);
        }
      }
    });
    // 选中所有新粘贴的控件
    AppState.selectedWidgetIds.clear();
    newIds.forEach(id => AppState.selectedWidgetIds.add(id));
    AppState.save();
  }
});

// 导航
document.querySelectorAll('[data-nav]').forEach(tab => tab.addEventListener('click', () => navigate(tab.dataset.nav)));

// ============ 右键菜单 ============
const contextMenu = document.getElementById('context-menu');

// 显示右键菜单
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / AppState.zoom;
  const y = (e.clientY - rect.top) / AppState.zoom;

  // 检查是否点击了某个控件
  const page = AppState.getCurrentPage();
  if (!page) return;

  const clickedWidget = [...page.widgets].reverse().find(w =>
    x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height
  );

  if (clickedWidget) {
    // 如果点击的控件不在已选中列表中，单选它
    if (!AppState.selectedWidgetIds.has(clickedWidget.id)) {
      AppState.selectWidget(clickedWidget.id);
    }
  }

  // 更新菜单项状态
  const hasSelection = AppState.selectedWidgetIds.size > 0;
  const multiSelected = AppState.selectedWidgetIds.size >= 2;

  // 撤销/恢复
  const undoItem = contextMenu.querySelector('[data-action="undo"]');
  const redoItem = contextMenu.querySelector('[data-action="redo"]');
  if (AppState.canUndo()) undoItem.classList.remove('disabled');
  else undoItem.classList.add('disabled');
  if (AppState.canRedo()) redoItem.classList.remove('disabled');
  else redoItem.classList.add('disabled');

  // 对齐和分布（需多选）
  contextMenu.querySelectorAll('[data-action^="align-"], [data-action^="distribute-"]').forEach(item => {
    if (multiSelected) item.classList.remove('disabled');
    else item.classList.add('disabled');
  });

  // 复制/删除（需选中）
  const copyItem = contextMenu.querySelector('[data-action="copy"]');
  const deleteItem = contextMenu.querySelector('[data-action="delete"]');
  if (hasSelection) { copyItem.classList.remove('disabled'); deleteItem.classList.remove('disabled'); }
  else { copyItem.classList.add('disabled'); deleteItem.classList.add('disabled'); }

  // 粘贴项
  const pasteItem = contextMenu.querySelector('[data-action="paste"]');
  if (clipboardWidgets.length > 0) pasteItem.classList.remove('disabled');
  else pasteItem.classList.add('disabled');

  // 显示菜单
  contextMenu.style.display = 'block';
  const menuW = contextMenu.offsetWidth;
  const menuH = contextMenu.offsetHeight;
  let left = e.clientX;
  let top = e.clientY;
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4;
  if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 4;
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
});

// 点击其他地方关闭菜单
document.addEventListener('click', () => {
  contextMenu.style.display = 'none';
});
document.addEventListener('contextmenu', (e) => {
  if (!canvas.contains(e.target)) {
    contextMenu.style.display = 'none';
  }
});

// 菜单操作
contextMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.context-menu-item');
  if (!item || item.classList.contains('disabled')) return;

  const action = item.dataset.action;

  // 撤销/恢复不需要选中控件
  if (action === 'undo') {
    AppState.undo();
    contextMenu.style.display = 'none';
    return;
  }
  if (action === 'redo') {
    AppState.redo();
    contextMenu.style.display = 'none';
    return;
  }

  const page = AppState.getCurrentPage();
  if (!page) return;

  // 获取所有选中控件
  const selectedWidgets = [...AppState.selectedWidgetIds]
    .map(id => page.widgets.find(w => w.id === id))
    .filter(Boolean);

  if (selectedWidgets.length === 0) return;

  switch (action) {
    case 'align-left': {
      const minX = Math.min(...selectedWidgets.map(w => w.x));
      selectedWidgets.forEach(w => { w.x = minX; });
      AppState.notify();
      break;
    }
    case 'align-right': {
      const maxR = Math.max(...selectedWidgets.map(w => w.x + w.width));
      selectedWidgets.forEach(w => { w.x = maxR - w.width; });
      AppState.notify();
      break;
    }
    case 'align-top': {
      const minY = Math.min(...selectedWidgets.map(w => w.y));
      selectedWidgets.forEach(w => { w.y = minY; });
      AppState.notify();
      break;
    }
    case 'align-bottom': {
      const maxB = Math.max(...selectedWidgets.map(w => w.y + w.height));
      selectedWidgets.forEach(w => { w.y = maxB - w.height; });
      AppState.notify();
      break;
    }
    case 'align-center-h': {
      const avgX = selectedWidgets.reduce((s, w) => s + w.x + w.width / 2, 0) / selectedWidgets.length;
      selectedWidgets.forEach(w => { w.x = Math.round(avgX - w.width / 2); });
      AppState.notify();
      break;
    }
    case 'align-center-v': {
      const avgY = selectedWidgets.reduce((s, w) => s + w.y + w.height / 2, 0) / selectedWidgets.length;
      selectedWidgets.forEach(w => { w.y = Math.round(avgY - w.height / 2); });
      AppState.notify();
      break;
    }
    case 'distribute-h': {
      if (selectedWidgets.length < 3) break;
      const sorted = [...selectedWidgets].sort((a, b) => a.x - b.x);
      const leftmost = sorted[0].x;
      const rightmost = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
      const totalWidth = sorted.reduce((s, w) => s + w.width, 0);
      const gap = (rightmost - leftmost - totalWidth) / (sorted.length - 1);
      let cx = leftmost;
      sorted.forEach(w => { w.x = Math.round(cx); cx += w.width + gap; });
      AppState.notify();
      break;
    }
    case 'distribute-v': {
      if (selectedWidgets.length < 3) break;
      const sorted = [...selectedWidgets].sort((a, b) => a.y - b.y);
      const topmost = sorted[0].y;
      const bottommost = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      const totalHeight = sorted.reduce((s, w) => s + w.height, 0);
      const gap = (bottommost - topmost - totalHeight) / (sorted.length - 1);
      let cy = topmost;
      sorted.forEach(w => { w.y = Math.round(cy); cy += w.height + gap; });
      AppState.notify();
      break;
    }
    case 'copy': {
      clipboardWidgets = [];
      AppState.selectedWidgetIds.forEach(id => {
        const w = AppState.getWidget(id);
        if (w) clipboardWidgets.push(JSON.parse(JSON.stringify(w)));
      });
      break;
    }
    case 'paste': {
      if (clipboardWidgets.length === 0) break;
      const offset = 10;
      const newIds = [];
      clipboardWidgets.forEach(cw => {
        AppState.addWidget(cw.type, cw.x + offset, cw.y + offset, cw.width, cw.height);
        const pg = AppState.getCurrentPage();
        if (pg) {
          const nw = pg.widgets[pg.widgets.length - 1];
          if (nw) {
            const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === cw.type);
            const props = typeInfo ? (typeInfo.properties || []) : [];
            props.forEach(prop => {
              if (prop !== 'locked' && cw[prop] !== undefined) {
                nw[prop] = JSON.parse(JSON.stringify(cw[prop]));
              }
            });
            newIds.push(nw.id);
          }
        }
      });
      AppState.selectedWidgetIds.clear();
      newIds.forEach(id => AppState.selectedWidgetIds.add(id));
      AppState.save();
      break;
    }
    case 'delete': {
      AppState.removeSelectedWidgets();
      break;
    }
  }

  contextMenu.style.display = 'none';
});

// ============ 渲染总调度 ============
AppState.subscribe(renderAll);

function renderAll() {
  renderPageTabs();
  renderCanvas();
  renderLayerList();
  renderResourceList();
  renderWidgetProps();
  renderProjectPanel();
  renderStatus();
}

// 初始化
renderPalette();
renderAll();

// 首次渲染后延迟居中画布（等待 DOM 布局完成）
requestAnimationFrame(() => {
  centerCanvas();
  const page = AppState.getCurrentPage();
  if (page) {
    canvas.style.left = panOffset.x + 'px';
    canvas.style.top = panOffset.y + 'px';
    renderRulers(page.width, page.height);
  }
});
