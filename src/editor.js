import { AppState, navigate, showToast, initNav, downloadFile, escapeHtml, escapeAttr } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_CATEGORIES, PROP_META, WIDGET_EVENTS, WIDGET_DEFAULTS, validateProjectFonts } from './sgl_api.js';
import { getCheckboxIconDataUrl } from './checkbox_icon.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, message, ask } from '@tauri-apps/plugin-dialog';
import {
  setFontLoadCallback, preloadProjectFonts, getCssFontStack, getFontBppCss, applyBppFilter,
  hexToRgba, mixColors, getWidgetAbsPos, sortWidgetsByHierarchy, flexAlign, textAlignCss,
  toAssetUrl, pixmapFormatHasAlpha, getOpaqueImageUrl, registerFontFile
} from './render_common.js';

initNav('editor');
AppState.init();
setFontLoadCallback(() => renderCanvas());

// 项目加载后预加载所有字体资源（仅 FontFace，用于 Canvas 光栅化）
preloadProjectFonts(AppState.project.resources?.fonts).then(() => {
  renderCanvas();
});

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
const logInput = document.getElementById('log-input');
const widgetPropsPanel = document.getElementById('widget-props-panel');
const emptyProps = document.getElementById('empty-props');
const widgetTypeLabel = document.getElementById('widget-type-label');

// ============ 终端命令执行 ============
const commandHistory = [];
let historyIndex = -1;

function logRaw(text, type = 'info') {
  if (!logContent) return;
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  line.textContent = text;
  logContent.appendChild(line);
  logContent.scrollTop = logContent.scrollHeight;
}

async function execCommand(cmd) {
  if (!cmd.trim()) return;
  commandHistory.push(cmd);
  historyIndex = commandHistory.length;
  logRaw('> ' + cmd, 'info');
  try {
    const result = await invoke('exec_command', { command: cmd });
    if (result.stdout) logRaw(result.stdout, 'info');
    if (result.stderr) logRaw(result.stderr, 'error');
    if (result.exit_code !== 0 && !result.stdout && !result.stderr) {
      logRaw(`退出码: ${result.exit_code}`, 'warn');
    }
  } catch (e) {
    logRaw('执行失败: ' + e, 'error');
  }
}

// 监听后端构建日志事件，实时输出到控制台
listen('build-log', (event) => {
  const payload = event.payload || {};
  if (payload.message !== undefined && payload.message !== null) {
    logRaw(String(payload.message), payload.level || 'info');
  }
}).catch(() => {});

if (logInput) {
  logInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = logInput.value;
      logInput.value = '';
      execCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex > 0) {
        historyIndex -= 1;
        logInput.value = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex += 1;
        logInput.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        logInput.value = '';
      }
    }
  });
}

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
        logMessage('已添加：' + item.name, 'success');
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
let lastRenderedPageId = null;

function centerCanvas() {
  const viewport = document.getElementById('canvas-viewport');
  const page = AppState.getCurrentPage();
  if (!viewport || !page) return;
  const z = AppState.zoom;
  const cw = page.width * z;
  const ch = page.height * z;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  panOffset.x = (vw - cw) / 2;
  panOffset.y = (vh - ch) / 2;
}

