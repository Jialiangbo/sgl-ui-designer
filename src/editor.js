import { AppState, navigate, showToast, initNav, downloadFile, escapeHtml, escapeAttr } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_CATEGORIES, PROP_META, WIDGET_EVENTS } from './sgl_api.js';
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
let snapLinesWidgetId = null; // 记录当前辅助线对应的控件ID（用于判断是否需要限制在父控件内）
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
  // 同步写入日志文件
  if (AppState.projectPath) {
    invoke('append_log', { projectPath: AppState.projectPath, message: `[${type.toUpperCase()}] ${msg}` }).catch(() => {});
  }
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

// ============ 浮动组件库面板 ============
const floatingPalette = document.getElementById('floating-palette');
const paletteHeader = document.getElementById('palette-header');
const paletteMinimizeBtn = document.getElementById('btn-palette-minimize');
const paletteResizeHandle = document.getElementById('palette-resize');

// 从 localStorage 读取位置和大小
function loadPaletteState() {
  try {
    const state = JSON.parse(localStorage.getItem('paletteState') || '{}');
    if (state.left != null && state.top != null) {
      floatingPalette.style.left = state.left + 'px';
      floatingPalette.style.top = state.top + 'px';
    } else {
      // 默认位置：右上角
      floatingPalette.style.right = '20px';
      floatingPalette.style.top = '60px';
    }
    if (state.width) floatingPalette.style.width = state.width + 'px';
    // 如果是最小化状态，保存高度用于展开时恢复
    if (state.minimized) {
      if (state.height) floatingPalette.dataset.savedHeight = state.height;
      floatingPalette.classList.add('minimized');
      paletteMinimizeBtn.textContent = '+';
      paletteMinimizeBtn.title = '展开';
    } else if (state.height) {
      floatingPalette.style.height = state.height + 'px';
    }
  } catch (e) {
    // 默认位置
    floatingPalette.style.right = '20px';
    floatingPalette.style.top = '60px';
  }
}

function savePaletteState() {
  const isMin = floatingPalette.classList.contains('minimized');
  const state = {
    left: floatingPalette.offsetLeft,
    top: floatingPalette.offsetTop,
    width: floatingPalette.offsetWidth,
    // 如果最小化，保存的是拉伸后的高度，不是当前渲染高度
    height: isMin ? (floatingPalette.dataset.savedHeight || floatingPalette.offsetHeight) : floatingPalette.offsetHeight,
    minimized: isMin
  };
  localStorage.setItem('paletteState', JSON.stringify(state));
}

// 拖动
let isDraggingPalette = false;
let dragOffsetX = 0, dragOffsetY = 0;

paletteHeader.addEventListener('mousedown', (e) => {
  if (e.target === paletteMinimizeBtn || e.target.closest('.floating-palette-btn')) return;
  isDraggingPalette = true;
  dragOffsetX = e.clientX - floatingPalette.offsetLeft;
  dragOffsetY = e.clientY - floatingPalette.offsetTop;
  document.body.style.cursor = 'move';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDraggingPalette) return;
  let newLeft = e.clientX - dragOffsetX;
  let newTop = e.clientY - dragOffsetY;
  // 限制在窗口内
  newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));
  newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
  floatingPalette.style.left = newLeft + 'px';
  floatingPalette.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  if (isDraggingPalette) {
    isDraggingPalette = false;
    document.body.style.cursor = '';
    savePaletteState();
  }
});

// 最小化/展开
paletteMinimizeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasMin = floatingPalette.classList.contains('minimized');
  if (!wasMin) {
    // 即将最小化 - 保存当前高度，切换到最小化状态
    const currentH = floatingPalette.offsetHeight;
    floatingPalette.dataset.savedHeight = currentH;
    floatingPalette.style.height = '';
    floatingPalette.classList.add('minimized');
    paletteMinimizeBtn.textContent = '+';
    paletteMinimizeBtn.title = '展开';
  } else {
    // 即将展开 - 恢复保存的高度
    const savedH = floatingPalette.dataset.savedHeight;
    floatingPalette.classList.remove('minimized');
    if (savedH) {
      floatingPalette.style.height = savedH + 'px';
    }
    paletteMinimizeBtn.textContent = '−';
    paletteMinimizeBtn.title = '最小化';
  }
  savePaletteState();
});

// 调整大小
let isResizingPalette = false;
let resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0;

paletteResizeHandle.addEventListener('mousedown', (e) => {
  isResizingPalette = true;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartW = floatingPalette.offsetWidth;
  resizeStartH = floatingPalette.offsetHeight;
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizingPalette) return;
  const dx = e.clientX - resizeStartX;
  const dy = e.clientY - resizeStartY;
  const newW = Math.max(200, resizeStartW + dx);
  const newH = resizeStartH + dy;
  // 如果高度小于 80px，自动最小化
  if (newH < 80) {
    floatingPalette.classList.add('minimized');
    paletteMinimizeBtn.textContent = '+';
    paletteMinimizeBtn.title = '展开';
    floatingPalette.style.height = '';
  } else {
    // 恢复正常高度，移除最小化状态
    if (floatingPalette.classList.contains('minimized')) {
      floatingPalette.classList.remove('minimized');
      paletteMinimizeBtn.textContent = '−';
      paletteMinimizeBtn.title = '最小化';
    }
    floatingPalette.style.height = newH + 'px';
  }
});

document.addEventListener('mouseup', () => {
  if (isResizingPalette) {
    isResizingPalette = false;
    savePaletteState();
  }
});

// 初始化浮动面板状态
loadPaletteState();

// ============ 渲染页面 Tabs（顶部工具栏） ============
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

