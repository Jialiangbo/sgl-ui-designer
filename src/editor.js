import { AppState, navigate, showToast, initNav, downloadFile, escapeHtml, escapeAttr, setupUpdateChecker, setupWindowControls } from './app.js';
import { SGL_WIDGET_TYPES, WIDGET_CATEGORIES, PROP_META, WIDGET_EVENTS, WIDGET_DEFAULTS, validateProjectFonts, validateSpritePixmaps, getWidgetVarName, setCodegenLogCallback } from './sgl_api.js';
import { getCheckboxIconDataUrl } from './checkbox_icon.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, message, ask } from '@tauri-apps/plugin-dialog';
import {
  setFontLoadCallback, preloadProjectFonts, getCssFontStack, getFontBppCss, applyBppFilter,
  hexToRgba, mixColors, getWidgetAbsPos, sortWidgetsByHierarchy, flexAlign, textAlignCss,
  toAssetUrl, pixmapFormatHasAlpha, getOpaqueImageUrl, registerFontFile,
  getPixmapImageData, getCachedPixmapImageData, preloadPixmapImage, getSglFontData, loadSglFontData
} from './render_common.js';
import { setLogger as setUpdaterLogger } from './updater.js';
import qrcodeGenerator from 'qrcode-generator';

initNav('editor');
setupWindowControls();
setupUpdateChecker();
AppState.init();
setFontLoadCallback(() => renderCanvas());
setCodegenLogCallback((message, level) => logMessage(message, level));

// 获取字体的实际路径（用于字模加载）
function resolveFontPath(family) {
  const fonts = (AppState.project.resources && AppState.project.resources.fonts) || [];
  if (!family || family === 'default') return '';
  // 已经是路径（包含分隔符）
  if (family.includes('/') || family.includes('\\')) return family;
  // 查找字体资源
  const font = fonts.find(f => f.name === family);
  if (font) return font.path;
  return family;
}

// 递归收集控件及其子控件需要生成的字模字符
function collectWidgetFontChars(w, fontTextMap) {
  const fam = w.fontFamily;
  if (fam && fam !== 'default') {
    const sz = w.fontSize || 14;
    const bpp = w.fontBpp || 4;
    // 使用实际字体路径作为 key，确保与 getSglFontData/loadSglFontData 一致
    const fontPath = resolveFontPath(fam);
    const key = `${fontPath}|${sz}|${bpp}`;
    if (!fontTextMap.has(key)) fontTextMap.set(key, new Set());
    const chars = fontTextMap.get(key);
    const texts = [w.text, w.titleText, w.options, w.leftSlots, w.rightSlots, w.xLabels];
    for (const t of texts) {
      if (t) for (const ch of String(t)) { if (ch.charCodeAt(0) >= 0x20) chars.add(ch); }
    }
    // chart 数值标签需要数字字符
    if (w.type === 'chart') {
      for (const ch of '0123456789.-') chars.add(ch);
    }
  }
  for (const child of (w.widgets || [])) {
    collectWidgetFontChars(child, fontTextMap);
  }
}

// 预加载项目所有字体的 SGL 字模数据（用于像素级 WYSIWYG 文本渲染）
// 收集所有页面所有控件（含子控件）的文本字符作为 symbols，确保字模覆盖所有文本
// 返回 Promise，所有字体加载完成后 resolve，避免多次触发 renderCanvas 导致卡顿
async function preloadSglFontData() {
  if (!window.SGLRenderer || !window.SGLRenderer.parseFontCFile) return;
  const project = AppState.project;
  if (!project || !project.pages) return;
  const fontTextMap = new Map(); // key: fontPath|size|bpp → Set<char>
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

// 项目加载后预加载所有字体资源（FontFace + SGL 字模数据）
preloadProjectFonts(AppState.project.resources?.fonts).then(async () => {
  await preloadSglFontData();
  renderCanvas();
});

// ============ 全局状态 ============
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let dragStart = { x: 0, y: 0, wx: 0, wy: 0, ww: 0, wh: 0 };
let draggingFromPalette = null;
// 控件库最近一次添加控件的时间戳, 用于防止双击时 mouseup 与 dblclick 重复添加
// 双击事件序列: mousedown→mouseup→mousedown→mouseup→dblclick
// 若双击时鼠标轻微移动超过阈值, mouseup 的 hasMoved=true 会触发添加, dblclick 也会触发添加
// 用时间戳去重, 短时间内只允许添加一次
let lastPaletteAddTime = 0;
// polygon 顶点拖拽状态
let isDraggingVertex = false;
let draggingVertexIdx = -1;

// SGL 版本检查缓存：避免每次点"编译仿真"都访问 GitHub 导致卡顿
// 会话内 10 分钟内不重复检查；手动更新后会重置
let sglVersionLastCheckTime = 0;
let sglVersionLastCheckResult = null;
const SGL_VERSION_CHECK_INTERVAL = 10 * 60 * 1000; // 10 分钟

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
// 将更新检查结果输出到编辑器控制台
setUpdaterLogger(logMessage);
// 注册全局日志函数到 AppState，供 addWidget 等操作输出错误提示
AppState.logger = logMessage;
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

        // 记录 mousedown 起始位置, 用于判断是否真正发生了拖拽
        // 双击时 mousedown→mouseup 鼠标几乎没移动, 不应触发拖拽添加, 交给 dblclick 处理
        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;

        const moveHandler = (ev) => {
          if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) {
            hasMoved = true;
          }
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

          // 只有真正发生了拖拽(鼠标移动超过 3px)才通过 mouseup 添加控件
          // 纯双击(鼠标未移动)交给 dblclick 处理, 避免双击时重复添加多个控件
          if (!hasMoved) {
            draggingFromPalette = null;
            return;
          }

          const rect = canvas.getBoundingClientRect();
          const insideCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                               ev.clientY >= rect.top && ev.clientY <= rect.bottom;
          const insideContainer = ev.clientX >= rect.left - 50 && ev.clientX <= rect.right + 50 &&
                                 ev.clientY >= rect.top - 50 && ev.clientY <= rect.bottom + 50;

          if (insideCanvas || insideContainer) {
            // 双击时第二次 mouseup 距离第一次 mouseup 很近, 用时间戳防止重复添加
            const now = Date.now();
            if (now - lastPaletteAddTime < 400) {
              draggingFromPalette = null;
              return;
            }
            lastPaletteAddTime = now;
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
        // 双击事件序列末尾触发, 若前面 mouseup 已因鼠标移动触发过添加, 此处跳过
        const now = Date.now();
        if (now - lastPaletteAddTime < 400) {
          return;
        }
        lastPaletteAddTime = now;
        const page = AppState.getCurrentPage();
        if (!page) return;
        const [dw, dh] = item.defaultSize;
        const x = Math.max(0, (page.width - dw) / 2);
        const y = Math.max(0, (page.height - dh) / 2);
        const added = AppState.addWidget(item.type, x, y, dw, dh);
        if (added) logMessage('已添加：' + item.name, 'success');
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
  // SGL 闭区间坐标缩放：像素宽度 = round((dim-1)*z) + 1，与 createSurface/sglSurface 一致
  // 确保 canvas content area 容纳控件 el 的 SGL 渲染范围 (0 ~ round((dim-1)*z))
  const cw = Math.max(1, Math.round((page.width - 1) * z) + 1);
  const ch = Math.max(1, Math.round((page.height - 1) * z) + 1);

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

  canvas.querySelectorAll('.canvas-widget, .resize-handle, .vertex-handle, .offscreen-child-indicator').forEach(el => el.remove());

  // 按父子层级排序渲染：父控件先渲染（在下层），子控件后渲染（在上层）
  // 单个控件渲染失败不应中断整个画布，避免导致结构树/资源列表等 UI 也无法刷新
  const sortedWidgets = sortWidgetsByHierarchy(page.widgets);
  sortedWidgets.forEach(w => {
    try {
      drawWidget(w);
    } catch (err) {
      console.error(`[renderCanvas] 绘制控件 ${w.id}(${w.type}) 失败:`, err);
      logMessage(`绘制控件 ${w.id}(${w.type}) 失败: ${err && err.message ? err.message : err}`, 'error');
    }
  });

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
  let absPos = getWidgetAbsPos(w, page);
  const z = AppState.zoom;

  // scroll 绑定对象时，SGL 运行时会强制重置 scroll 的坐标贴到目标边缘
  // 设计器模拟此行为以实现 WYSIWYG（垂直贴右侧，水平贴底部）
  // 注意：scroll 的 width 属性是滚动条宽度，不能覆盖，只重算 DOM 尺寸
  // SGL 源码: obj->coords.x2 = bind->coords.x2; obj->coords.x1 = x2 - scroll->width
  //   即 scroll 覆盖在 bind 右边缘上方（重叠 scroll->width 像素），不是贴在外侧
  let domW = w.width;
  let domH = w.height;
  if (w.type === 'scroll' && w.bindTarget) {
    const bindWidget = page.widgets.find(wt => getWidgetVarName(wt) === w.bindTarget);
    if (bindWidget) {
      const bindAbs = getWidgetAbsPos(bindWidget, page);
      const scDirect = w.direct != null ? w.direct : 1;
      const scWidth = w.width != null ? w.width : 10;
      // 仿真效果：scroll 完全位于绑定目标边框内部，四边均不覆盖目标边框
      const bindBorder = bindWidget.borderWidth != null ? bindWidget.borderWidth : 1;
      if (scDirect === 1) {
        // 垂直：左右留右边框，上下留上下边框
        absPos = { x: bindAbs.x + bindWidget.width - scWidth - bindBorder, y: bindAbs.y + bindBorder };
        domW = scWidth;
        domH = bindWidget.height - 2 * bindBorder;
      } else {
        // 水平：上下留底边框，左右留左右边框
        absPos = { x: bindAbs.x + bindBorder, y: bindAbs.y + bindWidget.height - scWidth - bindBorder };
        domW = bindWidget.width - 2 * bindBorder;
        domH = scWidth;
      }
    }
  }

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
  } else if (w.type === '2dball') {
    // 2dball 控件：SGL circle_zoom 将控件尺寸改为 2*radius，el 尺寸跟随球体
    const ballDiameter = (w.radius != null && w.radius > 0) ? w.radius * 2 : Math.min(w.width, w.height);
    el.style.width = (ballDiameter * z) + 'px';
    el.style.height = (ballDiameter * z) + 'px';
  } else if (w.type === 'arc_label' && w.angle != null && w.angle !== 0) {
    // arc_label 旋转模式：el 用原始 w×h，整体旋转
    // SGL obj->coords 中心 = 原始 w×h 中心（update_rotation_bounds 保持中心不变）
    // 所以 el 旋转中心 = SGL 旋转中心
    el.style.width = (w.width * z) + 'px';
    el.style.height = (w.height * z) + 'px';
  } else {
    // scroll 绑定对象时用重算后的 DOM 尺寸
    el.style.width = (domW * z) + 'px';
    el.style.height = (domH * z) + 'px';
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
      // 拖动/调整大小过程中不创建指示器，避免频繁重建导致残留；mouseup 后的渲染会创建
      const completelyOutside = (w.x + w.width <= 0 || w.y + w.height <= 0 || w.x >= parent.width || w.y >= parent.height);
      if (completelyOutside && !isDragging && !isResizing) {
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
  } else {
    // 顶级控件（无父对象）：裁剪超出画布的部分，与子控件超出父对象的逻辑一致
    const pageW = page.width;
    const pageH = page.height;
    const clipTop = w.y < 0 ? (-w.y) : 0;
    const clipLeft = w.x < 0 ? (-w.x) : 0;
    const clipRight = (w.x + w.width) > pageW ? (w.x + w.width - pageW) : 0;
    const clipBottom = (w.y + w.height) > pageH ? (w.y + w.height - pageH) : 0;
    if (clipTop > 0 || clipLeft > 0 || clipRight > 0 || clipBottom > 0) {
      el.style.clipPath = `inset(${clipTop * z}px ${clipRight * z}px ${clipBottom * z}px ${clipLeft * z}px)`;
    }
    // 完全在画布外时，在画布边缘显示指示器
    // 拖动/调整大小过程中不创建指示器，避免频繁重建导致残留；mouseup 后的渲染会创建
    const completelyOutside = (w.x + w.width <= 0 || w.y + w.height <= 0 || w.x >= pageW || w.y >= pageH);
    if (completelyOutside && !isDragging && !isResizing) {
      const childCenterX = w.x + w.width / 2;
      const childCenterY = w.y + w.height / 2;
      const pageCenterX = pageW / 2;
      const pageCenterY = pageH / 2;
      let indicatorX, indicatorY, arrow;
      if (childCenterX < 0) { indicatorX = 0; arrow = '◀'; }
      else if (childCenterX > pageW) { indicatorX = pageW - 16; arrow = '▶'; }
      else { indicatorX = childCenterX - 8; arrow = ''; }
      if (childCenterY < 0) { indicatorY = 0; arrow = '▲'; }
      else if (childCenterY > pageH) { indicatorY = pageH - 16; arrow = '▼'; }
      else { indicatorY = childCenterY - 8; if (!arrow) arrow = '●'; }
      indicatorX = Math.max(0, Math.min(indicatorX, pageW - 16));
      indicatorY = Math.max(0, Math.min(indicatorY, pageH - 16));
      const indicator = document.createElement('div');
      indicator.className = 'offscreen-child-indicator';
      indicator.dataset.childId = w.id;
      indicator.style.cssText = `position:absolute;left:${indicatorX * z}px;top:${indicatorY * z}px;width:${16 * z}px;height:${16 * z}px;display:flex;align-items:center;justify-content:center;font-size:${10 * z}px;background:rgba(139,92,246,0.7);color:#fff;border-radius:3px;cursor:pointer;z-index:100;pointer-events:auto;`;
      indicator.textContent = arrow;
      indicator.title = `控件 "${w.name || w.type}" 在画布外，点击移回`;
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        const newX = Math.max(0, Math.min((pageW - w.width) / 2, pageW - w.width));
        const newY = Math.max(0, Math.min((pageH - w.height) / 2, pageH - w.height));
        AppState.updateWidget(w.id, { x: Math.round(newX), y: Math.round(newY) });
        AppState.selectWidget(w.id);
      });
      canvas.appendChild(indicator);
    }
  }

  // WYSIWYG 渲染（scroll 绑定时传入重算的 DOM 尺寸）
  renderWidgetVisual(el, w, { domW, domH });

  canvas.appendChild(el);

  // 为主选中控件添加拖拽缩放手柄（放在 renderWidgetVisual 之后，避免被清空）
  // 锁定控件也显示手柄以表明被选中，但在 handle 的 mousedown 中阻止实际操作
  if (AppState.selectedWidgetId === w.id) {
    addResizeHandles(el, absPos.x, absPos.y, domW, domH, z, isLocked);
    // polygon 控件：额外添加顶点拖拽手柄
    if (w.type === 'polygon') {
      addPolygonVertexHandles(el, w, absPos, z, isLocked);
    }
  }

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle') || e.target.classList.contains('vertex-handle')) return;
    // 右键(button===2)交给 contextmenu 事件处理选中, 这里不干预
    if (e.button === 2) return;
    // 中键(button===1)交给 viewport 处理画布平移, 不选中/拖动控件
    if (e.button === 1) return;
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