// 控制台拉大时，自动缩小 zoom 让画布完整显示并保持在画布区域中心
function fitCanvasToViewport() {
  const viewport = document.getElementById('canvas-viewport');
  const page = AppState.getCurrentPage();
  if (!viewport || !page) return;
  const margin = 20;
  const maxW = Math.max(40, viewport.clientWidth - margin * 2);
  const maxH = Math.max(40, viewport.clientHeight - margin * 2);
  const fitZoom = Math.min(maxW / page.width, maxH / page.height, 4);
  if (AppState.zoom > fitZoom) {
    AppState.zoom = Math.max(0.25, Math.floor(fitZoom * 100) / 100);
  }
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
    const imgPath = toAssetUrl(page.pixmap);
    const pagePixmapFormat = page.pixmapFormat || 'RGB565';
    const pageHasAlpha = pixmapFormatHasAlpha(pagePixmapFormat);
    // 页面背景图片：非 Alpha 格式时透明区域按黑色填充，与设备渲染一致
    canvas.style.backgroundColor = page.bg_color || '#1e1e2e';
    canvas.style.backgroundSize = '100% 100%';
    canvas.style.backgroundPosition = '0 0';
    if (pageHasAlpha) {
      canvas.style.backgroundImage = `url('${imgPath}')`;
    } else {
      getOpaqueImageUrl(page.pixmap, '#000000').then(url => { canvas.style.backgroundImage = `url('${url}')`; });
    }
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

  canvas.querySelectorAll('.canvas-widget, .resize-handle').forEach(el => el.remove());

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

  // 根据 fontBpp 设置文本抗锯齿样式（继承到子文本元素）
  const bpp = w.fontBpp != null ? w.fontBpp : (WIDGET_DEFAULTS[w.type] && WIDGET_DEFAULTS[w.type].fontBpp) || 4;
  applyBppFilter(el, bpp);

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
    } else if (w.type === 'polygon') {
      // polygon 用实线框，避免和自身边线/虚线混淆
      el.classList.add('polygon-selected');
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

  canvas.appendChild(el);

  // 为主选中控件添加拖拽缩放手柄（放在 renderWidgetVisual 之后，避免被清空）
  if (AppState.selectedWidgetId === w.id && !isLocked) {
    const absPos = getWidgetAbsPos(w, page);
    addResizeHandles(el, absPos.x, absPos.y, w.width, w.height, z);
  }

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
  // SGL 像素级渲染器引用（由 sgl_renderer.js 注入到 window.SGLRenderer）
  const SGLR = window.SGLRenderer;

  // 清空内容
  el.innerHTML = '';

  // 创建 SGL 绘制表面：清空 el，附加一个铺满 el 的 canvas，返回 surface。
  // lw/lh 为可选的逻辑宽高（控件坐标系），默认用 w.width/w.height；
  // 对于 circle/ring 等 el 尺寸基于 radius 的控件，应传入与 drawWidget 一致的直径以避免拉伸。
  // 调用方在绘制完成后需执行 SGLR.flushSurface(surf)。
  function sglSurface(lw, lh) {
    el.innerHTML = '';
    el.style.background = 'transparent';
    el.style.border = 'none';
    el.style.borderRadius = '0';
    el.style.opacity = '1';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
    el.appendChild(cv);
    return SGLR.createSurface(cv, lw != null ? lw : w.width, lh != null ? lh : w.height, z);
  }

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

  // 字符串对齐 → SGL 数字对齐 (0=CENTER,1=TOP_MID,2=TOP_LEFT,3=TOP_RIGHT,4=BOT_MID,5=BOT_LEFT,6=BOT_RIGHT,7=LEFT_MID,8=RIGHT_MID)
  const SGL_ALIGN_MAP = { CENTER: 0, TOP_MID: 1, TOP_LEFT: 2, TOP_RIGHT: 3, BOT_MID: 4, BOT_LEFT: 5, BOT_RIGHT: 6, LEFT_MID: 7, RIGHT_MID: 8 };
  function sglAlign(s) { return SGL_ALIGN_MAP[s] != null ? SGL_ALIGN_MAP[s] : 0; }

  switch (w.type) {
    case 'rect': {
      const borderAlphaVal = p('borderAlpha', 255);
      const borderColor = p('borderColor', '#000000');
      const borderWidth = p('borderWidth', 2) * z;
      const radius = p('radius', 0) * z;
      const rectCol = p('color', '#FFFFFF');
      const mainAlphaVal = p('mainAlpha', 255);
      const mainAlphaCss = mainAlphaVal < 255 ? (mainAlphaVal / 255) : 1;

      // 处理图片（pixmap）——SGLRenderer 不支持位图绘制，保留 CSS 渲染
      const pixmap = p('pixmap', '');
      if (pixmap) {
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
        el.style.borderRadius = radius + 'px';
        const imgPath = toAssetUrl(pixmap);
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        // 支持 Alpha 的格式：图片透明区域与控件底色混合；否则按黑色填充并去掉 alpha 通道
        el.style.background = '';
        el.style.backgroundColor = hasAlpha ? rectCol : '#000000';
        const imgEl = document.createElement('div');
        imgEl.style.cssText = `position:absolute;inset:0;background-size:100% 100%;background-position:0 0;border-radius:${radius}px;opacity:${mainAlphaCss};`;
        el.appendChild(imgEl);
        if (hasAlpha) {
          imgEl.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(pixmap, '#000000').then(url => { imgEl.style.backgroundImage = `url('${url}')`; });
        }
      } else {
        // 纯色填充 + 边框：用 SGLRenderer 像素级渲染
        const surf = sglSurface();
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          color: SGLR.hexToColor(rectCol),
          alpha: mainAlphaVal,
          border: p('borderWidth', 2),
          border_color: SGLR.hexToColor(borderColor),
          border_alpha: borderAlphaVal,
          border_mask: 0,
          radius: p('radius', 0),
        });
        SGLR.flushSurface(surf);
      }
      break;
    }

    case 'circle': {
      // SGL 圆形：实际渲染半径 = 直径 / 2，圆心 = 中心 + offset
      // el 尺寸由 drawWidget 基于 radius 计算，surface 逻辑尺寸需与之匹配
      const circleDiameter = (w.radius != null && w.radius > 0) ? w.radius * 2 : Math.min(w.width, w.height);
      const circleCol = p('color', '#FFFFFF');
      const borderC = p('borderColor', '#000000');
      const xOff = p('xOffset', 0);
      const yOff = p('yOffset', 0);
      const pixmap = p('pixmap', '');
      if (pixmap) {
        // SGLRenderer 不支持位图绘制，保留 CSS 渲染
        const dia = circleDiameter * z;
        const borderW = p('borderWidth', 2) * z;
        const circleEl = document.createElement('div');
        circleEl.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)${(xOff || yOff) ? ` translate(${xOff * z}px, ${yOff * z}px)` : ''};width:${dia}px;height:${dia}px;border-radius:50%;border:${borderW}px solid ${borderC};box-sizing:border-box;`;
        const imgPath = toAssetUrl(pixmap);
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        circleEl.style.backgroundColor = hasAlpha ? circleCol : '#000000';
        circleEl.style.backgroundSize = '100% 100%';
        if (hasAlpha) {
          circleEl.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(pixmap, '#000000').then(url => { circleEl.style.backgroundImage = `url('${url}')`; });
        }
        el.appendChild(circleEl);
      } else {
        // 纯色填充 + 边框：用 SGLRenderer 像素级渲染
        const surf = sglSurface(circleDiameter, circleDiameter);
        const cx = circleDiameter / 2 + xOff;
        const cy = circleDiameter / 2 + yOff;
        const radius = circleDiameter / 2;
        SGLR.drawCircle(surf, cx, cy, radius, {
          color: SGLR.hexToColor(circleCol),
          alpha: alpha,
          border: p('borderWidth', 2),
          border_color: SGLR.hexToColor(borderC),
          border_alpha: alpha,
        });
        SGLR.flushSurface(surf);
      }
      break;
    }

    case 'line': {
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

      const lineCol = p('color', '#000000');
      const lineW = Math.max(1, p('lineWidth', 1));

      if (p('dashed', false)) {
        // 虚线：用 SGLRenderer drawDashedLine 像素级渲染
        const surf = sglSurface(w.width, w.height);
        const dLen = p('dashLen', 10);
        const gLen = p('gapLen', 5);
        SGLR.drawDashedLine(surf, relX1, relY1, relX2, relY2, dLen, gLen, SGLR.hexToColor(lineCol), alpha);
        SGLR.flushSurface(surf);
      } else {
        // 实线：用 SGLRenderer 像素级渲染
        const surf = sglSurface(w.width, w.height);
        SGLR.drawLine(surf, relX1, relY1, relX2, relY2, lineW, SGLR.hexToColor(lineCol), alpha);
        SGLR.flushSurface(surf);
      }
      break;
    }

    case 'ring': {
      // SGL ring: 圆心 cx=(x1+x2)/2, cy=(y1+y2)/2
      // radius_out = width / 2，radius_in = radius_out - 2（默认环厚度 2）
      // 单色 color 填充，alpha 透明度
      const ringColor = p('color', '#FFFFFF');
      // el 尺寸由 drawWidget 基于 radiusOut 计算，surface 逻辑尺寸需与之匹配
      const ringDiameter = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut * 2 : Math.min(w.width, w.height);
      const radiusOutVal = (w.radiusOut != null && w.radiusOut > 0) ? w.radiusOut : (ringDiameter / 2);
      const radiusInVal = (w.radiusIn != null && w.radiusIn > 0) ? w.radiusIn : (radiusOutVal - 2);
      const rOut = Math.max(1, radiusOutVal);
      const rIn = Math.max(0, Math.min(radiusInVal, radiusOutVal));

      // 用 SGLRenderer 像素级渲染
      const surf = sglSurface(ringDiameter, ringDiameter);
      const cx = ringDiameter / 2;
      const cy = ringDiameter / 2;
      SGLR.drawFillRing(surf, cx, cy, rIn, rOut, SGLR.hexToColor(ringColor), alpha);
      SGLR.flushSurface(surf);
      break;
    }

    case 'arc': {
      let arcRadiusInVal, arcRadiusOutVal;
      // SGL: radius_out = width / 2（自动推导），radius_in = radius_out - 2（自动推导）
      const arcDiameter = w.width;
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
      // SGL arc: color 是前景弧色，bgColor 是背景色（RING 模式下绘制背景环）
      const arcColor = p('color', '#000000');
      const bgColor = p('bgColor', '#FFFFFF');

      const rOut = Math.max(1, arcRadiusOutVal);
      const rIn = Math.max(0, arcRadiusInVal);

      // 用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const cx = w.width / 2;
      const cy = w.height / 2;
      SGLR.drawFillArc(surf, {
        cx, cy,
        radius_in: rIn,
        radius_out: rOut,
        start_angle: startAngle,
        end_angle: endAngle,
        mode: arcMode,
        color: SGLR.hexToColor(arcColor),
        bg_color: SGLR.hexToColor(bgColor),
        alpha: alpha,
      });
      SGLR.flushSurface(surf);
      break;
    }

    case 'polygon': {
      // SGL polygon: 扫描线填充 + 边框 + 居中文本，用 SGLRenderer 像素级渲染
      const vertices = p('vertices', '0,0;50,100;100,0');
      const coords = vertices.split(';').map(s => s.trim()).filter(s => s);
      const polyPts = coords.length >= 3
        ? coords.map(s => {
            const [x, y] = s.split(',').map(v => parseInt(v.trim()) || 0);
            return { x, y };
          })
        : [{x:25,y:0},{x:75,y:0},{x:100,y:50},{x:75,y:100},{x:25,y:100},{x:0,y:50}];

      const surf = sglSurface(w.width, w.height);
      const fillColor = SGLR.hexToColor(p('fillColor', '#8b5cf6'));
      const borderColor = SGLR.hexToColor(p('borderColor', '#7c3aed'));
      const borderWidth = p('borderWidth', 2);
      // 1. 填充多边形
      SGLR.drawFillPolygon(surf, polyPts, fillColor, alpha);
      // 2. 边框
      if (borderWidth > 0) {
        SGLR.drawPolygonBorder(surf, polyPts, borderColor, borderWidth, alpha);
      }
      SGLR.flushSurface(surf);
      // 3. 居中文本（DOM 叠加）
      overlayText({
        text: p('text', ''),
        color: p('textColor', '#ffffff'),
        fontSize: p('fontSize', 14),
        fontFamily: p('fontFamily', ''),
        align: 'CENTER',
        x: 0, y: 0, w: w.width, h: w.height
      });
      break;
    }

    case 'button': {
      const btnPixmap = p('pixmap', '');
      if (btnPixmap) {
        // pixmap 分支保留 CSS 渲染（SGLRenderer 不支持位图）
        const imgPath = toAssetUrl(btnPixmap);
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const btnBg = p('bgColor', p('color', '#8b5cf6'));
        el.style.background = '';
        el.style.backgroundSize = '100% 100%';
        el.style.backgroundPosition = '0 0';
        // 支持 Alpha 的格式：图片透明区域与控件底色混合；否则按黑色填充并去掉 alpha 通道
        el.style.backgroundColor = hasAlpha ? btnBg : '#000000';
        if (hasAlpha) {
          el.style.backgroundImage = `url('${imgPath}')`;
        } else {
          getOpaqueImageUrl(btnPixmap, '#000000').then(url => { el.style.backgroundImage = `url('${url}')`; });
        }
        el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#7c3aed')}`;
        el.style.borderRadius = (p('radius', 8) * z) + 'px';
        el.style.opacity = alphaCss;
        const btnInner = document.createElement('div');
        btnInner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:4px 8px;pointer-events:none;';
        Object.assign(btnInner.style, flexAlign(p('align', 'CENTER')));
        const textSpan = document.createElement('span');
        textSpan.textContent = p('text', '按钮');
        textSpan.style.color = p('textColor', '#ffffff');
        textSpan.style.fontSize = (p('fontSize', 14) * z) + 'px';
        textSpan.style.fontFamily = getCssFontStack(p('fontFamily', 'simhei.ttf'));
        textSpan.style.textAlign = textAlignCss(p('align', 'CENTER'));
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.filter = 'var(--sgl-bpp-filter,none)';
        btnInner.appendChild(textSpan);
        el.appendChild(btnInner);
      } else {
        // 纯色按钮：SGL 背景渲染 + overlayText 文本叠加（overlayText 内部处理有无字体）
        const surf = sglSurface(w.width, w.height);
        const btnBg = p('bgColor', p('color', '#8b5cf6'));
        const borderCol = p('borderColor', '#7c3aed');
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha,
          border: p('borderWidth', 1),
          border_alpha: alpha,
          border_mask: 0,
          color: SGLR.hexToColor(btnBg),
          border_color: SGLR.hexToColor(borderCol),
          radius: p('radius', 8),
        });
        SGLR.flushSurface(surf);
        overlayText({
          text: p('text', '按钮'),
          color: p('textColor', '#ffffff'),
          fontSize: p('fontSize', 14),
          fontFamily: p('fontFamily', 'simhei.ttf'),
          align: p('align', 'CENTER'),
          x: 0, y: 0, w: w.width, h: w.height
        });
      }
      break;
    }

    case 'label': {
      // SGL label: bg_flag 为 true 时画 bg_color 圆角矩形（默认 false），文本对齐由 align 决定，offset 微调
      const lblAlign = p('align', 'CENTER');
      const lblBg = p('bgColor', 'transparent');
      const lblRot = p('textRotation', 0);
      if (lblRot) {
        // 旋转文本 SGLRenderer 不支持，保留 CSS 渲染
        el.style.background = (lblBg && lblBg !== 'transparent') ? lblBg : 'transparent';
        el.style.border = 'none';
        el.style.borderRadius = (p('radius', 0) * z) + 'px';
        el.style.opacity = alphaCss;
        const lblOffsetX = p('textOffsetX', 0) * z;
        const lblOffsetY = p('textOffsetY', 0) * z;
        const labelInner = document.createElement('div');
        labelInner.style.cssText = `position:absolute;left:${lblOffsetX}px;top:${lblOffsetY}px;right:${-lblOffsetX}px;bottom:${-lblOffsetY}px;display:flex;padding:2px 4px;pointer-events:none;box-sizing:border-box;`;
        Object.assign(labelInner.style, flexAlign(lblAlign));
        const lblSpan = document.createElement('span');
        lblSpan.textContent = p('text', '标签文本');
        lblSpan.style.color = p('textColor', p('color', '#000000'));
        lblSpan.style.fontSize = (p('fontSize', 14) * z) + 'px';
        lblSpan.style.fontFamily = getCssFontStack(p('fontFamily', ''));
        lblSpan.style.overflow = 'hidden';
        lblSpan.style.textOverflow = 'ellipsis';
        lblSpan.style.whiteSpace = 'nowrap';
        lblSpan.style.transform = `rotate(${lblRot}deg)`;
        lblSpan.style.filter = 'var(--sgl-bpp-filter,none)';
        labelInner.appendChild(lblSpan);
        el.appendChild(labelInner);
      } else {
        // SGL optional bg + text (font: SGL drawString, no font: overlayText DOM span)
        const lblFontSize = p('fontSize', 14);
        const lblFontBpp = p('fontBpp', 4);
        const lblFontFamily = p('fontFamily', '');
        const lblCssFamily = getCssFontStack(lblFontFamily);
        const lblText = p('text', '标签文本');
        const lblTextCol = SGLR.hexToColor(p('textColor', p('color', '#000000')));
        const lblHasFont = widgetHasFont(w);
        const lblOffX = p('textOffsetX', 0);
        const lblOffY = p('textOffsetY', 0);
        const surf = sglSurface(w.width, w.height);
        const lblRadius = p('radius', 0);
        if (lblBg && lblBg !== 'transparent') {
          SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, lblRadius, SGLR.hexToColor(lblBg), alpha);
        }
        if (lblHasFont) {
          // SGL drawString to buf32 (before flushSurface)
          const coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
          const pos = SGLR.getTextPosRealtime(coords, lblText, lblFontSize, lblCssFamily, 4, sglAlign(lblAlign));
          SGLR.drawString(surf, pos.x + lblOffX, pos.y + lblOffY, lblText, lblTextCol, alpha, lblFontSize, lblCssFamily, lblFontBpp);
        }
        SGLR.flushSurface(surf);
        if (!lblHasFont) {
          // no font: DOM span (system default)
          overlayText({
            text: lblText,
            color: p('textColor', p('color', '#000000')),
            fontSize: lblFontSize,
            fontFamily: lblFontFamily,
            align: lblAlign,
            x: 0, y: 0, w: w.width, h: w.height,
            offX: lblOffX,
            offY: lblOffY
          });
        }
      }
      break;
    }

    case 'textbox': {
      // SGL textbox: bg 圆角矩形 + 多行文本
      // 严格移植自 sgl_textbox.c: focus=1 时 border_mask=1 不画边框，scroll_enable=0 默认不画滚动条
      const tbFontSize = p('fontSize', 14);
      const tbRadius = p('radius', 10);
      const tbBg = p('bgColor', '#FFFFFF');
      const tbBorderCol = p('borderColor', '#000000');
      const tbLineMargin = p('lineMargin', 1);
      const tbBorder = p('borderWidth', 1);
      const tbText = p('text', 'textbox');

      // SGLRenderer 背景渲染 + overlayText 多行文本叠加（overlayText 内部处理有无字体）
      const surf = sglSurface(w.width, w.height);
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: tbBorder,
        border_alpha: alpha,
        border_mask: 1,
        color: SGLR.hexToColor(tbBg),
        radius: tbRadius,
        border_color: SGLR.hexToColor(tbBorderCol),
      });
      SGLR.flushSurface(surf);
      const pad = tbRadius;
      overlayText({
        text: tbText,
        color: p('textColor', '#000000'),
        fontSize: tbFontSize,
        fontFamily: p('fontFamily', ''),
        align: 'TOP_LEFT',
        x: pad, y: pad, w: w.width - 2 * pad, h: w.height - 2 * pad,
        lineMargin: tbLineMargin,
        multiline: true,
        maxWidth: w.width - 2 * pad
      });
      break;
    }

    case 'switch': {
      // SGL switch: margin = knob_margin + border；轨道矩形 + 滑块正方形
      // 用 SGLRenderer 像素级渲染
      const swOn = p('status', false);
      const swBorderW = p('borderWidth', 2);
      const swMargin = (p('knobMargin', 0) + swBorderW);
      const swRadius = p('radius', 0);
      const swKnobRadiusDef = p('knobRadius', 255);
      const swTrackColor = swOn ? p('color', '#FFFFFF') : p('bgColor', '#000000');
      const swBorderCol = p('borderColor', '#000000');
      const swKnobColor = SGLR.hexToColor(p('knobColor', '#808080'));

      const surf = sglSurface(w.width, w.height);
      // 轨道：status=true 用 color，false 用 bgColor
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: swBorderW,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(swTrackColor),
        radius: swRadius,
        border_color: SGLR.hexToColor(swBorderCol),
      });
      // 滑块（正方形）：knob 边长 = h - 2*margin
      const knobW = Math.max(0, w.height - 2 * swMargin);
      const knobRadius = Math.min(Math.max(0, swRadius - swMargin), swKnobRadiusDef);
      let kx1, kx2;
      if (swOn) {
        kx2 = w.width - 1 - swMargin;
        kx1 = kx2 - knobW;
      } else {
        kx1 = swMargin;
        kx2 = kx1 + knobW;
      }
      if (knobW > 0) {
        SGLR.drawFillRect(surf, kx1, swMargin, kx1 + knobW, w.height - 1 - swMargin, knobRadius, swKnobColor, alpha);
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'checkbox': {
      // SGL checkbox: 26x22 4bpp 位图图标 + 文字，用 SGLRenderer 像素级渲染
      // 移植自 sgl_checkbox.c：icon->width=26, icon->height=22
      const cbCol = SGLR.hexToColor(p('color', p('onColor', p('textColor', '#000000'))));
      const cbStatus = p('status', false);
      const cbText = p('text', ' ');
      const cbFontSize = p('fontSize', 14);
      const cbFontFamily = getCssFontStack(p('fontFamily', ''));

      const surf = sglSurface(w.width, w.height);
      // SGL: text_x = icon->width + 2 = 28
      const textX = 28;
      // SGL: align_pos = sgl_get_text_pos(coords, font, text, text_x, SGL_ALIGN_CENTER)
      //   CENTER: x = (parentW - (textW + text_x)) / 2, y = (parentH - fontH) / 2
      const cbTextW = SGLR.estimateTextWidth(cbText, cbFontSize);
      const cbTotalW = cbTextW + textX;
      const alignX = Math.floor((w.width - cbTotalW) / 2);
      // SGL: icon_y = ((y2 - y1) - icon->height) / 2 + 1
      const iconY = Math.floor((w.height - 22) / 2) + 1;
      // 1. 画 4bpp 图标（必须在 flushSurface 之前，因为操作 buf32）
      const cbIcon = cbStatus ? SGLR.CHECKBOX_CHECKED_ICON : SGLR.CHECKBOX_UNCHECKED_ICON;
      SGLR.drawIcon(surf, alignX, iconY, cbCol, alpha, cbIcon);
      SGLR.flushSurface(surf);
      // 2. 文字（DOM 叠加，垂直居中于控件、水平居中于 [alignX+textX, alignX+textX+cbTextW]）
      overlayText({
        text: cbText,
        color: p('color', p('onColor', p('textColor', '#000000'))),
        fontSize: cbFontSize,
        fontFamily: p('fontFamily', ''),
        align: 'CENTER',
        x: alignX + textX, y: 0, w: cbTextW, h: w.height
      });
      break;
    }

    case 'slider': {
      // SGL slider: track + fill + knob，全部用 SGLRenderer 像素级渲染
      const isHoriz = p('direct', 0) !== 1;
      const slValue = p('value', 50);
      const border = p('borderWidth', 2);
      // SGL: knob_r = (isHoriz ? h : w) / 2 - 1（逻辑坐标）
      const knobR = Math.max(1, (isHoriz ? w.height : w.width) / 2 - 1);
      // SGL: thickness = min(slider->thickness, knob_r)，默认 255 被 knob_r 钳制
      const thickness = Math.min(p('thickness', 255), knobR);
      const barRadius = Math.min(thickness / 2, p('radius', 4));

      const fillColor = SGLR.hexToColor(p('fillColor', '#000000'));
      const trackColor = SGLR.hexToColor(p('trackColor', '#808080'));
      const knobColor = SGLR.hexToColor(p('knobColor', '#000000'));

      const surf = sglSurface(w.width, w.height);

      if (isHoriz) {
        // SGL 水平: bar.x1=x1+knob_r, bar.x2=x2-knob_r, bar.y 居中
        const barLeft = knobR;
        const barWidth = Math.max(0, w.width - 2 * knobR);
        const barTop = (w.height - thickness) / 2;
        // SGL: fill_pos = x1 + w * value / 100 - border, clamp to [bar.x1, bar.x2]
        let fillPos = w.width * slValue / 100 - border;
        fillPos = Math.max(barLeft, Math.min(fillPos, barLeft + barWidth));

        // track 段（整条）
        SGLR.drawFillRect(surf, barLeft, barTop, barLeft + Math.max(0, barWidth - 1), barTop + thickness - 1, barRadius, trackColor, alpha);
        // fill 段（从 bar.x1 到 fill_pos）
        if (fillPos > barLeft) {
          SGLR.drawFillRect(surf, barLeft, barTop, fillPos - 1, barTop + thickness - 1, barRadius, fillColor, alpha);
        }
        // knob 圆: 在 (fill_pos, mid(bar.y1, bar.y2))
        SGLR.drawFillCircle(surf, fillPos, barTop + thickness / 2, knobR, knobColor, alpha);
      } else {
        // SGL 垂直: bar.y1=y1+knob_r, bar.y2=y2-knob_r, bar.x 居中
        const barTop = knobR;
        const barHeight = Math.max(0, w.height - 2 * knobR);
        const barLeft = (w.width - thickness) / 2;
        // SGL: fill_pos = y2 - h * value / 100 + border, clamp to [bar.y1, bar.y2]
        let fillPos = w.height - w.height * slValue / 100 + border;
        fillPos = Math.max(barTop, Math.min(fillPos, barTop + barHeight));

        // track 段（整条）
        SGLR.drawFillRect(surf, barLeft, barTop, barLeft + thickness - 1, barTop + Math.max(0, barHeight - 1), barRadius, trackColor, alpha);
        // fill 段（从 fill_pos 到 bar.y2，即底部）
        if (barTop + barHeight > fillPos) {
          SGLR.drawFillRect(surf, barLeft, fillPos, barLeft + thickness - 1, barTop + barHeight - 1, barRadius, fillColor, alpha);
        }
        // knob 圆: 在 (mid(bar.x1, bar.x2), fill_pos)
        SGLR.drawFillCircle(surf, barLeft + thickness / 2, fillPos, knobR, knobColor, alpha);
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'progress': {
      // SGL progress: 轨道(body) + 虚线式多块填充，用 SGLRenderer 像素级渲染
      const prValue = p('value', 50);
      const prFillCol = SGLR.hexToColor(p('fillColor', '#FFFFFF'));
      const prGap = p('fillGap', 4);
      const prFillRadius = p('fillRadius', 0);
      const prFillWidth = p('fillWidth', 4);
      const prBorder = p('borderWidth', 2);
      const prRadius = p('radius', 0);
      // SGL: knob.x2 = x1 + w * value / 100 - radius/2 - 2 - (border - 1)
      const knobX2 = w.width * prValue / 100 - prRadius / 2 - 2 - (prBorder - 1);
      // SGL: fill_radius = min(obj->radius, knob_radius, knob_width/2)
      const fillR = Math.min(prRadius, prFillRadius, prFillWidth / 2);
      // SGL: rect.y1 = y1 + border + 1, rect.y2 = y2 - border - 1
      const rectY1 = prBorder + 1;
      const rectH = w.height - 2 * prBorder - 2;
      // SGL: rect.x1 起始 = x1 - interval*2 + border + 1
      let rectX1 = -prGap * 2 + prBorder + 1;

      const surf = sglSurface(w.width, w.height);
      // 轨道：trackColor 背景 + borderColor 边框 + radius
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        color: SGLR.hexToColor(p('trackColor', '#000000')),
        alpha: alpha,
        border: prBorder,
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
        border_alpha: alpha,
        border_mask: 0,
        radius: prRadius,
      });
      // fill 块
      while (rectX1 + prFillWidth <= knobX2) {
        if (rectX1 + prFillWidth - 1 >= 0) {
          SGLR.drawFillRect(surf, Math.max(0, rectX1), rectY1,
            rectX1 + prFillWidth - 1, rectY1 + Math.max(0, rectH - 1),
            fillR, prFillCol, alpha);
        }
        rectX1 += (prFillWidth + prGap);
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'bar': {
      // SGL bar: 两次 drawRect（fill + track）
      // 移植自 sgl_bar.c：knob_pos = x1 + (x2-x1+1) * value / 100 - border
      const barDirect = p('direct', 0);
      const barValue = p('value', 50);
      const barFillCol = SGLR.hexToColor(p('barColor', '#000000'));
      const barTrackCol = SGLR.hexToColor(p('bgColor', '#FFFFFF'));
      const barBorderCol = SGLR.hexToColor(p('borderColor', '#000000'));
      const barBorder = p('borderWidth', 2);
      const barRadius = p('radius', 0);

      const surf = sglSurface(w.width, w.height);
      if (barDirect === 0) {
        // 水平：knob_pos = x1 + w * value / 100 - border
        const knobPos = w.width * barValue / 100 - barBorder;
        // fill 段（左）
        SGLR.drawRect(surf, 0, 0, Math.min(knobPos, w.width - 1), w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        // track 段（右）
        SGLR.drawRect(surf, Math.max(knobPos, 0), 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
      } else {
        // 垂直：knob_pos = y2 - h * value / 100 + border
        const knobPos = w.height - w.height * barValue / 100 + barBorder;
        // fill 段（下）
        SGLR.drawRect(surf, 0, Math.max(knobPos, 0), w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        // track 段（上）
        SGLR.drawRect(surf, 0, 0, w.width - 1, Math.min(knobPos, w.height - 1), {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'gauge': {
      // SGL gauge: 严格移植自 sgl_gauge.c
      // 角度系统：sgl_draw_fill_arc 使用 0°=上顺时针；sgl_sin/sgl_cos 使用 0°=右顺时针
      //   弧用原始 angle_start/angle_end（0°=上系统）
      //   刻度/指针用 calc_angle = angle + 90（转为 0°=右系统）
      // 指针坐标 +1 偏移（SGL: +cx+1, +cy+1）
      // text 位置：txt_x = tx - text_len/2 - 2, txt_y = ty - font_h/2
      // text_interval 位掩码：(count & text_interval) == 0 显示文字和粗刻度
      const gValue = p('value', 0);
      const startAngle = p('startAngle', 30);
      const endAngle = p('endAngle', 330);
      const scaleAngle = p('scaleAngle', 15);
      const scaleStep = p('scaleStep', 10);
      const scaleStart = p('scaleStart', 0);
      const scaleLen = Math.max(p('scaleLength', 0), 4);
      const arcW = p('arcWidth', 2);
      const scaleW = p('scaleWidth', 1);
      const ptrW = p('pointerWidth', 2);
      // SGL 默认：bg=BG_COLOR(黑), arc/scale/text/hub=COLOR(白), pointer=RED
      const bgCol = p('bgColor', '#000000');
      const arcCol = p('arcColor', '#FFFFFF');
      const scaleCol = p('scaleColor', '#FFFFFF');
      const ptrCol = p('pointerColor', '#FF0000');
      const textCol = p('textColor', '#FFFFFF');
      const hubCol = p('hubColor', '#FFFFFF');
      const fontSize = p('fontSize', 12);
      const fontHeight = fontSize + 8; // SGL sgl_font_get_height
      const fontFamily = getCssFontStack(p('fontFamily', ''));

      const surf = sglSurface(w.width, w.height);
      const cx = w.width / 2;
      const cy = w.height / 2;
      const r = Math.max(p('radius', 0), w.width / 2 - 1);
      const hubR = Math.max((r + 8) / 8, p('hubRadius', 0));
      const scaleOut = arcW + 6;
      const scaleIn = scaleOut + scaleLen;
      // text_cr = r - scale_in - font_h/2 - 4
      const textCr = r - scaleIn - fontHeight / 2 - 4;
      const ptrStart = scaleIn + 4 + ptrW;
      const ptrEnd = r - hubR - ptrW;

      // deg2rad: 0°=右系统（与 Math.sin/cos 一致，SGL sgl_sin/sgl_cos 同此）
      const deg2rad = d => d * Math.PI / 180;

      // 1. 背景圆 (bgColor)
      SGLR.drawFillCircle(surf, cx, cy, r, SGLR.hexToColor(bgCol), alpha);
      // 2. 中心轴帽 (hubColor)
      if (hubR > 0) {
        SGLR.drawFillCircle(surf, cx, cy, hubR, SGLR.hexToColor(hubCol), alpha);
      }
      // 3. 外圈弧 (arcColor) - 使用 0°=上系统，与 SGL drawFillArc 一致
      SGLR.drawFillArc(surf, {
        cx: cx, cy: cy,
        radius_in: r - arcW - 1,
        radius_out: r - 1,
        start_angle: startAngle,
        end_angle: endAngle,
        mode: 0,
        color: SGLR.hexToColor(arcCol),
        bg_color: SGLR.hexToColor(bgCol),
        alpha: alpha,
      });

      // 4. 刻度线 - SGL: calc_angle = angle + 90（转为 0°=右系统）
      const textInterval = p('textInterval', 3);
      const scaleWarning = p('scaleWarning', 32767);
      let scaleMask = scaleStart;
      let count = 0;
      const majorTexts = []; // 缓存数字文本，待 flush 后绘制
      for (let angle = startAngle; angle <= endAngle; angle += scaleAngle) {
        const isMajor = (count & textInterval) === 0;
        const rad = deg2rad(angle + 90); // SGL: calc_angle = angle + 90
        const cosA = Math.cos(rad), sinA = Math.sin(rad);
        const xo = cx + (r - scaleOut) * cosA;
        const yo = cy + (r - scaleOut) * sinA;
        const xi = cx + (r - scaleIn) * cosA;
        const yi = cy + (r - scaleIn) * sinA;
        // SGL: scale_mask < scale_warning ? scale_color : RED
        const scCol = (scaleMask < scaleWarning) ? SGLR.hexToColor(scaleCol) : SGLR.SGL_COLOR_RED;
        const lineW = isMajor ? scaleW * 2 : scaleW;
        SGLR.drawLine(surf, xo, yo, xi, yi, lineW, scCol, alpha);
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

      // 6. 指针 (pointerColor) - 在 flush 前画
      // SGL: needle_angle = 90 + angle_start + value * scale_angle / scale_step (0°=右系统)
      const needleAngle = ((90 + startAngle + gValue * scaleAngle / scaleStep) % 360 + 360) % 360;
      const nRad = deg2rad(needleAngle);
      const nCos = Math.cos(nRad), nSin = Math.sin(nRad);
      // SGL: +cx+1, +cy+1 偏移
      const px = cx + (r - ptrStart) * nCos + 1;
      const py = cy + (r - ptrStart) * nSin + 1;
      const nx = cx + (r - ptrEnd) * nCos + 1;
      const ny = cy + (r - ptrEnd) * nSin + 1;
      SGLR.drawLine(surf, px, py, nx, ny, ptrW, SGLR.hexToColor(ptrCol), alpha);

      SGLR.flushSurface(surf);

      // 5. 刻度数字（DOM 叠加，每个刻度一个 span）
      // SGL: txt_x = tx - text_len/2 - 2, txt_y = ty - font_h/2
      const fH = SGLR.fontHeight(fontSize);
      const gHasFont = widgetHasFont(w);
      const gCssFamily = gHasFont ? fontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      majorTexts.forEach(mt => {
        const tw = SGLR.stringWidth(mt.text, fontSize);
        const tx = mt.x - tw / 2 - 2;
        const ty = mt.y - fH / 2;
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${tx * z}px;top:${ty * z}px;color:${textCol};font-size:${fontSize * z}px;font-family:${gCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
        span.textContent = mt.text;
        el.appendChild(span);
      });
      break;
    }

    case 'led': {
      // SGL led: 径向渐变平方曲线，中心亮(color)，边缘暗(bgColor)
      // SGL 默认: on_color=白, off_color=黑, bg_color=黑, radius=width/2
      // 用 SGLRenderer drawLed 像素级渲染
      const isOn = p('status', false);
      const bgCol = p('bgColor', '#000000');
      const ledCol = isOn ? p('onColor', p('color', '#FFFFFF')) : p('offColor', '#000000');
      const borderW = p('borderWidth', 0);
      const borderCol = p('borderColor', '#000000');

      const surf = sglSurface(w.width, w.height);
      // SGL 整数除法语义: cx=(x1+x2)/2=(width-1)/2, radius=width/2
      const cx = Math.floor((w.width - 1) / 2);
      const cy = Math.floor((w.height - 1) / 2);
      const radius = Math.floor(w.width / 2);
      // LED 平方曲线渐变（中心 ledCol，边缘 bgCol）
      SGLR.drawLed(surf, cx, cy, radius, SGLR.hexToColor(ledCol), SGLR.hexToColor(bgCol), alpha);
      // 边框环（SGL LED 默认无边框）
      if (borderW > 0) {
        SGLR.drawFillCircleBorder(surf, cx, cy, radius, SGLR.hexToColor(borderCol), borderW, alpha);
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'battery': {
      // SGL battery: border_width=2, padding=2 硬编码；外壳 radius=3, 盖帽 radius=0, 内部背景/电芯 radius=1
      // SGL: active_cells = (level * num_cells + 99) / 100
      // SGL: cell_width = (fill_width - total_min_gap) / num_cells, 前 remaining 个 cell +1px
      // SGL: 充电闪电 6 段直线多边形, line_width=4
      const bLevel = Math.min(100, p('level', p('value', 80)));
      const bDir = p('direction', 0); // 0=水平, 1=垂直
      const bCapPos = p('capPos', 0); // 0=右, 1=左, 2=上
      const bCapSize = p('capSize', 4);
      const bNumCells = p('numCells', 6);
      const bLowCol = p('lowColor', '#FF0000');
      const bMedCol = p('mediumColor', '#FFA500');
      const bHighCol = p('highColor', '#00FF00');
      // SGL: level<20 红, <50 橙, >=50 绿
      const bFillCol = bLevel < 20 ? bLowCol : (bLevel < 50 ? bMedCol : bHighCol);
      const bBorderCol = p('borderColor', '#FFFFFF');
      const bBgCol = p('bgColor', '#1E1E1E');
      const bBorderW = 2;
      const bPadding = 2;
      const bShellRadius = 3;
      const bInnerRadius = 1;

      const surf = sglSurface(w.width, w.height);

      let batteryW, batteryH, batteryX, batteryY, capW, capH, capX, capY;
      if (bDir === 0) {
        // 水平
        batteryW = w.width - bCapSize;
        batteryH = w.height - Math.floor(w.height / 5);
        batteryY = Math.floor((w.height - batteryH) / 2);
        capW = bCapSize;
        capH = Math.floor(batteryH / 3);
        if (bCapPos === 1) { // LEFT
          batteryX = bCapSize;
          capX = 0;
        } else { // RIGHT
          batteryX = 0;
          capX = batteryW;
        }
        capY = batteryY + Math.floor((batteryH - capH) / 2);
      } else {
        // 垂直
        batteryH = w.height - bCapSize;
        batteryW = w.width - Math.floor(w.width / 5);
        batteryX = Math.floor((w.width - batteryW) / 2);
        batteryY = bCapSize;
        capH = bCapSize;
        capW = Math.floor(batteryW / 3);
        capX = batteryX + Math.floor((batteryW - capW) / 2);
        capY = 0;
      }

      const fillX = batteryX + bBorderW + bPadding;
      const fillY = batteryY + bBorderW + bPadding;
      const fillW = batteryW - 2 * bBorderW - 2 * bPadding;
      const fillH = batteryH - 2 * bBorderW - 2 * bPadding;

      // 1. 外壳 (radius=3, border_color)
      SGLR.drawFillRectBorder(surf, batteryX, batteryY, batteryX + batteryW - 1, batteryY + batteryH - 1,
        bShellRadius, SGLR.hexToColor(bBorderCol), bBorderW, alpha);
      // 2. 盖帽 (radius=0, border_color)
      if (capW > 0 && capH > 0) {
        SGLR.drawFillRect(surf, capX, capY, capX + capW - 1, capY + capH - 1, 0, SGLR.hexToColor(bBorderCol), alpha);
      }
      // 3. 内部背景 (radius=1, bg_color)
      if (fillW > 0 && fillH > 0) {
        SGLR.drawFillRect(surf, fillX, fillY, fillX + fillW - 1, fillY + fillH - 1, bInnerRadius, SGLR.hexToColor(bBgCol), alpha);
      }
      // 4. 电芯 (radius=1, fill_color)
      if (bLevel > 0 && bNumCells > 0 && fillW > 0 && fillH > 0) {
        // SGL: active_cells = (level * num_cells + 99) / 100
        const activeCells = Math.min(bNumCells, Math.floor((bLevel * bNumCells + 99) / 100));
        const fillColObj = SGLR.hexToColor(bFillCol);
        if (bDir === 0) {
          // 水平
          let minGap = 2;
          let totalMinGap = (bNumCells - 1) * minGap;
          if (totalMinGap >= fillW) { minGap = 1; totalMinGap = bNumCells - 1; }
          const cellW = Math.max(1, Math.floor((fillW - totalMinGap) / bNumCells));
          const usedW = cellW * bNumCells + totalMinGap;
          const remainingW = fillW - usedW;
          if (bCapPos === 1) {
            // LEFT: 从右向左画
            let posX = fillX + fillW;
            for (let i = 0; i < activeCells; i++) {
              let curW = cellW + (i < remainingW ? 1 : 0);
              posX -= curW;
              SGLR.drawFillRect(surf, posX, fillY, posX + curW - 1, fillY + fillH - 1, bInnerRadius, fillColObj, alpha);
              if (i < bNumCells - 1) posX -= minGap;
            }
          } else {
            // RIGHT: 从左向右画
            let posX = fillX;
            for (let i = 0; i < activeCells; i++) {
              let curW = cellW + (i < remainingW ? 1 : 0);
              SGLR.drawFillRect(surf, posX, fillY, posX + curW - 1, fillY + fillH - 1, bInnerRadius, fillColObj, alpha);
              if (i < bNumCells - 1) posX += curW + minGap;
            }
          }
        } else {
          // 垂直: SGL 从 i=num_cells-1 递减到 0，i<active_cells 时画，pos_y 递增
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
              SGLR.drawFillRect(surf, fillX, posY, fillX + fillW - 1, posY + curH - 1, bInnerRadius, fillColObj, alpha);
            }
            posY += curH + minGap;
          }
        }
      }

      // 5. 充电闪电 SGL: 6 段直线多边形, line_width=4
      if (p('charging', false)) {
        const chCol = SGLR.hexToColor(p('chargingColor', '#FFFF00'));
        const chCx = batteryX + Math.floor(batteryW / 2);
        const chCy = batteryY + Math.floor(batteryH / 2);
        const chH = Math.floor(batteryH / 2);
        const chW = Math.floor(batteryW / 6);
        let p1x,p1y,p2x,p2y,p3x,p3y,p4x,p4y,p5x,p5y,p6x,p6y;
        if (bDir === 0) {
          // 水平
          p1x = chCx - Math.floor(chW/2); p1y = chCy - Math.floor(chH/2);
          p2x = chCx + chW*2;             p2y = chCy + Math.floor(chH/9);
          p3x = chCx + Math.floor(chW/4); p3y = chCy - Math.floor(chH/8);
          p4x = chCx + Math.floor(chW/2); p4y = chCy + Math.floor(chH/2);
          p5x = chCx - chW*2;             p5y = chCy - Math.floor(chH/9);
          p6x = chCx - Math.floor(chW/4); p6y = chCy + Math.floor(chH/8);
        } else {
          // 垂直
          p1x = chCx + Math.floor(chW/2); p1y = chCy - Math.floor(chH/2);
          p2x = chCx - Math.floor(chW/2); p2y = chCy - Math.floor(chH/15);
          p3x = chCx + chW*2;             p3y = chCy - Math.floor(chH/9);
          p4x = chCx - Math.floor(chW/2); p4y = chCy + Math.floor(chH/2);
          p5x = chCx + Math.floor(chW/2); p5y = chCy + Math.floor(chH/15);
          p6x = chCx - chW*2;             p6y = chCy + Math.floor(chH/9);
        }
        const chLW = 4;
        SGLR.drawLine(surf, p1x, p1y, p2x, p2y, chLW, chCol, alpha);
        SGLR.drawLine(surf, p2x, p2y, p3x, p3y, chLW, chCol, alpha);
        SGLR.drawLine(surf, p3x, p3y, p4x, p4y, chLW, chCol, alpha);
        SGLR.drawLine(surf, p4x, p4y, p5x, p5y, chLW, chCol, alpha);
        SGLR.drawLine(surf, p5x, p5y, p6x, p6y, chLW, chCol, alpha);
        SGLR.drawLine(surf, p6x, p6y, p1x, p1y, chLW, chCol, alpha);
      }

      SGLR.flushSurface(surf);

      // 6. 百分比文本（DOM 叠加）SGL: x_offset 根据 cap_pos, font_height = fontSize+8
      if (p('showPercentage', false)) {
        const pctText = bLevel + '%';
        const pctFontSize = p('fontSize', 12);
        let xOffset = 0, yOffset = 0;
        if (bCapPos === 0) xOffset = -bCapSize;       // RIGHT
        else if (bCapPos === 1) xOffset = bCapSize;   // LEFT
        else if (bCapPos === 2) yOffset = bCapSize;   // TOP
        overlayText({
          text: pctText,
          color: p('textColor', '#FFFFFF'),
          fontSize: pctFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'CENTER',
          x: 0, y: 0, w: w.width, h: w.height,
          offX: xOffset, offY: yOffset
        });
      }
      break;
    }

    case 'msgbox': {
      // SGL msgbox: 主体背景 + 标题(居中) + 分隔线 + 消息(多行) + 左右按钮
      // 用 SGLRenderer 像素级渲染
      // SGL: font_height = sgl_font_get_height(font) + 8 = fontSize + 8
      // SGL: lbtn_color = mixer(COLOR, TEXT_COLOR, 200) = mixer(白,黑,200) = #C7C7C7
      // SGL: 按下时 = mixer(TEXT_COLOR, COLOR, 128) = mixer(黑,白,128) = #808080
      const mbFontSize = p('fontSize', 14);
      const mbFontHeight = mbFontSize + 8;
      const mbBorder = p('borderWidth', 2);
      const mbRadius = p('radius', 0);
      const mbBg = p('bgColor', '#FFFFFF');
      const mbBorderCol = p('borderColor', '#000000');
      const mbFontFamily = getCssFontStack(p('fontFamily', ''));
      const mbTitleH = p('titleHeight', 0) || mbFontHeight;
      const mbMsgOffsetX = p('msgOffsetX', 0);
      const mbMsgOffsetY = p('msgOffsetY', 0);
      // SGL 默认按钮颜色 mixer(白,黑,200)=#C7C7C7
      const mbDefBtnCol = SGLR.colorMixer(SGLR.hexToColor('#FFFFFF'), SGLR.hexToColor('#000000'), 200);

      const surf = sglSurface(w.width, w.height);

      // 1. 主体背景圆角矩形 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: mbBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(mbBg),
        radius: mbRadius,
        border_color: SGLR.hexToColor(mbBorderCol),
      });

      // 3. 分隔线 SGL: y=coords.y1+title_h+4, x1=coords.x1+border, x2=coords.x2-border, width=border
      const mbSepY = mbTitleH + 4;
      SGLR.drawHLine(surf, mbBorder, w.width - 1 - mbBorder, mbSepY, Math.max(1, mbBorder), SGLR.hexToColor(mbBorderCol), alpha);

      // 5. 左右按钮背景 SGL: y1=coords.y2-2*font_height, y2=coords.y2-border
      const mbBtnTop = w.height - 2 * mbFontHeight;
      const mbBtnBottom = w.height - 1 - mbBorder;
      const mbMidX = w.width / 2;
      const mbLeftX1 = mbBorder;
      const mbLeftX2 = Math.floor(mbMidX - mbBorder / 2 - 1);
      const mbRightX1 = Math.floor(mbMidX + mbBorder / 2 + 1);
      const mbRightX2 = w.width - 1 - mbBorder;
      const mbLBtnCol = p('leftBtnColor', '') ? SGLR.hexToColor(p('leftBtnColor')) : mbDefBtnCol;
      const mbRBtnCol = p('rightBtnColor', '') ? SGLR.hexToColor(p('rightBtnColor')) : mbDefBtnCol;
      if (mbLeftX2 >= mbLeftX1) {
        SGLR.drawFillRect(surf, mbLeftX1, mbBtnTop, mbLeftX2, mbBtnBottom, 0, mbLBtnCol, alpha);
      }
      if (mbRightX2 >= mbRightX1) {
        SGLR.drawFillRect(surf, mbRightX1, mbBtnTop, mbRightX2, mbBtnBottom, 0, mbRBtnCol, alpha);
      }

      SGLR.flushSurface(surf);

      // 2. 标题文本（DOM 叠加，居中）
      // SGL: title_coords x1=border+2, x2=width-1-border+2, y1=1, y2=title_h+border
      const mbTitleText = p('titleText', 'Message Box');
      overlayText({
        text: mbTitleText,
        color: p('titleTextColor', '#000000'),
        fontSize: mbFontSize,
        fontFamily: p('fontFamily', ''),
        align: 'CENTER',
        x: mbBorder + 2, y: 1, w: w.width - 2 * mbBorder, h: mbTitleH + mbBorder
      });

      // 4. 消息文本（DOM 叠加，多行左对齐）
      // SGL: text_coords x1=border+2+offsetX, y1=title_h+border+offsetY, 绘制 y=y1+2
      const mbMsgTop = mbTitleH + mbBorder + mbMsgOffsetY + 2;
      const mbMsgLeft = mbBorder + 2 + mbMsgOffsetX;
      const mbMsgText = p('msgText', 'NULL');
      const mbLineMargin = p('msgLineMargin', 1);
      if (mbMsgText && mbMsgText !== 'NULL') {
        overlayText({
          text: mbMsgText,
          color: p('msgColor', p('textColor', '#000000')),
          fontSize: mbFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'TOP_LEFT',
          x: mbMsgLeft, y: mbMsgTop, w: w.width - 2 * mbBorder - 4, h: w.height - mbMsgTop - 2 * mbFontHeight,
          lineMargin: mbLineMargin,
          multiline: true,
          maxWidth: w.width - 2 * mbBorder - 4
        });
      }

      // 6. 按钮文本（DOM 叠加，居中）
      const mkBtnText = (x1, x2, txt, col) => {
        overlayText({
          text: txt,
          color: col,
          fontSize: mbFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'CENTER',
          x: x1, y: mbBtnTop, w: x2 - x1 + 1, h: mbBtnBottom - mbBtnTop + 1
        });
      };
      if (mbLeftX2 >= mbLeftX1) {
        mkBtnText(mbLeftX1, mbLeftX2, p('leftBtnText', 'YES'), p('leftBtnTextColor', '#000000'));
      }
      if (mbRightX2 >= mbRightX1) {
        mkBtnText(mbRightX1, mbRightX2, p('rightBtnText', 'NO'), p('rightBtnTextColor', '#000000'));
      }
      break;
    }

    case 'win': {
      // SGL win: 主体背景 + 标题栏背景(混合色) + 标题文本 + 关闭按钮(红色圆)
      // 用 SGLRenderer 像素级渲染
      const winFontSize = p('fontSize', 14);
      const winFontHeight = winFontSize + 8;
      const winBorder = p('borderWidth', 0);
      const winRadius = p('radius', 0);
      const winBg = p('bgColor', '#FFFFFF');
      const winBorderCol = p('borderColor', '#000000');
      const winFontFamily = getCssFontStack(p('fontFamily', ''));
      const winTitleH = Math.max(winRadius, p('titleHeight', 0), winFontHeight);

      const surf = sglSurface(w.width, w.height);

      // 1. 主体背景圆角矩形 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: winBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(winBg),
        radius: winRadius,
        border_color: SGLR.hexToColor(winBorderCol),
      });

      // 2. 标题栏背景（title_bg_color 与 bg_color 50% 混合，SGL: mixer(COLOR, BG_COLOR, 128)）
      const titleBgMixed = SGLR.colorMixer(SGLR.hexToColor(p('titleBgColor', '#808080')), SGLR.hexToColor(winBg), 128);
      SGLR.drawFillRect(surf, 0, 0, w.width - 1, winTitleH - 1, winRadius, titleBgMixed, alpha);

      // 4. 关闭按钮（红色圆形 close_color = sgl_rgb(255,90,80)）
      // SGL: close_r = title_h/3, close_cx = x2 - border - title_h/2, close_cy = y1 + title_h/2 + border/2
      const winCloseR = winTitleH / 3;
      const winCloseCx = w.width - 1 - winBorder - winTitleH / 2;
      const winCloseCy = winTitleH / 2 + winBorder / 2;
      if (winCloseR > 0) {
        SGLR.drawFillCircle(surf, winCloseCx, winCloseCy, winCloseR, SGLR.hexToColor(p('closeBtnColor', '#FF5A50')), alpha);
      }

      SGLR.flushSurface(surf);

      // 3. 标题文本（DOM 叠加，默认左中 LEFT_MID，左中时左侧内缩 radius）
      // SGL: title_area.x1+=border, title_area.x2-=border, LEFT_MID 时 align_pos.x+=radius, 绘制 y+=border
      const winTitleText = p('titleText', '窗口标题');
      const winTitleAlign = p('titleAlign', 'LEFT_MID');
      const titlePad = (winTitleAlign === 'LEFT_MID') ? winRadius : 0;
      overlayText({
        text: winTitleText,
        color: p('titleTextColor', '#000000'),
        fontSize: winFontSize,
        fontFamily: p('fontFamily', ''),
        align: winTitleAlign,
        x: winBorder + titlePad, y: winBorder,
        w: w.width - 1 - winBorder - winTitleH - (winBorder + titlePad),
        h: winTitleH
      });
      break;
    }

    case 'dropdown': {
      // SGL dropdown: 头部矩形 + 4bpp 箭头位图 + 选中项文本，用 SGLRenderer 像素级渲染
      // 关闭状态：整个控件高度 = option_h（头部高度）
      const ddOptions = (p('options', '') || '').split('\n').filter(o => o.length > 0);
      const ddFontSize = p('fontSize', 14);
      const ddFontHeight = ddFontSize; // font_height 近似为 fontSize
      const ddTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      const ddFontFamily = getCssFontStack(p('fontFamily', ''));
      const ddRadius = p('radius', 0);
      const ddBorderW = p('borderWidth', 1);
      const ddBgColor = SGLR.hexToColor(p('bgColor', '#FFFFFF'));
      const ddBorderColor = SGLR.hexToColor(p('borderColor', '#000000'));
      // item_height = font_height + 2 * OPTION_SPACE(3) = font_height + 6
      const ddItemH = ddFontHeight + 6;
      // item_pad = max(radius, border + 3)
      const ddItemPad = Math.max(ddRadius, ddBorderW + 3);
      // option_h：关闭状态头部高度，SGL 默认 = 控件高度
      const ddOptionH = w.height;

      const surf = sglSurface(w.width, w.height);

      // 1. 头部背景圆角矩形 + 边框（高度 = option_h）
      SGLR.drawRect(surf, 0, 0, w.width - 1, ddOptionH - 1, {
        alpha: alpha,
        border: ddBorderW,
        border_alpha: alpha,
        border_mask: 0,
        color: ddBgColor,
        radius: ddRadius,
        border_color: ddBorderColor,
      });

      // 2. 下拉箭头位图（18×10, 4bpp）- 必须在 flushSurface 之前
      // x = x2 - icon_width - radius
      // y = y1 + (item_height - icon_height + 1) / 2
      const ddIconW = 18, ddIconH = 10;
      const ddIconX = w.width - ddIconW - ddRadius;
      const ddIconY = (ddItemH - ddIconH + 1) / 2;
      SGLR.drawIcon(surf, ddIconX, ddIconY, ddTextColor, alpha, SGLR.DROPDOWN_ICON);

      SGLR.flushSurface(surf);

      // 3. 选中项文本（DOM 叠加，左中）
      // x = x1 + item_pad, y = y1 + (option_h - font_height + 1) / 2
      const ddText = ddOptions.length > 0 ? ddOptions[0] : '';
      if (ddText) {
        overlayText({
          text: ddText,
          color: p('textColor', '#000000'),
          fontSize: ddFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'LEFT_MID',
          x: ddItemPad, y: 0, w: w.width - ddItemPad - ddIconW - ddRadius, h: ddOptionH
        });
      }
      break;
    }

    case 'roller': {
      // SGL roller: 严格移植自 sgl_roller.c
      // item_h = font_height + 6, band_y1 = y1 + (widget_h - item_h) / 2 (垂直居中)
      // text_x = coords.x1 + radius + 2 (左对齐), text_y_off = (item_h - font_h) / 2
      // selected_color = mixer(SGL_THEME_COLOR, SGL_THEME_BG_COLOR, 128) = 灰色 (128,128,128)
      // border_mask = obj->focus (focus=0 时画边框)
      const rOptions = (p('options', '') || '').split('\n').filter(o => o.length > 0);
      const rFontSize = p('fontSize', 14);
      const rFontHeight = rFontSize + 8; // SGL sgl_font_get_height = fontSize + 8
      const rTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      // SGL 默认 selected_color = mixer(白,黑,128) = (128,128,128)
      const rSelectedColor = SGLR.hexToColor(p('selectedColor', '#808080'));
      const rFontFamily = getCssFontStack(p('fontFamily', ''));
      const rRadius = p('radius', 4);
      const rBorderW = p('borderWidth', 1);
      const rVisibleRows = p('visibleRows', 3);
      // item_h = font_height + 6
      const rItemH = rFontHeight + 6;
      // 选中带位置：band_y1 = (widget_h - item_h) / 2 (垂直居中在 widget 区域)
      const rBandY1 = (w.height - rItemH) / 2;
      // 文本 x = radius + 2 (左对齐，从控件左边缘开始)
      const rTextX = rRadius + 2;
      // 选中项索引（默认 0），scroll_y = -item_selected * item_h
      const rSelected = 0;
      const rScrollY = -rSelected * rItemH;

      const surf = sglSurface(w.width, w.height);

      // 1. 背景圆角矩形 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: rBorderW,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(p('bgColor', '#1e1e2e')),
        radius: rRadius,
        border_color: SGLR.hexToColor(p('borderColor', '#3d3d5c')),
      });

      // 2. 选中带（selectedColor 填充）
      SGLR.drawFillRect(surf, rBorderW, rBandY1, w.width - 1 - rBorderW, rBandY1 + rItemH - 1, 0, rSelectedColor, alpha);

      SGLR.flushSurface(surf);

      // 3. 各选项文本（DOM 叠加，每个选项一个 span）
      const rRowCount = Math.min(rOptions.length, Math.max(rVisibleRows, Math.ceil(w.height / rItemH) + 1));
      const rHasFont = widgetHasFont(w);
      const rCssFamily = rHasFont ? rFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const rTextColorCss = p('textColor', '#000000');
      for (let i = 0; i < rRowCount; i++) {
        const itemDrawY = rBandY1 + rScrollY + i * rItemH;
        const textY = itemDrawY + (rItemH - rFontHeight) / 2;
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${rTextX * z}px;top:${textY * z}px;color:${rTextColorCss};font-size:${rFontSize * z}px;font-family:${rCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
        span.textContent = rOptions[i] || '';
        el.appendChild(span);
      }
      break;
    }

    case 'textlist': {
      // SGL textlist: 严格移植自 sgl_textlist.c
      // 坐标公式: text_pos_y 初始 = ITEM_SPACE, 选中高亮 y1 = i*item_height (从 0 开始，覆盖 border)
      //           文本 x = item_pad (不是 border+item_pad), 分隔线 x 范围 = item_pad ~ width-1-item_pad
      // 选中高亮三分支圆角: 中间项 radius=0, 顶部/底部项 radius=obj.radius (用 clip 裁剪)
      const tlFontSize = p('fontSize', 12);
      const tlFontHeight = tlFontSize + 8;
      const ITEM_SPACE = 3;
      const ITEM_PAD = 3;
      const tlItemHeight = tlFontHeight + 2 * ITEM_SPACE;
      const tlBorder = p('borderWidth', 1);
      const tlRadius = p('radius', 0);
      const tlItemPad = Math.max(tlRadius, tlBorder + ITEM_PAD);
      const tlBg = p('bgColor', '#FFFFFF');
      const tlBorderCol = SGLR.hexToColor(p('borderColor', '#000000'));
      const tlTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      const tlSelectedColor = SGLR.hexToColor(p('selectedColor', '#808080'));
      const tlFontFamily = getCssFontStack(p('fontFamily', ''));

      const tlOptions = (p('options', '') || '').split('\n').filter(o => o.length > 0);

      const surf = sglSurface(w.width, w.height);

      // 1. 背景圆角矩形 + 边框（buf32，flush 前）
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: tlBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(tlBg),
        radius: tlRadius,
        border_color: tlBorderCol,
      });

      let tlVisibleCount = 0;
      if (tlOptions.length > 0) {
        const tlSelected = 0; // 设计器默认第一项选中
        const tlInnerH = w.height - 2 * tlBorder;
        tlVisibleCount = Math.min(tlOptions.length, Math.max(1, Math.floor(tlInnerH / tlItemHeight)));

        // 顶部分隔线 (y = 0, x = item_pad ~ width-1-item_pad)
        SGLR.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, 0, 1, tlBorderCol, alpha);

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
              // 判断顶部/中间/底部项
              const isTop = selY1 <= tlBorder + r;
              const isBottom = selY2 >= w.height - 1 - tlBorder - r;
              if (isTop) {
                // 顶部项：画更大圆角矩形，裁剪到 select
                const scY1 = tlBorder;
                const scY2 = selY1 + tlItemHeight + r + 1;
                const oldClip = surf.clip;
                surf.clip = {
                  x1: Math.round(selX1 * z), y1: Math.round(selY1 * z),
                  x2: Math.round(selX2 * z), y2: Math.round(selY2 * z)
                };
                SGLR.drawFillRect(surf, selX1, scY1, selX2, scY2, r, tlSelectedColor, alpha);
                surf.clip = oldClip;
              } else if (isBottom) {
                // 底部项：画更大圆角矩形，裁剪到 select
                const scY1 = selY1 - tlItemHeight - r - 1;
                const scY2 = w.height - 1 - tlBorder;
                const oldClip = surf.clip;
                surf.clip = {
                  x1: Math.round(selX1 * z), y1: Math.round(selY1 * z),
                  x2: Math.round(selX2 * z), y2: Math.round(selY2 * z)
                };
                SGLR.drawFillRect(surf, selX1, scY1, selX2, scY2, r, tlSelectedColor, alpha);
                surf.clip = oldClip;
              } else {
                // 中间项：直角
                SGLR.drawFillRect(surf, selX1, selY1, selX2, selY2, 0, tlSelectedColor, alpha);
              }
            } else {
              // radius=0：统一直角
              SGLR.drawFillRect(surf, selX1, selY1, selX2, selY2, 0, tlSelectedColor, alpha);
            }
          }

          // 底部分隔线 (y = (i+1)*item_height, x = item_pad ~ width-1-item_pad)
          const botSepY = (i + 1) * tlItemHeight;
          if (botSepY < w.height - tlBorder - 1) {
            SGLR.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, botSepY, 1, tlBorderCol, alpha);
          }
        }
      }

      SGLR.flushSurface(surf);

      // 文本（DOM 叠加，每个选项一个 span）
      // SGL: text_x = item_pad, text_y = i*item_height + ITEM_SPACE
      if (tlOptions.length > 0 && tlVisibleCount > 0) {
        const tlHasFont = widgetHasFont(w);
        const tlCssFamily = tlHasFont ? tlFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
        const tlTextColorCss = p('textColor', '#000000');
        for (let i = 0; i < tlVisibleCount; i++) {
          const textX = tlItemPad;
          const textY = i * tlItemHeight + ITEM_SPACE;
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;left:${textX * z}px;top:${textY * z}px;color:${tlTextColorCss};font-size:${tlFontSize * z}px;font-family:${tlCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
          span.textContent = tlOptions[i] || '';
          el.appendChild(span);
        }
      }
      break;
    }
    case 'viewlist': {
      // SGL viewlist: 仅画背景圆角矩形（子项由框架绘制），用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: p('borderWidth', 1),
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(p('bgColor', '#FFFFFF')),
        radius: p('radius', 0),
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
      });
      SGLR.flushSurface(surf);
      break;
    }

    case 'scroll': {
      // SGL scroll: 严格移植自 sgl_scroll.c
      // direct: SGL_DIRECT_HORIZONTAL=0, SGL_DIRECT_VERTICAL=1
      // 算法: radius=min(radius,width/2), len=max(trackLen/8, radius*2+1),
      //       pos=value*(trackLen-len)/100
      // 渲染: 先 sgl_draw_rect 画整个 track（含边框），再用 mixer(color, BG黑, 128)
      //       画滑块 fill, 滑块圆角=radius-border
      const scDirect = p('direct', 1); // 默认垂直（SGL: 0=水平, 1=垂直）
      const scValue = p('value', 0);
      const scWidth = p('width', 10); // SGL_SCROLL_DEFAULT_WIDTH
      const scColor = SGLR.hexToColor(p('color', '#FFFFFF')); // SGL_THEME_COLOR
      const scBorderColor = SGLR.hexToColor(p('borderColor', '#000000')); // SGL_THEME_BORDER_COLOR
      const scBorder = p('borderWidth', 2); // SGL scroll desc.border=2
      const scRadius = Math.min(p('radius', 0), Math.floor(scWidth / 2));
      const scAlpha = alpha;

      const surf = sglSurface(w.width, w.height);

      // 1. track: 整个控件区域（含边框、填充）
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: scAlpha,
        border: scBorder,
        border_alpha: scAlpha,
        border_mask: 0,
        color: scColor,
        border_color: scBorderColor,
        radius: scRadius
      });

      // 2. 滑块: 颜色 = sgl_color_mixer(color, SGL_THEME_BG_COLOR(黑), 128)
      const thumbCol = SGLR.colorMixer(scColor, SGLR.hexToColor('#000000'), 128);
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
      SGLR.drawFillRect(surf, fx1, fy1, fx2, fy2, thumbRadius, thumbCol, scAlpha);

      SGLR.flushSurface(surf);
      break;
    }

    case 'box': {
      // SGL box: 严格移植自 sgl_box.c
      // 默认: bg.color=SGL_THEME_COLOR(白), border=1, radius=0, focus=1
      //       scroll_color=SGL_THEME_SCROLL_FG_COLOR(200,200,200)
      // 滚动条: SGL_BOX_SCROLL_WIDTH=4, alpha=128, 圆角=SGL_BOX_SCROLL_WIDTH/2=2
      //   scroll_height = max(height/8, 4), height = (y2-y1) - 2*radius
      //   垂直: area.x1=x2-4-radius, area.y1=y1+radius, area.x2=x2-radius
      //   水平: area.y1=y2-4-radius, area.y2=y2-radius
      const surf = sglSurface(w.width, w.height);
      const boxBg = SGLR.hexToColor(p('bgColor', '#FFFFFF')); // SGL_THEME_COLOR
      const boxBorderCol = SGLR.hexToColor(p('borderColor', '#000000')); // SGL_THEME_BORDER_COLOR
      const boxBorderW = p('borderWidth', 1); // SGL box 默认 border=1
      const boxRadius = p('radius', 0);
      const boxAlpha = alpha;
      const boxScrollColor = SGLR.hexToColor(p('scrollColor', '#C8C8C8')); // SGL_THEME_SCROLL_FG_COLOR
      const showV = p('showVScrollbar', 1);
      const showH = p('showHScrollbar', 1);
      const scrollEnable = p('scrollEnable', 1);
      // scroll_mode: 1=VERTICAL_ONLY, 2=HORIZONTAL_ONLY, 3=BOTH
      const scrollMode = p('scrollMode', 3);
      const SCROLL_W = 4;

      // 1. 背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: boxAlpha,
        border: boxBorderW,
        border_alpha: boxAlpha,
        border_mask: 0,
        color: boxBg,
        border_color: boxBorderCol,
        radius: boxRadius
      });

      // 2. 滚动条
      if (scrollEnable && scrollMode) {
        const innerH = w.height - 2 * boxRadius;
        const innerW = w.width - 2 * boxRadius;
        const scrollH = Math.max(Math.floor(innerH / 8), SCROLL_W);
        const scrollW = Math.max(Math.floor(innerW / 8), SCROLL_W);
        const scrollRadius = Math.floor(SCROLL_W / 2);

        // 垂直滚动条
        if ((scrollMode & 1) && showV) {
          const vx1 = w.width - 1 - SCROLL_W - boxRadius;
          const vy1 = boxRadius;
          const vx2 = w.width - 1 - boxRadius;
          // 简化: 滚动条位于顶部（无内容偏移时）
          const vy2 = vy1 + scrollH;
          SGLR.drawFillRect(surf, vx1, vy1, vx2, vy2, scrollRadius, boxScrollColor, 128);
        }

        // 水平滚动条
        if ((scrollMode & 2) && showH) {
          const hy1 = w.height - 1 - SCROLL_W - boxRadius;
          const hy2 = w.height - 1 - boxRadius;
          const hx1 = boxRadius;
          // 若同时显示垂直滚动条, 水平滚动条右端需让出垂直滚动条宽度
          const hx2 = ((scrollMode & 1) && showV)
            ? (w.width - 1 - SCROLL_W - boxRadius)
            : (w.width - 1 - boxRadius);
          SGLR.drawFillRect(surf, hx1, hy1, hx2, hy2, scrollRadius, boxScrollColor, 128);
        }
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'numberkbd': {
      // SGL numberkbd: 5行4列，OK键跨2行，用 SGLRenderer 像素级渲染
      // 严格移植自 sgl_numberkbd.c: enter/backspace 使用 4bpp 位图，icon 在 flush 前，文字在 flush 后
      const COL = 4, ROW = 5;
      const nkMargin = p('btnMargin', 5);
      const boxW = (w.width - (COL + 1) * nkMargin) / COL;
      const boxH = (w.height - (ROW + 1) * nkMargin) / ROW;
      const nkBtnColor = SGLR.hexToColor(p('btnColor', '#FFFFFF'));
      const nkTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      const nkBtnBorderWidth = p('btnBorderWidth', 1);
      const nkBtnBorderColor = SGLR.hexToColor(p('btnBorderColor', '#000000'));
      const nkBtnRadius = p('btnRadius', 0);
      const nkFontSize = p('fontSize', 14);
      const nkFontFamily = getCssFontStack(p('fontFamily', ''));
      // SGL 按键字符表 kbd_digits[5][4]，OK 用 ASCII 13
      const kbdDigits = [
        ['+', '-', '*', '/'],
        ['7', '8', '9', '='],
        ['4', '5', '6', '\b'],
        ['1', '2', '3', '\r'],
        ['.', '0', '%', '\r']
      ];

      const surf = sglSurface(w.width, w.height);

      // 1. 主体背景 + 边框（buf32，flush 前）
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: p('borderWidth', 2),
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(p('cellColor', '#FFFFFF')),
        radius: p('radius', 0),
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
      });

      // 2. 各按钮矩形 + 4bpp 图标（buf32，flush 前）
      //    SGL: btn_col==3 && btn_row==2 → backspace_icon
      //         btn_col==3 && btn_row==3 → btn.y2 += margin+box_h, enter_icon（跨 row3+row4）
      //         btn_col==3 && btn_row==4 → 跳过（已合并到 enter）
      const textBtns = []; // 文字按钮，flush 后再画
      for (let r = 0; r < ROW; r++) {
        for (let c = 0; c < COL; c++) {
          if (r === 4 && c === 3) continue; // OK 键合并到 row3
          const isBack = (r === 2 && c === 3);
          const isOk = (r === 3 && c === 3);
          const bx = nkMargin + c * (boxW + nkMargin);
          const by = nkMargin + r * (boxH + nkMargin);
          const bh = isOk ? (2 * boxH + nkMargin) : boxH;
          SGLR.drawRect(surf, bx, by, bx + boxW - 1, by + bh - 1, {
            alpha: alpha,
            border: nkBtnBorderWidth,
            border_alpha: alpha,
            border_mask: 0,
            color: nkBtnColor,
            radius: nkBtnRadius,
            border_color: nkBtnBorderColor,
          });
          if (isBack) {
            // backspace icon 30×13: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (boxH - 13 + 1) / 2
            const iconX = bx + Math.floor((boxW - SGLR.NUMBERKBD_BACKSPACE_ICON.width) / 2);
            const iconY = by + Math.floor((boxH - SGLR.NUMBERKBD_BACKSPACE_ICON.height + 1) / 2);
            SGLR.drawIcon(surf, iconX, iconY, nkTextColor, alpha, SGLR.NUMBERKBD_BACKSPACE_ICON);
          } else if (isOk) {
            // enter icon 30×20: text_x = x1 + (boxW - 30) / 2, text_y = y1 + (2*boxH - 20) / 2
            const iconX = bx + Math.floor((boxW - SGLR.NUMBERKBD_ENTER_ICON.width) / 2);
            const iconY = by + Math.floor((2 * boxH - SGLR.NUMBERKBD_ENTER_ICON.height) / 2);
            SGLR.drawIcon(surf, iconX, iconY, nkTextColor, alpha, SGLR.NUMBERKBD_ENTER_ICON);
          } else {
            // 文字按钮：用 "0" 字符宽度居中（SGL 用 sgl_font_get_string_width("0")）
            const ch = kbdDigits[r][c];
            textBtns.push({ x1: bx, y1: by, x2: bx + boxW - 1, y2: by + boxH - 1, ch: ch });
          }
        }
      }

      SGLR.flushSurface(surf);

      // 3. 文字按钮文本（DOM 叠加，每个按钮一个 span，居中）
      //    SGL: text_x = btn.x1 + (boxW - font_width("0")) / 2, text_y = btn.y1 + (boxH - font_height) / 2
      const nkHasFont = widgetHasFont(w);
      const nkCssFamily = nkHasFont ? nkFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const nkTextColorCss = p('textColor', '#000000');
      textBtns.forEach(b => {
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${b.x1 * z}px;top:${b.y1 * z}px;width:${(b.x2 - b.x1 + 1) * z}px;height:${(b.y2 - b.y1 + 1) * z}px;display:flex;align-items:center;justify-content:center;color:${nkTextColorCss};font-size:${nkFontSize * z}px;font-family:${nkCssFamily};pointer-events:none;white-space:nowrap;overflow:hidden;filter:var(--sgl-bpp-filter,none);`;
        span.textContent = b.ch;
        el.appendChild(span);
      });
      break;
    }

    case 'keyboard': {
      // SGL 全键盘：4 行，列数变化；按键宽度按权重分配
      // 用 SGLRenderer 像素级渲染
      const kbBodyW = w.width, kbBodyH = w.height;
      const keyMargin = Math.max(kbBodyW / 128, 1);
      const rowH = (kbBodyH - 5 * keyMargin) / 4;
      const kbBtnColor = SGLR.hexToColor(p('btnColor', '#404040'));
      const kbTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      const kbBtnRadius = p('btnRadius', 0);
      const kbBtnBorderWidth = p('btnBorderWidth', 0);
      const kbBtnBorderColor = SGLR.hexToColor(p('btnBorderColor', '#000000'));
      const kbFontSize = p('fontSize', 14);
      const kbFontFamily = getCssFontStack(p('fontFamily', ''));
      // 字母模式（UPPER/LOWER）权重表
      const keyWeights = [
        [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 7],   // 行0 12键
        [6, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7],       // 行1 11键
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],    // 行2 12键
        [2, 2, 6, 2, 2]                            // 行3 5键（空格键跨 6 份宽度）
      ];
      // 按键显示文本（字母模式，小写）
      const keyTexts = [
        ['1#', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '←'],
        ['abc', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '↵'],
        ['_', '-', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ',', ':'],
        ['kbd', '<', ' ', ' >', '↵']
      ];

      const surf = sglSurface(w.width, w.height);

      // 1. 主体背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: p('borderWidth', 1),
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(p('cellColor', '#FFFFFF')),
        radius: p('radius', 0),
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
      });

      // 2. 各按键矩形（flush 前）
      const kbRects = [];
      for (let r = 0; r < 4; r++) {
        const weights = keyWeights[r];
        const texts = keyTexts[r];
        const numKeys = weights.length;
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const availW = kbBodyW - (numKeys + 1) * keyMargin;
        const unitW = availW / totalWeight;
        const ky = keyMargin + r * (rowH + keyMargin);
        let kx = keyMargin;
        for (let c = 0; c < numKeys; c++) {
          const kw = unitW * weights[c];
          SGLR.drawRect(surf, kx, ky, kx + kw - 1, ky + rowH - 1, {
            alpha: alpha,
            border: kbBtnBorderWidth,
            border_alpha: alpha,
            border_mask: 0,
            color: kbBtnColor,
            radius: kbBtnRadius,
            border_color: kbBtnBorderColor,
          });
          kbRects.push({ x1: kx, y1: ky, x2: kx + kw - 1, y2: ky + rowH - 1, txt: texts[c] });
          kx += kw + keyMargin;
        }
      }

      SGLR.flushSurface(surf);

      // 3. 按键文本（DOM 叠加，每个按键一个 span，居中）
      const kbHasFont = widgetHasFont(w);
      const kbCssFamily = kbHasFont ? kbFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const kbTextColorCss = p('textColor', '#000000');
      kbRects.forEach(b => {
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${b.x1 * z}px;top:${b.y1 * z}px;width:${(b.x2 - b.x1 + 1) * z}px;height:${(b.y2 - b.y1 + 1) * z}px;display:flex;align-items:center;justify-content:center;color:${kbTextColorCss};font-size:${kbFontSize * z}px;font-family:${kbCssFamily};pointer-events:none;white-space:nowrap;overflow:hidden;filter:var(--sgl-bpp-filter,none);`;
        span.textContent = b.txt;
        el.appendChild(span);
      });
      break;
    }

    case 'textline': {
      // SGL textline: bg_flag 默认 true，背景圆角矩形(bg_color)，多行文本起始 (x1+radius, y1+radius)
      // 用 SGLRenderer 像素级渲染
      const tlFontSize = p('fontSize', 14);
      const tlFontHeight = tlFontSize + 8;
      const tlRadius = p('radius', 0);
      const tlBgTransparent = p('bgTransparent', false);
      const tlBg = p('bgColor', '#FFFFFF');
      const tlTextColor = SGLR.hexToColor(p('textColor', p('color', '#000000')));
      const tlLineMargin = p('lineMargin', 1);
      const tlFontFamily = getCssFontStack(p('fontFamily', ''));

      const surf = sglSurface(w.width, w.height);
      // 背景
      if (!tlBgTransparent) {
        SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, tlRadius, SGLR.hexToColor(tlBg), alpha);
      }
      SGLR.flushSurface(surf);
      // 多行文本（DOM 叠加），起始 (radius, radius)
      const tlText = p('text', '');
      if (tlText) {
        overlayText({
          text: tlText,
          color: p('textColor', p('color', '#000000')),
          fontSize: tlFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'TOP_LEFT',
          x: tlRadius, y: tlRadius, w: w.width - tlRadius, h: w.height - tlRadius,
          lineMargin: tlLineMargin,
          multiline: true,
          maxWidth: w.width - tlRadius
        });
      }
      break;
    }

    case 'scope': {
      // SGL scope: 严格移植自 sgl_scope.c
      // 默认: bg=黑(0,0,0), grid=(50,50,50), border_width=0, border_color=(150,150,150)
      //       min=0, max=0xFFFF, line_width=2, grid_style=0(实线), alpha=255
      //       waveform_colors[0]=绿(0,255,0), y_label_color=白
      // 网格: 中心十字线 + 10 条垂直 + 10 条水平网格线
      // 波形: 从右向左画, Y 轴反转 (y = y2 - (value-min)*height/(max-min))
      const spBg = SGLR.hexToColor(p('bgColor', '#000000')); // SGL: (0,0,0)
      const spBorderWidth = p('borderWidth', 0); // SGL 默认 0
      const spBorderColor = SGLR.hexToColor(p('borderColor', '#969696')); // SGL: (150,150,150)
      const spGridColor = SGLR.hexToColor(p('gridColor', '#323232')); // SGL: (50,50,50)
      const spWaveColor = SGLR.hexToColor(p('color', '#00FF00')); // SGL: (0,255,0) 绿
      const spAlpha = alpha;
      const spLineWidth = p('lineWidth', 2);
      // grid_style: 0=实线, >0=虚线 (gap 长度)
      const spGridStyle = p('gridStyle', 0);

      const surf = sglSurface(w.width, w.height);

      // 1. 背景 + 边框（radius=0, SGL 不带圆角）
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: spAlpha,
        border: spBorderWidth,
        border_alpha: spAlpha,
        border_mask: 0,
        color: spBg,
        border_color: spBorderColor,
        radius: 0
      });

      // 2. 中心十字线
      const xCenter = Math.floor((w.width - 1) / 2);
      const yCenter = Math.floor((w.height - 1) / 2);
      if (spGridStyle > 0) {
        // SGL dashed: 周期 2*gap, dash=gap, gap=gap
        SGLR.drawDashedLine(surf, 0, yCenter, w.width - 1, yCenter, spGridStyle, spGridStyle, spGridColor, spAlpha);
        SGLR.drawDashedLine(surf, xCenter, 0, xCenter, w.height - 1, spGridStyle, spGridStyle, spGridColor, spAlpha);
      } else {
        SGLR.drawHLine(surf, 0, w.width - 1, yCenter, 1, spGridColor, spAlpha);
        SGLR.drawVLine(surf, xCenter, 0, w.height - 1, 1, spGridColor, spAlpha);
      }

      // 3. 10 条垂直网格线 (i=1..9)
      for (let i = 1; i < 10; i++) {
        const x = Math.floor(w.width * i / 10);
        if (spGridStyle > 0) {
          SGLR.drawDashedLine(surf, x, 0, x, w.height - 1, spGridStyle, spGridStyle, spGridColor, spAlpha);
        } else {
          SGLR.drawVLine(surf, x, 0, w.height - 1, 1, spGridColor, spAlpha);
        }
      }

      // 4. 10 条水平网格线 (i=1..9)
      for (let i = 1; i < 10; i++) {
        const y = Math.floor(w.height * i / 10);
        if (spGridStyle > 0) {
          SGLR.drawDashedLine(surf, 0, y, w.width - 1, y, spGridStyle, spGridStyle, spGridColor, spAlpha);
        } else {
          SGLR.drawHLine(surf, 0, w.width - 1, y, 1, spGridColor, spAlpha);
        }
      }

      // 5. 波形: 从右向左画, Y 轴反转
      // SGL: start.x = x2; start.y = y2 - (value-min)*height/(max-min)
      //      end.x = x2 - i*width/(data_points-1)
      const dataPoints = Math.min(w.width, 64);
      const pts = [];
      for (let i = 0; i < dataPoints; i++) {
        // 模拟正弦波, 值域 [0, height]
        const v = Math.floor((Math.sin(i * 0.2) * 0.4 + 0.5) * (w.height - 1));
        const px = w.width - 1 - Math.floor(i * (w.width - 1) / (dataPoints - 1));
        // Y 轴反转: 大值在上 (y 小)
        const py = (w.height - 1) - v;
        pts.push({ x: px, y: py });
      }
      for (let i = 1; i < pts.length; i++) {
        SGLR.drawLine(surf, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, spLineWidth, spWaveColor, spAlpha);
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'spectrum': {
      // SGL spectrum: 严格移植自 sgl_spectrum.c
      // 默认: alpha=255, bar_color=SGL_THEME_BG_COLOR(黑), bar_hat_color=mixer(BG黑,COLOR白,128)=灰
      //       bar_mode=SGL_SPECTRUM_MODE_BLOCK(2), bar_hat_height=3
      // bar_width = sgl_obj_get_width(obj) / (bar_num + 1)
      // BAR 模式: rect.y1 = y2 - bar_value[i], 连续填充
      // BLOCK 模式: 每个 bar 由多个 block 组成, block 高度=bar_hat_height, 间隔 1px
      //   for (rect.y2 = y2; rect.y2 > pos; rect.y2 -= (bar_hat_height + 1)):
      //     rect.y1 = rect.y2 - bar_hat_height + 1
      // HAT 模式: rect_hat.y1 = min(y2 - bar_hat[i], rect.y1 - bar_hat_height)
      // bar 间距: rect.x1 += (bar_width + 1)  (即 gap=1px)
      const specAlpha = alpha;
      const specBarColor = SGLR.hexToColor(p('barColor', '#000000')); // SGL: SGL_THEME_BG_COLOR
      const specHatColor = SGLR.hexToColor(p('hatColor', '#808080')); // SGL: mixer(黑, 白, 128)
      const specBarNum = p('barNum', 12);
      const specBarWidth = Math.floor(w.width / (specBarNum + 1));
      const specHatHeight = p('hatHeight', 3);
      // mode: 1=BAR, 2=BLOCK, 5=BAR_HAT, 6=BLOCK_HAT
      const specMode = p('barMode', 2);
      const hasHat = (specMode & 4) !== 0;
      const isBlock = (specMode & 2) !== 0;
      const isBar = (specMode & 1) !== 0;

      const surf = sglSurface(w.width, w.height);

      // 模拟频谱数据 (bar_value 数组)
      const values = [];
      for (let i = 0; i < specBarNum; i++) {
        values.push(Math.floor((Math.sin(i * 0.5) * 0.3 + 0.5) * w.height));
      }
      // hat 值 (峰值跟随), 这里简化为 0
      const hatValues = new Array(specBarNum).fill(0);

      // SGL: rect.x1 = obj->coords.x1, rect.y2 = obj->coords.y2
      let rectX1 = 0;
      const objY2 = w.height - 1;

      if (isBar) {
        // BAR 模式: 连续填充
        for (let i = 0; i < specBarNum; i++) {
          const rectX2 = rectX1 + specBarWidth - 1;
          const rectY1 = objY2 - values[i];
          SGLR.drawFillRect(surf, rectX1, rectY1, rectX2, objY2, 0, specBarColor, specAlpha);
          if (hasHat) {
            const hatY1 = Math.min(objY2 - hatValues[i], rectY1 - specHatHeight);
            const hatY2 = hatY1 + specHatHeight - 1;
            SGLR.drawFillRect(surf, rectX1, hatY1, rectX2, hatY2, 0, specHatColor, specAlpha);
          }
          rectX1 += (specBarWidth + 1);
        }
      } else if (isBlock) {
        // BLOCK 模式: 每隔 (bar_hat_height + 1) 像素画一个 block
        for (let i = 0; i < specBarNum; i++) {
          const pos = objY2 - values[i];
          const rectX2 = rectX1 + specBarWidth - 1;
          let lastRectY1 = objY2;
          for (let curY2 = objY2; curY2 > pos; curY2 -= (specHatHeight + 1)) {
            const curY1 = curY2 - specHatHeight + 1;
            SGLR.drawFillRect(surf, rectX1, curY1, rectX2, curY2, 0, specBarColor, specAlpha);
            lastRectY1 = curY1;
          }
          if (hasHat) {
            const hatY1 = Math.min(objY2 - hatValues[i], lastRectY1 - specHatHeight);
            const hatY2 = hatY1 + specHatHeight - 1;
            SGLR.drawFillRect(surf, rectX1, hatY1, rectX2, hatY2, 0, specHatColor, specAlpha);
          }
          rectX1 += (specBarWidth + 1);
        }
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'qrcode': {
      // SGL qrcode: 白底 + 7x7 黑色单元格网格，用 SGLRenderer 像素级渲染
      const qrBg = SGLR.hexToColor(p('bgColor', '#ffffff'));
      const qrBorderWidth = p('borderWidth', 1);
      const qrBorderColor = SGLR.hexToColor(p('borderColor', '#000000'));
      const qrColor = SGLR.hexToColor(p('color', '#000000'));
      const grid = 7;
      const seed = 42;

      const surf = sglSurface(w.width, w.height);

      // 1. 白色背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: qrBorderWidth,
        border_alpha: alpha,
        border_mask: 0,
        color: qrBg,
        radius: 0,
        border_color: qrBorderColor,
      });

      // 2. 7x7 黑色单元格
      const cellW = w.width / grid;
      const cellH = w.height / grid;
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          if ((r * 7 + c + seed) % 3 !== 0) {
            const cx1 = Math.round(c * cellW);
            const cy1 = Math.round(r * cellH);
            const cx2 = Math.round((c + 1) * cellW) - 1;
            const cy2 = Math.round((r + 1) * cellH) - 1;
            SGLR.drawFillRect(surf, cx1, cy1, cx2, cy2, 0, qrColor, alpha);
          }
        }
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'chart': {
      // SGL chart: 背景 + 折线图，用 SGLRenderer 像素级渲染
      const chartBg = SGLR.hexToColor(p('bgColor', '#1e1e2e'));
      const chartBorderWidth = p('borderWidth', 1);
      const chartBorderColor = SGLR.hexToColor(p('borderColor', '#3d3d5c'));
      const chartRadius = p('radius', 4);
      const chartColor = SGLR.hexToColor(p('color', '#8b5cf6'));
      const pts = [[0.2, 0.8], [0.4, 0.3], [0.6, 0.6], [0.8, 0.2], [1.0, 0.5]];

      const surf = sglSurface(w.width, w.height);

      // 1. 背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: chartBorderWidth,
        border_alpha: alpha,
        border_mask: 0,
        color: chartBg,
        radius: chartRadius,
        border_color: chartBorderColor,
      });

      // 2. 折线图：连接 5 个数据点
      // 填充区域颜色 = color 与 bg 50% 混合（半透明效果）
      const fillColor = SGLR.colorMixer(chartColor, chartBg, 128);
      const ptsPx = pts.map(([x, y]) => ({
        x: Math.round(x * (w.width - 1)),
        y: Math.round((1 - y) * (w.height - 1)),
      }));
      // 逐行扫描填充区域（从折线到底部）
      for (let i = 0; i < ptsPx.length - 1; i++) {
        const p1 = ptsPx[i], p2 = ptsPx[i + 1];
        const yMin = Math.min(p1.y, p2.y);
        const yMax = w.height - 1;
        for (let y = yMin; y <= yMax; y++) {
          // 线性插值求该 y 对应的左右 x 边界
          if (p2.y !== p1.y) {
            const t1 = (y - p1.y) / (p2.y - p1.y);
            const xInt = Math.round(p1.x + t1 * (p2.x - p1.x));
            if (y >= Math.min(p1.y, p2.y) && y <= Math.max(p1.y, p2.y)) {
              SGLR.drawHLine(surf, xInt, w.width - 1, y, 1, fillColor, alpha);
            }
          }
        }
      }
      // 画折线
      for (let i = 0; i < ptsPx.length - 1; i++) {
        SGLR.drawLine(surf, ptsPx[i].x, ptsPx[i].y, ptsPx[i + 1].x, ptsPx[i + 1].y, 2, chartColor, alpha);
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'canvas': {
      // SGL canvas: 背景 + 边框 + 网格线（painter 占位），用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const cvBg = SGLR.hexToColor(p('bgColor', '#1e1e2e'));
      const cvBorderCol = SGLR.hexToColor(p('borderColor', '#3d3d5c'));
      const cvBorderW = p('borderWidth', 1);
      const cvRadius = p('radius', 4);
      const cvGridCol = SGLR.hexToColor(p('color', '#8b5cf6'));
      // 背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: cvBorderW, border_alpha: alpha, border_mask: 0,
        color: cvBg, border_color: cvBorderCol, radius: cvRadius
      });
      // 网格线（透明度 0.1 ≈ 26）
      const gridAlpha = Math.round(alpha * 0.1);
      const step = 10;
      for (let x = step; x < w.width; x += step) {
        SGLR.drawVLine(surf, x, 0, w.height - 1, 1, cvGridCol, gridAlpha);
      }
      for (let y = step; y < w.height; y += step) {
        SGLR.drawHLine(surf, 0, w.width - 1, y, 1, cvGridCol, gridAlpha);
      }
      SGLR.flushSurface(surf);
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
      //   第一层在秒针前画，第二层和第三层在秒针后画
      const acBg = SGLR.hexToColor(p('bgColor', '#000000'));
      const acScaleCol = SGLR.hexToColor(p('scaleColor', '#FFFFFF'));
      const acTextCol = SGLR.hexToColor(p('textColor', '#FFFFFF'));
      const acHourCol = SGLR.hexToColor(p('hourPtrColor', '#FFFFFF'));
      const acMinCol = SGLR.hexToColor(p('minPtrColor', '#FFFFFF'));
      const acSecCol = SGLR.hexToColor(p('secPtrColor', '#FF0000'));
      const acHubCol = SGLR.hexToColor(p('hubColor', '#FF0000'));
      const acScaleW = p('scaleWidth', 1);
      const acScaleLen = Math.max(p('scaleLength', 8), 4);
      const acHourW = p('hourPtrWidth', 5);
      const acMinW = p('minPtrWidth', 5);
      const acSecW = p('secPtrWidth', 2);
      const acHubR = Math.max(5, p('hubRadius', 6));
      const acFontSize = p('fontSize', 12);
      const acFontH = acFontSize + 8; // SGL sgl_font_get_height
      const acFontFamily = getCssFontStack(p('fontFamily', ''));
      const hour = p('hour', 0), minute = p('minute', 0), second = p('second', 0);

      const cx = w.width / 2;
      const cy = w.height / 2;
      const r = Math.max(0, Math.max(p('radius', 0), w.width / 2 - 1));
      const acBorderW = Math.min(p('borderWidth', 0), r);
      const innerR = Math.max(0, r - acBorderW);
      const scaleOut = Math.max(0, innerR - 2);
      const scaleIn = Math.max(0, scaleOut - acScaleLen);
      // SGL: h_len=inner_r/2, m_len=inner_r*160/256, s_len_1=inner_r*217/256, s_len_2=inner_r*39/256
      const hLen = innerR / 2;
      const mLen = (innerR * 160) >> 8;
      const sLen1 = (innerR * 217) >> 8;
      const sLen2 = (innerR * 39) >> 8;
      // 次刻度颜色 = scaleColor 与 bg 50% 混合
      const subScaleCol = SGLR.colorMixer(acScaleCol, acBg, 128);

      const surf = sglSurface(w.width, w.height);
      const deg2rad = d => d * Math.PI / 180;

      // 1. 背景圆 (bgColor)
      SGLR.drawFillCircle(surf, cx, cy, r, acBg, alpha);

      // 2. 边框环（如 borderWidth > 0）
      if (acBorderW > 0) {
        SGLR.drawFillRing(surf, cx, cy, innerR, r, acBg, alpha);
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
        // SGL: j==5 时用 scale_color，其他用 sub_scale_color；j==0 时显示数字
        const isMain = (i % 5 === 0);
        const lineW = isMain ? Math.max(1, acScaleW * 2) : Math.max(1, acScaleW);
        const lineCol = isMain ? acScaleCol : subScaleCol;
        SGLR.drawLine(surf, xo, yo, xi, yi, lineW, lineCol, alpha);
      }

      // 4. 时针、分针（两段式：细柄 中心→尾部 + 粗头 尾部→前端）
      // SGL: h_angle = (hour%12)*30 + min/2 - 90, m_angle = min*6 - 90
      const hAngle = ((hour % 12) * 30 + Math.floor(minute / 2)) - 90;
      const mAngle = (minute * 6) - 90;
      const sAngle = (second * 6) - 90;
      function drawHand(angleDeg, tailLen, tipLen, mainWidth, tailWidth, color) {
        const rad = deg2rad(angleDeg);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const sx = cx + tailLen * cos;  // 尾部
        const sy = cy + tailLen * sin;
        const px = cx + tipLen * cos;   // 前端
        const py = cy + tipLen * sin;
        // SGL: 先画 尾部→前端（粗），再画 中心→尾部（细）
        SGLR.drawLine(surf, sx, sy, px, py, mainWidth, color, alpha);
        if (tailWidth > 0 && tailLen > 0) {
          SGLR.drawLine(surf, cx, cy, sx, sy, tailWidth, color, alpha);
        }
      }
      drawHand(hAngle, sLen2, hLen, acHourW, acSecW, acHourCol);
      drawHand(mAngle, sLen2, mLen, acMinW, acSecW, acMinCol);

      // 5. hub 第一层（minPtrColor, hub_r+1，坐标 cx-1, cy-1）- 在秒针前画
      SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR + 1, acMinCol, alpha);

      // 6. 秒针（反向尾部 -s_len_2 → 前端 s_len_1）
      const sRad = deg2rad(sAngle);
      const sCos = Math.cos(sRad), sSin = Math.sin(sRad);
      SGLR.drawLine(surf, cx - sLen2 * sCos, cy - sLen2 * sSin, cx + sLen1 * sCos, cy + sLen1 * sSin, acSecW, acSecCol, alpha);

      // 7. hub 第二层（hubColor, hub_r，坐标 cx-1, cy-1）- 在秒针后画
      SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR, acHubCol, alpha);
      // 8. hub 第三层（bgColor, hub_r-2，坐标 cx-1, cy-1）- 内凹效果
      if (acHubR - 2 > 0) {
        SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR - 2, acBg, alpha);
      }

      SGLR.flushSurface(surf);

      // 9. 数字（DOM 叠加，每个数字一个 span）- SGL: i==0 显示 12, 其他显示 i/5
      const acHasFont = widgetHasFont(w);
      const acCssFamily = acHasFont ? acFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const acTextColCss = p('textColor', '#FFFFFF');
      for (let i = 0; i < 60; i++) {
        if (i % 5 !== 0) continue;
        const angle = i * 6 - 90;
        const rad = deg2rad(angle);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const text = i === 0 ? '12' : String(i / 5);
        const textR = Math.max(0, scaleIn - acFontH - 2);
        const tx = cx + textR * cos;
        const ty = cy + textR * sin;
        const tw = SGLR.stringWidth(text, acFontSize);
        const th = SGLR.fontHeight(acFontSize);
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${Math.round((tx - tw / 2) * z)}px;top:${Math.round((ty - th / 2) * z)}px;color:${acTextColCss};font-size:${acFontSize * z}px;font-family:${acCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
        span.textContent = text;
        el.appendChild(span);
      }
      break;
    }

    case 'icon':
    case 'sprite': {
      // SGL icon/sprite: 背景矩形 + 边框 + 居中占位文本，用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const iconBg = SGLR.hexToColor(p('bgColor', '#000000'));
      const iconBorderCol = SGLR.hexToColor(p('borderColor', '#000000'));
      const iconBorderW = p('borderWidth', 0);
      const iconRadius = p('radius', 4);
      const iconColor = SGLR.hexToColor(p('color', '#8b5cf6'));
      // 背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: iconBorderW, border_alpha: alpha, border_mask: 0,
        color: iconBg, border_color: iconBorderCol, radius: iconRadius
      });
      SGLR.flushSurface(surf);
      // 占位文本（DOM 叠加，居中）
      const iconMap = { 'icon': '★', 'sprite': '◆', '2dball': '●' };
      const iconText = iconMap[w.type] || '●';
      const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
      if (iconFontSize > 0) {
        overlayText({
          text: iconText,
          color: p('color', '#8b5cf6'),
          fontSize: iconFontSize,
          fontFamily: '',
          align: 'CENTER',
          x: 0, y: 0, w: w.width, h: w.height
        });
      }
      break;
    }

    case '2dball': {
      // SGL 2dball: 线性渐变球体，中心 color，边缘 bgColor
      // SGL: radius = sgl_obj_get_width(obj) / 2, 默认 color=白, bg=黑
      const ballColor = p('color', '#FFFFFF');
      const ballBg = p('bgColor', '#000000');
      const surf = sglSurface(w.width, w.height);
      const cx = w.width / 2;
      const cy = w.height / 2;
      const radius = w.width / 2;
      SGLR.draw2dBall(surf, cx, cy, radius, SGLR.hexToColor(ballColor), SGLR.hexToColor(ballBg), alpha);
      SGLR.flushSurface(surf);
      break;
    }

    case 'statusbar': {
      // SGL statusbar: 半透明背景 + 左右槽位文本，用 SGLRenderer 像素级渲染
      const sbFontSize = p('fontSize', 14);
      const sbFontHeightVal = sbFontSize + 8;
      const sbBg = SGLR.hexToColor(p('bgColor', '#141414'));
      const sbBgAlpha = p('bgAlpha', 128);
      const sbRadius = p('radius', 0);
      const sbLeftMargin = p('leftMargin', 5);
      const sbRightMargin = p('rightMargin', 5);
      const sbSlotSpace = p('slotSpace', 4);
      const sbSlotColor = SGLR.hexToColor(p('slotColor', '#ffffff'));
      const sbSlotAlpha = p('slotAlpha', 255);
      const sbFontFamily = p('fontFamily', '');

      // 解析槽位文本（格式: 0:文本;1:文本）
      const parseSbSlots = (str) => {
        const map = {};
        (str || '').split(';').map(s => s.trim()).filter(s => s).forEach(slot => {
          const idx = slot.indexOf(':');
          const index = idx >= 0 ? (parseInt(slot.slice(0, idx).trim()) || 0) : 0;
          const text = idx >= 0 ? slot.slice(idx + 1).trim() : slot;
          map[index] = text;
        });
        return map;
      };
      const sbLeftMap = parseSbSlots(p('leftSlots', ''));
      const sbRightMap = parseSbSlots(p('rightSlots', ''));
      const sbText = p('text', '');
      if (sbText && sbLeftMap[0] === undefined) sbLeftMap[0] = sbText;

      const surf = sglSurface(w.width, w.height);
      // 半透明背景
      SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, sbRadius, sbBg, Math.round(sbBgAlpha * alpha / 255));
      SGLR.flushSurface(surf);

      // 垂直居中
      const sbPosY = Math.round((w.height - sbFontHeightVal) / 2);
      const slotAlphaEff = Math.round(sbSlotAlpha * alpha / 255);
      const sbHasFont = widgetHasFont(w);
      const sbCssFamily = sbHasFont ? getCssFontStack(sbFontFamily) : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const sbSlotColorCss = p('slotColor', '#ffffff');
      const sbSlotOpacity = slotAlphaEff / 255;

      // 左侧槽位（从左到右，DOM 叠加）
      let leftX = sbLeftMargin;
      for (let i = 0; i < 4; i++) {
        if (sbLeftMap[i] === undefined) continue;
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${leftX * z}px;top:${sbPosY * z}px;color:${sbSlotColorCss};font-size:${sbFontSize * z}px;font-family:${sbCssFamily};pointer-events:none;white-space:nowrap;opacity:${sbSlotOpacity};filter:var(--sgl-bpp-filter,none);`;
        span.textContent = sbLeftMap[i];
        el.appendChild(span);
        leftX += SGLR.stringWidth(sbLeftMap[i], sbFontSize) + sbSlotSpace;
      }
      // 右侧槽位（从右到左，DOM 叠加）
      let rightX = w.width - sbRightMargin;
      for (let i = 0; i < 8; i++) {
        if (sbRightMap[i] === undefined) continue;
        const tw = SGLR.stringWidth(sbRightMap[i], sbFontSize);
        rightX -= tw;
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${rightX * z}px;top:${sbPosY * z}px;color:${sbSlotColorCss};font-size:${sbFontSize * z}px;font-family:${sbCssFamily};pointer-events:none;white-space:nowrap;opacity:${sbSlotOpacity};filter:var(--sgl-bpp-filter,none);`;
        span.textContent = sbRightMap[i];
        el.appendChild(span);
        rightX -= sbSlotSpace;
      }
      break;
    }

    case 'ext_img': {
      // SGL ext_img: 背景 + 边框 + 居中占位文本（rotation/scale 仅作注释标注），用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const eiBg = SGLR.hexToColor('#313149');
      const eiBorderCol = SGLR.hexToColor('#3d3d5c');
      // 背景 + 边框
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: 1, border_alpha: alpha, border_mask: 0,
        color: eiBg, border_color: eiBorderCol, radius: 4
      });
      SGLR.flushSurface(surf);
      // 占位文本（DOM 叠加，居中，带 alpha）
      const eiText = 'IMG';
      const eiFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
      const eiAlphaCss = Math.round(alpha * 0.4) / 255;
      overlayText({
        text: eiText,
        color: `rgba(139,92,246,${eiAlphaCss})`,
        fontSize: eiFontSize,
        fontFamily: '',
        align: 'CENTER',
        x: 0, y: 0, w: w.width, h: w.height
      });
      break;
    }

    default: {
      // SGL 默认: 背景 + 边框 + 居中类型名，用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const defBg = SGLR.hexToColor(p('bgColor', '#313149'));
      const defBorderCol = SGLR.hexToColor(p('borderColor', '#8b5cf6'));
      const defBorderW = p('borderWidth', 1);
      const defRadius = p('radius', 4);
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha, border: defBorderW, border_alpha: alpha, border_mask: 0,
        color: defBg, border_color: defBorderCol, radius: defRadius
      });
      SGLR.flushSurface(surf);
      // 居中类型名（DOM 叠加，带 alpha）
      const defColorHex = p('color', '#8b5cf6');
      const defAlphaCss = Math.round(alpha * 0.7) / 255;
      const defR = parseInt(defColorHex.slice(1, 3), 16);
      const defG = parseInt(defColorHex.slice(3, 5), 16);
      const defB = parseInt(defColorHex.slice(5, 7), 16);
      const defFontSize = 12;
      const defText = w.type || '';
      overlayText({
        text: defText,
        color: `rgba(${defR},${defG},${defB},${defAlphaCss})`,
        fontSize: defFontSize,
        fontFamily: '',
        align: 'CENTER',
        x: 0, y: 0, w: w.width, h: w.height
      });
    }
  }

  // 选中状态覆盖（仅虚线边框，已在 drawWidget 中通过 CSS class 添加）
}