// ============ 渲染页面列表（左侧迷你版） ============
function renderPageTabsMini() {
  const miniTabs = document.getElementById('page-tabs-mini');
  if (!miniTabs) return;
  miniTabs.innerHTML = '';
  AppState.project.pages.forEach(page => {
    const tab = document.createElement('div');
    tab.className = 'page-tab-mini' + (page.id === AppState.currentPageId ? ' active' : '');
    tab.innerHTML = `<span>${escapeHtml(page.name)}</span>`;
    tab.addEventListener('click', () => {
      AppState.setCurrentPage(page.id);
    });
    miniTabs.appendChild(tab);
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
  canvas.style.borderRadius = (AppState.project.screen_shape === 'circle') ? '50%' : '0';

  // 背景：先清除，再分别设置图片或颜色
  canvas.style.background = '';
  canvas.style.backgroundImage = '';
  canvas.style.backgroundColor = '';
  canvas.style.backgroundSize = '';
  canvas.style.backgroundPosition = '';

  if (page.pixmap) {
    let imgPath = page.pixmap;
    if (!imgPath.startsWith('file://') && !imgPath.startsWith('http')) {
      imgPath = 'file:///' + imgPath.replace(/\\/g, '/');
    }
    canvas.style.backgroundImage = `url('${imgPath}')`;
    canvas.style.backgroundSize = 'cover';
    canvas.style.backgroundPosition = 'center';
  } else {
    canvas.style.background = page.bg_color || '#1e1e2e';
  }

  // alpha 透明度
  const pageAlpha = (page.alpha != null && page.alpha !== undefined) ? page.alpha : 255;
  canvas.style.opacity = pageAlpha < 255 ? (pageAlpha / 255) : 1;

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

  // 按父子层级排序渲染：父控件先渲染（在下层），子控件后渲染（在上层）
  const sortedWidgets = sortWidgetsByHierarchy(page.widgets);
  sortedWidgets.forEach(w => drawWidget(w));

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

  // 检查当前拖动控件是否有父控件，如果有则将辅助线添加到父控件内（会被 clip-path 裁剪）
  let parentWidget = null;
  let parentEl = null;
  if (snapLinesWidgetId) {
    const w = AppState.getWidget(snapLinesWidgetId);
    if (w && w.parentId) {
      parentWidget = AppState.getWidget(w.parentId);
      if (parentWidget) {
        parentEl = canvas.querySelector(`[data-id="${w.parentId}"]`);
      }
    }
  }

  snapLines.forEach(line => {
    const el = document.createElement('div');
    el.className = 'snap-line';

    if (parentWidget) {
      // 子控件的辅助线：限制在父控件可见区域内
      // computeSnap 返回的 line.value 已经是相对父控件的坐标
      if (line.axis === 'x') {
        // 垂直虚线
        const relX = line.value * z;
        const top = 0;
        const height = parentWidget.height * z;
        el.style.cssText = `position:absolute;left:${relX}px;top:${top}px;width:0;height:${height}px;border-left:1px dashed #00e5ff;pointer-events:none;z-index:9999;opacity:0.8;`;
      } else {
        // 水平虚线
        const relY = line.value * z;
        const left = 0;
        const width = parentWidget.width * z;
        el.style.cssText = `position:absolute;top:${relY}px;left:${left}px;height:0;width:${width}px;border-top:1px dashed #00e5ff;pointer-events:none;z-index:9999;opacity:0.8;`;
      }
      // 添加到父控件元素内，这样会受父控件的 clip-path 裁剪
      if (parentEl) {
        parentEl.appendChild(el);
        return;
      }
    }

    // 默认：添加到画布，全页面范围
    if (line.axis === 'x') {
      el.style.cssText = `position:absolute;left:${line.value * z}px;top:0;width:0;height:${page.height * z}px;border-left:1px dashed #00e5ff;pointer-events:none;z-index:9999;opacity:0.8;`;
    } else {
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

    // 如果拖动的是子控件，只与同属一个父控件的其他子控件对齐
    if (dragWidget.parentId) {
      if (w.parentId !== dragWidget.parentId) return;
    } else {
      // 如果拖动的是根控件，只与其他根控件对齐
      if (w.parentId) return;
    }

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

// 按层级组排序：父控件和子控件作为整体，组之间按 zOrder 排序，组内按深度（父在前，子在后）
function sortWidgetsByHierarchy(widgets) {
  const widgetMap = new Map();
  widgets.forEach(w => widgetMap.set(w.id, w));

  // 计算每个控件的根祖先（组标识）
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
    // 先按组排序（组 zOrder）
    if (zA !== zB) return zA - zB;
    // 同组内按深度排序（父在前，子在后）
    return depthMap.get(a.id) - depthMap.get(b.id);
  });
}

// 计算控件的绝对位置（考虑父对象）
function getWidgetAbsPos(w, page) {
  let absX = w.x;
  let absY = w.y;
  let parentId = w.parentId;
  while (parentId) {
    const parent = page.widgets.find(pw => pw.id === parentId);
    if (!parent) break;
    absX += parent.x;
    absY += parent.y;
    parentId = parent.parentId;
  }
  return { x: absX, y: absY };
}

// 获取所有子控件（包括嵌套）
function getChildWidgets(wId, page) {
  const children = [];
  page.widgets.forEach(w => {
    if (w.parentId === wId) {
      children.push(w);
    }
  });
  return children;
}

function drawWidget(w, parentEl) {
  const page = AppState.getCurrentPage();
  if (!page) return;

  // 计算绝对位置
  const absPos = getWidgetAbsPos(w, page);
  const z = AppState.zoom;

  const el = document.createElement('div');
  el.className = 'canvas-widget';
  el.dataset.id = w.id;
  el.style.left = (absPos.x * z) + 'px';
  el.style.top = (absPos.y * z) + 'px';
  el.style.boxSizing = 'border-box';
  el.style.position = 'absolute';
  el.style.cursor = 'move';
  el.style.overflow = 'visible'; // 父控件需要 overflow:visible 以显示子控件
  el.style.transition = 'border-color 0.1s';

  // Circle 控件：圆的大小由 radius 决定，半径 = radius，直径 = radius * 2
  // 如果 radius 未设置（undefined）或为 0，使用 min(width, height) 作为直径
  if (w.type === 'circle') {
    const circleDiameter = (w.radius != null && w.radius > 0) ? w.radius * 2 : Math.min(w.width, w.height);
    el.style.width = (circleDiameter * z) + 'px';
    el.style.height = (circleDiameter * z) + 'px';
  } else if (w.type === 'ring') {
    // Ring 控件：圆环大小由 radiusOut 决定，直径 = radiusOut * 2
    const ringDiameter = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut * 2 : Math.min(w.width, w.height);
    el.style.width = (ringDiameter * z) + 'px';
    el.style.height = (ringDiameter * z) + 'px';
  } else if (w.type === 'arc') {
    // Arc 控件：元素尺寸使用 widget 的宽高，圆弧居中绘制
    el.style.width = (w.width * z) + 'px';
    el.style.height = (w.height * z) + 'px';
  } else {
    el.style.width = (w.width * z) + 'px';
    el.style.height = (w.height * z) + 'px';
  }

  // 选中状态：子控件和父控件的选中样式不同
  const isLocked = w.locked;
  if (AppState.selectedWidgetIds.has(w.id)) {
    if (w.parentId) {
      // 子控件选中：用绿色虚线区别于父控件
      el.classList.add('child-selected');
    } else {
      el.classList.add('selected');
    }
  }
  if (isLocked) {
    el.classList.add('locked-widget');
    // 锁定图标覆盖
    const lockIcon = document.createElement('div');
    lockIcon.style.cssText = 'position:absolute;top:4px;right:4px;width:16px;height:16px;background:rgba(0,0,0,0.5);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;pointer-events:none;z-index:10;';
    lockIcon.textContent = '🔒';
    el.appendChild(lockIcon);
  }

  // 如果有父对象且未被选中，添加子控件视觉标识（用outline避免影响border渲染），并裁剪超出父区域的部分
  // 选中的子控件优先显示选中框，不显示子控件虚线
  if (w.parentId) {
    if (!AppState.selectedWidgetIds.has(w.id)) {
      el.style.outline = '1px dashed rgba(139, 92, 246, 0.5)';
      el.style.outlineOffset = '0px';
    }
    const parent = page.widgets.find(p => p.id === w.parentId);
    if (parent) {
      // 计算裁剪：子控件超出父区域的部分不可见
      const clipTop = w.y < 0 ? (-w.y) : 0;
      const clipLeft = w.x < 0 ? (-w.x) : 0;
      const clipRight = (w.x + w.width) > parent.width ? (w.x + w.width - parent.width) : 0;
      const clipBottom = (w.y + w.height) > parent.height ? (w.y + w.height - parent.height) : 0;
      if (clipTop > 0 || clipLeft > 0 || clipRight > 0 || clipBottom > 0) {
        el.style.clipPath = `inset(${clipTop * z}px ${clipRight * z}px ${clipBottom * z}px ${clipLeft * z}px)`;
      }
      // 如果子控件完全在父控件可视区域外，在父控件边缘显示指示器
      const completelyOutside = (w.x + w.width <= 0 || w.y + w.height <= 0 || w.x >= parent.width || w.y >= parent.height);
      if (completelyOutside) {
        const parentEl = canvas.querySelector(`[data-id="${w.parentId}"]`);
        if (parentEl) {
          // 计算指示器位置：在父控件边缘，指向子控件方向
          const childCenterX = w.x + w.width / 2;
          const childCenterY = w.y + w.height / 2;
          const parentCenterX = parent.width / 2;
          const parentCenterY = parent.height / 2;
          // 指示器放在父控件边缘
          let indicatorX, indicatorY, arrow;
          if (childCenterX < 0) { indicatorX = 0; arrow = '◀'; }
          else if (childCenterX > parent.width) { indicatorX = parent.width - 16; arrow = '▶'; }
          else { indicatorX = childCenterX - 8; arrow = ''; }
          if (childCenterY < 0) { indicatorY = 0; arrow = '▲'; }
          else if (childCenterY > parent.height) { indicatorY = parent.height - 16; arrow = '▼'; }
          else { indicatorY = childCenterY - 8; if (!arrow) arrow = '●'; }
          // 限制在父控件范围内
          indicatorX = Math.max(0, Math.min(indicatorX, parent.width - 16));
          indicatorY = Math.max(0, Math.min(indicatorY, parent.height - 16));
          const indicator = document.createElement('div');
          indicator.className = 'offscreen-child-indicator';
          indicator.dataset.childId = w.id;
          indicator.style.cssText = `position:absolute;left:${indicatorX * z}px;top:${indicatorY * z}px;width:${16 * z}px;height:${16 * z}px;display:flex;align-items:center;justify-content:center;font-size:${10 * z}px;background:rgba(139,92,246,0.7);color:#fff;border-radius:3px;cursor:pointer;z-index:100;pointer-events:auto;`;
          indicator.textContent = arrow;
          indicator.title = `子控件 "${w.name || w.type}" 在可视区域外，点击移回`;
          indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            // 将子控件移回父控件可视区域中心
            const newX = Math.max(0, Math.min((parent.width - w.width) / 2, parent.width - w.width));
            const newY = Math.max(0, Math.min((parent.height - w.height) / 2, parent.height - w.height));
            AppState.updateWidget(w.id, { x: Math.round(newX), y: Math.round(newY) });
            AppState.selectWidget(w.id);
          });
          parentEl.appendChild(indicator);
        }
      }
    }
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
      const borderAlphaVal = p('borderAlpha', 255);
      const borderColor = p('borderColor', '#000000');
      const borderWidth = p('borderWidth', 2) * z;
      // 边框透明度需要用 rgba 格式实现
      if (borderAlphaVal < 255 && borderColor && borderColor !== 'transparent') {
        const hex2rgba = (hex, alpha) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        el.style.border = `${borderWidth}px solid ${hex2rgba(borderColor, borderAlphaVal / 255)}`;
      } else {
        el.style.border = `${borderWidth}px solid ${borderColor}`;
      }
      const radius = p('radius', 0) * z;
      el.style.borderRadius = radius + 'px';
      const rectCol = p('color', '#FFFFFF');
      const mainAlphaVal = p('mainAlpha', 255);
      const mainAlphaCss = mainAlphaVal < 255 ? (mainAlphaVal / 255) : 1;

      // 处理图片（pixmap）——value 存的是图片路径
      const pixmap = p('pixmap', '');
      if (pixmap) {
        let imgPath = pixmap;
        if (imgPath && !imgPath.startsWith('file://') && !imgPath.startsWith('http')) {
          imgPath = 'file:///' + imgPath.replace(/\\/g, '/');
        }
        const imgEl = document.createElement('div');
        imgEl.style.cssText = `position:absolute;inset:0;background-image:url('${imgPath}');background-size:cover;background-position:center;border-radius:${radius}px;opacity:${mainAlphaCss};`;
        el.appendChild(imgEl);
      } else if (rectCol && rectCol !== 'transparent') {
        // SGL: color 是填充色，直接设置为背景，支持透明度
        if (mainAlphaVal < 255) {
          const hex2rgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          el.style.background = hex2rgba(rectCol, mainAlphaCss);
        } else {
          el.style.background = rectCol;
        }
      } else {
        el.style.background = 'transparent';
      }
      break;
    }

    case 'circle': {
      const circleCol = p('color', '#FFFFFF');
      const borderW = p('borderWidth', 2) * z;
      const borderC = p('borderColor', '#000000');
      el.style.borderRadius = '50%';
      // SGL: color 是填充色，border 是描边
      if (circleCol && circleCol !== 'transparent') {
        if (alphaCss < 1) {
          const hex2rgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          el.style.background = hex2rgba(circleCol, alphaCss);
        } else {
          el.style.background = circleCol;
        }
      } else {
        el.style.background = 'transparent';
      }
      el.style.border = `${borderW}px solid ${borderC}`;
      const xOff = p('xOffset', 0) * z;
      const yOff = p('yOffset', 0) * z;
      if (xOff || yOff) {
        el.style.transform = `translate(${xOff}px, ${yOff}px)`;
      }
      // 处理图片（pixmap）
      const pixmap = p('pixmap', '');
      if (pixmap) {
        let imgPath = pixmap;
        if (imgPath && !imgPath.startsWith('file://') && !imgPath.startsWith('http')) {
          imgPath = 'file:///' + imgPath.replace(/\\/g, '/');
        }
        const imgEl = document.createElement('div');
        imgEl.style.cssText = `position:absolute;inset:0;background-image:url('${imgPath}');background-size:cover;background-position:center;border-radius:50%;`;
        el.appendChild(imgEl);
      }
      break;
    }

    case 'line': {
      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.borderRadius = '0';
      el.style.opacity = alphaCss;
      const lineEl = document.createElement('div');
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
      // 斜线的实际长度（勾股定理）
      const lineLen = Math.sqrt(Math.pow(relX2 - relX1, 2) + Math.pow(relY2 - relY1, 2));
      const minX = Math.min(relX1, relX2);
      const minY = Math.min(relY1, relY2);
      
      // 使用斜线的实际长度作为宽度
      lineEl.style.cssText = `position:absolute;left:${minX * z}px;top:${minY * z}px;width:${Math.max(lineLen * z, 1)}px;height:${lineH}px;background:${lineCol};border-radius:${lineH / 2}px;transform-origin:left top;`;
      
      // 如果是斜线，使用旋转
      if (relY1 !== relY2 && Math.abs(relX2 - relX1) > 0) {
        const angle = Math.atan2(relY2 - relY1, relX2 - relX1) * 180 / Math.PI;
        lineEl.style.transform = `rotate(${angle}deg)`;
      }
      
      if (p('dashed', false)) {
        const dLen = p('dashLen', 10);
        const gLen = p('gapLen', 5);
        lineEl.style.background = `repeating-linear-gradient(90deg, ${lineCol} 0, ${lineCol} ${dLen * z}px, transparent ${dLen * z}px, transparent ${(dLen + gLen) * z}px)`;
      }
      el.appendChild(lineEl);
      break;
    }

    case 'ring': {
      // SGL ring: width = ring 宽度，radius_out = min(w, h) / 2，radius_in = radius_out - width
      const ringColor = p('color', '#FFFFFF');
      // 外径由控件宽高决定
      const radiusOutVal = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut : Math.min(w.width, w.height) / 2;
      // 内径 = 外径 - width (默认 width = 2)
      const ringWidth = (w.radiusOut != null && w.radiusIn != null) ? (w.radiusOut - w.radiusIn) : 2;
      const ringW = ringWidth * z;
      // 元素尺寸：外径 * 2（如果用户显式设置了 radiusOut，使用该值；否则使用控件宽高）
      if (w.radiusOut != null && w.radiusOut > 0) {
        el.style.width = (w.radiusOut * 2 * z) + 'px';
        el.style.height = (w.radiusOut * 2 * z) + 'px';
      }
      el.style.background = 'transparent';
      if (ringColor && ringColor !== 'transparent') {
        if (alphaCss < 1) {
          const hex2rgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          el.style.border = `${ringW}px solid ${hex2rgba(ringColor, alphaCss)}`;
        } else {
          el.style.border = `${ringW}px solid ${ringColor}`;
        }
      } else {
        el.style.border = `${ringW}px solid transparent`;
      }
      el.style.borderRadius = '50%';
      break;
    }

    case 'arc': {
      let arcRadiusInVal, arcRadiusOutVal;
      const arcDiameter = Math.min(w.width, w.height);
      // SGL: radius_out=-1 表示自动计算为 width/2，radius_in=-1 表示 radius_out - 2
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
      const arcMode = Number(p('mode', 0));
      const startAngle = Number(p('startAngle', 0));
      const endAngle = Number(p('endAngle', 360));
      // SGL: color = SGL_THEME_BG_COLOR (黑色)，bg_color = SGL_THEME_COLOR (白色)
      const arcColor = p('color', '#000000');
      const bgColor = p('bgColor', '#FFFFFF');

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
      el.style.opacity = alphaCss;
      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.mask = '';
      el.style.webkitMask = '';

      // 0度=6点钟方向，顺时针为正。SVG 0度=3点钟方向，顺时针为正。
      // 转换：SVG角度 = 我们的度数 + 90
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
      el.style.background = p('fillColor', '#8b5cf6');
      el.style.border = `${p('borderWidth', 2) * z}px solid ${p('borderColor', '#7c3aed')}`;
      el.style.opacity = alphaCss;
      el.style.clipPath = 'none';
      
      const vertices = p('vertices', '0,0;50,100;100,0');
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
      
      const text = p('text', '');
      if (text) {
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        textSpan.style.cssText = `
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          color:${p('textColor', '#ffffff')};
          font-size:${(p('fontSize', 14) * z)}px;
          font-family:${getCssFontStack(p('fontFamily', 'simsun.ttc'))};
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

// 收集控件的所有后代ID（包括直接子控件和嵌套子控件）
function getAllDescendantIds(wId, page) {
  const descendants = [];
  const stack = [wId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    page.widgets.forEach(w => {
      if (w.parentId === currentId) {
        descendants.push(w.id);
        stack.push(w.id);
      }
    });
  }
  return descendants;
}

// 鼠标事件
document.addEventListener('mousemove', (e) => {
  if (isDragging && AppState.selectedWidgetIds.size > 0) {
    const dx = (e.clientX - dragStart.x) / AppState.zoom;
    const dy = (e.clientY - dragStart.y) / AppState.zoom;

    // 多选拖动：移动所有选中控件及其后代
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
        snapLinesWidgetId = w.id; // 记录辅助线对应的控件
        const sdx = dx + snap.snapX;
        const sdy = dy + snap.snapY;

        dragStart.widgetPositions.forEach(pos => {
          const ww = AppState.getWidget(pos.id);
          if (ww && !ww.locked) {
            let newX = pos.x + sdx;
            let newY = pos.y + sdy;
            // 如果有父控件，允许自由坐标（子控件可以超出父控件区域，超出部分由clip-path裁剪）
            const page = AppState.getCurrentPage();
            if (page && ww.parentId) {
              // 不限制坐标范围，超出父控件区域的部分由渲染时的 clip-path 自动裁剪
            }
            AppState.moveWidget(pos.id, newX, newY);
            // 子控件不需要显式移动：它们的相对位置不变，
            // 渲染时 getWidgetAbsPos 会自动加上父控件的位移，视觉上自然跟随
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
    snapLinesWidgetId = null;
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
  html += `<div class="form-row" style="margin-bottom:8px;"><div class="form-group"><label class="form-label">宽度</label><input type="number" class="form-input" data-prop="width" value="${w.width}" min="20" /></div><div class="form-group"><label class="form-label">高度</label><input type="number" class="form-input" data-prop="height" value="${w.height}" min="20" /></div></div>`;

  // 父对象选择器：空选项 = 当前页面
  const currentPage = AppState.project.pages.find(p => p.id === AppState.currentPageId);
  const pageName = currentPage ? currentPage.name : '页面';
  const siblings = currentPage ? currentPage.widgets.filter(w2 => w2.id !== w.id) : [];
  html += `<div class="form-group"><label class="form-label">📦 父对象</label>`;
  html += `<select class="form-select" data-prop="parentId">`;
  html += `<option value="">📄 ${pageName}（顶级）</option>`;
  siblings.forEach(s => {
    html += `<option value="${s.id}" ${w.parentId === s.id ? 'selected' : ''}>${s.id} (${s.type})</option>`;
  });
  html += `</select></div>`;

  // 锁定控件开关（在最上面，位置与尺寸之后）
  const hasLocked = propList.includes('locked');
  if (hasLocked) {
    html += `<div class="form-group" style="margin-bottom:10px;"><label class="form-label">🔒 锁定控件</label><div class="switch-input ${w.locked ? 'on' : ''}" data-prop="locked" data-bool="1" style="cursor:pointer;"></div></div>`;
  }

  // 根据 properties 列表 + PROP_META 动态渲染属性（跳过 locked，已在上面显示）
  let inFontSection = false;
  let inEventSection = false;
  
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

    // 虚线长度和间隔：只在虚线模式下显示
    if ((prop === 'dashLen' || prop === 'gapLen') && !w.dashed) {
      return;
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
        // 字体选择：只显示项目资源中的字体
        const projectFonts = (AppState.project.resources && AppState.project.resources.fonts) || [];
        const currentVal = rawVal || '';
        html += `<div class="form-group"><label class="form-label">${label}</label>`;
        html += `<select class="form-select" data-prop="fontFamily">`;
        html += `<option value="">无</option>`;
        if (projectFonts.length > 0) {
          html += `<optgroup label="项目字体">`;
          projectFonts.forEach(f => {
            html += `<option value="${escapeAttr(f.path)}" ${currentVal === f.path ? 'selected' : ''}>${escapeHtml(f.name)}</option>`;
          });
          html += `</optgroup>`;
        }
        html += `</select></div>`;
      } else if (prop === 'pixmap') {
        // 图片选择：项目资源图片列表
        const projectImages = (AppState.project.resources && AppState.project.resources.images) || [];
        const currentVal = rawVal || '';
        html += `<div class="form-group"><label class="form-label">${label}</label>`;
        html += `<select class="form-select" data-prop="pixmap">`;
        html += `<option value="">无</option>`;
        if (projectImages.length > 0) {
          html += `<optgroup label="项目图片">`;
          projectImages.forEach(img => {
            html += `<option value="${escapeAttr(img.path)}" ${currentVal === img.path ? 'selected' : ''}>${escapeHtml(img.name)}</option>`;
          });
          html += `</optgroup>`;
        }
        if (currentVal && !projectImages.some(img => img.path === currentVal)) {
          html += `<option value="${escapeAttr(currentVal)}" selected>${escapeHtml(currentVal)}</option>`;
        }
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
      // number - 坐标对并排显示（x1+y1, x2+y2）
      if ((prop === 'x1' || prop === 'x2') && propList.includes(prop)) {
        const pairProp = prop === 'x1' ? 'y1' : 'y2';
        const pairMeta = PROP_META[pairProp];
        const minStr = meta.min != null ? ` min="${meta.min}"` : '';
        const maxStr = meta.max != null ? ` max="${meta.max}"` : '';
        const pairMinStr = pairMeta.min != null ? ` min="${pairMeta.min}"` : '';
        const pairMaxStr = pairMeta.max != null ? ` max="${pairMeta.max}"` : '';
        // line 控件：x1/y1 显示当前控件位置，x2/y2 显示当前终点坐标
        let xVal, yVal;
        if (w.type === 'line') {
          if (prop === 'x1') {
            xVal = w.x1 != null ? w.x1 : w.x;
            yVal = w.y1 != null ? w.y1 : w.y;
          } else {
            xVal = w.x2 != null ? w.x2 : (w.x + w.width);
            yVal = w.y2 != null ? w.y2 : (w.y + w.height);
          }
        } else {
          xVal = rawVal != null ? rawVal : 0;
          yVal = w[pairProp] != null ? w[pairProp] : 0;
        }
        
        html += `<div class="form-group" style="display:flex;flex-direction:column;">`;
        html += `<div style="display:flex;gap:8px;">`;
        html += `<div style="flex:1;display:flex;flex-direction:column;gap:2px;">`;
        html += `<label style="font-size:10px;color:#94a3b8;">${prop === 'x1' ? 'X1' : 'X2'}</label>`;
        html += `<input type="number" class="form-input" data-prop="${prop}" value="${xVal}"${minStr}${maxStr} placeholder="${label}" />`;
        html += `</div>`;
        html += `<div style="flex:1;display:flex;flex-direction:column;gap:2px;">`;
        html += `<label style="font-size:10px;color:#94a3b8;">${prop === 'x1' ? 'Y1' : 'Y2'}</label>`;
        html += `<input type="number" class="form-input" data-prop="${pairProp}" value="${yVal}"${pairMinStr}${pairMaxStr} placeholder="${pairMeta.label}" />`;
        html += `</div>`;
        html += `</div></div>`;
      } else if (prop === 'y1' || prop === 'y2') {
        // y1 和 y2 已经在 x1/x2 的并排显示中处理过了，跳过单独显示
      } else {
        const minStr = meta.min != null ? ` min="${meta.min}"` : '';
        const maxStr = meta.max != null ? ` max="${meta.max}"` : '';
        html += `<div class="form-group"><label class="form-label">${label}</label><input type="number" class="form-input" data-prop="${prop}" value="${rawVal != null ? rawVal : 0}"${minStr}${maxStr} /></div>`;
      }
    }
  });

  // 动态添加事件属性（可添加/删除的事件列表）
  const supportedEvents = WIDGET_EVENTS[w.type] || [];
  if (supportedEvents.length > 0) {
    html += `<div class="form-group" style="margin-top:10px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;">`;
    html += `<label class="form-label" style="font-weight:600;color:#22d3ee;font-size:12px;margin:0;">⚡ 事件绑定</label>`;
    html += `<button type="button" id="add-event-btn" style="background:#22d3ee22;color:#22d3ee;border:1px solid #22d3ee44;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">+ 添加事件</button>`;
    html += `</div>`;

    const events = w.events || [];
    events.forEach((evt, idx) => {
      html += `<div class="form-group event-item" style="display:flex;gap:4px;align-items:center;">`;
      // 事件类型下拉
      html += `<select class="form-select event-type-select" data-event-idx="${idx}" style="flex:1;font-size:11px;padding:4px 6px;">`;
      supportedEvents.forEach(ep => {
        const meta = PROP_META[ep];
        if (!meta) return;
        html += `<option value="${ep}" ${evt.type === ep ? 'selected' : ''}>${meta.label}</option>`;
      });
      html += `</select>`;
      // 回调函数名输入
      html += `<input type="text" class="form-input event-cb-input" data-event-idx="${idx}" placeholder="回调函数名" value="${escapeAttr(evt.callback || '')}" style="flex:1;font-size:11px;padding:4px 6px;" />`;
      // 删除按钮
      html += `<button type="button" class="remove-event-btn" data-event-idx="${idx}" style="background:none;color:#ef4444;border:none;cursor:pointer;font-size:14px;padding:2px 4px;">✕</button>`;
      html += `</div>`;
    });

    if (events.length === 0) {
      html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 0;">点击"添加事件"为控件绑定事件回调</div>`;
    }
  }

  widgetPropContent.innerHTML = html;

  // 绑定事件添加/删除/修改
  const addEventBtn = document.getElementById('add-event-btn');
  if (addEventBtn) {
    addEventBtn.addEventListener('click', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const supportedEvts = WIDGET_EVENTS[wgt.type] || [];
      const newEvents = [...(wgt.events || []), { type: supportedEvts[0] || 'onPressed', callback: '' }];
      AppState.updateWidget(AppState.selectedWidgetId, { events: newEvents });
    });
  }

  widgetPropContent.querySelectorAll('.remove-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const idx = parseInt(btn.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents.splice(idx, 1);
      AppState.updateWidget(AppState.selectedWidgetId, { events: newEvents });
    });
  });

  widgetPropContent.querySelectorAll('.event-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const idx = parseInt(sel.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents[idx] = { ...newEvents[idx], type: sel.value };
      // 直接更新数据，不重建面板
      wgt.events = newEvents;
      AppState.save();
    });
  });

  widgetPropContent.querySelectorAll('.event-cb-input').forEach(input => {
    input.addEventListener('input', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const idx = parseInt(input.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents[idx] = { ...newEvents[idx], callback: input.value };
      // 直接更新数据，不重建面板
      wgt.events = newEvents;
      AppState.save();
    });
    input.addEventListener('blur', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const idx = parseInt(input.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents[idx] = { ...newEvents[idx], callback: input.value };
      AppState.updateWidget(AppState.selectedWidgetId, { events: newEvents });
    });
  });

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

    // parentId 不需要 input 事件（由 change 事件处理），其他属性绑定 input 事件
    if (prop !== 'parentId') {
      input.addEventListener('input', () => {
        let val;
        if (input.type === 'number') val = parseFloat(input.value) || 0;
        else if (input.type === 'select-one') {
          const strVal = input.value;
          if (strVal === 'true') val = true;
          else if (strVal === 'false') val = false;
          else val = strVal;
        }
        else val = input.value;

        // 直接更新控件数据，不触发属性面板重建（避免输入框丢失焦点）
        const w = AppState.getWidget(AppState.selectedWidgetId);
        if (w) {
          w[prop] = val;
          
          // 当修改 alpha 属性时，同时更新 borderAlpha 和 mainAlpha
          if (prop === 'alpha' && w.type === 'rect') {
            w.borderAlpha = val;
            w.mainAlpha = val;
          }
          
          // Circle 控件：宽高同步修改，并根据 radius 更新圆的实际大小
          if (w.type === 'circle' && (prop === 'width' || prop === 'height')) {
            const newVal = Math.max(20, Math.round(parseFloat(input.value) || 20));
            if (w.radius != null && w.radius > 0) {
              // radius > 0 时，圆的大小由 radius 决定，width/height 跟随 radius * 2
              w.radius = Math.round(newVal / 2);
              w.width = newVal;
              w.height = newVal;
            } else {
              // radius = 0 时，使用 min(width, height) 作为直径，保持宽高相等
              w.width = newVal;
              w.height = newVal;
            }
          }

          // Ring 控件：宽高同步修改
          if (w.type === 'ring' && (prop === 'width' || prop === 'height')) {
            const newVal = Math.max(20, Math.round(parseFloat(input.value) || 20));
            const newRadiusOut = Math.round(newVal / 2);
            const ringWidth = (w.radiusOut || 30) - (w.radiusIn || 28);
            w.radiusOut = newRadiusOut;
            w.radiusIn = Math.max(0, newRadiusOut - ringWidth);
            w.width = newVal;
            w.height = newVal;
          }

          // Ring 控件：修改外半径时的联动逻辑（只更新值，联动检查在 blur 事件中执行）
          if (w.type === 'ring' && prop === 'radiusOut') {
            const newRadiusOut = Math.max(1, Math.round(parseFloat(input.value) || 30));
            w.radiusOut = newRadiusOut;
            w.width = newRadiusOut * 2;
            w.height = newRadiusOut * 2;
          }

          // Ring 控件：修改内半径时，外半径保持不变（内半径必须小于外半径）
          if (w.type === 'ring' && prop === 'radiusIn') {
            const maxRadiusIn = (w.radiusOut || Math.round(Math.min(w.width, w.height) / 2)) - 1;
            const newRadiusIn = Math.max(0, Math.min(maxRadiusIn, Math.round(parseFloat(input.value) || 28)));
            w.radiusIn = newRadiusIn;
          }

          // Arc 控件：宽高同步修改
          if (w.type === 'arc' && (prop === 'width' || prop === 'height')) {
            const newVal = Math.max(20, Math.round(parseFloat(input.value) || 20));
            const newRadiusOut = Math.round(newVal / 2);
            const arcWidth = (w.radiusOut || 30) - (w.radiusIn || 28);
            w.radiusOut = newRadiusOut;
            w.radiusIn = Math.max(0, newRadiusOut - arcWidth);
            w.width = newVal;
            w.height = newVal;
          }

          // Arc 控件：修改外半径时的联动逻辑
          if (w.type === 'arc' && prop === 'radiusOut') {
            const newRadiusOut = Math.max(1, Math.round(parseFloat(input.value) || 30));
            const arcWidth = (w.radiusOut || 30) - (w.radiusIn || 28);
            w.radiusOut = newRadiusOut;
            w.radiusIn = Math.max(0, newRadiusOut - arcWidth);
            w.width = newRadiusOut * 2;
            w.height = newRadiusOut * 2;
          }

          // Arc 控件：修改内半径时，外半径保持不变（内半径必须小于外半径）
          if (w.type === 'arc' && prop === 'radiusIn') {
            const maxRadiusIn = (w.radiusOut || Math.round(Math.min(w.width, w.height) / 2)) - 1;
            const newRadiusIn = Math.max(0, Math.min(maxRadiusIn, Math.round(parseFloat(input.value) || 28)));
            w.radiusIn = newRadiusIn;
          }

          // Line 控件：修改线宽后同步控件尺寸
          if (w.type === 'line' && prop === 'lineWidth') {
            AppState.syncLineBounds(w);
          }

          // Line 控件：x1/y1 就是控件位置，x2/y2 决定控件宽高
          if (w.type === 'line' && (prop === 'x1' || prop === 'y1' || prop === 'x2' || prop === 'y2')) {
            const curX1 = w.x1 != null ? w.x1 : w.x;
            const curY1 = w.y1 != null ? w.y1 : w.y;
            const newX1 = prop === 'x1' ? val : curX1;
            const newY1 = prop === 'y1' ? val : curY1;
            const newX2 = prop === 'x2' ? val : (w.x2 != null ? w.x2 : w.x + w.width);
            const newY2 = prop === 'y2' ? val : (w.y2 != null ? w.y2 : w.y + w.height);
            // x1/y1 同步更新控件位置
            w.x1 = newX1;
            w.y1 = newY1;
            w.x = newX1;
            w.y = newY1;
            // x2/y2 同步更新控件宽高（直线时宽高等于线宽）
            w.x2 = newX2;
            w.y2 = newY2;
            AppState.syncLineBounds(w);
            // 同步更新属性面板中的 x/y/width/height 输入框
            const xInput = widgetPropContent.querySelector('[data-prop="x"]');
            const yInput = widgetPropContent.querySelector('[data-prop="y"]');
            const widthInput = widgetPropContent.querySelector('[data-prop="width"]');
            const heightInput = widgetPropContent.querySelector('[data-prop="height"]');
            if (xInput) xInput.value = w.x;
            if (yInput) yInput.value = w.y;
            if (widthInput) widthInput.value = w.width;
            if (heightInput) heightInput.value = w.height;
          }

          // Line 控件：修改 x/y/width/height 时同步更新 x1/y1/x2/y2
          if (w.type === 'line' && (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height')) {
            if (prop === 'x' || prop === 'y') {
              if (w.x1 != null) w.x1 = w.x;
              if (w.y1 != null) w.y1 = w.y;
            }
            if (prop === 'width' || prop === 'height' || prop === 'x' || prop === 'y') {
              if (w.x2 != null) w.x2 = w.x + w.width;
              if (w.y2 != null) w.y2 = w.y + w.height;
            }
            AppState.syncLineBounds(w);
            // 同步更新属性面板中的 X1/Y1/X2/Y2 输入框
            const x1Input = widgetPropContent.querySelector('[data-prop="x1"]');
            const y1Input = widgetPropContent.querySelector('[data-prop="y1"]');
            const x2Input = widgetPropContent.querySelector('[data-prop="x2"]');
            const y2Input = widgetPropContent.querySelector('[data-prop="y2"]');
            const widthInput2 = widgetPropContent.querySelector('[data-prop="width"]');
            const heightInput2 = widgetPropContent.querySelector('[data-prop="height"]');
            if (x1Input) x1Input.value = w.x1 != null ? w.x1 : w.x;
            if (y1Input) y1Input.value = w.y1 != null ? w.y1 : w.y;
            if (x2Input) x2Input.value = w.x2 != null ? w.x2 : w.x + w.width;
            if (y2Input) y2Input.value = w.y2 != null ? w.y2 : w.y + w.height;
            if (widthInput2) widthInput2.value = w.width;
            if (heightInput2) heightInput2.value = w.height;
          }

          // 只刷新画布和图层，不重建属性面板
          renderCanvas();
          renderLayerList();
          renderStatus();
          AppState.save();
          
          // 如果是 dashed 属性变化，需要重新渲染属性面板以显示/隐藏虚线参数
          if (prop === 'dashed') {
            renderWidgetProps();
          }
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

      // 失焦时完整刷新（同步最终值）- parentId 由 change 事件处理，跳过
      input.addEventListener('blur', () => {
        let val;
        if (input.type === 'number') val = parseFloat(input.value) || 0;
        else if (input.type === 'select-one') {
          const strVal = input.value;
          if (strVal === 'true') val = true;
          else if (strVal === 'false') val = false;
          else val = strVal;
        }
        else val = input.value;
        
        // 当修改 alpha 属性时，同时更新 borderAlpha 和 mainAlpha
        if (prop === 'alpha') {
          const w = AppState.getWidget(AppState.selectedWidgetId);
          if (w && w.type === 'rect') {
            AppState.updateWidget(AppState.selectedWidgetId, { alpha: val, borderAlpha: val, mainAlpha: val });
            return;
          }
        }
        
        // Ring 控件：修改外半径后，检查并确保内半径小于外半径
        if (prop === 'radiusOut') {
          const w = AppState.getWidget(AppState.selectedWidgetId);
          if (w && w.type === 'ring') {
            const newRadiusOut = Math.max(1, Math.round(val));
            let updates = { radiusOut: newRadiusOut };
            // 确保内半径小于外半径
            if (w.radiusIn != null && w.radiusIn >= newRadiusOut) {
              updates.radiusIn = newRadiusOut - 1;
            }
            updates.width = newRadiusOut * 2;
            updates.height = newRadiusOut * 2;
            AppState.updateWidget(AppState.selectedWidgetId, updates);
            return;
          }
        }
        
        AppState.updateWidget(AppState.selectedWidgetId, { [prop]: val });
      });
    }

    // select 用 change
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', async () => {
        let val = input.value;
        // 布尔值转换
        if (val === 'true') val = true;
        else if (val === 'false') val = false;

        // parentId 变更：转换位置（绝对 ↔ 相对），并约束子控件在父控件区域内
        if (prop === 'parentId') {
          const w = AppState.getWidget(AppState.selectedWidgetId);
          const page = AppState.getCurrentPage();
          if (w && page) {
            if (val && val !== '') {
              // 设置父对象：将当前绝对位置转换为相对于新父对象的相对位置
              const parent = page.widgets.find(p => p.id === val);
              if (parent) {
                const parentAbs = getWidgetAbsPos(parent, page);
                // 新相对位置 = 当前绝对位置 - 父对象绝对位置
                let relX = w.x - parentAbs.x;
                let relY = w.y - parentAbs.y;
                // 子控件继承父控件的 zOrder，确保作为同一层级组
                const newZOrder = (parent.zOrder != null ? parent.zOrder : 0);
                AppState.updateWidget(AppState.selectedWidgetId, { parentId: val, x: relX, y: relY, zOrder: newZOrder });
              }
            } else {
              // 移除父对象：将相对位置转换为绝对位置
              if (w.parentId) {
                const oldParent = page.widgets.find(p => p.id === w.parentId);
                if (oldParent) {
                  const parentAbs = getWidgetAbsPos(oldParent, page);
                  // 新绝对位置 = 当前相对位置 + 父对象绝对位置
                  const absX = w.x + parentAbs.x;
                  const absY = w.y + parentAbs.y;
                  AppState.updateWidget(AppState.selectedWidgetId, { parentId: '', x: absX, y: absY });
                } else {
                  AppState.updateWidget(AppState.selectedWidgetId, { parentId: '' });
                }
              }
            }
          }
          renderCanvas();
          renderLayerList();
          renderStatus();
          AppState.save();
          return;
        }

        if (!isNaN(parseFloat(val)) && isFinite(val)) val = parseFloat(val);
        
        // dashed 切换到虚线时，确保 dashLen/gapLen 有默认值
        if (prop === 'dashed' && val === true) {
          const w = AppState.getWidget(AppState.selectedWidgetId);
          if (w) {
            if (w.dashLen == null) w.dashLen = 10;
            if (w.gapLen == null) w.gapLen = 5;
          }
        }
        
        AppState.updateWidget(AppState.selectedWidgetId, { [prop]: val });
        
        // dashed 属性变化时重新渲染属性面板（显示/隐藏虚线参数）
        if (prop === 'dashed') {
          const w = AppState.getWidget(AppState.selectedWidgetId);
          if (w) {
            renderWidgetProps(w);
          }
        }
      });
    }
  });
}