function renderWidgetVisual(el, w, renderSize) {
  // renderSize: scroll 绑定对象时的实际渲染尺寸 { domW, domH }，其他控件为 undefined
  const page = AppState.getCurrentPage();
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
    const surf = SGLR.createSurface(cv, lw != null ? lw : w.width, lh != null ? lh : w.height, z);
    // CSS 尺寸 = 像素尺寸，1:1 显示，避免 CSS 缩放导致右边框/下边框像素被压缩或丢失
    // pointer-events:none 让鼠标事件直通到 el，确保 :hover outline 正常显示
    cv.style.cssText = `position:absolute;left:0;top:0;width:${surf.w}px;height:${surf.h}px;pointer-events:none;`;
    el.appendChild(cv);
    return surf;
  }

  // 模拟 SGL sgl_font_get_string_height 的行数计算
  // SGL: 遍历字符，累加 ch_width=(adv_w+8)>>4，超过 width 则换行；'\n' 强制换行
  // 设计器无 SGL 字体 adv_w 信息，用 canvas measureText 近似（system-ui 字体）
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

      // 处理图片（pixmap）——按 pixmapFormat 像素级量化渲染（WYSIWYG 色彩降级）
      const pixmap = p('pixmap', '');
      if (pixmap) {
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const imgData = getCachedPixmapImageData(pixmap);
        if (imgData) {
          // 图片已缓存：用 SGLRenderer 像素级渲染
          const surf = sglSurface();
          // 1. 填充背景色（alpha 格式用控件底色，非 alpha 格式用黑色）
          const bgColor = hasAlpha ? SGLR.hexToColor(rectCol) : SGLR.hexToColor('#000000');
          SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, p('radius', 0), bgColor, 255);
          // 2. 绘制图片（按格式量化）
          SGLR.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, mainAlphaVal);
          // 3. 绘制边框
          SGLR.drawFillRectBorder(surf, 0, 0, w.width - 1, w.height - 1, p('radius', 0), SGLR.hexToColor(borderColor), p('borderWidth', 2), borderAlphaVal);
          SGLR.flushSurface(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载，加载完成后重绘
          el.style.border = `${borderWidth}px solid ${borderColor}`;
          el.style.borderRadius = radius + 'px';
          el.style.backgroundColor = hasAlpha ? rectCol : '#000000';
          const imgEl = document.createElement('div');
          imgEl.style.cssText = `position:absolute;inset:0;background-size:100% 100%;background-position:0 0;border-radius:${radius}px;opacity:${mainAlphaCss};background-image:url('${toAssetUrl(pixmap)}');`;
          el.appendChild(imgEl);
          preloadPixmapImage(pixmap, () => renderCanvas());
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
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const imgData = getCachedPixmapImageData(pixmap);
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染 + 圆形裁剪
          const surf = sglSurface(circleDiameter, circleDiameter);
          const pcx = Math.floor((surf.w - 1) / 2) + Math.round(xOff * z);
          const pcy = Math.floor((surf.h - 1) / 2) + Math.round(yOff * z);
          const pr = Math.floor(Math.min(surf.w, surf.h) / 2);
          // 1. 填充圆形背景色
          const bgColor = hasAlpha ? SGLR.hexToColor(circleCol) : SGLR.hexToColor('#000000');
          SGLR.drawFillCircle(surf, pcx, pcy, pr, bgColor, 255);
          // 2. 绘制图片（按格式量化）
          SGLR.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, alpha);
          // 3. 清除圆外像素（透明）
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
          // 4. 绘制圆形边框
          SGLR.drawFillCircleBorder(surf, pcx, pcy, pr, SGLR.hexToColor(borderC), p('borderWidth', 2), alpha);
          SGLR.flushSurface(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          const dia = circleDiameter * z;
          const borderW = p('borderWidth', 2) * z;
          const circleEl = document.createElement('div');
          circleEl.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)${(xOff || yOff) ? ` translate(${xOff * z}px, ${yOff * z}px)` : ''};width:${dia}px;height:${dia}px;border-radius:50%;border:${borderW}px solid ${borderC};box-sizing:border-box;background-color:${hasAlpha ? circleCol : '#000000'};background-size:100% 100%;background-image:url('${toAssetUrl(pixmap)}');`;
          el.appendChild(circleEl);
          preloadPixmapImage(pixmap, () => renderCanvas());
        }
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
        const pixmapFormat = p('pixmapFormat', 'RGB565');
        const hasAlpha = pixmapFormatHasAlpha(pixmapFormat);
        const btnBg = p('bgColor', p('color', '#8b5cf6'));
        const imgData = getCachedPixmapImageData(btnPixmap);
        if (imgData) {
          // 图片已缓存：SGLRenderer 像素级渲染
          const surf = sglSurface(w.width, w.height);
          const bgColor = hasAlpha ? SGLR.hexToColor(btnBg) : SGLR.hexToColor('#000000');
          SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, p('radius', 8), bgColor, 255);
          SGLR.drawPixmap(surf, 0, 0, w.width, w.height, imgData, pixmapFormat, alpha);
          SGLR.drawFillRectBorder(surf, 0, 0, w.width - 1, w.height - 1, p('radius', 8), SGLR.hexToColor(p('borderColor', '#7c3aed')), p('borderWidth', 1), alpha);
          SGLR.flushSurface(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载
          el.style.background = '';
          el.style.backgroundSize = '100% 100%';
          el.style.backgroundColor = hasAlpha ? btnBg : '#000000';
          el.style.backgroundImage = `url('${toAssetUrl(btnPixmap)}')`;
          el.style.border = `${p('borderWidth', 1) * z}px solid ${p('borderColor', '#7c3aed')}`;
          el.style.borderRadius = (p('radius', 8) * z) + 'px';
          el.style.opacity = alphaCss;
          preloadPixmapImage(btnPixmap, () => renderCanvas());
        }
        // 文本叠加（无论图片是否缓存都需要）
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
      // SGL 核心：textbox 默认 focus=1，渲染完控件后额外画绿色焦点 wireframe
      // SGL_FOCUSED_COLOR = sgl_rgb(0x00, 0xFF, 0x00)，SGL_FOCUSED_WIDTH = 1
      SGLR.drawWireframe(surf, 0, 0, w.width - 1, w.height - 1, tbRadius, 1, SGLR.hexToColor('#00FF00'), 255);
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
      // SGL checkbox 新版矢量渲染（移植自 sgl_checkbox.c）
      // box_w = font_h - 2，icon 矩形 + 圆角 + 勾线，文字 LEFT_MID 对齐
      const cbStatus = p('status', false);
      const cbText = p('text', ' ');
      const cbFontSize = p('fontSize', 14);
      const cbFontFamily = getCssFontStack(p('fontFamily', ''));
      // 三色：text_color / box_color / check_color
      const cbTextColor = p('textColor', p('color', '#000000'));
      const cbBoxColor = p('boxColor', '#2196F3');
      const cbCheckColor = p('checkColor', '#FFFFFF');

      const surf = sglSurface(w.width, w.height);
      // SGL: font_h = sgl_font_get_height(font) ≈ fontSize
      const fontH = cbFontSize;
      // SGL: box_w = font_h - 2
      const boxW = fontH - 2;
      // SGL: align_pos = sgl_get_text_pos(coords, font, text, 0, SGL_ALIGN_LEFT_MID)
      //   LEFT_MID: x = coords.x1, y = coords.y1 + (widgetH - fontH) / 2
      const alignY = Math.floor((w.height - fontH) / 2);
      // SGL: icon rect
      //   x1 = coords.x1 + 1, y1 = align_pos.y + 1
      //   x2 = coords.x1 + box_w - 2, y2 = align_pos.y + box_w - 2
      const iconX1 = 1;
      const iconY1 = alignY + 1;
      const iconX2 = boxW - 2;
      const iconY2 = alignY + boxW - 2;
      // SGL: radius = box_w / 4
      const boxRadius = Math.floor(boxW / 4);

      if (cbStatus) {
        // 选中：填充圆角矩形（box_color）
        SGLR.drawFillRect(surf, iconX1, iconY1, iconX2, iconY2, boxRadius, SGLR.hexToColor(cbBoxColor), alpha);
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
        SGLR.drawLineSlanted(surf, ax1, ay1, ax2, ay2, lw, SGLR.hexToColor(cbCheckColor), alpha);
        SGLR.drawLineSlanted(surf, ax2, ay2, ax3, ay3, lw, SGLR.hexToColor(cbCheckColor), alpha);
      } else {
        // 未选中：带边框矩形（box_color，边框宽度 2）
        SGLR.drawFillRectBorder(surf, iconX1, iconY1, iconX2, iconY2, boxRadius, SGLR.hexToColor(cbBoxColor), 2, alpha);
      }

      SGLR.flushSurface(surf);
      // 文字（DOM 叠加）
      // SGL: sgl_draw_string 从 (align_pos.x + box_w + 2, align_pos.y) 左对齐画
      const textX = boxW + 2;
      overlayText({
        text: cbText,
        color: cbTextColor,
        fontSize: cbFontSize,
        fontFamily: p('fontFamily', ''),
        align: 'LEFT_MID',
        x: textX, y: 0, w: w.width - textX, h: w.height
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
      // SGL progress: 严格移植自 sgl_progress.c
      // SGL: knob.x1 = x1 + radius/2 + border (clip 起始)
      // SGL: knob.x2 = x1 - radius/2 - 2 + w * value / 100 - (border - 1)
      // SGL: rect.y1 = y1 + border + 1, rect.y2 = y2 - border - 1
      // SGL: rect.x1 起始 = x1 - interval*2 + border + 1
      // SGL: 循环 while (rect.x2 <= knob.x2)，rect.x2 = rect.x1 + knob_width
      // SGL: sgl_draw_fill_rect(surf, &knob, &rect, fill_radius, ...) 第一个参数是 knob 作为 clip area
      // SGL: fill_radius = min(obj->radius, knob_radius, knob_width/2)
      const prValue = p('value', 50);
      const prFillCol = SGLR.hexToColor(p('fillColor', '#FFFFFF'));
      const prGap = p('fillGap', 4);
      const prFillRadius = p('fillRadius', 0);
      const prFillWidth = p('fillWidth', 4);
      const prBorder = p('borderWidth', 2);
      const prRadius = p('radius', 0);
      // SGL knob.x2 (相对坐标) = w * value / 100 - radius/2 - 2 - (border - 1)
      const knobX2 = w.width * prValue / 100 - prRadius / 2 - 2 - (prBorder - 1);
      // SGL knob.x1 (相对坐标) = radius/2 + border
      const knobX1 = prRadius / 2 + prBorder;
      // SGL fill_radius = min(obj->radius, knob_radius, knob_width/2)
      const fillR = Math.min(prRadius, prFillRadius, Math.floor(prFillWidth / 2));
      // SGL rect.y1 = y1 + border + 1, rect.y2 = y2 - border - 1
      const rectY1 = prBorder + 1;
      const rectY2 = w.height - 1 - prBorder - 1;
      // SGL rect.x1 起始 = x1 - interval*2 + border + 1 (相对 = -interval*2 + border + 1)
      let rectX1 = -prGap * 2 + prBorder + 1;
      let rectX2 = 0; // SGL 初始化 rect.x2 = 0

      const surf = sglSurface(w.width, w.height);
      // 轨道：trackColor 背景 + borderColor 边框 + radius (SGL: sgl_draw_rect with body)
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        color: SGLR.hexToColor(p('trackColor', '#000000')),
        alpha: alpha,
        border: prBorder,
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
        border_alpha: alpha,
        border_mask: 0,
        radius: prRadius,
      });
      // fill 块：SGL while (rect.x2 <= knob.x2) { rect.x2 = rect.x1 + knob_width; draw; rect.x1 = rect.x2 + interval; }
      // 用 knob 作为 clip area，rect 作为绘制区域
      while (rectX2 <= knobX2) {
        rectX2 = rectX1 + prFillWidth;
        // SGL: sgl_draw_fill_rect(surf, &knob, &rect, fill_radius, color, alpha)
        // 设置 clip 为 knob 区域，绘制 rect
        const oldClip = surf.clip;
        const kx1 = Math.max(0, Math.round(knobX1 * z));
        const kx2 = Math.min(surf.w - 1, Math.round(knobX2 * z));
        if (kx2 >= kx1) {
          surf.clip = { x1: kx1, y1: 0, x2: kx2, y2: surf.h - 1 };
          SGLR.drawFillRect(surf, rectX1, rectY1, rectX2, rectY2, fillR, prFillCol, alpha);
        }
        surf.clip = oldClip;
        rectX1 = rectX2 + prGap;
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'bar': {
      // SGL bar: 严格移植自 sgl_bar.c
      // SGL: sgl_draw_rect(surf, &desc_area, &obj->coords, &desc)
      // desc_area 是裁剪区域，obj->coords 是绘制区域（整个控件）
      // 边框和圆角基于整个 obj->coords 画，填充颜色被 desc_area 裁剪
      // SGL: knob_pos = x1 + (x2-x1+1) * value / 100 - border (水平)
      // SGL: knob_pos = y2 - (y2-y1+1) * value / 100 + border (垂直)
      const barDirect = p('direct', 0);
      const barValue = p('value', 50);
      const barFillCol = SGLR.hexToColor(p('barColor', '#000000'));
      const barTrackCol = SGLR.hexToColor(p('bgColor', '#FFFFFF'));
      const barBorderCol = SGLR.hexToColor(p('borderColor', '#000000'));
      const barBorder = p('borderWidth', 2);
      const barRadius = p('radius', 0);

      const surf = sglSurface(w.width, w.height);
      // SGL: 先画 fill 段（desc_area 裁剪到 fill 区域），再画 track 段（desc_area 裁剪到 track 区域）
      // 两次都用 obj->coords 作为绘制区域，所以边框和圆角是完整的
      if (barDirect === 0) {
        // 水平：knob_pos = x1 + w * value / 100 - border
        const knobPos = w.width * barValue / 100 - barBorder;
        // fill 段（左）：clip 到 [0, knobPos]，绘制整个 obj->coords
        const oldClip = surf.clip;
        const kp = Math.round(Math.min(knobPos, w.width - 1) * z);
        surf.clip = { x1: 0, y1: 0, x2: kp, y2: surf.h - 1 };
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        // track 段（右）：clip 到 [knobPos, width-1]，绘制整个 obj->coords
        surf.clip = { x1: Math.max(0, kp), y1: 0, x2: surf.w - 1, y2: surf.h - 1 };
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = oldClip;
      } else {
        // 垂直：knob_pos = y2 - h * value / 100 + border
        const knobPos = w.height - w.height * barValue / 100 + barBorder;
        // fill 段（下）：clip 到 [knobPos, height-1]，绘制整个 obj->coords
        const oldClip = surf.clip;
        const kp = Math.round(Math.max(knobPos, 0) * z);
        surf.clip = { x1: 0, y1: kp, x2: surf.w - 1, y2: surf.h - 1 };
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barFillCol, border_color: barBorderCol, radius: barRadius
        });
        // track 段（上）：clip 到 [0, knobPos]，绘制整个 obj->coords
        surf.clip = { x1: 0, y1: 0, x2: surf.w - 1, y2: Math.min(surf.h - 1, kp) };
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: alpha, border: barBorder, border_alpha: alpha, border_mask: 0,
          color: barTrackCol, border_color: barBorderCol, radius: barRadius
        });
        surf.clip = oldClip;
      }
      SGLR.flushSurface(surf);
      break;
    }

    case 'gauge': {
      // SGL gauge: 严格移植自 sgl_gauge.c（全部使用 SGL 整数算法）
      // SGL 坐标系：闭区间 (x1,y1)-(x2,y2)，cx=(x1+x2)/2 整数除法
      // SGL 三角函数：sgl_sin/sgl_cos 定点整数（SGL_SIN_FIXED_ONE=32768）
      // SGL 字体度量：sgl_font_get_height=font->font_height，sgl_font_get_string_width=逐字符 adv_w
      const gValue = p('value', 0);
      const startAngle = p('startAngle', 30);
      const endAngle = p('endAngle', 330);
      const scaleAngle = Math.max(1, p('scaleAngle', 15));
      const scaleStep = Math.max(1, p('scaleStep', 10));
      const scaleStart = p('scaleStart', 0);
      const scaleLen = Math.max(p('scaleLength', 0), 4);
      const arcW = p('arcWidth', 2);
      const scaleW = p('scaleWidth', 1);
      const ptrW = p('pointerWidth', 2);
      const bgCol = p('bgColor', '#000000');
      const arcCol = p('arcColor', '#FFFFFF');
      const scaleCol = p('scaleColor', '#FFFFFF');
      const ptrCol = p('pointerColor', '#FF0000');
      const textCol = p('textColor', '#FFFFFF');
      const hubCol = p('hubColor', '#FFFFFF');
      const fontSize = p('fontSize', 12);
      const fontBpp = p('fontBpp', 4);
      const fontFamily = getCssFontStack(p('fontFamily', ''));

      // 获取 SGL 字模数据（用于精确的 font_height 和 string_width）
      const gFontFamily = p('fontFamily', '');
      const sglFont = getSglFontData(gFontFamily, fontSize, fontBpp);
      // SGL: sgl_font_get_height(gauge->font) → font->font_height
      const sglFontH = sglFont ? SGLR.fontGetHeight(sglFont) : fontSize;
      // SGL: sgl_font_get_string_width 的 JS 等价函数
      const sglStrWidth = (text) => {
        if (sglFont) return SGLR.fontGetStringWidth(text, sglFont);
        return SGLR.stringWidth(text, fontSize);
      };

      const surf = sglSurface(w.width, w.height);
      // SGL: cx = (x1 + x2) / 2, 整数除法; x1=0, x2=width-1
      const cx = Math.floor((0 + (w.width - 1)) / 2);
      const cy = Math.floor((0 + (w.height - 1)) / 2);
      // SGL: r = sgl_max(obj->radius, sgl_obj_get_width(obj) / 2 - 1)
      // sgl_obj_get_width = x2 - x1 + 1 = w.width, 整数除法
      const r = Math.max(p('radius', 0), Math.floor(w.width / 2) - 1);
      // SGL: hub_r = sgl_max((r + 8) / 8, gauge->hub_r), 整数除法
      const hubR = Math.max(Math.floor((r + 8) / 8), p('hubRadius', 0));
      // SGL: scale_out = arc_width + 6
      const scaleOut = arcW + 6;
      // SGL: scale_in = scale_out + max(scale_length, 4)
      const scaleIn = scaleOut + scaleLen;
      // SGL: text_cr = r - scale_in - (sgl_font_get_height(font) / 2) - 4, 整数除法
      const textCr = r - scaleIn - Math.floor(sglFontH / 2) - 4;
      // SGL: pointer_s = scale_in + 4 + pointer_width
      const ptrStart = scaleIn + 4 + ptrW;
      // SGL: pointer_e = r - hub_r - pointer_width
      const ptrEnd = r - hubR - ptrW;

      // 1. 背景圆 (bgColor)
      SGLR.drawFillCircle(surf, cx, cy, r, SGLR.hexToColor(bgCol), alpha);
      // 2. 中心轴帽 (hubColor)
      if (hubR > 0) {
        SGLR.drawFillCircle(surf, cx, cy, hubR, SGLR.hexToColor(hubCol), alpha);
      }
      // 3. 外圈弧 (arcColor) - SGL drawFillArc 使用 0°=上顺时针
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

      // 4. 刻度线 - SGL: calc_angle = angle + 90, sgl_sin/sgl_cos 定点整数
      const textInterval = p('textInterval', 3);
      const scaleWarning = p('scaleWarning', 32767);
      let scaleMask = scaleStart;
      let count = 0;
      const majorTexts = [];
      for (let angle = startAngle; angle <= endAngle; angle += scaleAngle) {
        const isMajor = (count & textInterval) === 0;
        // SGL: calc_angle = angle + 90; sin_val = sgl_sin(calc_angle); cos_val = sgl_cos(calc_angle)
        const calcAngle = angle + 90;
        const sinVal = SGLR.sglSin(calcAngle);
        const cosVal = SGLR.sglCos(calcAngle);
        // SGL: x_out = ((r - scale_out) * cos_val) / SGL_SIN_FIXED_ONE + cx, 整数除法
        const xOut = Math.floor((r - scaleOut) * cosVal / SGLR.SGL_SIN_FIXED_ONE) + cx;
        const yOut = Math.floor((r - scaleOut) * sinVal / SGLR.SGL_SIN_FIXED_ONE) + cy;
        const xIn = Math.floor((r - scaleIn) * cosVal / SGLR.SGL_SIN_FIXED_ONE) + cx;
        const yIn = Math.floor((r - scaleIn) * sinVal / SGLR.SGL_SIN_FIXED_ONE) + cy;
        // SGL: scale_color = scale_mask < scale_warning ? scale_color : RED
        const scCol = (scaleMask < scaleWarning) ? SGLR.hexToColor(scaleCol) : SGLR.SGL_COLOR_RED;
        const lineW = isMajor ? scaleW * 2 : scaleW;
        SGLR.drawLine(surf, xOut, yOut, xIn, yIn, lineW, scCol, alpha);
        if (isMajor && (angle - startAngle) < 360) {
          // SGL: tx = (text_cr * cos_val) / SGL_SIN_FIXED_ONE + cx, 整数除法
          const tx = Math.floor(textCr * cosVal / SGLR.SGL_SIN_FIXED_ONE) + cx;
          const ty = Math.floor(textCr * sinVal / SGLR.SGL_SIN_FIXED_ONE) + cy;
          majorTexts.push({ tx, ty, text: String(scaleMask) });
        }
        scaleMask += scaleStep;
        count++;
      }

      // 5. 指针 (pointerColor)
      // SGL: needle_angle = sgl_mod360(90 + angle_start + value * scale_angle / scale_step)
      // 注意: value * scale_angle / scale_step 是整数除法
      const needleAngle = SGLR.sglMod360(90 + startAngle + Math.floor(gValue * scaleAngle / scaleStep));
      const nSin = SGLR.sglSin(needleAngle);
      // SGL: n_cos = sgl_sin(needle_angle_deg + 90)
      const nCos = SGLR.sglSin(needleAngle + 90);
      // SGL: px = ((r - pointer_s) * n_cos) / SGL_SIN_FIXED_ONE + cx + 1, 整数除法
      const px = Math.floor((r - ptrStart) * nCos / SGLR.SGL_SIN_FIXED_ONE) + cx + 1;
      const py = Math.floor((r - ptrStart) * nSin / SGLR.SGL_SIN_FIXED_ONE) + cy + 1;
      const nx = Math.floor((r - ptrEnd) * nCos / SGLR.SGL_SIN_FIXED_ONE) + cx + 1;
      const ny = Math.floor((r - ptrEnd) * nSin / SGLR.SGL_SIN_FIXED_ONE) + cy + 1;
      SGLR.drawLine(surf, px, py, nx, ny, ptrW, SGLR.hexToColor(ptrCol), alpha);

      SGLR.flushSurface(surf);

      // 6. 刻度数字（DOM 叠加）
      // SGL: txt_x = tx - (text_len) / 2 - 2, 整数除法
      // SGL: txt_y = ty - (sgl_font_get_height(font) / 2), 整数除法
      const gHasFont = widgetHasFont(w);
      const gCssFamily = gHasFont ? fontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      majorTexts.forEach(mt => {
        const textLen = sglStrWidth(mt.text);
        const txtX = mt.tx - Math.floor(textLen / 2) - 2;
        const txtY = mt.ty - Math.floor(sglFontH / 2);
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;left:${txtX * z}px;top:${txtY * z}px;color:${textCol};font-size:${fontSize * z}px;font-family:${gCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
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
      // SGL battery: 严格移植自 sgl_battery.c
      // SGL 结构: 外壳实心填充(border_color, radius=3) + 盖帽实心填充(border_color, radius=0)
      //          + 内部背景实心填充(bg_color, radius=1, 缩进 border_width=2)
      //          + 电芯实心填充(fill_color, radius=1, 缩进 border_width+padding=4)
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
      // SGL 硬编码
      const bBorderW = 2;
      const bPadding = 2;
      const bShellRadius = 3;
      const bInnerRadius = 1;
      const borderColObj = SGLR.hexToColor(bBorderCol);
      const bgColObj = SGLR.hexToColor(bBgCol);

      const surf = sglSurface(w.width, w.height);

      // SGL: width = x2 - x1, height = y2 - y1 (非闭区间，差 1)
      const sglW = w.width - 1;
      const sglH = w.height - 1;
      let batteryW, batteryH, batteryX, batteryY, capW, capH, capX, capY;
      if (bDir === 0) {
        // 水平: battery_width = width - cap_size, battery_height = height - height/5
        batteryW = sglW - bCapSize;
        batteryH = sglH - Math.floor(sglH / 5);
        capW = bCapSize;
        capH = Math.floor(batteryH / 3);
        if (bCapPos === 1) { // LEFT
          batteryX = bCapSize;
          batteryY = Math.floor((sglH - batteryH) / 2);
          capX = 0;
          capY = batteryY + Math.floor((batteryH - capH) / 2);
        } else { // RIGHT
          batteryX = 0;
          batteryY = Math.floor((sglH - batteryH) / 2);
          capX = batteryW;
          capY = batteryY + Math.floor((batteryH - capH) / 2);
        }
      } else {
        // 垂直: battery_height = height - cap_size, battery_width = width - width/5
        batteryH = sglH - bCapSize;
        batteryW = sglW - Math.floor(sglW / 5);
        capH = bCapSize;
        capW = Math.floor(batteryW / 3);
        batteryX = Math.floor((sglW - batteryW) / 2);
        batteryY = bCapSize;
        capX = batteryX + Math.floor((batteryW - capW) / 2);
        capY = 0;
      }

      // SGL: fill_x = battery_x + border_width + padding, fill_width = battery_width - 2*border_width - 2*padding
      const fillX = batteryX + bBorderW + bPadding;
      const fillY = batteryY + bBorderW + bPadding;
      const fillW = batteryW - 2 * bBorderW - 2 * bPadding;
      const fillH = batteryH - 2 * bBorderW - 2 * bPadding;
      // SGL: bg_rect.x1 = battery_x + border_width, bg_rect.x2 = battery_x + battery_width - border_width
      const bgX = batteryX + bBorderW;
      const bgY = batteryY + bBorderW;
      const bgW = batteryW - 2 * bBorderW;
      const bgH = batteryH - 2 * bBorderW;

      // 1. 外壳实心填充 (radius=3, border_color) - SGL: sgl_draw_fill_rect(battery_rect, 3, border_color)
      SGLR.drawFillRect(surf, batteryX, batteryY, batteryX + batteryW, batteryY + batteryH,
        bShellRadius, borderColObj, alpha);
      // 2. 盖帽实心填充 (radius=0, border_color) - SGL: sgl_draw_fill_rect(cap_rect, 0, border_color)
      if (capW > 0 && capH > 0) {
        SGLR.drawFillRect(surf, capX, capY, capX + capW, capY + capH, 0, borderColObj, alpha);
      }
      // 3. 内部背景实心填充 (radius=1, bg_color) - 覆盖外壳内部，留出 border_width=2 的边框
      if (bgW > 0 && bgH > 0) {
        SGLR.drawFillRect(surf, bgX, bgY, bgX + bgW, bgY + bgH, bInnerRadius, bgColObj, alpha);
      }
      // 4. 电芯 (radius=1, fill_color)
      if (bLevel > 0 && bNumCells > 0 && fillW > 0 && fillH > 0) {
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
              SGLR.drawFillRect(surf, posX, fillY, posX + curW, fillY + fillH, bInnerRadius, fillColObj, alpha);
              if (i < bNumCells - 1) posX -= minGap;
            }
          } else {
            // RIGHT: 从左向右画
            let posX = fillX;
            for (let i = 0; i < activeCells; i++) {
              let curW = cellW + (i < remainingW ? 1 : 0);
              SGLR.drawFillRect(surf, posX, fillY, posX + curW, fillY + fillH, bInnerRadius, fillColObj, alpha);
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
              SGLR.drawFillRect(surf, fillX, posY, fillX + fillW, posY + curH, bInnerRadius, fillColObj, alpha);
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
      // SGL msgbox: 严格移植自 sgl_msgbox.c sgl_msgbox_construct_cb
      // 坐标系: x1=0, y1=0, x2=W-1, y2=H-1 (闭区间)
      // font_height = sgl_font_get_height(font) + 8 = fontSize + 8
      // title_height = msgbox->title_height ? msgbox->title_height : font_height
      // button_coords = {x1, x2, y2-font_height, y2}  (整个按钮带, 作为 clip)
      // left_coords  = {x1+border, (x1+x2)/2-border/2-1, y2-2*font_height, y2-border}
      // right_coords = {(x1+x2)/2+border/2+1, x2-border, y2-2*font_height, y2-border}
      // title_coords = {x1+border+2, x2-border+2, y1+1, y1+title_height+border}
      // text_coords  = {x1+border+2+offsetX, x2-border-2, y1+title_height+border+offsetY, y2-(font_height+border)}
      // 分隔线: sgl_draw_fill_hline(y=y1+title_height+4, x1=x1+border, x2=x2-border, width=border)
      // 按钮: sgl_draw_fill_rect(clip=button_coords, rect=left/right_coords, radius=obj->radius, color, alpha)
      //        (带圆角, 且 clip 到 button_coords 避免按钮超出按钮带)
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
      // SGL 默认按钮颜色 mixer(COLOR, TEXT_COLOR, 200) = mixer(白,黑,200)
      const mbDefBtnCol = SGLR.colorMixer(SGLR.hexToColor('#FFFFFF'), SGLR.hexToColor('#000000'), 200);

      const surf = sglSurface(w.width, w.height);

      // SGL 整数除法: (x1+x2)/2, x1=0, x2=width-1
      const mbMidX = Math.trunc((0 + (w.width - 1)) / 2);

      // 1. 主体背景圆角矩形 + 边框 (SGL: sgl_draw_rect)
      SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: mbBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(mbBg),
        radius: mbRadius,
        border_color: SGLR.hexToColor(mbBorderCol),
      });

      // 2. 标题分隔线 (SGL: sgl_draw_fill_hline)
      //    y = y1 + title_height + 4, x1 = x1+border, x2 = x2-border, width = border
      const mbSepY = mbTitleH + 4;
      SGLR.drawHLine(surf, mbBorder, (w.width - 1) - mbBorder, mbSepY, mbBorder, SGLR.hexToColor(mbBorderCol), alpha);

      // 3. 左右按钮背景 (SGL: sgl_draw_fill_rect 带 button_coords clip 和 obj->radius 圆角)
      //    button_coords = {x1=0, x2=width-1, y1=height-1-font_height, y2=height-1}
      //    left_coords  = {x1=border, x2=midX-border/2-1, y1=height-1-2*font_height, y2=height-1-border}
      //    right_coords = {x1=midX+border/2+1, x2=width-1-border, y1=height-1-2*font_height, y2=height-1-border}
      const mbBtnTop = (w.height - 1) - 2 * mbFontHeight;
      const mbBtnBottom = (w.height - 1) - mbBorder;
      const mbBtnClipY1 = (w.height - 1) - mbFontHeight;
      const mbLeftX1 = mbBorder;
      const mbLeftX2 = mbMidX - Math.trunc(mbBorder / 2) - 1;
      const mbRightX1 = mbMidX + Math.trunc(mbBorder / 2) + 1;
      const mbRightX2 = (w.width - 1) - mbBorder;
      const mbLBtnCol = p('leftBtnColor', '') ? SGLR.hexToColor(p('leftBtnColor')) : mbDefBtnCol;
      const mbRBtnCol = p('rightBtnColor', '') ? SGLR.hexToColor(p('rightBtnColor')) : mbDefBtnCol;

      // 保存原始 clip, 临时设置 button_coords 作为 clip (SGL: sgl_draw_fill_rect 的 area 参数)
      const mbOldClip = surf.clip;
      const mbBtnClip = {
        x1: Math.round(0 * z),
        y1: Math.round(mbBtnClipY1 * z),
        x2: Math.round((w.width - 1) * z),
        y2: Math.round((w.height - 1) * z),
      };
      // 限制到原 clip 范围内
      mbBtnClip.x1 = Math.max(mbBtnClip.x1, mbOldClip.x1);
      mbBtnClip.y1 = Math.max(mbBtnClip.y1, mbOldClip.y1);
      mbBtnClip.x2 = Math.min(mbBtnClip.x2, mbOldClip.x2);
      mbBtnClip.y2 = Math.min(mbBtnClip.y2, mbOldClip.y2);

      if (mbLeftX2 >= mbLeftX1) {
        surf.clip = mbBtnClip;
        SGLR.drawFillRect(surf, mbLeftX1, mbBtnTop, mbLeftX2, mbBtnBottom, mbRadius, mbLBtnCol, alpha);
        surf.clip = mbOldClip;
      }
      if (mbRightX2 >= mbRightX1) {
        surf.clip = mbBtnClip;
        SGLR.drawFillRect(surf, mbRightX1, mbBtnTop, mbRightX2, mbBtnBottom, mbRadius, mbRBtnCol, alpha);
        surf.clip = mbOldClip;
      }

      SGLR.flushSurface(surf);

      // 4. 标题文本（DOM 叠加，居中）
      //    SGL: title_coords x1=border+2, x2=x2-border+2, y1=1, y2=title_h+border
      //    sgl_get_text_pos(CENTER) + sgl_draw_string
      const mbTitleText = p('titleText', 'Message Box');
      overlayText({
        text: mbTitleText,
        color: p('titleTextColor', '#000000'),
        fontSize: mbFontSize,
        fontFamily: p('fontFamily', ''),
        align: 'CENTER',
        x: mbBorder + 2, y: 1, w: (w.width - 1) - mbBorder + 2 - (mbBorder + 2) + 1, h: mbTitleH + mbBorder
      });

      // 5. 消息文本（DOM 叠加，多行左对齐）
      //    SGL: text_coords x1=border+2+offsetX, x2=x2-border-2, y1=title_h+border+offsetY, y2=y2-(font_height+border)
      //    sgl_draw_string_mult_line(x=text_coords.x1, y=text_coords.y1+2)
      const mbMsgTop = mbTitleH + mbBorder + mbMsgOffsetY + 2;
      const mbMsgLeft = mbBorder + 2 + mbMsgOffsetX;
      const mbMsgRight = (w.width - 1) - mbBorder - 2;
      const mbMsgBottom = (w.height - 1) - (mbFontHeight + mbBorder);
      const mbMsgText = p('msgText', 'NULL');
      const mbLineMargin = p('msgLineMargin', 1);
      if (mbMsgText && mbMsgText !== 'NULL') {
        overlayText({
          text: mbMsgText,
          color: p('msgColor', p('textColor', '#000000')),
          fontSize: mbFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'TOP_LEFT',
          x: mbMsgLeft, y: mbMsgTop, w: mbMsgRight - mbMsgLeft + 1, h: mbMsgBottom - mbMsgTop + 1,
          lineMargin: mbLineMargin,
          multiline: true,
          maxWidth: mbMsgRight - mbMsgLeft + 1
        });
      }

      // 6. 按钮文本（DOM 叠加）
      //    SGL: msgbox_draw_text(coords, font, text, 0, SGL_ALIGN_CENTER, y_offset=font_height/2)
      //    align_pos.y = (coords_h - fontSize) / 2  (CENTER, 整数除法)
      //    draw_y = coords.y1 + align_pos.y + y_offset  (y_offset = (fontSize+8)/2)
      //    sgl_draw_string 绘制文本, y 为字体行顶部参考点
      //    SGL 文本中心 = draw_y + fontSize/2
      //    按钮中心 = coords.y1 + coords_h/2
      //    offY = SGL文本中心 - 按钮中心 (用于 CENTER 对齐的浏览器文本偏移)
      const mkBtnText = (x1, x2, txt, col) => {
        const coordsW = x2 - x1 + 1;
        const coordsH = mbBtnBottom - mbBtnTop + 1;
        // SGL 整数除法计算偏移
        const sglOffY = Math.trunc((coordsH - mbFontSize) / 2) + Math.trunc(mbFontHeight / 2) + Math.trunc(mbFontSize / 2) - Math.trunc(coordsH / 2);
        overlayText({
          text: txt,
          color: col,
          fontSize: mbFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'CENTER',
          x: x1, y: mbBtnTop, w: coordsW, h: coordsH,
          offY: sglOffY
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
      // SGL win: 严格移植自 sgl_win.c sgl_win_construct_cb
      // 1. title_h = max(radius, title_h, font_height)
      // 2. 主体(body_area: y1+title_h ~ y2) 用 sgl_draw_rect(bg.color, bg.pixmap, border, radius)
      // 3. 标题栏(title_area: y1 ~ y1+title_h) 用 sgl_draw_rect(title_bg_color, pixmap=NULL, 其他沿用bg)
      // 4. 标题文本(sgl_draw_string)
      // 5. 关闭按钮(sgl_draw_fill_circle, close_r=title_h/3)
      const winFontSize = p('fontSize', 14);
      const winFontBppVal = p('fontBpp', 4);
      const winFontFamilyVal = p('fontFamily', '');
      const winBorder = p('borderWidth', 0);
      const winRadius = p('radius', 0);
      const winBg = p('bgColor', '#FFFFFF');
      const winBorderCol = p('borderColor', '#000000');
      // SGL: title_h = sgl_max3(obj->radius, win->title_h, sgl_font_get_height(win->title_font))
      // 必须优先使用已加载的真实字模 font_height，否则设计器与仿真 title_h 不一致会导致文本错位
      const winSglFontForMetrics = getSglFontData(winFontFamilyVal, winFontSize, winFontBppVal);
      const winFontHeight = winSglFontForMetrics ? winSglFontForMetrics.font_height : winFontSize;
      const winTitleH = Math.max(winRadius, p('titleHeight', 0), winFontHeight);

      const surf = sglSurface(w.width, w.height);

      // pixmap 背景图片
      const winPixmapPath = p('pixmap', '');
      const winPixmapFormat = p('pixmapFormat', 'RGB565');
      let winPixmapImg = null;
      if (winPixmapPath) {
        winPixmapImg = getCachedPixmapImageData(winPixmapPath);
        if (!winPixmapImg) {
          preloadPixmapImage(winPixmapPath, () => renderCanvas());
        }
      }

      // SGL: body_area = {x1, y1+title_h, x2, y2}
      // SGL: desc 用 win->bg 的全部属性, border_mask = obj->focus
      // 1. 主体背景（标题栏以下区域）
      SGLR.drawRect(surf, 0, winTitleH, w.width - 1, w.height - 1, {
        alpha: alpha,
        border: winBorder,
        border_alpha: alpha,
        border_mask: 0,
        color: SGLR.hexToColor(winBg),
        radius: winRadius,
        border_color: SGLR.hexToColor(winBorderCol),
        pixmap: winPixmapImg,
        pixmapFormat: winPixmapFormat,
      });

      // SGL: title_area = {x1, y1, x2, y1+title_h}
      // SGL: desc.color = win->title_bg_color（直接使用，不再混合）
      // SGL: desc.alpha = win->bg.alpha, desc.pixmap = NULL
      // 2. 标题栏背景（直接使用 titleBgColor，不再与 bgColor 混合）
      if (winTitleH > 0) {
        SGLR.drawRect(surf, 0, 0, w.width - 1, winTitleH, {
          alpha: alpha,
          border: winBorder,
          border_alpha: alpha,
          border_mask: 0,
          color: SGLR.hexToColor(p('titleBgColor', '#808080')),
          radius: winRadius,
          border_color: SGLR.hexToColor(winBorderCol),
          pixmap: null, // 标题栏不贴图
          pixmapFormat: winPixmapFormat,
        });
      }

      // SGL: close_r = title_h / 3, close_cx = x2 - border - title_h/2, close_cy = y1 + title_h/2 + border/2
      // 3. 关闭按钮
      const winCloseR = Math.floor(winTitleH / 3);
      const winCloseCx = w.width - 1 - winBorder - Math.floor(winTitleH / 2);
      const winCloseCy = Math.floor(winTitleH / 2) + Math.floor(winBorder / 2);
      if (winCloseR > 0) {
        SGLR.drawFillCircle(surf, winCloseCx, winCloseCy, winCloseR, SGLR.hexToColor(p('closeBtnColor', '#FF5A50')), alpha);
      }

      // 4. 标题文本
      // SGL: title_area.x1+=border, title_area.x2-=border, LEFT_MID 时 align_pos.x+=radius
      // SGL: 绘制 y = align_pos.y + border
      const winTitleText = p('titleText', '窗口标题');
      const winTitleAlign = p('titleAlign', 'LEFT_MID');
      const winTitleTextColor = p('titleTextColor', '#000000');
      const winHasFont = widgetHasFont(w);
      const winCssFamily = getCssFontStack(winFontFamilyVal);

      if (winHasFont && winTitleText) {
        // 有字体：使用 SGL 字模数据像素级渲染（真正 WYSIWYG）
        // SGL win.c: title_area.x1+=border, title_area.x2-=border（不减 title_h）
        const titleTextCoords = {
          x1: winBorder, y1: 0,
          x2: w.width - 1 - winBorder, y2: winTitleH
        };
        const titleAlignId = sglAlign(winTitleAlign);
        // 复用前面计算 title_h 时获取的字模数据
        const winSglFont = winSglFontForMetrics || getSglFontData(winFontFamilyVal, winFontSize, winFontBppVal);
        let titleDrawX, titleDrawY;
        if (winSglFont) {
          // 使用真实字模宽高计算位置 + 字模数据渲染
          const titlePos = SGLR.getTextPosSGL(titleTextCoords, winTitleText, winSglFont, 0, titleAlignId);
          titleDrawX = titlePos.x;
          if (winTitleAlign === 'LEFT_MID') titleDrawX += winRadius;
          titleDrawY = titlePos.y + winBorder;
          SGLR.drawStringSGL(surf, titleDrawX, titleDrawY, winTitleText,
            SGLR.hexToColor(winTitleTextColor), alpha, winSglFont);
        } else {
          // fallback: 字模数据未加载时用 Canvas fillText 近似
          const titlePos = SGLR.getTextPosRealtime(titleTextCoords, winTitleText, winFontSize, winCssFamily, 0, titleAlignId);
          titleDrawX = titlePos.x;
          if (winTitleAlign === 'LEFT_MID') titleDrawX += winRadius;
          titleDrawY = titlePos.y + winBorder;
          SGLR.drawString(surf, titleDrawX, titleDrawY, winTitleText,
            SGLR.hexToColor(winTitleTextColor), alpha, winFontSize, winCssFamily, winFontBppVal);
        }
      }

      SGLR.flushSurface(surf);

      if (!winHasFont) {
        // 无字体：DOM 叠加（系统默认字体）
        const titlePad = (winTitleAlign === 'LEFT_MID') ? winRadius : 0;
        overlayText({
          text: winTitleText,
          color: winTitleTextColor,
          fontSize: winFontSize,
          fontFamily: winFontFamilyVal,
          align: winTitleAlign,
          x: winBorder + titlePad, y: winBorder,
          w: w.width - 1 - winBorder - winTitleH - (winBorder + titlePad),
          h: winTitleH
        });
      }
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
      // item_h = sgl_font_get_height(font) + 6
      // draw_h = max(widget_h, 3 * item_h)
      // band_y1 = (widget_h - item_h) / 2 (垂直居中)
      // band_area.y1 = max(band_y1, coords.y1), band_area.y2 = min(band_y2, coords.y2)
      // text_x = coords.x1 + radius + 2 = border + radius + 2
      // text_y_off = (item_h - font_h) / 2
      // selected_color = mixer(SGL_THEME_COLOR, SGL_THEME_BG_COLOR, 128)
      const rOptions = (p('options', '') || '').split('\n').filter(o => o.length > 0);
      const rFontSize = p('fontSize', 14);
      // sgl_font_get_height: 字体文件中 font_height 通常等于 fontSize
      // (consolas14→14, consolas23→23, consolas24→24, song23→23)
      const rFontHeight = rFontSize;
      const rSelectedColor = SGLR.hexToColor(p('selectedColor', '#808080'));
      const rFontFamily = getCssFontStack(p('fontFamily', ''));
      const rRadius = p('radius', 4);
      const rBorderW = p('borderWidth', 1);
      // item_h = sgl_font_get_height(font) + 6
      const rItemH = rFontHeight + 6;
      // draw_h = max(widget_h, 3 * item_h)
      const rDrawH = Math.max(w.height, 3 * rItemH);
      // 选中带：band_y1 = (widget_h - item_h) / 2 (垂直居中在 widget 区域)
      const rBandY1 = Math.floor((w.height - rItemH) / 2);
      const rBandY2 = rBandY1 + rItemH - 1;
      // SGL: band_area.y1 = max(band_y1, coords.y1=border), y2 = min(band_y2, coords.y2=height-1-border)
      const rBandClipY1 = Math.max(rBandY1, rBorderW);
      const rBandClipY2 = Math.min(rBandY2, w.height - 1 - rBorderW);
      // text_x = coords.x1 + radius + 2 = border + radius + 2
      const rTextX = rBorderW + rRadius + 2;
      // text_y_off = (item_h - font_h) / 2
      const rTextYOff = Math.floor((rItemH - rFontHeight) / 2);
      // selected = 0, scroll_y = -selected * item_h = 0
      const rScrollY = 0;

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

      // 2. 选中带（x 范围 0~width-1，y 被 clip 到 coords 内）
      if (rBandClipY1 <= rBandClipY2) {
        SGLR.drawFillRect(surf, 0, rBandClipY1, w.width - 1, rBandClipY2, 0, rSelectedColor, alpha);
      }

      SGLR.flushSurface(surf);

      // 3. 各选项文本（DOM 叠加，用 flex 在 item 区域内垂直居中）
      // SGL: item_draw_y = band_y1 + scroll_y + i * item_h, text_x = border + radius + 2
      // 跳过 item_draw_y + item_h < draw_y1(0) 的，遇到 item_draw_y > draw_y2(draw_h-1) 停止
      const rHasFont = widgetHasFont(w);
      const rCssFamily = rHasFont ? rFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const rTextColorCss = p('textColor', '#000000');
      const rItemW = w.width - rTextX - (rBorderW + rRadius);
      for (let i = 0; i < rOptions.length; i++) {
        const itemDrawY = rBandY1 + rScrollY + i * rItemH;
        if (itemDrawY + rItemH < 0) continue;
        if (itemDrawY > rDrawH - 1) break;
        overlayText({
          text: rOptions[i] || '',
          color: rTextColorCss,
          fontSize: rFontSize,
          fontFamily: w.fontFamily || '',
          x: rTextX,
          y: itemDrawY,
          w: rItemW,
          h: rItemH,
          align: 'LEFT_MID'
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
      const tlFontSize = p('fontSize', 12);
      const ITEM_SPACE = 3;
      const ITEM_PAD = 3;
      // SGL: sgl_font_get_height(font) = font_height = 字号
      const tlItemHeight = tlFontSize + 2 * ITEM_SPACE;
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
        const tlSelected = -1; // SGL 默认 item_selected = -1，未选中任何项
        const tlInnerH = w.height - 2 * tlBorder;
        tlVisibleCount = Math.min(tlOptions.length, Math.max(1, Math.floor(tlInnerH / tlItemHeight)));

        // 顶部分隔线 (y = 0, x = item_pad ~ width-1-item_pad, 颜色 = 文本色)
        SGLR.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, 0, 1, tlTextColor, alpha);

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
              // SGL: select.y1 <= (area.y1 + radius), area.y1 相对控件 = 0
              const isTop = selY1 <= r;
              const isBottom = selY2 >= w.height - 1 - r;
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

          // 底部分隔线 (y = (i+1)*item_height, x = item_pad ~ width-1-item_pad, 颜色 = 文本色)
          const botSepY = (i + 1) * tlItemHeight;
          if (botSepY < w.height - tlBorder - 1) {
            SGLR.drawHLine(surf, tlItemPad, w.width - 1 - tlItemPad, botSepY, 1, tlTextColor, alpha);
          }
        }
      }

      SGLR.flushSurface(surf);

      // 文本（DOM 叠加，每个选项在 item 高度内垂直居中）
      // SGL: sgl_draw_string(surf, area, text_pos_x1, text_pos_y, ...) 
      // y 依赖字体度量(base_line/ofs_y)，仿真中文本恰好在 item 内垂直居中
      // 设计器用 flex 布局 LEFT_MID 实现相同效果
      // SGL: text_x = item_pad
      if (tlOptions.length > 0 && tlVisibleCount > 0) {
        for (let i = 0; i < tlVisibleCount; i++) {
          overlayText({
            text: tlOptions[i] || '',
            color: p('textColor', '#000000'),
            fontSize: tlFontSize,
            fontFamily: p('fontFamily', ''),
            align: 'LEFT_MID',
            x: tlItemPad,
            y: i * tlItemHeight,
            w: w.width - 2 * tlItemPad,
            h: tlItemHeight
          });
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
      const scWidth = p('width', 10); // SGL_SCROLL_DEFAULT_WIDTH（滚动条宽度属性）
      const scColor = SGLR.hexToColor(p('color', '#FFFFFF')); // SGL_THEME_COLOR
      const scBorderColor = SGLR.hexToColor(p('borderColor', '#000000')); // SGL_THEME_BORDER_COLOR
      const scBorder = p('borderWidth', 2); // SGL scroll desc.border=2
      const scRadius = Math.min(p('radius', 0), Math.floor(scWidth / 2));
      const scAlpha = alpha;

      // 绑定对象时用重算的渲染尺寸，否则用控件自身尺寸
      // SGL 运行时: 垂直贴目标右侧(宽=scWidth, 高=目标高), 水平贴目标底部(宽=目标宽, 高=scWidth)
      const rw = renderSize ? renderSize.domW : w.width;
      const rh = renderSize ? renderSize.domH : w.height;

      // 绑定对象时,scroll 应视觉上融入绑定目标,与仿真图片一致:
      // track 颜色 = 目标背景色,不显示 scroll 自己的独立边框,只保留滑块
      // 未绑定时,scroll 作为独立控件画完整 track(含边框、填充)
      const bindWidget = (w.bindTarget && page.widgets) ? page.widgets.find(wt => getWidgetVarName(wt) === w.bindTarget) : null;
      const surf = sglSurface(rw, rh);

      if (bindWidget) {
        // 融入目标:用目标背景色填充整个 scroll 区域,覆盖目标右侧/底侧边框
        const trackColor = SGLR.hexToColor(bindWidget.bgColor || bindWidget.color || '#FFFFFF');
        SGLR.drawFillRect(surf, 0, 0, rw - 1, rh - 1, scRadius, trackColor, scAlpha);
      } else {
        // 未绑定:画完整 track（含边框、填充）
        SGLR.drawRect(surf, 0, 0, rw - 1, rh - 1, {
          alpha: scAlpha,
          border: scBorder,
          border_alpha: scAlpha,
          border_mask: 0,
          color: scColor,
          border_color: scBorderColor,
          radius: scRadius
        });
      }

      // 滑块: 颜色 = sgl_color_mixer(color, SGL_THEME_BG_COLOR(黑), 128)
      const thumbCol = SGLR.colorMixer(scColor, SGLR.hexToColor('#000000'), 128);
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
      // SGL 核心：box 默认 focus=1，渲染完控件后额外画绿色焦点 wireframe
      // SGL_FOCUSED_COLOR = sgl_rgb(0x00, 0xFF, 0x00)，SGL_FOCUSED_WIDTH = 1
      SGLR.drawWireframe(surf, 0, 0, w.width - 1, w.height - 1, boxRadius, 1, SGLR.hexToColor('#00FF00'), 255);

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
      // SGL DRAW_INIT: 根据初始尺寸算出 box_w/box_h，再重算精确尺寸
      // new_width = box_w * COL + (COL+1) * margin, new_height = box_h * ROW + (ROW+1) * margin
      // SGL: obj->coords.x2 = x1 + new_width (闭区间), body_w = new_width + 1
      const rawBoxW = Math.floor((w.width - (COL + 1) * nkMargin) / COL);
      const rawBoxH = Math.floor((w.height - (ROW + 1) * nkMargin) / ROW);
      const nkBodyW = rawBoxW * COL + (COL + 1) * nkMargin + 1;
      const nkBodyH = rawBoxH * ROW + (ROW + 1) * nkMargin + 1;
      const boxW = rawBoxW;
      const boxH = rawBoxH;
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

      const surf = sglSurface(nkBodyW, nkBodyH);

      // 1. 主体背景 + 边框（buf32，flush 前）
      // SGL: body_desc.border_alpha 未设置(memset=0)，边框完全透明不可见
      SGLR.drawRect(surf, 0, 0, nkBodyW - 1, nkBodyH - 1, {
        alpha: alpha,
        border: p('borderWidth', 2),
        border_alpha: 0,
        border_mask: 0,
        color: SGLR.hexToColor(p('cellColor', '#FFFFFF')),
        radius: p('radius', 0),
        border_color: SGLR.hexToColor(p('borderColor', '#000000')),
      });

      // 2. 各按钮矩形 + 4bpp 图标（buf32，flush 前）
      //    SGL: btn.x2 = btn.x1 + box_w (闭区间，width = box_w + 1), btn.y2 = btn.y1 + box_h
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
          // SGL: btn.x2 = btn.x1 + box_w, btn.y2 = btn.y1 + box_h (闭区间 width=box_w+1)
          const bx2 = bx + boxW;
          const by2 = isOk ? (by + 2 * boxH + nkMargin) : (by + boxH);
          // SGL: btn_desc.border_alpha 未设置(memset=0)，边框完全透明不可见
          SGLR.drawRect(surf, bx, by, bx2, by2, {
            alpha: alpha,
            border: nkBtnBorderWidth,
            border_alpha: 0,
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
            // 文字按钮：记录按钮位置，flush 后用 "0" 字符宽度居中绘制
            const ch = kbdDigits[r][c];
            textBtns.push({ x1: bx, y1: by, ch: ch });
          }
        }
      }

      // 3. 文字按钮文本
      //    SGL: text_x = btn.x1 + (boxW - font_width("0")) / 2  ← 用 "0" 宽度居中，非实际字符
      //         text_y = btn.y1 + (boxH - font_height) / 2
      //    有字体时用 SGL drawString 像素级渲染到 buf32（flush 前），与 SGL 仿真一致
      //    无字体时用 DOM span 叠加（flush 后），使用系统默认字体
      const nkHasFont = widgetHasFont(w);
      const nkFontBpp = p('fontBpp', 4);
      const nkCssFamily = nkHasFont ? nkFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const nkTextColorCss = p('textColor', '#000000');
      // 用 "0" 字符宽度计算水平居中偏移（与 SGL 一致）
      const zeroWidth = SGLR.measureTextWidth('0', nkFontSize, nkCssFamily);
      const fontHeight = nkFontSize; // SGL font_height
      const textOffsetX = Math.floor((boxW - zeroWidth) / 2);
      const textOffsetY = Math.floor((boxH - fontHeight) / 2);

      // 有字体：SGL drawString 像素级渲染到 buf32（flush 前）
      if (nkHasFont) {
        textBtns.forEach(b => {
          const tx = b.x1 + textOffsetX;
          const ty = b.y1 + textOffsetY;
          SGLR.drawString(surf, tx, ty, b.ch, nkTextColor, alpha, nkFontSize, nkCssFamily, nkFontBpp);
        });
      }

      SGLR.flushSurface(surf);

      // 无字体：DOM span 叠加（flush 后），使用系统默认字体
      if (!nkHasFont) {
        textBtns.forEach(b => {
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;left:${(b.x1 + textOffsetX) * z}px;top:${(b.y1 + textOffsetY) * z}px;color:${nkTextColorCss};font-size:${nkFontSize * z}px;font-family:${nkCssFamily};pointer-events:none;white-space:nowrap;line-height:${nkFontSize * z}px;filter:var(--sgl-bpp-filter,none);`;
          span.textContent = b.ch;
          el.appendChild(span);
        });
      }
      break;
    }

    case 'keyboard': {
      // SGL keyboard 严格移植自 sgl_keyboard.c DRAW_MAIN
      // 默认展示 LOWER 模式 (key_mode=1, layout_mode=0)
      // 1. splitLen 计算行高和列宽
      // 2. icon 按键 (backspace/enter/newline/keybd/left/right) 用 drawIcon 渲染
      // 3. 文字按键: 有字体时用 drawString 像素级渲染, 无字体时 DOM span 叠加
      const kbBodyW = w.width, kbBodyH = w.height;
      // SGL DRAW_INIT: key_margin = max(body_w/128, 1) if 0; btn_radius = max(key_margin, 2) if 0
      let kbKeyMargin = p('btnMargin', 0);
      if (kbKeyMargin === 0) kbKeyMargin = Math.max(Math.floor(kbBodyW / 128), 1);
      let kbBtnRadius = p('btnRadius', 0);
      if (kbBtnRadius === 0) kbBtnRadius = Math.max(kbKeyMargin, 2);
      const kbBtnColor = SGLR.hexToColor(p('btnColor', '#404040'));
      const kbTextColor = SGLR.hexToColor(p('textColor', '#000000'));
      const kbBtnBorderWidth = p('btnBorderWidth', 0);
      const kbBtnBorderColor = SGLR.hexToColor(p('btnBorderColor', '#000000'));
      const kbFontSize = p('fontSize', 14);
      const kbFontBpp = p('fontBpp', 4);
      const kbFontFamily = getCssFontStack(p('fontFamily', ''));
      // 默认 LOWER 模式
      const kbKeyMode = 1;
      const kbLayoutMode = kbKeyMode >> 1;  // 0 = upper/lower layout
      const kbHasFont = widgetHasFont(w);
      const kbCssFamily = kbHasFont ? kbFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';

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

      // 2. splitLen 计算行高
      const btnHeight = new Array(4);
      SGLR.splitLen(SGLR.KEYBD_BTN_HEIGHT, 4, kbBodyH, kbKeyMargin, btnHeight);

      // 3. 遍历 4 行按键
      let btnIndex = 0;
      const textBtns = [];  // 文字按钮，flush 后再画
      let btnY1 = 0;
      for (let i = 0; i < 4; i++) {
        // 每行 splitLen 计算列宽
        const btnWidth = new Array(12);
        const rowCount = SGLR.KEYBOARD_BTN_COUNT[kbLayoutMode][i];
        SGLR.splitLen(SGLR.KEYBD_BTN_WIDTH[kbLayoutMode][i], rowCount, kbBodyW, kbKeyMargin, btnWidth);

        btnY1 += kbKeyMargin;
        const btnY2 = btnY1 + btnHeight[i] - 1;
        let btnX1 = 0;

        for (let j = 0; j < rowCount; j++) {
          btnX1 += kbKeyMargin;
          const btnX2 = btnX1 + btnWidth[j] - 1;

          // 画按键矩形
          SGLR.drawRect(surf, btnX1, btnY1, btnX2, btnY2, {
            alpha: alpha,
            border: kbBtnBorderWidth,
            border_alpha: alpha,
            border_mask: 0,
            color: kbBtnColor,
            radius: kbBtnRadius,
            border_color: kbBtnBorderColor,
          });

          // 判断是否为 icon
          const iconName = SGLR.keyindexIsIcon(kbKeyMode, btnIndex);
          if (iconName) {
            // icon 按键: 用 drawKeyboardIcon 渲染（严格移植 sgl_draw_character）
            // SGL: text_x = btn.x1 + (btn_width - advW) / 2, text_y = btn.y1 + (btn_height - fontHeight) / 2
            // drawKeyboardIcon 内部按 sgl_draw_character 算法计算 bitmap 位置
            const meta = SGLR.KEYBOARD_ICON_META[iconName];
            const textX = btnX1 + Math.floor((btnWidth[j] - meta.advW) / 2);
            const textY = btnY1 + Math.floor((btnHeight[i] - meta.fontHeight) / 2);
            SGLR.drawKeyboardIcon(surf, textX, textY, kbTextColor, SGLR.SGL_ALPHA_MAX, meta);
          } else {
            // 文字按键: 记录位置，flush 后处理
            const text = SGLR.KEYBD_BTN_MAP[kbKeyMode][btnIndex];
            textBtns.push({ x1: btnX1, y1: btnY1, x2: btnX2, y2: btnY2, w: btnWidth[j], h: btnHeight[i], text: text });
          }

          btnX1 += btnWidth[j];
          btnIndex++;
        }
        btnY1 = btnY2 + 1;  // 下一行起始 = 当前行结束 + 1（但实际 SGL 在下一轮循环 y1 += key_margin）
        // SGL: btn_coords.y1 += key_margin 在每行开始时，所以这里保持 btnY1 为当前行 y2+1
        // 下一轮循环会 btnY1 += kbKeyMargin
      }

      // 有字体: drawString 像素级渲染到 buf32（flush 前）
      if (kbHasFont) {
        textBtns.forEach(b => {
          const textW = SGLR.measureTextWidth(b.text, kbFontSize, kbCssFamily);
          const textX = b.x1 + Math.floor((b.w - textW) / 2);
          const textY = b.y1 + Math.floor((b.h - kbFontSize) / 2);
          SGLR.drawString(surf, textX, textY, b.text, kbTextColor, alpha, kbFontSize, kbCssFamily, kbFontBpp);
        });
      }

      SGLR.flushSurface(surf);

      // 无字体: DOM span 叠加（flush 后）
      if (!kbHasFont) {
        const kbTextColorCss = p('textColor', '#000000');
        textBtns.forEach(b => {
          const textW = SGLR.measureTextWidth(b.text, kbFontSize, kbCssFamily);
          const textX = b.x1 + Math.floor((b.w - textW) / 2);
          const textY = b.y1 + Math.floor((b.h - kbFontSize) / 2);
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;left:${textX * z}px;top:${textY * z}px;color:${kbTextColorCss};font-size:${kbFontSize * z}px;font-family:${kbCssFamily};pointer-events:none;white-space:nowrap;line-height:${kbFontSize * z}px;filter:var(--sgl-bpp-filter,none);`;
          span.textContent = b.text;
          el.appendChild(span);
        });
      }
      break;
    }

    case 'textline': {
      // SGL textline 严格移植自 sgl_textline.c
      // 1. 高度自动计算: y2 = y1 + (sgl_font_get_string_height(width-2*radius, text, font, line_margin) + 2*radius) - 1
      // 2. 背景条件渲染 (bg_flag)，bg_color 默认 SGL_THEME_COLOR(白)
      // 3. 文本区域 (x1+radius, y1+radius) ~ (x2-radius, y2-radius)
      // 4. 文本起始位置 (x1+radius, y1+radius)，TOP_LEFT 对齐（多行从左上角开始）
      const tlFontSize = p('fontSize', 14);
      const tlRadius = p('radius', 0);
      const tlBgTransparent = p('bgTransparent', false);
      const tlBg = p('bgColor', '#FFFFFF');
      const tlLineMargin = p('lineMargin', 1);
      const tlText = p('text', '');

      // 计算 SGL 实际高度（模拟 sgl_font_get_string_height）
      // SGL: return lines * (font_height + line_space)，textline y2 = y1 + (height + 2*radius) - 1
      const tlAvailWidth = w.width - 2 * tlRadius;
      const tlLines = calcSglTextLines(tlText, tlFontSize, tlAvailWidth);
      const tlActualHeight = tlLines * (tlFontSize + tlLineMargin) + 2 * tlRadius;

      const surf = sglSurface(w.width, w.height);
      // 背景：按 SGL 实际高度画（不是 w.height，与 SGL y2 自适应一致）
      if (!tlBgTransparent) {
        SGLR.drawFillRect(surf, 0, 0, w.width - 1, tlActualHeight - 1, tlRadius, SGLR.hexToColor(tlBg), alpha);
      }
      SGLR.flushSurface(surf);
      // 多行文本（DOM 叠加），文本区域 (radius, radius) ~ (width-radius, actualHeight-radius)
      if (tlText) {
        overlayText({
          text: tlText,
          color: p('textColor', p('color', '#000000')),
          fontSize: tlFontSize,
          fontFamily: p('fontFamily', ''),
          align: 'TOP_LEFT',
          x: tlRadius, y: tlRadius,
          w: w.width - 2 * tlRadius,
          h: tlActualHeight - 2 * tlRadius,
          lineMargin: tlLineMargin,
          multiline: true,
          maxWidth: w.width - 2 * tlRadius
        });
      }
      break;
    }

    case 'scope': {
      // SGL scope: 严格移植自 sgl_scope.c scope_construct_cb
      // 默认: bg=黑(0,0,0), grid=(50,50,50), border_width=0, border_color=(150,150,150)
      //       min=0, max=0xFFFF, line_width=2, grid_style=0(实线), alpha=255
      //       waveform_colors[0]=绿(0,255,0), y_label_color=白
      const spBg = SGLR.hexToColor(p('bgColor', '#000000'));
      const spBorderWidth = p('borderWidth', 0);
      const spBorderColor = SGLR.hexToColor(p('borderColor', '#969696'));
      const spGridColor = SGLR.hexToColor(p('gridColor', '#323232'));
      const spAlpha = alpha;
      const spLineWidth = p('lineWidth', 2);
      // SGL grid_style: 0=实线, >0=虚线 (gap 长度, dash=gap, 周期 2*gap)
      const spGridStyle = p('gridLine', 0);
      const spRangeMin = Number(p('rangeMin', 0));
      const spRangeMax = Number(p('rangeMax', 65535));
      const spAutoScale = p('autoScale', false);
      const spShowYLabels = p('showYLabels', false);
      const spYLabelColor = p('yLabelColor', '#FFFFFF');
      const spChannelCount = Math.max(1, Math.min(4, p('channelCount', 1) || 1));

      const surf = sglSurface(w.width, w.height);
      const W = w.width, H = w.height;

      // 1. 背景 + 边框（radius=0）
      SGLR.drawRect(surf, 0, 0, W - 1, H - 1, {
        alpha: spAlpha,
        border: spBorderWidth,
        border_alpha: spAlpha,
        border_mask: 0,
        color: spBg,
        border_color: spBorderColor,
        radius: 0
      });

      // SGL 坐标系: x1=0, x2=W-1, y1=0, y2=H-1, width=W, height=H (闭区间)
      const x1 = 0, y1 = 0, x2 = W - 1, y2 = H - 1;
      const width = x2 - x1;       // SGL: width = x2 - x1
      const height = y2 - y1;      // SGL: height = y2 - y1

      // 2. 计算 display_min / display_max (SGL autoScale 逻辑)
      // 设计时无真实数据, autoScale 时用 [0, 100] 模拟范围
      let displayMin = spRangeMin;
      let displayMax = spRangeMax;
      let actualMin = displayMin;
      let actualMax = displayMax;

      // 3. 中心十字线 (SGL: x_center = (x1+x2)/2, y_center 按 display 范围中点)
      // SGL: y_center = y1 + (height * (display_max - (min+max)/2)) / (max-min)
      const xCenter = Math.trunc((x1 + x2) / 2);
      const yCenter = y1 + Math.trunc((height * (displayMax - Math.trunc((displayMin + displayMax) / 2))) / (displayMax - displayMin));
      if (spGridStyle > 0) {
        SGLR.drawDashedLine(surf, x1, yCenter, x2, yCenter, spGridStyle, spGridStyle, spGridColor, spAlpha);
        SGLR.drawDashedLine(surf, xCenter, y1, xCenter, y2, spGridStyle, spGridStyle, spGridColor, spAlpha);
      } else {
        SGLR.drawHLine(surf, x1, x2, yCenter, 1, spGridColor, spAlpha);
        SGLR.drawVLine(surf, xCenter, y1, y2, 1, spGridColor, spAlpha);
      }

      // 4. 9 条垂直网格线 (SGL: i=1..9, x_pos = x1 + width*i/10, 整数除法)
      for (let i = 1; i < 10; i++) {
        const xPos = x1 + Math.trunc(width * i / 10);
        if (spGridStyle > 0) {
          SGLR.drawDashedLine(surf, xPos, y1, xPos, y2, spGridStyle, spGridStyle, spGridColor, spAlpha);
        } else {
          SGLR.drawVLine(surf, xPos, y1, y2, 1, spGridColor, spAlpha);
        }
      }

      // 5. 9 条水平网格线 (SGL: i=1..9, y_pos = y1 + height*i/10, 整数除法)
      for (let i = 1; i < 10; i++) {
        const yPos = y1 + Math.trunc(height * i / 10);
        if (spGridStyle > 0) {
          SGLR.drawDashedLine(surf, x1, yPos, x2, yPos, spGridStyle, spGridStyle, spGridColor, spAlpha);
        } else {
          SGLR.drawHLine(surf, x1, x2, yPos, 1, spGridColor, spAlpha);
        }
      }

      // 6. 波形绘制 (SGL: 从右向左, 多通道, Y 轴反转)
      // 解析通道数据: channelBuffers 格式 "ch0_data;ch1_data" 每通道用逗号分隔数值
      const chBufStr = p('channelBuffers', '') || '';
      const chColStr = p('channelWaveformColors', '#00FF00') || '#00FF00';
      const chCols = chColStr.split(';').map(s => s.trim()).filter(s => s);
      // SGL 默认通道颜色: ch0=绿, ch1=红, ch2=蓝, ch3=黄
      const defaultChCols = ['#00FF00', '#FF0000', '#0000FF', '#FFFF00'];
      const channels = chBufStr ? chBufStr.split('|') : [];

      const rangeSpan = Math.max(1, displayMax - displayMin);

      if (channels.length > 0) {
        // 有用户数据: 按用户数据绘制 (与 preview.js 一致)
        channels.forEach((bufStr, ci) => {
          const points = bufStr.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
          if (points.length < 2) return;
          const col = SGLR.hexToColor(chCols[ci] || defaultChCols[ci] || '#00FF00');
          const n = points.length;
          // SGL: start.x = x2, start.y = y2 - (value-min)*height/(max-min)
          let prevX = x2;
          let prevV = Math.max(displayMin, Math.min(displayMax, points[n - 1]));
          let prevY = y2 - Math.trunc((prevV - displayMin) * height / rangeSpan);
          for (let i = 1; i < n; i++) {
            const idx = n - 1 - i;
            const curV = Math.max(displayMin, Math.min(displayMax, points[idx]));
            const curX = x2 - Math.trunc(i * width / (n - 1));
            const curY = y2 - Math.trunc((curV - displayMin) * height / rangeSpan);
            SGLR.drawLine(surf, prevX, prevY, curX, curY, spLineWidth, col, spAlpha);
            prevX = curX;
            prevY = curY;
          }
        });
      } else {
        // 无用户数据: 模拟正弦波 (值域映射到 [displayMin, displayMax])
        const dataPoints = Math.min(W, 64);
        const pts = [];
        for (let i = 0; i < dataPoints; i++) {
          // 归一化 [0,1] -> 映射到 [displayMin, displayMax]
          const norm = Math.sin(i * 0.2) * 0.4 + 0.5;
          const v = Math.trunc(displayMin + norm * rangeSpan);
          const px = x2 - Math.trunc(i * width / (dataPoints - 1));
          const py = y2 - Math.trunc((v - displayMin) * height / rangeSpan);
          pts.push({ x: px, y: py });
        }
        const col = SGLR.hexToColor(chCols[0] || defaultChCols[0] || '#00FF00');
        for (let i = 1; i < pts.length; i++) {
          SGLR.drawLine(surf, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, spLineWidth, col, spAlpha);
        }
      }

      SGLR.flushSurface(surf);

      // 7. Y 轴标签 (SGL: showYLabels && y_label_font 时画 max/min/mid)
      // 设计时无字体也能预览, 用 DOM span 模拟
      if (spShowYLabels) {
        const labelColor = spYLabelColor || '#FFFFFF';
        const labelText = (txt) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = `position:absolute;left:2px;top:0;width:50px;height:${H}px;pointer-events:none;box-sizing:border-box;overflow:hidden;`;
          const top = document.createElement('span');
          top.style.cssText = `position:absolute;left:0;top:2px;color:${labelColor};font-size:11px;font-family:monospace;white-space:nowrap;`;
          top.textContent = String(actualMax);
          const mid = document.createElement('span');
          mid.style.cssText = `position:absolute;left:0;top:${Math.trunc(yCenter - 6)}px;color:${labelColor};font-size:11px;font-family:monospace;white-space:nowrap;`;
          mid.textContent = String(Math.trunc((actualMax + actualMin) / 2));
          const bot = document.createElement('span');
          bot.style.cssText = `position:absolute;left:0;bottom:2px;color:${labelColor};font-size:11px;font-family:monospace;white-space:nowrap;`;
          bot.textContent = String(actualMin);
          wrap.appendChild(top);
          wrap.appendChild(mid);
          wrap.appendChild(bot);
          el.appendChild(wrap);
        };
        labelText();
      }
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
      const specHatColor = SGLR.hexToColor(p('barHatColor', '#808080')); // SGL: mixer(黑, 白, 128)
      const specBarNum = Math.max(1, p('barNum', 12));
      const specBarWidth = Math.max(1, Math.floor(w.width / (specBarNum + 1)));
      const specHatHeight = Math.max(1, p('barHatHeight', 3));
      // mode: 1=BAR, 2=BLOCK, 5=BAR_HAT, 6=BLOCK_HAT (SGL 宏定义)
      const specMode = p('barMode', 2);
      const hasHat = (specMode & 4) !== 0;
      const isBlock = (specMode & 2) !== 0;
      const isBar = (specMode & 1) !== 0;

      const surf = sglSurface(w.width, w.height);

      // 频谱数据 (bar_value 数组): 优先用 barValues 属性（0-100 百分比），无则用 sin 模拟
      const valStr = p('barValues', '');
      let values;
      if (valStr) {
        const parsed = String(valStr).split(';').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
        values = [];
        for (let i = 0; i < specBarNum; i++) {
          const v = Math.max(0, Math.min(100, parsed[i] != null ? parsed[i] : 0));
          values.push(Math.max(0, Math.round(w.height * v / 100)));
        }
      } else {
        values = [];
        for (let i = 0; i < specBarNum; i++) {
          values.push(Math.floor((Math.sin(i * 0.5) * 0.3 + 0.5) * w.height));
        }
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
      // SGL qrcode: 严格移植自 sgl_qrcode.c
      // 1. 用 QR 码库生成模块矩阵（同源 nayuki 算法，与 SGL C 版本一致）
      // 2. 按 SGL 渲染算法绘制：背景 + 单元格网格 + logo（如有）
      const qrText = p('qrText', 'hello');
      const qrVersion = p('version', 5);
      const qrEcc = p('ecc', 0);
      const qrScale = p('scale', 4);
      const qrZone = p('zone', 1);
      const qrCellRadius = p('cellRadius', 0);
      const qrObjRadius = p('radius', 0);
      const qrBg = SGLR.hexToColor(p('bgColor', '#ffffff'));
      const qrCellColor = SGLR.hexToColor(p('cellColor', '#000000'));
      const qrLogoPath = p('logo', '');

      // SGL ecc 0-3 → qrcode-generator 'L'/'M'/'Q'/'H'
      const eccMap = ['L', 'M', 'Q', 'H'];
      const eccLevel = eccMap[qrEcc] || 'L';

      // 生成 QR 矩阵（typeNumber=version, errorCorrectionLevel=ecc）
      let qrSize = 0;
      let isDark = () => false;
      try {
        const qr = qrcodeGenerator(qrVersion, eccLevel);
        qr.addData(qrText || ' ');
        qr.make();
        qrSize = qr.getModuleCount();
        isDark = (x, y) => qr.isDark(y, x);
      } catch (e) {
        // 文本过长或版本太小时，回退到显示空网格
        console.warn('QR 码生成失败:', e);
        qrSize = 4 * qrVersion + 17;
        isDark = () => false;
      }

      // logo 图片：已缓存则同步渲染，未缓存则异步加载后重绘
      let logoImg = null;
      const qrLogoFormat = p('pixmapFormat', 'RGB565');
      if (qrLogoPath) {
        logoImg = getCachedPixmapImageData(qrLogoPath);
        if (!logoImg) {
          preloadPixmapImage(qrLogoPath, () => renderCanvas());
        }
      }

      const surf = sglSurface(w.width, w.height);
      SGLR.drawQrcode(surf, 0, 0, w.width, w.height, {
        qrSize, isDark, scale: qrScale, zone: qrZone,
        cellRadius: qrCellRadius, bgColor: qrBg, cellColor: qrCellColor,
        alpha: alpha, objRadius: qrObjRadius, ecc: qrEcc, logoImg, logoFormat: qrLogoFormat
      });
      SGLR.flushSurface(surf);
      break;
    }

    case 'chart': {
      // SGL chart: 严格移植 SGL 算法，用 SGLRenderer 像素级渲染
      const surf = sglSurface(w.width, w.height);
      const chartFontFamily = p('fontFamily', '');
      const chartFontSize = chartFontFamily ? p('fontSize', 12) : 14;
      const chartFontBpp = p('fontBpp', 4);
      const chartHasFont = widgetHasFont(w);
      // 无自定义字体时，SGL 的 sgl_system.font = NULL，x_font = NULL，不增加 margin
      // 有自定义字体时，使用字模实际的 font_height 计算布局（与 SGL 一致）
      let chartFontHeight = chartFontSize;
      if (chartHasFont) {
        const fontPath = resolveFontPath(chartFontFamily);
        const sglFont = getSglFontData(fontPath, chartFontSize, chartFontBpp);

        if (sglFont && sglFont.font_height) {
          chartFontHeight = sglFont.font_height;
        } else {
          // 字模数据未加载，异步加载并触发重绘
          loadSglFontData(fontPath, chartFontSize, chartFontBpp, '0123456789.-').then(() => {
            renderCanvas();
          });
        }
      }
      const overlays = SGLR.drawChart(surf, w, SGLR, {
        alpha: alpha,
        fontSize: chartFontSize,
        fontHeight: chartFontHeight,
        fontFamily: chartFontFamily,
        hasFont: chartHasFont
      });
      SGLR.flushSurface(surf);
      // 文本叠加（坐标轴标签、图例文本）
      for (const o of overlays) {
        overlayText({
          text: o.text, color: o.color, fontSize: o.fontSize,
          fontFamily: o.fontFamily, align: 'TOP_LEFT',
          x: o.x, y: o.y
        });
      }
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
      const acFontH = acFontSize + 8;
      const acFontFamily = getCssFontStack(p('fontFamily', ''));
      const hour = p('hour', 0), minute = p('minute', 0), second = p('second', 0);

      // SGL: cx=(x1+x2)/2, cy=(y1+y2)/2, r=max(radius, width/2 - 1) 整数除法
      const cx = Math.trunc((0 + (w.width - 1)) / 2);
      const cy = Math.trunc((0 + (w.height - 1)) / 2);
      const r = Math.max(0, Math.max(p('radius', 0), Math.trunc(w.width / 2) - 1));
      const acBorderW = Math.min(p('borderWidth', 0), r);
      const innerR = Math.max(0, r - acBorderW);
      const scaleOut = Math.max(0, innerR - 2);
      const scaleIn = Math.max(0, scaleOut - acScaleLen);
      // SGL: h_len=inner_r/2 (整数除法), m_len/s_len 用 <<8 定点
      const hLen = Math.trunc(innerR / 2);
      const mLen = (innerR * 160) >> 8;
      const sLen1 = (innerR * 217) >> 8;
      const sLen2 = (innerR * 39) >> 8;
      const subScaleCol = SGLR.colorMixer(acScaleCol, acBg, 128);

      const surf = sglSurface(w.width, w.height);
      // SGL 用定点整数三角函数 sgl_sin/sgl_cos (SGL_SIN_FIXED_ONE=32768)
      // 坐标计算: (len * sin_val) / SGL_SIN_FIXED_ONE + cx (整数除法向零截断)
      // 注意: 不能用 Math.sin/Math.cos (浮点), 否则坐标与 SGL 仿真不一致
      const SIN_FIXED = SGLR.SGL_SIN_FIXED_ONE;

      // 1. 背景圆 (bgColor) - SGL: sgl_draw_fill_circle(cx, cy, r, bg_color)
      SGLR.drawFillCircle(surf, cx, cy, r, acBg, alpha);

      // 2. 边框环 (SGL: border_w>0 时画 ring, 颜色=bg_color)
      if (acBorderW > 0) {
        SGLR.drawFillRing(surf, cx, cy, innerR, r, acBg, alpha);
      }

      // 3. 60 刻度 + 数字 (SGL: 同一循环, 顺序: 画刻度 → if(j==5)j=0 → if(j==0)画数字 → j++)
      //    j==5 时主刻度(scale_color)并 j=0, 其余次刻度(sub_scale_color)
      //    j==0 时画数字 (i==0 显示 12, 其余 i/5)
      //    所有刻度宽度都是 scale_width (主/次只是颜色不同)
      const acHasFont = widgetHasFont(w);
      const acCssFamily = acHasFont ? acFontFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
      const acTextColCss = p('textColor', '#FFFFFF');
      const textR = Math.max(0, scaleIn - acFontH - 2);
      let j = 0;
      for (let i = 0; i < 60; i++) {
        const angle = i * 6 - 90;
        const sinVal = SGLR.sglSin(angle);
        const cosVal = SGLR.sglCos(angle);
        // SGL C 整数运算: (scale_out * cos_val) / SGL_SIN_FIXED_ONE + cx
        // 必须先做整数除法 (向零截断), 再加 cx, 不能先加 cx 再截断
        const xo = Math.trunc((scaleOut * cosVal) / SIN_FIXED) + cx;
        const yo = Math.trunc((scaleOut * sinVal) / SIN_FIXED) + cy;
        const xi = Math.trunc((scaleIn * cosVal) / SIN_FIXED) + cx;
        const yi = Math.trunc((scaleIn * sinVal) / SIN_FIXED) + cy;

        // 1. 画刻度
        if (j === 5) {
          SGLR.drawLine(surf, xo, yo, xi, yi, acScaleW, acScaleCol, alpha);
          j = 0;
        } else {
          SGLR.drawLine(surf, xo, yo, xi, yi, acScaleW, subScaleCol, alpha);
        }

        // 2. j==0 时画数字 (SGL: if (clock->font && j == 0))
        //    SGL 中只有设置了字体(clock->font != NULL)才画数字, 否则不画
        //    设计器匹配此行为: 未设置字体时不画数字, 实现所见即所得
        if (j === 0 && acHasFont) {
          const text = i === 0 ? '12' : String(Math.trunc(i / 5));
          const tx = Math.trunc((textR * cosVal) / SIN_FIXED) + cx;
          const ty = Math.trunc((textR * sinVal) / SIN_FIXED) + cy;
          const tw = SGLR.stringWidth(text, acFontSize);
          const th = SGLR.fontHeight(acFontSize);
          const span = document.createElement('span');
          span.style.cssText = `position:absolute;left:${Math.round((tx - Math.trunc(tw / 2)) * z)}px;top:${Math.round((ty - Math.trunc(th / 2)) * z)}px;color:${acTextColCss};font-size:${acFontSize * z}px;font-family:${acCssFamily};pointer-events:none;white-space:nowrap;filter:var(--sgl-bpp-filter,none);`;
          span.textContent = text;
          el.appendChild(span);
        }

        j++;
      }

      // 4. 时针、分针 (两段式: 粗头 尾部→前端 + 细柄 中心→尾部)
      //    SGL: 尾部细柄颜色 = 前端颜色 (不是 sec_ptr_color)
      //    SGL: 尾部细柄无条件绘制 (sgl_draw_line_fill_slanted 两次调用)
      //    坐标: px = (h_len * cos(angle)) / FIXED + cx, 整数除法
      const hAngle = ((hour % 12) * 30 + Math.trunc(minute / 2)) - 90;
      const mAngle = (minute * 6) - 90;
      const sAngle = (second * 6) - 90;
      function drawHand(angleDeg, tailLen, tipLen, mainWidth, tailWidth, color) {
        const sinVal = SGLR.sglSin(angleDeg);
        const cosVal = SGLR.sglCos(angleDeg);
        // SGL C 整数运算: 先整数除法, 再加 cx/cy
        const sx = cx + Math.trunc((tailLen * cosVal) / SIN_FIXED);
        const sy = cy + Math.trunc((tailLen * sinVal) / SIN_FIXED);
        const px = Math.trunc((tipLen * cosVal) / SIN_FIXED) + cx;
        const py = Math.trunc((tipLen * sinVal) / SIN_FIXED) + cy;
        // SGL: 先画前端粗头 (sx,sy)→(px,py), 宽度 mainWidth
        SGLR.drawLine(surf, sx, sy, px, py, mainWidth, color, alpha);
        // SGL: 再画尾部细柄 (cx,cy)→(sx,sy), 宽度 tailWidth (无条件)
        SGLR.drawLine(surf, cx, cy, sx, sy, tailWidth, color, alpha);
      }
      drawHand(hAngle, sLen2, hLen, acHourW, acSecW, acHourCol);
      drawHand(mAngle, sLen2, mLen, acMinW, acSecW, acMinCol);

      // 5. hub 第一层 (minPtrColor, hub_r+1, 坐标 cx-1, cy-1) - 秒针前画
      SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR + 1, acMinCol, alpha);

      // 6. 秒针 (反向尾部 -s_len_2 → 前端 s_len_1)
      //    SGL: sx = cx - (s_len_2 * cos) / FIXED, px = (s_len_1 * cos) / FIXED + cx
      {
        const sinVal = SGLR.sglSin(sAngle);
        const cosVal = SGLR.sglCos(sAngle);
        const sx = cx - Math.trunc((sLen2 * cosVal) / SIN_FIXED);
        const sy = cy - Math.trunc((sLen2 * sinVal) / SIN_FIXED);
        const px = Math.trunc((sLen1 * cosVal) / SIN_FIXED) + cx;
        const py = Math.trunc((sLen1 * sinVal) / SIN_FIXED) + cy;
        SGLR.drawLine(surf, sx, sy, px, py, acSecW, acSecCol, alpha);
      }

      // 7. hub 第二层 (hubColor, hub_r) + 第三层 (bgColor, hub_r-2) - 秒针后画
      SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR, acHubCol, alpha);
      if (acHubR - 2 > 0) {
        SGLR.drawFillCircle(surf, cx - 1, cy - 1, acHubR - 2, acBg, alpha);
      }

      SGLR.flushSurface(surf);
      break;
    }

    case 'icon': {
      // SGL icon: 4bpp alpha 蒙版图标，用 color 颜色混合绘制
      // 移植自 sgl_icon.c → sgl_get_icon_pos + sgl_draw_icon
      const iconPath = p('icon', '');
      const iconColor = SGLR.hexToColor(p('color', '#000000'));
      const iconAlign = p('align', 'CENTER');
      if (iconPath) {
        const imgData = getCachedPixmapImageData(iconPath);
        if (imgData) {
          // 图片已缓存：提取 alpha 通道转为 4bpp 蒙版，用 drawIcon 像素级渲染
          const surf = sglSurface(w.width, w.height);
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
          SGLR.drawIcon(surf, ix, iy, iconColor, alpha, iconObj);
          SGLR.flushSurface(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载，加载完成后重绘
          const surf = sglSurface(w.width, w.height);
          SGLR.flushSurface(surf);
          preloadPixmapImage(iconPath, () => renderCanvas());
        }
      } else {
        // 无图片时显示占位符
        const surf = sglSurface(w.width, w.height);
        SGLR.flushSurface(surf);
        const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
        if (iconFontSize > 0) {
          overlayText({
            text: '★',
            color: p('color', '#8b5cf6'),
            fontSize: iconFontSize,
            fontFamily: '',
            align: 'CENTER',
            x: 0, y: 0, w: w.width, h: w.height
          });
        }
      }
      break;
    }

    case 'sprite': {
      // SGL sprite: 严格移植自 sgl_sprite.c
      // 只支持 ARGB4444，不缩放（1:1 像素映射），与现有帧缓冲像素混合
      const spPixmap = p('pixmap', '');
      const spAlpha = p('alpha', 255);
      if (spPixmap) {
        const imgData = getCachedPixmapImageData(spPixmap);
        if (imgData) {
          // 图片已缓存：用 drawSprite 像素级渲染（SGL 算法）
          const surf = sglSurface(w.width, w.height);
          SGLR.drawSprite(surf, imgData, spAlpha);
          SGLR.flushSurface(surf);
        } else {
          // 图片未缓存：CSS 占位 + 异步加载，加载完成后重绘
          el.style.backgroundImage = `url('${toAssetUrl(spPixmap)}')`;
          el.style.backgroundSize = '100% 100%';
          preloadPixmapImage(spPixmap, () => renderCanvas());
        }
      } else {
        // 无图片时显示占位符，提示需要设置图片
        const surf = sglSurface(w.width, w.height);
        SGLR.flushSurface(surf);
        const iconFontSize = Math.round(Math.min(w.width, w.height) * 0.5);
        if (iconFontSize > 0) {
          overlayText({
            text: '◆',
            color: '#8b5cf6',
            fontSize: iconFontSize,
            fontFamily: '',
            align: 'CENTER',
            x: 0, y: 0, w: w.width, h: w.height
          });
        }
      }
      break;
    }

    case '2dball': {
      // SGL 2dball: 严格移植自 sgl_2dball.c
      // SGL: sgl_2dball_set_radius 调用 sgl_obj_circle_zoom，将控件 coords 改为 2*radius
      // 渲染时 radius = sgl_obj_get_width(obj) / 2 = 设置的 radius
      // 设计器必须用 w.radius 属性，不能用 w.width/2（设计器不执行 circle_zoom）
      const ballColor = p('color', '#FFFFFF');
      const ballBg = p('bgColor', '#000000');
      const ballRadius = p('radius', 20);
      const ballSize = ballRadius * 2;
      const surf = sglSurface(ballSize, ballSize);
      const cx = Math.floor((ballSize - 1) / 2);
      const cy = Math.floor((ballSize - 1) / 2);
      SGLR.draw2dBall(surf, cx, cy, ballRadius, SGLR.hexToColor(ballColor), SGLR.hexToColor(ballBg), alpha);
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
      // SGL ext_img WYSIWYG 渲染：按 SGL 算法居中/旋转/缩放绘制图片
      const surf = sglSurface(w.width, w.height);
      const eiPixmap = w.pixmap;
      const eiAlpha = alpha;

      // 统一占位符绘制（无图片或图片未加载时）
      function drawExtImgPlaceholder() {
        const eiBg = SGLR.hexToColor('#313149');
        const eiBorderCol = SGLR.hexToColor('#3d3d5c');
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: eiAlpha, border: 1, border_alpha: eiAlpha, border_mask: 0,
          color: eiBg, border_color: eiBorderCol, radius: 4
        });
        SGLR.flushSurface(surf);
        const eiText = 'IMG';
        const eiFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
        const eiAlphaCss = Math.round(eiAlpha * 0.4) / 255;
        overlayText({
          text: eiText,
          color: `rgba(139,92,246,${eiAlphaCss})`,
          fontSize: eiFontSize,
          fontFamily: '',
          align: 'CENTER',
          x: 0, y: 0, w: w.width, h: w.height
        });
      }

      if (eiPixmap) {
        const imgData = getCachedPixmapImageData(eiPixmap);
        if (imgData) {
          // 使用严格移植的 SGL ext_img 像素级渲染算法
          // SGL ext_img 设置 pixmap 后 coords 会被强制设为图片尺寸，绘制区域由图片决定
          SGLR.drawExtImg(surf, imgData, imgData.width, imgData.height, w.rotation, w.scaleUniform, w.pivotX, w.pivotY, eiAlpha, w.pixmapFormat);
          SGLR.flushSurface(surf);
        } else {
          preloadPixmapImage(eiPixmap, () => renderCanvas());
          drawExtImgPlaceholder();
        }
      } else {
        drawExtImgPlaceholder();
      }
      break;
    }

    case 'img': {
      // SGL img WYSIWYG 渲染：1:1像素映射，按pixmap格式解码
      const surf = sglSurface(w.width, w.height);
      const imgPixmap = w.pixmap;
      const imgAlpha = alpha;

      function drawImgPlaceholder() {
        const imgBg = SGLR.hexToColor('#313149');
        const imgBorderCol = SGLR.hexToColor('#3d3d5c');
        SGLR.drawRect(surf, 0, 0, w.width - 1, w.height - 1, {
          alpha: imgAlpha, border: 1, border_alpha: imgAlpha, border_mask: 0,
          color: imgBg, border_color: imgBorderCol, radius: 4
        });
        SGLR.flushSurface(surf);
        const imgText = 'IMG';
        const imgFontSize = Math.max(8, Math.round(Math.min(w.width, w.height) * 0.3));
        const imgAlphaCss = Math.round(imgAlpha * 0.4) / 255;
        overlayText({
          text: imgText,
          color: `rgba(139,92,246,${imgAlphaCss})`,
          fontSize: imgFontSize,
          fontFamily: '',
          align: 'CENTER',
          x: 0, y: 0, w: w.width, h: w.height
        });
      }

      if (imgPixmap) {
        const imgData = getCachedPixmapImageData(imgPixmap);
        if (imgData) {
          SGLR.drawImg(surf, 0, 0, imgData, w.pixmapFormat, imgAlpha);
          SGLR.flushSurface(surf);
        } else {
          preloadPixmapImage(imgPixmap, () => renderCanvas());
          drawImgPlaceholder();
        }
      } else {
        drawImgPlaceholder();
      }
      break;
    }

    case 'arc_label': {
      // SGL arc_label WYSIWYG 渲染：文本绘制 + 旋转
      const alText = p('text', '标签');
      const alTextColor = p('textColor', '#000000');
      const alBgFlag = p('bgFlag', false);
      const alBgColor = p('bgColor', '#FFFFFF');
      const alRadius = p('radius', 0);
      const alAlign = p('align', 'CENTER');
      const alFontSize = p('fontSize', 14);
      const alFontFamily = p('fontFamily', '');
      const alFontBpp = p('fontBpp', 4);
      const alAngle = p('angle', 0);
      const alOffsetX = p('offsetX', 0);
      const alOffsetY = p('offsetY', 0);
      const alAlpha = alpha;
      const alHasFont = widgetHasFont(w);
      const alCssFamily = getCssFontStack(alFontFamily);
      const alTextCol = SGLR.hexToColor(alTextColor);

      if (alAngle && alAngle !== 0) {
        // SGL arc_label 旋转模式渲染（严格移植 sgl_arc_label_construct_cb）：
        // SGL 渲染分两部分：
        //   1. 如果 bg_flag：画水平背景矩形（obj->coords = 旋转后边界框大小）
        //   2. 创建临时缓冲（textW+margin*2 × textH+margin*2），用 bg_color 填充，画文本后旋转 angle 度
        // 关键：obj->coords 中心 = 原始 w×h 中心（update_rotation_bounds 保持中心不变）
        //
        // 设计器实现：el 用原始 w×h 并整体旋转 angle 度
        //   - 选中框跟着旋转 ✓
        //   - 背景画在 el canvas 上（原始 w×h），跟着 el 旋转
        //   - 文本块（bg_color 背景）居中放置，跟着 el 旋转（= SGL 旋转文本块）

        // el 整体旋转（选中框、背景、文本块都跟着旋转）
        el.style.transform = `rotate(${alAngle}deg)`;
        el.style.transformOrigin = 'center center';

        // 1. 背景矩形（如果 bg_flag）：画在 el 的 canvas 上（原始 w×h），跟着 el 旋转
        const surf = sglSurface(w.width, w.height);
        if (alBgFlag) {
          SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, alRadius, SGLR.hexToColor(alBgColor), alAlpha);
        }
        SGLR.flushSurface(surf);

        // 2. 临时缓冲（文本块）：textWidth+margin*2 × textHeight+margin*2
        // SGL: text_width = sgl_font_get_string_width, text_height = sgl_font_get_height, margin = text_height * 2
        const alMeasureFamily = alHasFont ? alCssFamily : 'system-ui, -apple-system, "Segoe UI", sans-serif';
        const alTextWidth = Math.ceil(SGLR.measureTextWidth(alText, alFontSize, alMeasureFamily));
        const alTextHeight = alFontSize;
        const alMargin = alTextHeight * 2;
        const alBufW = alTextWidth + alMargin * 2;
        const alBufH = alTextHeight + alMargin * 2;

        // 3. 创建内部 div（文本块），居中放置在 el 中心
        // SGL: sgl_draw_xform_surf 将临时缓冲旋转绘制到 obj->coords 中心
        // el 已旋转，文本块跟着 el 旋转（= SGL 旋转文本块）
        const alTextBlock = document.createElement('div');
        alTextBlock.style.cssText = `position:absolute;left:50%;top:50%;width:${alBufW*z}px;height:${alBufH*z}px;transform:translate(-50%,-50%);pointer-events:none;overflow:hidden;`;
        // SGL: 旋转模式临时缓冲总是用 bg_color 填充（不管 bg_flag）
        // 代码生成时旋转模式总是生成 set_bg_color，所以 bg_color = bgColor
        alTextBlock.style.background = alBgColor;

        // 4. 在文本块上画文本
        // SGL: sgl_draw_string(&temp_surf, &temp_area, margin, margin, ...)
        // sgl_draw_string 的 y 是字体行高框顶部，与 SGLR.drawString 的 textBaseline='top' 一致
        if (alHasFont) {
          const alTbCanvas = document.createElement('canvas');
          const alTbSurf = SGLR.createSurface(alTbCanvas, alBufW, alBufH, z);
          alTbCanvas.style.cssText = `position:absolute;left:0;top:0;width:${alTbSurf.w}px;height:${alTbSurf.h}px;pointer-events:none;`;
          SGLR.drawString(alTbSurf, alMargin, alMargin, alText, alTextCol, alAlpha, alFontSize, alCssFamily, alFontBpp);
          SGLR.flushSurface(alTbSurf);
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
        const surf = sglSurface(w.width, w.height);
        if (alBgFlag) {
          SGLR.drawFillRect(surf, 0, 0, w.width - 1, w.height - 1, alRadius, SGLR.hexToColor(alBgColor), alAlpha);
        }
        if (alHasFont) {
          // 有字体：SGL drawString 像素级渲染
          const coords = { x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 };
          const pos = SGLR.getTextPosRealtime(coords, alText, alFontSize, alCssFamily, 0, sglAlign(alAlign));
          SGLR.drawString(surf, pos.x + alOffsetX, pos.y + alOffsetY, alText, alTextCol, alAlpha, alFontSize, alCssFamily, alFontBpp);
        }
        SGLR.flushSurface(surf);
        if (!alHasFont) {
          // 无字体：DOM span 叠加（系统默认字体）
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

function addResizeHandles(container, wx, wy, ww, wh, z, locked = false) {
  const x = wx * z;
  const y = wy * z;
  const w = ww * z;
  const h = wh * z;
  const positions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
  positions.forEach(pos => {
    const handle = document.createElement('div');
    handle.className = 'resize-handle ' + pos;
    handle.dataset.pos = pos;
    if (locked) {
      handle.style.cursor = 'not-allowed';
      handle.title = '控件已锁定';
    }
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 中键交给 viewport 处理画布平移
      if (e.button === 1) return;
      // 锁定控件不允许调整大小
      if (locked) return;
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

// 为 polygon 控件添加顶点拖拽手柄（青色小方块，区别于白色 resize 手柄）
// 顶点坐标是相对于控件左上角的，手柄位置 = 控件绝对位置 + 顶点坐标
function addPolygonVertexHandles(container, w, absPos, z, locked = false) {
  const verts = (typeof w.vertices === 'string' ? w.vertices : '').split(';').map(s => s.trim()).filter(s => s);
  verts.forEach((v, idx) => {
    const [vx, vy] = v.split(',').map(n => parseInt(n.trim()) || 0);
    const handle = document.createElement('div');
    handle.className = 'vertex-handle';
    handle.dataset.vertexIdx = idx;
    const cursorStyle = locked ? 'not-allowed' : 'move';
    handle.style.cssText = `position:absolute;width:10px;height:10px;background:#22d3ee;border:1px solid #fff;border-radius:2px;cursor:${cursorStyle};pointer-events:auto;box-sizing:border-box;z-index:1000;`;
    handle.style.left = (absPos.x + vx) * z - 5 + 'px';
    handle.style.top = (absPos.y + vy) * z - 5 + 'px';
    handle.title = locked ? '控件已锁定' : `顶点 ${idx + 1} (${vx}, ${vy})`;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 中键交给 viewport 处理画布平移
      if (e.button === 1) return;
      // 锁定控件不允许拖拽顶点
      if (locked) return;
      isDraggingVertex = true;
      draggingVertexIdx = idx;
      AppState.beginBatch();
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
    });
    // 右键删除顶点（至少保留 3 个）
    handle.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 锁定控件不允许删除顶点
      if (locked) return;
      const verts2 = (typeof w.vertices === 'string' ? w.vertices : '').split(';').map(s => s.trim()).filter(s => s);
      if (verts2.length <= 3) return;
      verts2.splice(idx, 1);
      AppState.updateWidget(w.id, { vertices: verts2.join(';') });
    });
    container.appendChild(handle);
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
  } else if (isDraggingVertex && AppState.selectedWidgetId && draggingVertexIdx >= 0) {
    // polygon 顶点拖拽
    const w = AppState.getWidget(AppState.selectedWidgetId);
    if (!w || w.type !== 'polygon') return;
    const dx = Math.round((e.clientX - dragStart.x) / AppState.zoom);
    const dy = Math.round((e.clientY - dragStart.y) / AppState.zoom);
    const verts = (typeof w.vertices === 'string' ? w.vertices : '').split(';').map(s => s.trim()).filter(s => s);
    if (draggingVertexIdx >= verts.length) return;
    const [origX, origY] = verts[draggingVertexIdx].split(',').map(n => parseInt(n.trim()) || 0);
    const newX = origX + dx;
    const newY = origY + dy;
    verts[draggingVertexIdx] = `${newX},${newY}`;
    w.vertices = verts.join(';');
    renderCanvas();
    AppState.save();
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
  if (isDraggingVertex) {
    isDraggingVertex = false;
    draggingVertexIdx = -1;
    AppState.endBatch(); // 顶点拖拽结束
  }
});