function parseSelectValue(prop, strVal) {
  if (strVal === 'true') return true;
  if (strVal === 'false') return false;
  const meta = PROP_META[prop];
  if (meta && meta.type === 'select' && meta.options) {
    const opt = meta.options.find(([v]) => String(v) === strVal);
    if (opt) return opt[0];
  }
  return strVal;
}

function addResizeHandles(container, wx, wy, ww, wh, z) {
  const x = wx * z;
  const y = wy * z;
  const w = ww * z;
  const h = wh * z;
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
    canvas.appendChild(handle);
    // 根据容器位置计算手柄坐标（手柄尺寸 10x10，偏移 5px）
    let hx = x, hy = y;
    if (pos.includes('e')) hx = x + w - 5;
    if (pos.includes('w')) hx = x - 5;
    if (pos.includes('s')) hy = y + h - 5;
    if (pos.includes('n')) hy = y - 5;
    if (pos === 'n' || pos === 's') hx = x + w / 2 - 5;
    if (pos === 'w' || pos === 'e') hy = y + h / 2 - 5;
    handle.style.left = hx + 'px';
    handle.style.top = hy + 'px';
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
  if (e.target === canvas) {
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

  // 控件名称（C 代码变量名）
  html += `<div class="form-group" style="margin-bottom:8px;">`;
  html += `<label class="form-label">控件名称 <span style="font-weight:normal;color:var(--text-muted);font-size:10px;">(C 变量名)</span></label>`;
  html += `<input type="text" class="form-input" data-prop="name" value="${escapeAttr(w.name || w.id)}" placeholder="如 btn_1" style="font-family:monospace;" />`;
  html += `</div>`;

  // 位置与尺寸（通用），右侧加锁定图标
  const hasLocked = propList.includes('locked');
  const lockIconSvg = w.locked
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
  html += `<div class="form-group" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
  html += `<label class="form-label" style="margin-bottom:0;">位置与尺寸</label>`;
  if (hasLocked) {
    html += `<button type="button" class="lock-icon-btn ${w.locked ? 'locked' : ''}" data-prop="locked" data-bool="1" title="${w.locked ? '解锁控件' : '锁定控件'}">${lockIconSvg}</button>`;
  }
  html += `</div>`;
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

  // 根据 properties 列表 + PROP_META 动态渲染属性（跳过 locked，已在位置与尺寸标题处显示）
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
        const defaultVal = (WIDGET_DEFAULTS[w.type] && WIDGET_DEFAULTS[w.type][prop]) || meta.options[0][0];
        const curStr = rawVal != null ? String(rawVal) : String(defaultVal);
        meta.options.forEach(([optVal, optLabel]) => {
          const optStr = String(optVal);
          html += `<option value="${optStr}" ${curStr === optStr ? 'selected' : ''}>${optLabel}</option>`;
        });
        html += `</select></div>`;
      }
    } else if (prop === 'options') {
      // 选项文本：用可添加/删除的列表编辑，内部自动用 \n 拼接
      const opts = (typeof rawVal === 'string' ? rawVal : '').split('\n').filter(o => o.length > 0);
      html += `<div class="form-group" data-options-group>`;
      html += `<label class="form-label">${label}</label>`;
      html += `<div class="options-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">`;
      if (opts.length === 0) {
        html += `<div style="font-size:11px;color:var(--text-muted);padding:2px 0;">暂无选项</div>`;
      } else {
        opts.forEach((opt, idx) => {
          html += `<div class="option-item" style="display:flex;gap:4px;align-items:center;">`;
          html += `<input type="text" class="form-input option-input" data-option-idx="${idx}" value="${escapeAttr(opt)}" placeholder="选项文本" style="flex:1;font-size:12px;" />`;
          html += `<button type="button" class="option-delete-btn" data-option-idx="${idx}" title="删除" style="background:none;color:#ef4444;border:none;cursor:pointer;font-size:14px;padding:2px 6px;">✕</button>`;
          html += `</div>`;
        });
      }
      html += `</div>`;
      html += `<button type="button" class="option-add-btn" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;width:100%;">+ 添加选项</button>`;
      html += `</div>`;
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

    // 控件名称：单独校验 C 标识符规则与唯一性
    if (prop === 'name') {
      input.addEventListener('input', () => {
        const val = input.value.trim();
        if (val && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val)) {
          input.style.borderColor = 'var(--error)';
        } else {
          input.style.borderColor = '';
        }
      });
      input.addEventListener('blur', () => {
        const val = input.value.trim();
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        if (!wgt) return;
        if (!val) {
          input.value = wgt.name || wgt.id;
          return;
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val)) {
          showToast('控件名称只能包含英文字母、数字和下划线，且不能以数字开头');
          input.value = wgt.name || wgt.id;
          input.style.borderColor = '';
          return;
        }
        const page = AppState.getCurrentPage();
        const duplicate = page && page.widgets.some(ww => ww.id !== wgt.id && (ww.name || ww.id) === val);
        if (duplicate) {
          showToast('控件名称已存在，请使用唯一名称');
          input.value = wgt.name || wgt.id;
          input.style.borderColor = '';
          return;
        }
        AppState.updateWidget(wgt.id, { name: val });
      });
      return;
    }

    if (isBool) {
      input.addEventListener('click', () => {
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        AppState.updateWidget(AppState.selectedWidgetId, { [prop]: !wgt[prop] });
      });
      return;
    }

    // parentId/fontFamily 不需要 input 事件（由 change 事件处理），其他属性绑定 input 事件
    if (prop !== 'parentId' && prop !== 'fontFamily') {
      input.addEventListener('input', () => {
        let val;
        if (input.type === 'number') val = parseFloat(input.value) || 0;
        else if (input.type === 'select-one') {
          val = parseSelectValue(prop, input.value);
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

          // Circle 控件：修改 radius 时同步更新宽高
          if (w.type === 'circle' && prop === 'radius') {
            const newRadius = Math.max(0, Math.round(parseFloat(input.value) || 0));
            w.radius = newRadius;
            if (newRadius > 0) {
              w.width = newRadius * 2;
              w.height = newRadius * 2;
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

          // ============ Line 控件属性联动 ============
          // 中心线语义：x1/y1, x2/y2 是中心线端点坐标
          // 调整线宽：直线时 height = lineWidth，线在控件内居中
          // 调整 Y2：线宽不变，高度随 Y2 变化（可能变斜线）
          // 调整 height：线宽不变，Y1=Y2 保持相等（水平线），线在控件内居中

          // Line 控件：修改线宽后同步控件尺寸
          if (w.type === 'line' && prop === 'lineWidth') {
            // 重新计算中心线 y 坐标（保持控件 y 不变，线居中）
            const lw = Math.max(1, w.lineWidth != null ? w.lineWidth : 1);
            const isHorizontal = w.y2 != null && Math.abs(w.y2 - w.y1) < lw;
            const isVertical = w.x2 != null && Math.abs(w.x2 - w.x1) < lw;
            if (isHorizontal && !isVertical) {
              // 水平线：y1 = y2 = y + (lw-1)/2, height = lw
              w.y1 = w.y + Math.floor((lw - 1) / 2);
              w.y2 = w.y1;
            } else if (isVertical && !isHorizontal) {
              // 垂直线：x1 = x2 = x + (lw-1)/2, width = lw
              w.x1 = w.x + Math.floor((lw - 1) / 2);
              w.x2 = w.x1;
            }
            AppState.syncLineBounds(w);
          }

          // Line 控件：修改 x1/y1/x2/y2（中心线端点）
          if (w.type === 'line' && (prop === 'x1' || prop === 'y1' || prop === 'x2' || prop === 'y2')) {
            // 直接更新中心线端点，syncLineBounds 计算控件位置和尺寸
            AppState.syncLineBounds(w);
          }

          // Line 控件：修改 x/y/width/height
          if (w.type === 'line' && (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height')) {
            const lw = Math.max(1, w.lineWidth != null ? w.lineWidth : 1);
            if (prop === 'x' || prop === 'y') {
              // 移动控件：中心线端点同步移动
              const dx = prop === 'x' ? (val - w.x) : 0;
              const dy = prop === 'y' ? (val - w.y) : 0;
              w.x = val;
              w.y = val;
              if (w.x1 != null) w.x1 += dx;
              if (w.y1 != null) w.y1 += dy;
              if (w.x2 != null) w.x2 += dx;
              if (w.y2 != null) w.y2 += dy;
            } else if (prop === 'height') {
              // 调整高度：线宽不变，水平线 Y1=Y2 保持，线在控件内居中
              const isHorizontal = w.y2 != null && Math.abs(w.y2 - w.y1) < lw;
              if (isHorizontal) {
                // 水平线：Y1 = Y2 = y + (height-1)/2，线宽不变
                w.y1 = w.y + Math.floor((val - 1) / 2);
                w.y2 = w.y1;
                w.height = val;
              } else {
                // 斜线/垂直线：按比例调整 y1/y2
                const oldH = w.height;
                if (oldH > 0) {
                  const scaleY = val / oldH;
                  const centerY1 = w.y + (w.y1 - w.y);
                  const centerY2 = w.y + (w.y2 - w.y);
                  w.y1 = w.y + Math.round((centerY1 - w.y) * scaleY);
                  w.y2 = w.y + Math.round((centerY2 - w.y) * scaleY);
                }
                w.height = val;
              }
            } else if (prop === 'width') {
              // 调整宽度：线宽不变，垂直线 X1=X2 保持，线在控件内居中
              const isVertical = w.x2 != null && Math.abs(w.x2 - w.x1) < lw;
              if (isVertical) {
                w.x1 = w.x + Math.floor((val - 1) / 2);
                w.x2 = w.x1;
                w.width = val;
              } else {
                const oldW = w.width;
                if (oldW > 0) {
                  const scaleX = val / oldW;
                  const centerX1 = w.x + (w.x1 - w.x);
                  const centerX2 = w.x + (w.x2 - w.x);
                  w.x1 = w.x + Math.round((centerX1 - w.x) * scaleX);
                  w.x2 = w.x + Math.round((centerX2 - w.x) * scaleX);
                }
                w.width = val;
              }
            }
            AppState.syncLineBounds(w);
          }

          // Line 控件：同步更新属性面板所有相关输入框
          if (w.type === 'line') {
            const syncInput = (name, value) => {
              const input = widgetPropContent.querySelector(`[data-prop="${name}"]`);
              if (input) input.value = value;
            };
            syncInput('x', w.x);
            syncInput('y', w.y);
            syncInput('width', w.width);
            syncInput('height', w.height);
            syncInput('x1', w.x1 != null ? w.x1 : w.x);
            syncInput('y1', w.y1 != null ? w.y1 : w.y);
            syncInput('x2', w.x2 != null ? w.x2 : w.x + w.width - 1);
            syncInput('y2', w.y2 != null ? w.y2 : w.y + w.height - 1);
          }

          // 只刷新画布和图层，不重建属性面板
          renderCanvas();
          renderLayerList();
          renderProperties();
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
          val = parseSelectValue(prop, input.value);
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
          renderProperties();
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

        // 字体/字号/bpp 变更时立即重新渲染（实时响应）
        if (prop === 'fontFamily' || prop === 'fontSize' || prop === 'fontBpp') {
          if (prop === 'fontFamily' && val) {
            registerFontFile(val).then(() => renderCanvas());
          }
          renderCanvas();
        }

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

  // 选项文本（options）添加/删除/编辑
  const optionsGroup = widgetPropContent.querySelector('[data-options-group]');
  if (optionsGroup) {
    optionsGroup.querySelector('.option-add-btn').addEventListener('click', () => {
      const wgt = AppState.getWidget(AppState.selectedWidgetId);
      if (!wgt) return;
      const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n').filter(o => o.length > 0);
      opts.push(`选项${opts.length + 1}`);
      AppState.updateWidget(AppState.selectedWidgetId, { options: opts.join('\n') });
    });

    optionsGroup.querySelectorAll('.option-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        if (!wgt) return;
        const idx = parseInt(btn.dataset.optionIdx);
        const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n').filter(o => o.length > 0);
        opts.splice(idx, 1);
        AppState.updateWidget(AppState.selectedWidgetId, { options: opts.join('\n') });
      });
    });

    optionsGroup.querySelectorAll('.option-input').forEach(input => {
      input.addEventListener('input', () => {
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        if (!wgt) return;
        const idx = parseInt(input.dataset.optionIdx);
        const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n');
        // 保留原始空字符串位置，仅修改对应索引
        opts[idx] = input.value;
        wgt.options = opts.join('\n');
        renderCanvas();
        AppState.save();
      });
      input.addEventListener('blur', () => {
        const wgt = AppState.getWidget(AppState.selectedWidgetId);
        if (!wgt) return;
        const idx = parseInt(input.dataset.optionIdx);
        const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n');
        opts[idx] = input.value;
        AppState.updateWidget(AppState.selectedWidgetId, { options: opts.join('\n') });
      });
    });
  }
}

// ============ 图层列表：树形结构（页面 → 父控件 → 子控件）============
const expandedPages = new Set();
const expandedWidgets = new Set();
// 记录已初始化默认展开状态的页面，避免每次渲染都强制展开
const pageExpandInitialized = new Set();

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
    // 仅在首次遇到该页面时设置默认展开（当前页且有控件时默认展开）
    if (!pageExpandInitialized.has(page.id)) {
      pageExpandInitialized.add(page.id);
      if (page.id === currentPageId && page.widgets && page.widgets.length > 0) {
        expandedPages.add(page.id);
      }
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
        wLabel.textContent = w.name || w.id;
        wLabel.title = (w.name || w.id) + (w.text ? ' - ' + w.text : '');
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
    el('prop-page-pixmap-format', page.pixmapFormat || 'RGB565');
  }
}

function renderProperties() {
  const w = AppState.selectedWidgetId ? AppState.getWidget(AppState.selectedWidgetId) : null;
  const page = AppState.getCurrentPage();
  document.getElementById('status-project').textContent = '项目: ' + AppState.project.name;
  document.getElementById('status-size').textContent = '屏幕: ' + AppState.project.screen_width + '×' + AppState.project.screen_height;
  document.getElementById('status-widgets').textContent = '组件: ' + (page ? page.widgets.length : 0);
  document.getElementById('status-selection').textContent = w ? `选中: ${SGL_WIDGET_TYPES.find(t => t.type === w.type)?.name || w.type} @ (${w.x},${w.y})` : '未选中';
  document.getElementById('zoom-label').textContent = Math.round(AppState.zoom * 100) + '%';

  const fontIssues = validateProjectFonts(AppState.project);
  const statusFont = document.getElementById('status-font');
  if (statusFont) {
    statusFont.textContent = fontIssues.length > 0 ? `缺少字体: ${fontIssues.length} 个控件` : '';
  }
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
    // 注册新字体到浏览器并刷新画布
    await Promise.all(paths.map(p => registerFontFile(p)));
    renderCanvas();
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
const canvasArea = document.querySelector('.canvas-area');
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
  if (canvasArea) {
    canvasArea.style.setProperty('--log-height', newH + 'px');
  }
  fitCanvasToViewport();
  centerCanvas();
  renderCanvas();
  const page = AppState.getCurrentPage();
  if (page) renderRulers(page.width, page.height);
  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = Math.round(AppState.zoom * 100) + '%';
});

document.addEventListener('mouseup', () => {
  if (isLogResizing) {
    isLogResizing = false;
    logResizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// 画布区域大小变化时，保持画布完整居中
if (canvasContainer) {
  new ResizeObserver(() => {
    const page = AppState.getCurrentPage();
    if (!page) return;
    fitCanvasToViewport();
    centerCanvas();
    renderCanvas();
    renderRulers(page.width, page.height);
    const zoomLabel = document.getElementById('zoom-label');
    if (zoomLabel) zoomLabel.textContent = Math.round(AppState.zoom * 100) + '%';
  }).observe(canvasContainer);
}

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
document.getElementById('prop-project-name').addEventListener('change', e => { AppState.project.name = e.target.value; AppState.save(); renderProperties(); });
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
document.getElementById('prop-page-pixmap-format').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.pixmapFormat = e.target.value; AppState.save(); renderCanvas(); }
});
document.getElementById('prop-page-alpha').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.alpha = parseInt(e.target.value) || 0; AppState.save(); renderCanvas(); }
});