// ============ 图层列表：树形结构（页面 → 父控件 → 子控件）============
const expandedPages = new Set();
const expandedWidgets = new Set();

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

    // 控件子节点（仅当展开时显示）—— 树形结构
    if (hasWidgets && isExpanded) {
      const children = document.createElement('div');
      children.className = 'tree-children';

      // 递归渲染控件树：只渲染顶级控件（无 parentId 的），子控件嵌套在父控件下
      const widgetMap = new Map();
      page.widgets.forEach(w => widgetMap.set(w.id, w));

      function renderWidgetNode(w, container, depth) {
        const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
        const hasChildren = page.widgets.some(cw => cw.parentId === w.id);
        const isWidgetExpanded = expandedWidgets.has(w.id);

        // 每个控件节点用一个 wrapper 包裹（行 + 子节点容器）
        const nodeWrapper = document.createElement('div');
        nodeWrapper.className = 'tree-node';

        const widgetRow = document.createElement('div');
        widgetRow.className = 'tree-row tree-widget-row' + (AppState.selectedWidgetIds.has(w.id) ? ' active' : '');

        // 箭头（有子控件时显示）
        const wArrow = document.createElement('span');
        wArrow.className = 'tree-arrow' + (isWidgetExpanded ? ' open' : '');
        if (!hasChildren) wArrow.style.visibility = 'hidden';
        wArrow.textContent = '▶';
        wArrow.style.fontSize = '8px';
        wArrow.style.marginRight = '2px';
        if (hasChildren) {
          wArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            if (expandedWidgets.has(w.id)) expandedWidgets.delete(w.id);
            else expandedWidgets.add(w.id);
            renderLayerList();
          });
        }
        widgetRow.appendChild(wArrow);

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
          // 点击已选中的控件取消选中，点击未选中的控件选中
          if (AppState.selectedWidgetIds.has(w.id)) {
            AppState.selectWidget(null);
          } else {
            AppState.selectWidget(w.id, e.ctrlKey || e.metaKey);
          }
        });

        nodeWrapper.appendChild(widgetRow);

        // 渲染子控件（嵌套在当前节点的 wrapper 内）
        if (hasChildren && isWidgetExpanded) {
          const childContainer = document.createElement('div');
          childContainer.className = 'tree-children';
          page.widgets.filter(cw => cw.parentId === w.id).forEach(cw => {
            renderWidgetNode(cw, childContainer, depth + 1);
          });
          nodeWrapper.appendChild(childContainer);
        }

        container.appendChild(nodeWrapper);
      }

      // 只渲染顶级控件（parentId 为空或指向不存在的控件）
      page.widgets.filter(w => !w.parentId || !widgetMap.has(w.parentId)).forEach(w => {
        renderWidgetNode(w, children, 0);
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
  el('prop-screen-shape', AppState.project.screen_shape || 'rect');
  el('prop-color-depth', AppState.project.color_depth);

  const page = AppState.getCurrentPage();
  if (page) {
    el('prop-page-name', page.name);
    el('prop-page-bgcolor', page.bg_color || '#FFFFFF');
    el('prop-page-bgcolor-text', page.bg_color || '#FFFFFF');
    el('prop-page-alpha', (page.alpha != null && page.alpha !== undefined) ? page.alpha : 255);

    // 填充背景图片下拉框
    const pixmapSelect = document.getElementById('prop-page-pixmap');
    if (pixmapSelect) {
      const projectImages = (AppState.project.resources && AppState.project.resources.images) || [];
      const currentPixmap = page.pixmap || '';
      let optionsHtml = '<option value="">无</option>';
      if (projectImages.length > 0) {
        optionsHtml += '<optgroup label="项目图片">';
        projectImages.forEach(img => {
          optionsHtml += `<option value="${escapeAttr(img.path)}" ${currentPixmap === img.path ? 'selected' : ''}>${escapeHtml(img.name)}</option>`;
        });
        optionsHtml += '</optgroup>';
      }
      if (currentPixmap && !projectImages.some(img => img.path === currentPixmap)) {
        optionsHtml += `<option value="${escapeAttr(currentPixmap)}" selected>${escapeHtml(currentPixmap)}</option>`;
      }
      pixmapSelect.innerHTML = optionsHtml;
    }
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
document.getElementById('prop-screen-w').addEventListener('change', e => {
  const w = parseInt(e.target.value) || 480;
  AppState.updateProject({ screen_width: w });
  // 圆形时同步高度
  if (AppState.project.screen_shape === 'circle') {
    document.getElementById('prop-screen-h').value = w;
    AppState.updateProject({ screen_height: w });
  }
});
document.getElementById('prop-screen-h').addEventListener('change', e => {
  const h = parseInt(e.target.value) || 320;
  AppState.updateProject({ screen_height: h });
  // 圆形时同步宽度
  if (AppState.project.screen_shape === 'circle') {
    document.getElementById('prop-screen-w').value = h;
    AppState.updateProject({ screen_width: h });
  }
});
document.getElementById('prop-screen-shape').addEventListener('change', e => {
  AppState.project.screen_shape = e.target.value;
  // 切换为圆形时，宽度和高度自动同步为相同的值（取最大值）
  if (e.target.value === 'circle') {
    const size = Math.max(AppState.project.screen_width, AppState.project.screen_height);
    document.getElementById('prop-screen-w').value = size;
    document.getElementById('prop-screen-h').value = size;
    AppState.updateProject({ screen_width: size, screen_height: size });
  } else {
    AppState.save();
    renderCanvas();
  }
});
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
document.getElementById('prop-page-pixmap').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.pixmap = e.target.value; AppState.save(); renderCanvas(); }
});
document.getElementById('prop-page-alpha').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.alpha = parseInt(e.target.value) || 0; AppState.save(); renderCanvas(); }
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