canvas.addEventListener('click', (e) => {
  if (e.target === canvas) {
    AppState.selectWidget(null);
  }
});

// 双击 polygon 控件边线：在最近的边上插入新顶点
canvas.addEventListener('dblclick', (e) => {
  const w = AppState.selectedWidgetId ? AppState.getWidget(AppState.selectedWidgetId) : null;
  if (!w || w.type !== 'polygon') return;
  if (e.target === canvas || !canvas.contains(e.target)) return;
  if (e.target.classList.contains('vertex-handle') || e.target.classList.contains('resize-handle')) return;

  const rect = canvas.getBoundingClientRect();
  const clickX = Math.round((e.clientX - rect.left) / AppState.zoom);
  const clickY = Math.round((e.clientY - rect.top) / AppState.zoom);
  const absPos = getWidgetAbsPos(w, AppState.getCurrentPage());
  // 点击点相对于控件左上角的坐标
  const localX = clickX - absPos.x;
  const localY = clickY - absPos.y;

  const verts = (typeof w.vertices === 'string' ? w.vertices : '').split(';').map(s => s.trim()).filter(s => s);
  if (verts.length < 3) return;
  const pts = verts.map(v => {
    const [x, y] = v.split(',').map(n => parseInt(n.trim()) || 0);
    return { x, y };
  });

  // 找到距离点击位置最近的边（点到线段距离）
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dist = pointToSegmentDist(localX, localY, p1.x, p1.y, p2.x, p2.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  // 在 bestIdx 和 bestIdx+1 之间插入新顶点（取边的中点）
  const p1 = pts[bestIdx];
  const p2 = pts[(bestIdx + 1) % pts.length];
  const newX = Math.round((p1.x + p2.x) / 2);
  const newY = Math.round((p1.y + p2.y) / 2);
  verts.splice(bestIdx + 1, 0, `${newX},${newY}`);
  AppState.updateWidget(w.id, { vertices: verts.join(';') });
});

// 点到线段距离的平方
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - x1, ddy = py - y1;
    return ddx * ddx + ddy * ddy;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ddx = px - cx, ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}