// 检查并提示字体缺失
async function checkAndWarnFonts(actionName) {
  const issues = validateProjectFonts(AppState.project);
  if (issues.length === 0) return true;

  const summary = `检测到 ${issues.length} 个文本控件缺少字体资源`;
  const detail = issues.map(item =>
    `• ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`
  ).join('\n');
  const msg = `${summary}，请在右侧资源面板添加字体文件后再操作。\n\n${detail}`;

  showToast(summary, 'error');
  logMessage(`[${actionName}] ${summary}，操作已终止`, 'error');
  issues.forEach(item => {
    logMessage(`  - ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`, 'error');
  });

  try {
    await message(msg, { title: '字体资源缺失', kind: 'error' });
  } catch (e) {
    console.warn('显示字体缺失提示失败:', e);
  }
  return false;
}

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
  await checkAndWarnFonts('保存');
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
  // 字体检查：没有字体时不允许导出
  const fontOk = await checkAndWarnFonts('导出代码');
  if (!fontOk) return;
  logMessage('正在导出代码...', 'info');
  const result = await AppState.exportCodeToProject('导出代码');
  if (result.ok) {
    logMessage(result.msg, 'success');
  } else if (result.msg !== '项目未保存' && result.msg !== '取消保存') {
    logMessage('导出失败: ' + result.msg, 'error');
  }
});