// ============ 编译相关按钮 ============

// 确保项目已保存，返回项目路径
async function ensureProjectSaved() {
  if (!AppState.projectPath) {
    showToast('请先保存项目', 'error');
    logMessage('操作失败: 项目未保存', 'warn');
    return null;
  }
  // 自动保存
  const result = await AppState.saveProject();
  if (!result.ok) {
    showToast('保存项目失败: ' + result.msg, 'error');
    return null;
  }
  return AppState.projectPath;
}

document.getElementById('btn-export-code').addEventListener('click', async () => {
  const projectPath = await ensureProjectSaved();
  if (!projectPath) return;
  try {
    logMessage('正在导出代码...', 'info');
    const result = await invoke('export_code_to_project', { project: AppState.project, projectPath });
    showToast('代码已导出', 'success');
    logMessage(result, 'success');
  } catch (e) {
    showToast('导出失败: ' + e, 'error');
    logMessage('导出失败: ' + e, 'error');
  }
});

document.getElementById('btn-build-run').addEventListener('click', async () => {
  const projectPath = await ensureProjectSaved();
  if (!projectPath) return;
  try {
    // 先检查工具链
    const check = await invoke('check_toolchain', { projectPath });

    if (!check.gcc_found) {
      showToast('未找到 gcc，请安装 MinGW 并添加到系统 PATH', 'error');
      logMessage('运行失败: 未找到 gcc，请安装 MinGW 并将 bin 目录添加到系统环境变量 PATH 中', 'error');
      return;
    }
    if (!check.cmake_found) {
      showToast('未找到 cmake，请安装 CMake 并添加到系统 PATH', 'error');
      logMessage('运行失败: 未找到 cmake', 'error');
      return;
    }

    // 如果 sgl-port 项目不存在，先克隆
    if (!check.sgl_port_exists) {
      if (!check.git_found) {
        showToast('未找到 git，请安装 Git', 'error');
        logMessage('运行失败: 未找到 git，无法自动克隆 sgl-port 项目', 'error');
        return;
      }
      logMessage('正在克隆 sgl-port-windows-vscode 项目...', 'info');
      showToast('正在克隆 sgl-port 项目，请稍候...', 'info');
      try {
        const cloneResult = await invoke('clone_sgl_port', { projectPath });
        logMessage(cloneResult, 'success');
      } catch (e) {
        showToast('克隆失败: ' + e, 'error');
        logMessage('克隆失败: ' + e, 'error');
        return;
      }
    }

    // 编译
    logMessage('正在编译项目...', 'info');
    showToast('正在编译，请稍候...', 'info');
    const buildResult = await invoke('build_project', { project: AppState.project, projectPath });
    logMessage(buildResult, 'success');

    // 运行模拟器
    const runResult = await invoke('run_simulator', { projectPath });
    showToast(runResult, 'success');
    logMessage(runResult, 'success');
  } catch (e) {
    showToast('运行失败: ' + e, 'error');
    logMessage('运行失败: ' + e, 'error');
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
  // 方向键移动选中控件
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && AppState.selectedWidgetIds.size > 0 && !inInput) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    AppState.beginBatch();
    AppState.selectedWidgetIds.forEach(id => {
      const w = AppState.getWidget(id);
      if (w && !w.locked) {
        let nx = w.x, ny = w.y;
        if (e.key === 'ArrowUp') ny -= step;
        if (e.key === 'ArrowDown') ny += step;
        if (e.key === 'ArrowLeft') nx -= step;
        if (e.key === 'ArrowRight') nx += step;
        AppState.moveWidget(id, nx, ny);
      }
    });
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

  // 如果没有选中控件，检查是否右键点击了某个控件
  if (selectedWidgets.length === 0) {
    // 右键菜单的坐标在 canvas 坐标系中，需要从 e.clientX/Y 计算
    const rect = canvas.getBoundingClientRect();
    const menuX = (parseFloat(contextMenu.style.left) - rect.left) / AppState.zoom;
    const menuY = (parseFloat(contextMenu.style.top) - rect.top) / AppState.zoom;
    const clickedWidget = [...page.widgets].reverse().find(w =>
      menuX >= w.x && menuX <= w.x + w.width && menuY >= w.y && menuY <= w.y + w.height
    );
    if (clickedWidget) {
      selectedWidgets.push(clickedWidget);
    }
  }

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
    case 'z-order-top':
    case 'z-order-up':
    case 'z-order-down':
    case 'z-order-bottom': {
      // 层级调整：调整选中控件所在组的 zOrder（改变所有根祖先的 zOrder）
      const widgetMap = new Map();
      page.widgets.forEach(w => widgetMap.set(w.id, w));

      // 找到所有根祖先（组标识）
      const rootSet = new Set();
      selectedWidgets.forEach(w => {
        let current = w;
        while (current.parentId && widgetMap.has(current.parentId)) {
          current = widgetMap.get(current.parentId);
        }
        rootSet.add(current.id);
      });

      // 收集所有组的 zOrder
      const groupZOrders = new Map();
      page.widgets.forEach(w => {
        let current = w;
        while (current.parentId && widgetMap.has(current.parentId)) {
          current = widgetMap.get(current.parentId);
        }
        groupZOrders.set(current.id, current.zOrder != null ? current.zOrder : 0);
      });

      const maxZ = Math.max(...groupZOrders.values());
      const minZ = Math.min(...groupZOrders.values());

      if (action === 'z-order-top') {
        // 置顶：所有选中组的 zOrder = max + 1
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (root) root.zOrder = maxZ + 1;
        });
      } else if (action === 'z-order-bottom') {
        // 置底：所有选中组的 zOrder = min - 1
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (root) root.zOrder = minZ - 1;
        });
      } else if (action === 'z-order-up') {
        // 上移一层：找到 zOrder 比当前组大的最小 zOrder，与其交换
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (!root) return;
          const currentZ = root.zOrder != null ? root.zOrder : 0;
          // 找到 zOrder 比 currentZ 大的其他组的最小 zOrder
          let nextZ = null;
          groupZOrders.forEach((z, gid) => {
            if (z > currentZ && (nextZ === null || z < nextZ)) {
              nextZ = z;
            }
          });
          if (nextZ !== null) {
            // 交换：当前组和 zOrder=nextZ 的组交换
            root.zOrder = nextZ;
            groupZOrders.forEach((z, gid) => {
              if (z === nextZ) {
                const otherRoot = widgetMap.get(gid);
                if (otherRoot && !rootSet.has(gid)) {
                  otherRoot.zOrder = currentZ;
                }
              }
            });
          }
        });
      } else if (action === 'z-order-down') {
        // 下移一层：找到 zOrder 比当前组小的最大 zOrder，与其交换
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (!root) return;
          const currentZ = root.zOrder != null ? root.zOrder : 0;
          // 找到 zOrder 比 currentZ 小的其他组的最大 zOrder
          let prevZ = null;
          groupZOrders.forEach((z, gid) => {
            if (z < currentZ && (prevZ === null || z > prevZ)) {
              prevZ = z;
            }
          });
          if (prevZ !== null) {
            root.zOrder = prevZ;
            groupZOrders.forEach((z, gid) => {
              if (z === prevZ) {
                const otherRoot = widgetMap.get(gid);
                if (otherRoot && !rootSet.has(gid)) {
                  otherRoot.zOrder = currentZ;
                }
              }
            });
          }
        });
      }
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
      // 检查是否有子控件
      const children = [];
      selectedWidgets.forEach(w => {
        const childList = page.widgets.filter(cw => cw.parentId === w.id);
        if (childList.length > 0) {
          children.push(...childList);
        }
      });

      if (children.length > 0) {
        // 有子控件，显示确认对话框
        const msg = `删除选中的 ${selectedWidgets.length} 个控件时，发现有 ${children.length} 个子控件也会被删除。\n\n确定要删除吗？`;
        if (!confirm(msg)) {
          break;
        }
      }

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
  renderPageTabsMini();
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