// 点击画布外的区域取消选中的控件
// 白名单模式：只有点击 canvas-viewport 内且不在 canvas 上的区域（画布周围的灰色空白区）才取消选中，
// 避免误触属性面板（含 switch 开关等 div 控件）、图层列表、组件库等 UI 区域。
document.addEventListener('mousedown', (e) => {
  const viewport = document.getElementById('canvas-viewport');
  if (!viewport) return;
  // 点击的是 canvas 或其子孙（画布上的控件/手柄），不处理
  if (e.target === canvas || canvas.contains(e.target)) return;
  // 只有点击落在 canvas-viewport 内（画布周围空白区）才取消选中
  if (e.target === viewport || viewport.contains(e.target)) {
    if (AppState.selectedWidgetIds.size > 0) {
      AppState.selectWidget(null);
    }
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
  let propList = typeInfo ? (typeInfo.properties || []) : [];

  // chart 控件：按 chartType 过滤属性，只显示当前模式相关的属性
  if (w.type === 'chart') {
    const chartType = w.chartType || 'linechart';
    // 三种模式通用属性
    const commonProps = ['chartType', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked', 'openAnim'];
    // 折线图 + 柱状图共用属性
    const lineBarProps = ['bgColor', 'bgAlpha', 'borderColor', 'minValue', 'maxValue', 'autoScale', 'showYLabels', 'gridColor', 'gridDashed', 'textColor', 'seriesCount', 'seriesData', 'seriesColors', 'xLabels', 'openAnimDir'];
    // 折线图专用
    const lineOnlyProps = ['seriesLineAlpha', 'seriesLineWidth'];
    // 柱状图专用
    const barOnlyProps = ['barSpacing', 'orientation', 'openAnimDuration'];
    // 饼图专用
    const pieOnlyProps = ['startAngle', 'innerRadiusRate', 'radius', 'sliceAlpha', 'smooth', 'legendEnable', 'legendPos', 'legendDir', 'legendTextColor', 'legendAreaSize', 'legendAlpha', 'legendBoxSize', 'legendPadding', 'legendItemGap', 'legendBg', 'legendBgColor', 'legendBorderColor', 'sliceCount', 'sliceValues', 'sliceColors', 'sliceLabels'];

    let allowedProps;
    if (chartType === 'piechart') {
      allowedProps = new Set([...commonProps, ...pieOnlyProps]);
    } else if (chartType === 'barchart') {
      allowedProps = new Set([...commonProps, ...lineBarProps, ...barOnlyProps]);
    } else {
      allowedProps = new Set([...commonProps, ...lineBarProps, ...lineOnlyProps]);
    }
    propList = propList.filter(p => allowedProps.has(p));
  }

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

    // 饼图图例子属性：只在启用图例时显示
    if (prop.startsWith('legend') && prop !== 'legendEnable' && prop !== 'legendBg' && !w.legendEnable) {
      return;
    }
    // 图例背景颜色和边框颜色：只在启用图例背景时显示
    if ((prop === 'legendBgColor' || prop === 'legendBorderColor') && (!w.legendEnable || !w.legendBg)) {
      return;
    }

    // 开屏动画方向和时长：只在启用动画时显示
    if ((prop === 'openAnimDir' || prop === 'openAnimDuration') && !w.openAnim) {
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
      } else if (prop === 'pixmap' || prop === 'logo' || prop === 'icon') {
        // 图片选择：项目资源图片列表
        const projectImages = (AppState.project.resources && AppState.project.resources.images) || [];
        const currentVal = rawVal || '';
        html += `<div class="form-group"><label class="form-label">${label}</label>`;
        html += `<select class="form-select" data-prop="${prop}">`;
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
      } else if (prop === 'bindTarget') {
        // 绑定目标对象：列出当前页面所有控件（排除自身），值=控件变量名
        const page = AppState.getCurrentPage();
        const currentVal = rawVal || '';
        html += `<div class="form-group"><label class="form-label">${label}</label>`;
        html += `<select class="form-select" data-prop="bindTarget">`;
        html += `<option value="">无</option>`;
        if (page && Array.isArray(page.widgets)) {
          const widgets = page.widgets.filter(wt => wt.id !== w.id);
          if (widgets.length > 0) {
            html += `<optgroup label="当前页面控件">`;
            widgets.forEach(wt => {
              const varName = getWidgetVarName(wt);
              const typeName = SGL_WIDGET_TYPES.find(t => t.type === wt.type)?.name || wt.type;
              html += `<option value="${escapeAttr(varName)}" ${currentVal === varName ? 'selected' : ''}>${escapeHtml(typeName)} (${escapeHtml(varName)})</option>`;
            });
            html += `</optgroup>`;
          }
        }
        if (currentVal && !(page && page.widgets.some(wt => wt.id !== w.id && getWidgetVarName(wt) === currentVal))) {
          html += `<option value="${escapeAttr(currentVal)}" selected>${escapeHtml(currentVal)}</option>`;
        }
        html += `</select></div>`;
      } else if (meta.options && meta.options.length > 0) {
        // pixmapFormat：根据控件类型过滤不支持的格式
        // ext_img 使用 SGL decode_pixel，支持6种非RLE格式，不支持RLE压缩格式
        // img 使用 SGL rle_decompress_line，支持全部12种格式（含RLE）
        // 其他控件使用 sgl_pixmap_get_buf 强转读取，仅支持 RGB565（固定格式，不显示下拉框）
        let optionsList = meta.options;
        let effectiveVal = rawVal;
        if (prop === 'pixmapFormat') {
          if (w.type === 'ext_img') {
            optionsList = meta.options.filter(([v]) => !/^RLE_/.test(v));
            // 旧项目 ext_img 若设了 RLE 格式，回退到对应基础格式
            if (rawVal && /^RLE_/.test(rawVal)) {
              const baseFmt = rawVal.replace(/^RLE_/, '');
              effectiveVal = baseFmt;
              if (w.pixmapFormat !== baseFmt) {
                w.pixmapFormat = baseFmt;
              }
            }
          } else if (w.type === 'img') {
            // img 支持全部12种格式（含RLE），显示全部选项
          } else {
            // 其他控件仅支持 RGB565，固定格式不显示下拉框
            // 旧项目若设了非 RGB565 格式，回退到 RGB565
            if (rawVal && rawVal !== 'RGB565') {
              w.pixmapFormat = 'RGB565';
            }
            return;
          }
        }
        html += `<div class="form-group"><label class="form-label">${label}</label><select class="form-select" data-prop="${prop}">`;
        const defaultVal = (WIDGET_DEFAULTS[w.type] && WIDGET_DEFAULTS[w.type][prop]) || optionsList[0][0];
        const curStr = effectiveVal != null ? String(effectiveVal) : String(defaultVal);
        optionsList.forEach(([optVal, optLabel]) => {
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
    } else if (prop === 'vertices') {
      // 多边形顶点：每行 X+Y 输入框，可添加/删除，内部用 x,y; 格式拼接
      const verts = (typeof rawVal === 'string' ? rawVal : '').split(';').map(s => s.trim()).filter(s => s);
      html += `<div class="form-group" data-vertices-group>`;
      html += `<label class="form-label">${label} <span style="font-weight:normal;color:var(--text-muted);font-size:10px;">(也可在画布上拖拽顶点)</span></label>`;
      html += `<div class="vertices-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;">`;
      verts.forEach((v, idx) => {
        const [vx, vy] = v.split(',').map(n => parseInt(n.trim()) || 0);
        html += `<div class="vertex-item" style="display:flex;gap:4px;align-items:center;">`;
        html += `<span style="font-size:10px;color:var(--text-muted);width:18px;">${idx + 1}</span>`;
        html += `<input type="number" class="form-input vertex-input vertex-x" data-vertex-idx="${idx}" data-axis="x" value="${vx}" placeholder="X" style="flex:1;font-size:12px;min-width:0;" />`;
        html += `<input type="number" class="form-input vertex-input vertex-y" data-vertex-idx="${idx}" data-axis="y" value="${vy}" placeholder="Y" style="flex:1;font-size:12px;min-width:0;" />`;
        html += `<button type="button" class="vertex-delete-btn" data-vertex-idx="${idx}" title="删除" style="background:none;color:#ef4444;border:none;cursor:pointer;font-size:14px;padding:2px 6px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button type="button" class="vertex-add-btn" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;width:100%;">+ 添加顶点</button>`;
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
        const numVal = (prop === 'pivotX' || prop === 'pivotY') ? (rawVal != null ? rawVal : '') : (rawVal != null ? rawVal : 0);
        html += `<div class="form-group"><label class="form-label">${label}</label><input type="number" class="form-input" data-prop="${prop}" value="${numVal}"${minStr}${maxStr} /></div>`;
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
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const supportedEvts = WIDGET_EVENTS[wgt.type] || [];
      const newEvents = [...(wgt.events || []), { type: supportedEvts[0] || 'onPressed', callback: '' }];
      AppState.updateWidget(w.id, { events: newEvents });
    });
  }

  widgetPropContent.querySelectorAll('.remove-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const idx = parseInt(btn.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents.splice(idx, 1);
      AppState.updateWidget(w.id, { events: newEvents });
    });
  });

  widgetPropContent.querySelectorAll('.event-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const wgt = AppState.getWidget(w.id);
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
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const idx = parseInt(input.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents[idx] = { ...newEvents[idx], callback: input.value };
      // 直接更新数据，不重建面板
      wgt.events = newEvents;
      AppState.save();
    });
    input.addEventListener('blur', () => {
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const idx = parseInt(input.dataset.eventIdx);
      const newEvents = [...(wgt.events || [])];
      newEvents[idx] = { ...newEvents[idx], callback: input.value };
      AppState.updateWidget(w.id, { events: newEvents });
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
        const wgt = AppState.getWidget(w.id);
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
        const wgt = AppState.getWidget(w.id);
        AppState.updateWidget(w.id, { [prop]: !wgt[prop] });
      });
      return;
    }

    // parentId/fontFamily 不需要 input 事件（由 change 事件处理），其他属性绑定 input 事件
    if (prop !== 'parentId' && prop !== 'fontFamily') {
      input.addEventListener('input', () => {
        let val;
        if (input.type === 'number') {
          if (prop === 'pivotX' || prop === 'pivotY') {
            val = input.value.trim() === '' ? '' : (parseFloat(input.value) || 0);
          } else {
            val = parseFloat(input.value) || 0;
          }
        }
        else if (input.type === 'select-one') {
          val = parseSelectValue(prop, input.value);
        }
        else val = input.value;

        // 直接更新控件数据，不触发属性面板重建（避免输入框丢失焦点）
        // 注意：不能用 const w（会触发 TDZ，因为 w.id 中的 w 会查找到未初始化的内层 w）
        // 使用 wgt 避免遮蔽外层 w，后续代码中的 w 引用外层 w（与 wgt 是同一对象）
        const wgt = AppState.getWidget(w.id);
        if (wgt) {
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
          // chart 属性变化需要重新渲染属性面板以显示/隐藏对应模式的属性
          if (prop === 'chartType' || prop === 'legendEnable' || prop === 'legendBg' || prop === 'openAnim') {
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
        if (input.type === 'number') {
          if (prop === 'pivotX' || prop === 'pivotY') {
            val = input.value.trim() === '' ? '' : (parseFloat(input.value) || 0);
          } else {
            val = parseFloat(input.value) || 0;
          }
        }
        else if (input.type === 'select-one') {
          val = parseSelectValue(prop, input.value);
        }
        else val = input.value;
        
        // 当修改 alpha 属性时，同时更新 borderAlpha 和 mainAlpha
        if (prop === 'alpha') {
          const wgt = AppState.getWidget(w.id);
          if (wgt && wgt.type === 'rect') {
            AppState.updateWidget(w.id, { alpha: val, borderAlpha: val, mainAlpha: val });
            return;
          }
        }
        
        // Ring 控件：修改外半径后，检查并确保内半径小于外半径
        if (prop === 'radiusOut') {
          const wgt = AppState.getWidget(w.id);
          if (wgt && wgt.type === 'ring') {
            const newRadiusOut = Math.max(1, Math.round(val));
            let updates = { radiusOut: newRadiusOut };
            // 确保内半径小于外半径
            if (wgt.radiusIn != null && wgt.radiusIn >= newRadiusOut) {
              updates.radiusIn = newRadiusOut - 1;
            }
            updates.width = newRadiusOut * 2;
            updates.height = newRadiusOut * 2;
            AppState.updateWidget(w.id, updates);
            return;
          }
        }
        
        AppState.updateWidget(w.id, { [prop]: val });
      });
    }

    // select 用 change
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', async () => {
        let val = input.value;
        // 布尔值转换
        if (val === 'true') val = true;
        else if (val === 'false') val = false;

        // parentId 变更：设置父对象时把子控件置于父对象中心, 移除父对象时保留当前绝对位置
        if (prop === 'parentId') {
          const wgt = AppState.getWidget(w.id);
          const page = AppState.getCurrentPage();
          if (wgt && page) {
            if (val && val !== '') {
              // 设置父对象：把子控件置于父对象中心位置 (相对坐标)
              const parent = page.widgets.find(p => p.id === val);
              if (parent) {
                // 居中: 相对 x = (父宽 - 子宽) / 2, 相对 y = (父高 - 子高) / 2
                const relX = Math.trunc((parent.width - wgt.width) / 2);
                const relY = Math.trunc((parent.height - wgt.height) / 2);
                // 子控件继承父控件的 zOrder, 确保作为同一层级组
                const newZOrder = (parent.zOrder != null ? parent.zOrder : 0);
                AppState.updateWidget(w.id, { parentId: val, x: relX, y: relY, zOrder: newZOrder });
              }
            } else {
              // 移除父对象：将相对位置转换为绝对位置，保留视觉位置不变
              if (wgt.parentId) {
                const oldParent = page.widgets.find(p => p.id === wgt.parentId);
                if (oldParent) {
                  const parentAbs = getWidgetAbsPos(oldParent, page);
                  // 新绝对位置 = 当前相对位置 + 父对象绝对位置
                  const absX = wgt.x + parentAbs.x;
                  const absY = wgt.y + parentAbs.y;
                  AppState.updateWidget(w.id, { parentId: '', x: absX, y: absY });
                } else {
                  AppState.updateWidget(w.id, { parentId: '' });
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
          const wgt = AppState.getWidget(w.id);
          if (wgt) {
            if (wgt.dashLen == null) wgt.dashLen = 10;
            if (wgt.gapLen == null) wgt.gapLen = 5;
          }
        }
        
        AppState.updateWidget(w.id, { [prop]: val });

        // 字体/字号/bpp 变更时立即重新渲染（实时响应）
        if (prop === 'fontFamily' || prop === 'fontSize' || prop === 'fontBpp') {
          if (prop === 'fontFamily' && val) {
            registerFontFile(val).then(() => renderCanvas());
          }
          renderCanvas();
        }

        // dashed 属性变化时重新渲染属性面板（显示/隐藏虚线参数）
        if (prop === 'dashed') {
          const wgt = AppState.getWidget(w.id);
          if (wgt) {
            renderWidgetProps(wgt);
          }
        }
      });
    }
  });

  // 选项文本（options）添加/删除/编辑
  const optionsGroup = widgetPropContent.querySelector('[data-options-group]');
  if (optionsGroup) {
    optionsGroup.querySelector('.option-add-btn').addEventListener('click', () => {
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n').filter(o => o.length > 0);
      opts.push(`选项${opts.length + 1}`);
      AppState.updateWidget(w.id, { options: opts.join('\n') });
    });

    optionsGroup.querySelectorAll('.option-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wgt = AppState.getWidget(w.id);
        if (!wgt) return;
        const idx = parseInt(btn.dataset.optionIdx);
        const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n').filter(o => o.length > 0);
        opts.splice(idx, 1);
        AppState.updateWidget(w.id, { options: opts.join('\n') });
      });
    });

    optionsGroup.querySelectorAll('.option-input').forEach(input => {
      input.addEventListener('input', () => {
        const wgt = AppState.getWidget(w.id);
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
        const wgt = AppState.getWidget(w.id);
        if (!wgt) return;
        const idx = parseInt(input.dataset.optionIdx);
        const opts = (typeof wgt.options === 'string' ? wgt.options : '').split('\n');
        opts[idx] = input.value;
        AppState.updateWidget(w.id, { options: opts.join('\n') });
      });
    });
  }

  // 多边形顶点（vertices）添加/删除/编辑
  const verticesGroup = widgetPropContent.querySelector('[data-vertices-group]');
  if (verticesGroup) {
    // 添加顶点：在最后一个顶点附近添加
    verticesGroup.querySelector('.vertex-add-btn').addEventListener('click', () => {
      const wgt = AppState.getWidget(w.id);
      if (!wgt) return;
      const verts = (typeof wgt.vertices === 'string' ? wgt.vertices : '').split(';').map(s => s.trim()).filter(s => s);
      // 解析现有顶点，在最后一个顶点右侧添加新顶点
      let newX = 50, newY = 50;
      if (verts.length > 0) {
        const last = verts[verts.length - 1].split(',').map(n => parseInt(n.trim()) || 0);
        const first = verts[0].split(',').map(n => parseInt(n.trim()) || 0);
        // 新顶点放在最后顶点和首顶点之间
        newX = Math.round((last[0] + first[0]) / 2);
        newY = Math.round((last[1] + first[1]) / 2);
      }
      verts.push(`${newX},${newY}`);
      AppState.updateWidget(w.id, { vertices: verts.join(';') });
    });

    // 删除顶点
    verticesGroup.querySelectorAll('.vertex-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wgt = AppState.getWidget(w.id);
        if (!wgt) return;
        const idx = parseInt(btn.dataset.vertexIdx);
        const verts = (typeof wgt.vertices === 'string' ? wgt.vertices : '').split(';').map(s => s.trim()).filter(s => s);
        if (verts.length <= 3) return; // 至少保留 3 个顶点
        verts.splice(idx, 1);
        AppState.updateWidget(w.id, { vertices: verts.join(';') });
      });
    });

    // 编辑顶点坐标
    verticesGroup.querySelectorAll('.vertex-input').forEach(input => {
      input.addEventListener('input', () => {
        const wgt = AppState.getWidget(w.id);
        if (!wgt) return;
        const idx = parseInt(input.dataset.vertexIdx);
        const axis = input.dataset.axis;
        const verts = (typeof wgt.vertices === 'string' ? wgt.vertices : '').split(';').map(s => s.trim()).filter(s => s);
        if (idx >= verts.length) return;
        const [vx, vy] = verts[idx].split(',').map(n => parseInt(n.trim()) || 0);
        const newX = axis === 'x' ? (parseInt(input.value) || 0) : vx;
        const newY = axis === 'y' ? (parseInt(input.value) || 0) : vy;
        verts[idx] = `${newX},${newY}`;
        wgt.vertices = verts.join(';');
        renderCanvas();
        AppState.save();
      });
      input.addEventListener('blur', () => {
        const wgt = AppState.getWidget(w.id);
        if (!wgt) return;
        const idx = parseInt(input.dataset.vertexIdx);
        const axis = input.dataset.axis;
        const verts = (typeof wgt.vertices === 'string' ? wgt.vertices : '').split(';').map(s => s.trim()).filter(s => s);
        if (idx >= verts.length) return;
        const [vx, vy] = verts[idx].split(',').map(n => parseInt(n.trim()) || 0);
        const newX = axis === 'x' ? (parseInt(input.value) || 0) : vx;
        const newY = axis === 'y' ? (parseInt(input.value) || 0) : vy;
        verts[idx] = `${newX},${newY}`;
        AppState.updateWidget(w.id, { vertices: verts.join(';') });
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

        // 右键菜单: 与画布上的右键菜单一致
        widgetRow.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // 切换到控件所在页面
          if (AppState.currentPageId !== page.id) {
            AppState.setCurrentPage(page.id);
          }
          showContextMenu(e.clientX, e.clientY, w.id);
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
    // 页面背景固定使用 RGB565 格式
    page.pixmapFormat = 'RGB565';
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

// 鼠标滚轮缩放画布（以鼠标位置为中心放大）
document.getElementById('canvas-viewport').addEventListener('wheel', (e) => {
  e.preventDefault();
  const viewport = document.getElementById('canvas-viewport');
  const rect = viewport.getBoundingClientRect();
  // 鼠标相对 viewport 的坐标
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  // 缩放前鼠标对应的画布逻辑坐标
  const oldZoom = AppState.zoom;
  const cx = (mx - panOffset.x) / oldZoom;
  const cy = (my - panOffset.y) / oldZoom;
  // 计算新缩放
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = Math.max(0.25, Math.min(4, Math.round((oldZoom + delta) * 20) / 20));
  if (newZoom === oldZoom) return;
  AppState.zoom = newZoom;
  // 调整 panOffset 使鼠标位置对应的画布坐标保持不变：
  // mx = panOffset.x + cx * newZoom  =>  panOffset.x = mx - cx * newZoom
  panOffset.x = mx - cx * newZoom;
  panOffset.y = my - cy * newZoom;
  document.getElementById('zoom-label').textContent = Math.round(AppState.zoom * 100) + '%';
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
document.getElementById('prop-page-alpha').addEventListener('change', e => {
  const page = AppState.getCurrentPage();
  if (page) { page.alpha = parseInt(e.target.value) || 0; AppState.save(); renderCanvas(); }
});

// 检查并提示字体缺失
// block=true（运行）：error 级别 + 弹窗 + 阻断操作
// block=false（导出代码）：warn 级别警告，不阻断操作
async function checkAndWarnFonts(actionName, block = true) {
  const issues = validateProjectFonts(AppState.project);
  if (issues.length === 0) return true;

  const summary = `检测到 ${issues.length} 个文本控件缺少字体资源`;
  const detail = issues.map(item =>
    `• ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`
  ).join('\n');

  if (block) {
    // 运行时报错并阻断
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
  } else {
    // 导出代码时仅警告，不阻断
    showToast(summary, 'warn');
    logMessage(`[${actionName}] ${summary}，生成的代码可能无法正常编译`, 'warn');
    issues.forEach(item => {
      logMessage(`  - ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`, 'warn');
    });
    return true;
  }
}

// 检查并提示 sprite 控件未设置图片
// block=true（运行）：error 级别 + 弹窗 + 阻断操作
// block=false（导出代码）：warn 级别警告，不阻断操作
async function checkAndWarnSpritePixmaps(actionName, block = true) {
  const issues = validateSpritePixmaps(AppState.project);
  if (issues.length === 0) return true;

  const summary = `检测到 ${issues.length} 个精灵动画控件未设置图片`;
  const detail = issues.map(item =>
    `• ${item.page} / ${item.widget}: ${item.reason}`
  ).join('\n');

  if (block) {
    const msg = `${summary}，请先在属性面板为 sprite 控件选择图片后再操作。\n\n${detail}`;
    showToast(summary, 'error');
    logMessage(`[${actionName}] ${summary}，操作已终止`, 'error');
    issues.forEach(item => {
      logMessage(`  - ${item.page} / ${item.widget}: ${item.reason}`, 'error');
    });
    try {
      await message(msg, { title: '图片资源缺失', kind: 'error' });
    } catch (e) {
      console.warn('显示图片缺失提示失败:', e);
    }
    return false;
  } else {
    showToast(summary, 'warn');
    logMessage(`[${actionName}] ${summary}，生成的代码可能无法正常编译`, 'warn');
    issues.forEach(item => {
      logMessage(`  - ${item.page} / ${item.widget}: ${item.reason}`, 'warn');
    });
    return true;
  }
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
    // 预加载新项目的 SGL 字模数据
    preloadProjectFonts(AppState.project.resources?.fonts).then(() => {
      preloadSglFontData();
      renderCanvas();
    });
  } else if (result.msg !== '取消打开') {
    showToast('打开失败: ' + result.msg, 'error');
    logMessage('打开失败: ' + result.msg, 'error');
  }
});

// 保存项目（按钮点击和 Ctrl+S 共用）
async function saveProjectAction() {
  // 保存时不检查字体，直接保存
  const result = await AppState.saveProject();
  if (result.ok) {
    showToast('项目已保存到: ' + result.path.split(/[/\\]/).pop(), 'success');
    logMessage('项目已保存: ' + result.path, 'success');
  } else if (result.msg !== '取消保存') {
    showToast('保存失败: ' + result.msg, 'error');
    logMessage('保存失败: ' + result.msg, 'error');
  }
}

document.getElementById('btn-save').addEventListener('click', saveProjectAction);

// Ctrl+S 快捷键保存项目
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProjectAction();
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
  // 字体检查：导出代码时仅警告，不阻断
  await checkAndWarnFonts('导出代码', false);
  // sprite 图片检查：导出代码时仅警告，不阻断
  await checkAndWarnSpritePixmaps('导出代码', false);
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
  const spriteOk = await checkAndWarnSpritePixmaps('编译运行');
  if (!spriteOk) return;
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
      const now = Date.now();
      let status;
      if (sglVersionLastCheckResult && (now - sglVersionLastCheckTime) < SGL_VERSION_CHECK_INTERVAL) {
        // 会话内缓存有效，跳过网络检查避免卡顿
        logMessage('SGL 库版本检查已跳过（近期已检查）', 'info');
        status = sglVersionLastCheckResult;
      } else {
        logMessage('正在检查 SGL 库版本...', 'info');
        status = await invoke('check_sgl_submodule_status', { projectPath });
        sglVersionLastCheckTime = now;
        sglVersionLastCheckResult = status;
      }
      if (status.exists && !status.up_to_date) {
        logMessage('SGL 库有新版本可用', 'warn');
        const yes = await ask('检测到 SGL 库有新版本可用，是否更新到最新版本？', { title: 'SGL 库更新', kind: 'info', okLabel: '是', cancelLabel: '否' });
        updateSgl = yes;
        // 用户选择更新后，重置缓存以便下次重新检查
        if (updateSgl) {
          sglVersionLastCheckTime = 0;
          sglVersionLastCheckResult = null;
        }
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
    const buildResult = await invoke('build_project', { project: AppState.getProjectForRust(), projectPath, code, updateSgl });
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

// 显示右键菜单 (复用: 画布和控件结构树都调用此函数)
// widgetId: 可选, 右键命中的控件 id. 传入时若未选中则单选它
function showContextMenu(clientX, clientY, widgetId) {
  const page = AppState.getCurrentPage();
  if (!page) return;

  // 如果传入了控件 id 且未选中, 则单选它
  if (widgetId) {
    if (!AppState.selectedWidgetIds.has(widgetId)) {
      AppState.selectWidget(widgetId);
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
  let left = clientX;
  let top = clientY;
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4;
  if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 4;
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
}

// 画布右键菜单: 命中检测后调用 showContextMenu
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / AppState.zoom;
  const y = (e.clientY - rect.top) / AppState.zoom;

  const page = AppState.getCurrentPage();
  if (!page) return;

  const clickedWidget = [...page.widgets].reverse().find(w =>
    x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height
  );

  showContextMenu(e.clientX, e.clientY, clickedWidget ? clickedWidget.id : null);
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
      // 层级调整: 区分顶级控件和子控件
      // - 顶级控件(无 parentId): 调整 zOrder, 整个父子组在顶级控件间移动
      // - 子控件(有 parentId): 调整在兄弟间的渲染顺序(通过交换 widgets 数组位置)
      const widgetMap = new Map();
      page.widgets.forEach(w => widgetMap.set(w.id, w));

      // 区分: 选中的是否为子控件(有 parentId)
      const isChildWidget = selectedWidgets.length > 0 && selectedWidgets.every(w => w.parentId && widgetMap.has(w.parentId));

      if (isChildWidget) {
        // === 子控件: 在同一父对象下的兄弟间调整顺序 ===
        // 渲染顺序由 widgets 数组中的相对位置决定 (sortWidgetsByHierarchy 同 depth 靠数组顺序)
        // 只处理同一父对象下的情况 (多选且不同父对象时不操作)
        const parentIds = new Set(selectedWidgets.map(w => w.parentId));
        if (parentIds.size !== 1) break;
        const parentId = selectedWidgets[0].parentId;

        // 收集该父对象下的所有子控件(保持 widgets 数组顺序)
        const siblings = [];
        page.widgets.forEach((w, idx) => {
          if (w.parentId === parentId) siblings.push({ widget: w, index: idx });
        });

        // 选中控件在 siblings 中的位置集合
        const selectedSiblingIdx = new Set(
          siblings.filter(s => AppState.selectedWidgetIds.has(s.widget.id)).map(s => siblings.indexOf(s))
        );

        if (action === 'z-order-top') {
          // 置顶: 把选中控件移到兄弟最前面
          // 在 widgets 数组中, 把选中的子控件移到第一个兄弟之前
          const selectedSet = new Set(AppState.selectedWidgetIds);
          const selectedSiblings = siblings.filter(s => selectedSet.has(s.widget.id));
          const otherSiblings = siblings.filter(s => !selectedSet.has(s.widget.id));
          // 重新排列: 选中的在前, 其他在后
          const newOrder = [...selectedSiblings, ...otherSiblings];
          // 从 widgets 数组中移除该父对象的所有子控件, 按新顺序重新插入到第一个子控件的原位置
          const firstIdx = Math.min(...siblings.map(s => s.index));
          const newWidgets = page.widgets.filter(w => w.parentId !== parentId);
          // 找到 firstIdx 在新数组中的对应位置
          let insertPos = 0;
          for (let i = 0; i < firstIdx; i++) {
            if (page.widgets[i].parentId !== parentId) insertPos++;
          }
          newOrder.forEach(s => newWidgets.splice(insertPos++, 0, s.widget));
          page.widgets = newWidgets;
        } else if (action === 'z-order-bottom') {
          // 置底: 把选中控件移到兄弟最后
          const selectedSet = new Set(AppState.selectedWidgetIds);
          const selectedSiblings = siblings.filter(s => selectedSet.has(s.widget.id));
          const otherSiblings = siblings.filter(s => !selectedSet.has(s.widget.id));
          const newOrder = [...otherSiblings, ...selectedSiblings];
          const firstIdx = Math.min(...siblings.map(s => s.index));
          const newWidgets = page.widgets.filter(w => w.parentId !== parentId);
          let insertPos = 0;
          for (let i = 0; i < firstIdx; i++) {
            if (page.widgets[i].parentId !== parentId) insertPos++;
          }
          newOrder.forEach(s => newWidgets.splice(insertPos++, 0, s.widget));
          page.widgets = newWidgets;
        } else if (action === 'z-order-up') {
          // 上移一层: 每个选中控件与它前一个兄弟交换位置
          const selectedSet = new Set(AppState.selectedWidgetIds);
          // 从后往前处理, 避免连续交换冲突
          for (let i = siblings.length - 1; i > 0; i--) {
            if (selectedSet.has(siblings[i].widget.id) && !selectedSet.has(siblings[i-1].widget.id)) {
              // 交换 widgets 数组中的位置
              const idxA = siblings[i].index;
              const idxB = siblings[i-1].index;
              // 在 page.widgets 中找到这两个控件的位置(过滤后的)
              const posA = page.widgets.indexOf(siblings[i].widget);
              const posB = page.widgets.indexOf(siblings[i-1].widget);
              if (posA >= 0 && posB >= 0) {
                [page.widgets[posA], page.widgets[posB]] = [page.widgets[posB], page.widgets[posA]];
              }
            }
          }
        } else if (action === 'z-order-down') {
          // 下移一层: 每个选中控件与它后一个兄弟交换位置
          const selectedSet = new Set(AppState.selectedWidgetIds);
          // 从前往后处理
          for (let i = 0; i < siblings.length - 1; i++) {
            if (selectedSet.has(siblings[i].widget.id) && !selectedSet.has(siblings[i+1].widget.id)) {
              const posA = page.widgets.indexOf(siblings[i].widget);
              const posB = page.widgets.indexOf(siblings[i+1].widget);
              if (posA >= 0 && posB >= 0) {
                [page.widgets[posA], page.widgets[posB]] = [page.widgets[posB], page.widgets[posA]];
              }
            }
          }
        }
        AppState.notify();
        break;
      }

      // === 顶级控件: 调整 zOrder ===
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
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (root) root.zOrder = maxZ + 1;
        });
      } else if (action === 'z-order-bottom') {
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (root) root.zOrder = minZ - 1;
        });
      } else if (action === 'z-order-up') {
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (!root) return;
          const currentZ = root.zOrder != null ? root.zOrder : 0;
          let nextZ = null;
          groupZOrders.forEach((z, gid) => {
            if (z > currentZ && (nextZ === null || z < nextZ)) {
              nextZ = z;
            }
          });
          if (nextZ !== null) {
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
        rootSet.forEach(id => {
          const root = widgetMap.get(id);
          if (!root) return;
          const currentZ = root.zOrder != null ? root.zOrder : 0;
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
  // 各面板独立捕获异常，一个面板失败不应导致其他面板也不刷新
  const safeRender = (fn, name) => {
    try { fn(); }
    catch (err) { console.error(`[renderAll] ${name} 失败:`, err); }
  };
  safeRender(renderPageTabs, 'renderPageTabs');
  safeRender(renderPageTabsMini, 'renderPageTabsMini');
  safeRender(renderCanvas, 'renderCanvas');
  safeRender(renderLayerList, 'renderLayerList');
  safeRender(renderResourceList, 'renderResourceList');
  safeRender(renderWidgetProps, 'renderWidgetProps');
  safeRender(renderProjectPanel, 'renderProjectPanel');
  safeRender(renderProperties, 'renderProperties');
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