document.getElementById('btn-build-run').addEventListener('click', async () => {
  const fontOk = await checkAndWarnFonts('编译运行');
  if (!fontOk) return;
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

    // 同步 sgl_config.h 外部修改到项目配置（用户可能在 SGL 配置页面外手动修改过）
    try {
      const config = await invoke('read_sgl_config_from_file', { projectPath });
      if (config) {
        AppState.project.sgl_config = config;
        AppState.save();
        logMessage('已同步 sgl_config.h 配置', 'info');
      }
    } catch (e) {
      console.log('同步 sgl_config.h 失败:', e);
    }

    // 先检查 sgl 子模块是否最新，不是最新才提示用户是否更新
    let updateSgl = false;
    try {
      logMessage('正在检查 SGL 库版本...', 'info');
      const status = await invoke('check_sgl_submodule_status', { projectPath });
      if (status.exists && !status.up_to_date) {
        logMessage('SGL 库有新版本可用', 'warn');
        const yes = await ask('检测到 SGL 库有新版本可用，是否更新到最新版本？', { title: 'SGL 库更新', kind: 'info', okLabel: '是', cancelLabel: '否' });
        updateSgl = yes;
      } else if (status.exists && status.up_to_date) {
        logMessage('SGL 库已是最新版本', 'success');
      } else {
        logMessage(status.msg || 'SGL 库状态未知', 'warn');
      }
    } catch (e) {
      console.warn('检查 SGL 库版本失败:', e);
      logMessage('检查 SGL 库版本失败: ' + e, 'warn');
    }
    if (updateSgl) {
      logMessage('用户选择更新 SGL 库，开始更新子模块...', 'info');
    }

    // 编译
    logMessage('正在编译项目...', 'info');
    showToast('正在编译，请稍候...', 'info');
    const code = AppState.generateCode();
    const buildResult = await invoke('build_project', { project: AppState.project, projectPath, code, updateSgl });
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

  // 取色器：始终可用
  const pickItem = contextMenu.querySelector('[data-action="pick-color"]');
  if (pickItem) pickItem.classList.remove('disabled');

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
  // 取色器：进入取色模式
  if (action === 'pick-color') {
    contextMenu.style.display = 'none';
    enterPickColorMode();
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

// ============ 取色器 ============
let pickColorActive = false;
let pickColorOverlay = null;

function enterPickColorMode() {
  if (pickColorActive) exitPickColorMode();
  pickColorActive = true;
  canvas.style.cursor = 'crosshair';

  // 创建预览圆点跟随鼠标
  pickColorOverlay = document.createElement('div');
  pickColorOverlay.id = 'pick-color-overlay';
  pickColorOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;width:12px;height:12px;border:1px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000,0 1px 3px rgba(0,0,0,0.4);display:none;';
  const colorBox = document.createElement('div');
  colorBox.style.cssText = 'position:absolute;inset:1px;border-radius:50%;background:#000;';
  pickColorOverlay.appendChild(colorBox);
  const hexLabel = document.createElement('div');
  hexLabel.style.cssText = 'position:absolute;left:16px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:1px 5px;border-radius:3px;font-size:10px;font-family:monospace;white-space:nowrap;';
  pickColorOverlay.appendChild(hexLabel);
  document.body.appendChild(pickColorOverlay);

  // 提示条
  const tip = document.createElement('div');
  tip.id = 'pick-color-tip';
  tip.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;z-index:99999;pointer-events:none;';
  tip.textContent = '取色器：点击画布取色，按 Esc 取消';
  document.body.appendChild(tip);

  window._pickColorMove = (e) => {
    if (!pickColorActive) return;
    const color = getColorAtPoint(e.clientX, e.clientY);
    if (color) {
      pickColorOverlay.style.display = 'block';
      pickColorOverlay.style.left = (e.clientX - 6) + 'px';
      pickColorOverlay.style.top = (e.clientY - 6) + 'px';
      const hex = '#' + [color.r, color.g, color.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      colorBox.style.background = hex;
      hexLabel.textContent = hex;
    }
  };
  window._pickColorClick = (e) => {
    if (!pickColorActive) return;
    e.preventDefault();
    e.stopPropagation();
    const color = getColorAtPoint(e.clientX, e.clientY);
    exitPickColorMode();
    if (color) {
      const hex = '#' + [color.r, color.g, color.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      // 复制到剪贴板
      navigator.clipboard.writeText(hex).then(() => {
        showToast('已取色 ' + hex + '（已复制到剪贴板）');
      }).catch(() => {
        showToast('已取色 ' + hex);
      });
      console.log('[取色器] ' + hex + ' rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')');
    } else {
      showToast('该位置无法取色', 'error');
    }
  };
  window._pickColorKey = (e) => {
    if (e.key === 'Escape' && pickColorActive) {
      e.preventDefault();
      exitPickColorMode();
      showToast('已取消取色');
    }
  };
  // 用捕获阶段确保优先处理
  document.addEventListener('mousemove', window._pickColorMove, true);
  document.addEventListener('click', window._pickColorClick, true);
  document.addEventListener('keydown', window._pickColorKey, true);
  // 阻止右键菜单
  window._pickColorContext = (e) => { if (pickColorActive) { e.preventDefault(); exitPickColorMode(); } };
  document.addEventListener('contextmenu', window._pickColorContext, true);
}

function exitPickColorMode() {
  pickColorActive = false;
  canvas.style.cursor = '';
  if (pickColorOverlay) { pickColorOverlay.remove(); pickColorOverlay = null; }
  const tip = document.getElementById('pick-color-tip');
  if (tip) tip.remove();
  if (window._pickColorMove) { document.removeEventListener('mousemove', window._pickColorMove, true); delete window._pickColorMove; }
  if (window._pickColorClick) { document.removeEventListener('click', window._pickColorClick, true); delete window._pickColorClick; }
  if (window._pickColorKey) { document.removeEventListener('keydown', window._pickColorKey, true); delete window._pickColorKey; }
  if (window._pickColorContext) { document.removeEventListener('contextmenu', window._pickColorContext, true); delete window._pickColorContext; }
}

/**
 * 获取屏幕坐标处的画布像素颜色
 * 通过 elementsFromPoint 找到最上层 canvas，读取像素数据
 * 结果按项目颜色深度量化，模拟真实设备显示效果
 */
function getColorAtPoint(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  // 找到第一个 canvas 元素（最上层的）
  for (const el of elements) {
    if (el.tagName === 'CANVAS' && el.getContext) {
      try {
        const rect = el.getBoundingClientRect();
        const x = Math.floor((clientX - rect.left) / rect.width * el.width);
        const y = Math.floor((clientY - rect.top) / rect.height * el.height);
        if (x < 0 || y < 0 || x >= el.width || y >= el.height) continue;
        const ctx = el.getContext('2d');
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        // 跳过完全透明的像素，继续找下一层 canvas
        if (pixel[3] > 0) {
          return quantizeColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
        }
      } catch (e) {
        // canvas 被污染（跨域）等情况，跳过
        continue;
      }
    }
  }
  // 没找到 canvas，尝试读取 DOM 元素的计算背景色
  for (const el of elements) {
    if (el === document.body || el === document.documentElement) continue;
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const m = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) return quantizeColor({ r: +m[1], g: +m[2], b: +m[3] });
    }
  }
  return null;
}

/**
 * 按项目颜色深度量化颜色，模拟真实设备显示效果
 * 8bit (RGB332): R=3位(0-7), G=3位(0-7), B=2位(0-3)
 * 16bit (RGB565): R=5位(0-31), G=6位(0-63), B=5位(0-31)
 * 24bit/32bit: 不量化
 */
function quantizeColor(color) {
  const depth = AppState.project && AppState.project.color_depth || '16bit';
  if (depth === '24bit' || depth === '32bit') return color;

  let rBits, gBits, bBits;
  if (depth === '8bit') {
    // RGB332
    rBits = 3; gBits = 3; bBits = 2;
  } else {
    // 16bit RGB565
    rBits = 5; gBits = 6; bBits = 5;
  }
  const rMax = (1 << rBits) - 1;
  const gMax = (1 << gBits) - 1;
  const bMax = (1 << bBits) - 1;
  const r5 = Math.round(color.r * rMax / 255);
  const g6 = Math.round(color.g * gMax / 255);
  const b5 = Math.round(color.b * bMax / 255);
  return {
    r: Math.round(r5 * 255 / rMax),
    g: Math.round(g6 * 255 / gMax),
    b: Math.round(b5 * 255 / bMax),
  };
}

// ============ 渲染总调度 ============
AppState.subscribe(renderAll);

function renderAll() {
  // 页面切换时自动重新居中画布
  if (AppState.currentPageId !== lastRenderedPageId) {
    centerCanvas();
    lastRenderedPageId = AppState.currentPageId;
  }
  renderPageTabs();
  renderPageTabsMini();
  renderCanvas();
  renderLayerList();
  renderResourceList();
  renderWidgetProps();
  renderProjectPanel();
  renderProperties();
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

// 窗口大小变化时重新居中画布
window.addEventListener('resize', () => {
  centerCanvas();
  renderCanvas();
});
