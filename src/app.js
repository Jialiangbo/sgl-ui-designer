// ============ SGL UI Designer - 全局状态管理 ============
import { SGL_WIDGET_TYPES, WIDGET_DEFAULTS, createWidgetDefaults, generateSGLCode, validateProjectFonts } from './sgl_api.js';
import { invoke } from '@tauri-apps/api/core';
import { open, save, message } from '@tauri-apps/plugin-dialog';

export const AppState = {
  project: {
    name: '未命名项目',
    version: '0.1.0',
    color_depth: '16bit',
    screen_width: 480,
    screen_height: 320,
    screen_shape: 'rect', // 'rect' | 'circle'
    pages: [],
    resources: { fonts: [], images: [] },
    ascii_fonts: [],
    sgl_config: {
      fbdev_pixel_depth: 16,
      fbdev_rotation: 0,
      fbdev_even_coords: 0,
      use_fbdev_vram: 0,
      systick_ms: 10,
      event_queue_size: 16,
      dirty_area_num_max: 16,
      color16_swap: 0,
      focused_color: '#00FF00',
      focused_width: 1,
      dirty_area_trace: 0,
      dirty_area_trace_color: '#000000',
      monitor_trace: 0,
      pixmap_bilinear_interp: 0,
      animation: 1,
      debug: 1,
      log_color: 1,
      log_level: 0,
      obj_use_name: 0,
      font_compressed: 0,
      font_small_table: 0,
      boot_logo: 1,
      theme_dark: 0,
      heap_algo: 'lwmem',
      heap_memory_size: 102400,
      font_song23: 0,
      font_consolas14: 0,
      font_consolas23: 0,
      font_consolas24: 0,
      font_consolas32: 0,
      font_consolas24_compress: 0
    }
  },
  projectPath: null, // 项目文件保存路径（未保存时为 null）
  currentPageId: null,
  selectedWidgetIds: new Set(),
  zoom: 1,
  listeners: [],
  logger: null, // 外部注册的日志函数 (msg, type) => void

  // ============ 撤销/恢复 ============
  _undoStack: [],
  _redoStack: [],
  _undoMaxSize: 50,
  _undoPaused: false, // 暂停记录（恢复时用）
  _batchMode: false,  // 批量模式：拖动/调整过程中跳过中间记录

  _pushUndo() {
    if (this._undoPaused || this._batchMode) return;
    this._undoStack.push(JSON.stringify(this.project));
    if (this._undoStack.length > this._undoMaxSize) this._undoStack.shift();
    this._redoStack = []; // 新操作清空 redo
  },

  // 开始批量操作（拖动/调整大小前调用，保存一次快照）
  beginBatch() {
    if (this._undoPaused || this._batchMode) return;
    this._undoStack.push(JSON.stringify(this.project));
    if (this._undoStack.length > this._undoMaxSize) this._undoStack.shift();
    this._redoStack = [];
    this._batchMode = true;
  },

  // 结束批量操作
  endBatch() {
    this._batchMode = false;
  },

  undo() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(JSON.stringify(this.project));
    const snapshot = JSON.parse(this._undoStack.pop());
    this._undoPaused = true;
    this.project = snapshot;
    this.selectedWidgetIds.clear();
    this._undoPaused = false;
    this.listeners.forEach(fn => fn());
    this.save();
    return true;
  },

  redo() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(JSON.stringify(this.project));
    const snapshot = JSON.parse(this._redoStack.pop());
    this._undoPaused = true;
    this.project = snapshot;
    this.selectedWidgetIds.clear();
    this._undoPaused = false;
    this.listeners.forEach(fn => fn());
    this.save();
    return true;
  },

  canUndo() { return this._undoStack.length > 0; },
  canRedo() { return this._redoStack.length > 0; },

  init() {
    this.load();
    if (this.project.pages.length === 0) {
      this.addPage('主页面');
    }
    if (!this.currentPageId || !this.project.pages.some(p => p.id === this.currentPageId)) {
      this.currentPageId = this.project.pages.length > 0 ? this.project.pages[0].id : null;
    }
  },

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this._pushUndo();
    this.listeners.forEach(fn => fn());
    this.save();
  },

  // ============ 页面操作 ============
  addPage(name) {
    // 找到最大页面序号，避免删除后 ID 冲突
    let maxNum = 0;
    this.project.pages.forEach(p => {
      if (p.id.startsWith('page')) {
        const numStr = p.id.slice(4);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const id = 'page' + (maxNum + 1);
    const page = {
      id,
      name: name || '新页面',
      width: this.project.screen_width,
      height: this.project.screen_height,
      bg_color: '#FFFFFF',
      pixmap: '',
      pixmapFormat: 'RGB565',
      alpha: 255,
      widgets: []
    };
    this.project.pages.push(page);
    this.currentPageId = id;
    this.notify();
    return page;
  },

  removePage(id) {
    const idx = this.project.pages.findIndex(p => p.id === id);
    if (idx === -1 || this.project.pages.length <= 1) return;
    this.project.pages.splice(idx, 1);
    if (this.currentPageId === id) {
      this.currentPageId = this.project.pages[Math.max(0, idx - 1)].id;
    }
    if (this.selectedWidgetIds.size) this.selectedWidgetIds.clear();
    this.notify();
  },

  getCurrentPage() {
    return this.project.pages.find(p => p.id === this.currentPageId);
  },

  setCurrentPage(id) {
    this.currentPageId = id;
    this.selectedWidgetIds.clear();
    this.notify();
  },

  renamePage(id, name) {
    const page = this.project.pages.find(p => p.id === id);
    if (page) { page.name = name; this.notify(); }
  },

  // ============ line 控件尺寸同步 ============
  // 中心线语义：x1/y1, x2/y2 是中心线端点坐标（SGL 标准）
  // 水平线（|dy| < lineWidth）：y2 = y1, height = lineWidth, 线在控件内垂直居中
  // 垂直线（|dx| < lineWidth）：x2 = x1, width = lineWidth, 线在控件内水平居中
  // 斜线：width/height 为包围盒（含线宽扩展）
  syncLineBounds(w) {
    if (w.type !== 'line') return;
    const lineWidth = Math.max(1, w.lineWidth != null ? w.lineWidth : 1);
    const x1 = w.x1 != null ? w.x1 : w.x;
    const y1 = w.y1 != null ? w.y1 : w.y;
    const x2 = w.x2 != null ? w.x2 : w.x + w.width;
    const y2 = w.y2 != null ? w.y2 : w.y + w.height;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const isHorizontal = Math.abs(dy) < lineWidth;
    const isVertical = Math.abs(dx) < lineWidth;
    if (isHorizontal && !isVertical) {
      // 水平线：y2 = y1（中心线），height = lineWidth，线在控件内居中
      w.y2 = y1;
      w.x2 = x2;
      w.width = Math.max(1, Math.abs(dx) + 1);
      w.height = lineWidth;
      w.x = Math.min(x1, x2);
      w.y = y1 - Math.floor((lineWidth - 1) / 2);
    } else if (isVertical && !isHorizontal) {
      // 垂直线：x2 = x1（中心线），width = lineWidth
      w.x2 = x1;
      w.y2 = y2;
      w.width = lineWidth;
      w.height = Math.max(1, Math.abs(dy) + 1);
      w.x = x1 - Math.floor((lineWidth - 1) / 2);
      w.y = Math.min(y1, y2);
    } else if (isHorizontal && isVertical) {
      // 点：width = height = lineWidth
      w.x2 = x1;
      w.y2 = y1;
      w.width = lineWidth;
      w.height = lineWidth;
      w.x = x1 - Math.floor((lineWidth - 1) / 2);
      w.y = y1 - Math.floor((lineWidth - 1) / 2);
    } else {
      // 斜线：中心线端点不变，包围盒含线宽扩展
      w.x2 = x2;
      w.y2 = y2;
      w.width = Math.max(1, Math.abs(dx) + lineWidth);
      w.height = Math.max(1, Math.abs(dy) + lineWidth);
      w.x = Math.min(x1, x2) - Math.floor((lineWidth - 1) / 2);
      w.y = Math.min(y1, y2) - Math.floor((lineWidth - 1) / 2);
    }
  },

  // ============ 组件操作 ============
  addWidget(type, x, y, w, h) {
    const page = this.getCurrentPage();
    if (!page) return;
    // 按控件类型+序号命名，如 button1、label2
    // 找到所有页面中同类型控件的最大序号，避免删除后 ID 冲突
    let maxNum = 0;
    this.project.pages.forEach(p => {
      p.widgets.forEach(ww => {
        if (ww.type === type && ww.id.startsWith(type)) {
          const numStr = ww.id.slice(type.length);
          const num = parseInt(numStr, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    });
    const id = type + (maxNum + 1);
    const defaults = createWidgetDefaults(type);
    // 找到当前页面中最大的 zOrder
    let maxZ = 0;
    page.widgets.forEach(ww => {
      if (ww.zOrder != null && ww.zOrder > maxZ) maxZ = ww.zOrder;
    });
    const widget = {
      id,
      name: id,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      zOrder: maxZ + 1,
      ...defaults
    };
    // ring 控件：根据宽高计算内外径
    if (type === 'ring') {
      const diameter = Math.min(widget.width, widget.height);
      widget.radiusOut = Math.round(diameter / 2);
      widget.radiusIn = widget.radiusOut - 2;
      // 同步宽高为直径
      widget.width = widget.radiusOut * 2;
      widget.height = widget.radiusOut * 2;
    }
    // circle 控件：根据宽高计算 radius
    if (type === 'circle') {
      const diameter = Math.min(widget.width, widget.height);
      widget.radius = Math.round(diameter / 2);
      widget.width = widget.radius * 2;
      widget.height = widget.radius * 2;
    }
    // line 控件：中心线在控件内居中，调用 syncLineBounds 计算包围盒
    if (type === 'line') {
      const lineWidth = widget.lineWidth != null ? widget.lineWidth : 1;
      widget.x1 = widget.x;
      widget.y1 = widget.y + Math.floor((lineWidth - 1) / 2);
      widget.x2 = widget.x + widget.width - 1;
      widget.y2 = widget.y1;
      this.syncLineBounds(widget);
    }
    // arc 控件：根据宽高计算内外径
    if (type === 'arc') {
      const diameter = Math.min(widget.width, widget.height);
      widget.radiusOut = Math.round(diameter / 2);
      widget.radiusIn = widget.radiusOut - 2;
      // 同步宽高为直径
      widget.width = widget.radiusOut * 2;
      widget.height = widget.radiusOut * 2;
    }
    // 2dball 控件：SGL circle_zoom 会将控件尺寸改为 2*radius，设计器同步
    if (type === '2dball') {
      widget.width = widget.radius * 2;
      widget.height = widget.radius * 2;
    }
    // textline 控件：SGL 会根据文本自动计算高度 y2 = y1 + (string_height + 2*radius) - 1
    // 新建时按默认文本和字号计算实际高度，与 SGL 仿真保持一致
    if (type === 'textline') {
      const tlFontSize = widget.fontSize != null ? widget.fontSize : 14;
      const tlLineMargin = widget.lineMargin != null ? widget.lineMargin : 1;
      const tlRadius = widget.radius || 0;
      const tlText = widget.text || '';
      // 简化行数计算：按 SGL sgl_font_get_string_height 算法近似（单行宽度估算）
      const tlAvailWidth = widget.width - 2 * tlRadius;
      let tlLines = 1;
      if (tlText) {
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d');
        ctx.font = `${tlFontSize}px system-ui, sans-serif`;
        let offset_x = 0;
        for (let i = 0; i < tlText.length; i++) {
          const ch = tlText[i];
          if (ch === '\n') { tlLines++; offset_x = 0; continue; }
          const chWidth = ctx.measureText(ch).width;
          if (offset_x + chWidth >= tlAvailWidth) { offset_x = 0; tlLines++; }
          offset_x += chWidth;
        }
      }
      widget.height = tlLines * (tlFontSize + tlLineMargin) + 2 * tlRadius;
    }
    // numberkbd/keyboard 控件需要 ASCII 字模才能显示按键文字
    // 添加时自动确保 ASCII 字模配置存在，避免用户手动配置
    if (type === 'numberkbd' || type === 'keyboard') {
      this._ensureAsciiFontForKbd(widget);
    }
    page.widgets.push(widget);
    this.selectedWidgetIds.clear();
    this.selectedWidgetIds.add(id);
    this.notify();
    return widget;
  },

  // numberkbd/keyboard 控件需要 ASCII 字模显示按键文字
  // 控件设置了自定义字体时 collect_fonts 会自动收集字符生成字模，无需额外处理
  // 控件未设置字体（使用系统默认字体）时，需要确保 SGL 配置中启用了内置 ASCII 字模
  _ensureAsciiFontForKbd(widget) {
    const family = widget.fontFamily;
    // 控件设置了自定义字体，collect_fonts 会自动生成字模，无需处理
    if (family && family !== 'default' && family !== '') return;

    // 控件未设置字体，需要确保内置 ASCII 字模启用
    const cfg = this.project.sgl_config;
    if (!cfg) return;

    // 检查是否已启用任一内置 ASCII 字模
    const builtinEnabled = cfg.font_consolas14 || cfg.font_consolas23 || cfg.font_consolas24 || cfg.font_consolas32 || cfg.font_consolas24_compress || cfg.font_song23;
    if (builtinEnabled) return;

    // 自动启用 consolas14（与 numberkbd 默认 fontSize=14 匹配）
    cfg.font_consolas14 = 1;
    if (this.logger) {
      this.logger('已自动启用 SGL 内置 Consolas14 字模（数字键盘/键盘控件需要 ASCII 字模）', 'info');
    }
  },

  removeWidget(id) {
    const page = this.getCurrentPage();
    if (!page) return;
    const idx = page.widgets.findIndex(w => w.id === id);
    if (idx !== -1) {
      page.widgets.splice(idx, 1);
      this.selectedWidgetIds.delete(id);
      this.notify();
    }
  },

  getWidget(id) {
    const page = this.getCurrentPage();
    return page ? page.widgets.find(w => w.id === id) : null;
  },

  updateWidget(id, updates) {
    const w = this.getWidget(id);
    if (w) { Object.assign(w, updates); this.notify(); }
  },

  moveWidget(id, x, y) {
    const w = this.getWidget(id);
    if (w) {
      const dx = Math.round(x) - w.x;
      const dy = Math.round(y) - w.y;
      w.x = Math.round(x);
      w.y = Math.round(y);
      // line 控件：同步更新起点和终点坐标
      if (w.type === 'line') {
        if (w.x1 != null) w.x1 += dx;
        if (w.y1 != null) w.y1 += dy;
        if (w.x2 != null) w.x2 += dx;
        if (w.y2 != null) w.y2 += dy;
      }
      this.notify();
    }
  },

  resizeWidget(id, x, y, w0, h0) {
    const w = this.getWidget(id);
    if (w) {
      w.x = Math.round(x); w.y = Math.round(y);
      let nw = Math.max(20, Math.round(w0));
      let nh = Math.max(20, Math.round(h0));
      if (w.type === 'circle') {
        // circle 控件：圆的大小由 radius 决定
        // 如果 radius > 0，更新 radius 为直径的一半
        // 如果 radius = 0，使用 min(width, height) 作为直径
        if (w.radius != null && w.radius > 0) {
          const newDiameter = Math.max(nw, nh);
          w.radius = Math.round(newDiameter / 2);
          w.width = newDiameter;
          w.height = newDiameter;
        } else {
          nw = nh = Math.max(nw, nh);
          w.width = nw;
          w.height = nh;
        }
      } else if (w.type === 'ring') {
        const newDiameter = Math.max(nw, nh);
        if (w.radiusOut == null || w.radiusOut <= 0) {
          w.radiusOut = Math.round(newDiameter / 2);
          w.radiusIn = w.radiusOut - 2;
        } else {
          // 保持环厚度（radiusOut - radiusIn）不变
          const thickness = (w.radiusIn != null && w.radiusIn > 0) ? (w.radiusOut - w.radiusIn) : 2;
          w.radiusOut = Math.round(newDiameter / 2);
          w.radiusIn = Math.max(0, w.radiusOut - thickness);
        }
        w.width = newDiameter;
        w.height = newDiameter;
      } else if (w.type === 'arc') {
        const newDiameter = Math.max(nw, nh);
        if (w.radiusOut == null || w.radiusOut <= 0) {
          w.radiusOut = Math.round(newDiameter / 2);
          w.radiusIn = w.radiusOut - 2;
        } else {
          // 保持环厚度（radiusOut - radiusIn）不变
          const thickness = (w.radiusIn != null && w.radiusIn > 0) ? (w.radiusOut - w.radiusIn) : 2;
          w.radiusOut = Math.round(newDiameter / 2);
          w.radiusIn = Math.max(0, w.radiusOut - thickness);
        }
        w.width = newDiameter;
        w.height = newDiameter;
      } else if (w.type === 'checkbox') {
        w.width = nw;
        w.height = nh;
      } else if (w.type === 'qrcode') {
        const scaleX = nw / w.width;
        const scaleY = nh / w.height;
        const scale = Math.min(scaleX, scaleY);
        if (scale > 0) {
          w.scale = Math.max(1, Math.round(w.scale * scale));
        }
        w.width = nw;
        w.height = nh;
      } else if (w.type === '2dball') {
        // 2dball 控件：SGL circle_zoom 将控件尺寸改为 2*radius，设计器同步
        const newDiameter = Math.max(nw, nh);
        w.radius = Math.round(newDiameter / 2);
        w.width = newDiameter;
        w.height = newDiameter;
      } else if (w.type === 'line') {
        const lineWidth = Math.max(1, w.lineWidth != null ? w.lineWidth : 1);
        // 根据当前线方向设置中心线端点
        const curDx = (w.x2 != null ? w.x2 : w.x + w.width - 1) - w.x1;
        const curDy = (w.y2 != null ? w.y2 : w.y + w.height - 1) - w.y1;
        const wasHorizontal = Math.abs(curDy) < lineWidth;
        const wasVertical = Math.abs(curDx) < lineWidth;
        if (wasHorizontal && !wasVertical) {
          // 水平线：只改变 x 方向长度，y1/y2 保持中心线
          w.x1 = w.x;
          w.y1 = w.y + Math.floor((lineWidth - 1) / 2);
          w.x2 = w.x1 + Math.max(1, Math.round(w0) - 1);
          w.y2 = w.y1;
        } else if (wasVertical && !wasHorizontal) {
          // 垂直线：只改变 y 方向长度，x1/x2 保持中心线
          w.x1 = w.x + Math.floor((lineWidth - 1) / 2);
          w.y1 = w.y;
          w.x2 = w.x1;
          w.y2 = w.y1 + Math.max(1, Math.round(h0) - 1);
        } else {
          // 斜线：x2/y2 都根据新的宽高设置
          w.x1 = w.x + Math.floor((lineWidth - 1) / 2);
          w.y1 = w.y + Math.floor((lineWidth - 1) / 2);
          w.x2 = w.x1 + Math.max(1, Math.round(w0) - lineWidth);
          w.y2 = w.y1 + Math.max(1, Math.round(h0) - lineWidth);
        }
        this.syncLineBounds(w);
      } else if (w.type === 'polygon') {
        // polygon 控件：整体等比缩放（保持形状不变）
        // 取 min(scaleX, scaleY) 保证多边形不超出新尺寸，整体形状不变
        const scaleX = w.width > 0 ? nw / w.width : 1;
        const scaleY = w.height > 0 ? nh / w.height : 1;
        const scale = Math.max(0, Math.min(scaleX, scaleY));
        if (w.vertices && scale !== 1) {
          w.vertices = w.vertices.split(';').map(p => {
            const [vx, vy] = p.split(',').map(v => parseInt(v.trim()) || 0);
            return `${Math.round(vx * scale)},${Math.round(vy * scale)}`;
          }).join(';');
        }
        w.width = nw;
        w.height = nh;
      } else {
        w.width = nw;
        w.height = nh;
      }
      this.notify();
    }
  },

  selectWidget(id, multi = false) {
    if (id === null) {
      this.selectedWidgetIds.clear();
    } else if (multi) {
      if (this.selectedWidgetIds.has(id)) {
        this.selectedWidgetIds.delete(id);
      } else {
        this.selectedWidgetIds.add(id);
      }
    } else {
      this.selectedWidgetIds.clear();
      this.selectedWidgetIds.add(id);
    }
    this.notify();
  },

  // 辅助属性：获取第一个选中的控件ID
  get selectedWidgetId() {
    return this.selectedWidgetIds.size > 0 ? [...this.selectedWidgetIds][0] : null;
  },

  // 批量删除选中控件（包括其子控件）
  removeSelectedWidgets() {
    const page = this.getCurrentPage();
    if (!page) return;
    
    // 收集所有要删除的控件（包括子控件）
    const toRemove = new Set(this.selectedWidgetIds);
    
    // 递归查找子控件
    let changed = true;
    while (changed) {
      changed = false;
      page.widgets.forEach(w => {
        if (!toRemove.has(w.id) && toRemove.has(w.parentId)) {
          toRemove.add(w.id);
          changed = true;
        }
      });
    }
    
    page.widgets = page.widgets.filter(w => !toRemove.has(w.id));
    this.selectedWidgetIds.clear();
    this.notify();
  },

  // ============ 项目设置 ============
  updateProject(updates) {
    Object.assign(this.project, updates);
    this.project.pages.forEach(p => {
      p.width = this.project.screen_width;
      p.height = this.project.screen_height;
    });
    this.notify();
  },

  // ============ 代码生成 ============
  generateCode() {
    return generateSGLCode(this.project);
  },

  // ============ 导出代码 ============
  async exportCode() {
    if (!this.projectPath) {
      return { ok: false, msg: '请先保存项目，再导出代码' };
    }
    try {
      // 代码保存在项目文件同目录下
      const projectDir = this.projectPath.replace(/[/\\][^/\\]*$/, '');
      const codePath = projectDir + '/ui_' + this.project.name + '.c';
      const code = generateSGLCode(this.project);
      await invoke('export_code', { path: codePath, code, project: this.project });
      return { ok: true, path: codePath };
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  },

  // ============ 导出代码到项目目录（设计器和代码预览共用） ============
  async exportCodeToProject(actionName = '导出代码') {
    // 检查字体缺失，有缺失则阻止导出
    const issues = validateProjectFonts(this.project);
    if (issues.length > 0) {
      const summary = `检测到 ${issues.length} 个文本控件缺少字体资源`;
      const detail = issues.map(item =>
        `• ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`
      ).join('\n');
      showToast(summary, 'error');
      logMessage(`[${actionName}] ${summary}，操作已终止`, 'error');
      issues.forEach(item => {
        logMessage(`  - ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})`, 'error');
      });
      try {
        await message(`${summary}，请在右侧资源面板添加字体文件后再操作。\n\n${detail}`, { title: '字体资源缺失', kind: 'error' });
      } catch (e) {
        console.warn('显示字体缺失提示失败:', e);
      }
      return { ok: false, msg: '字体资源缺失，已终止导出' };
    }

    if (!this.projectPath) {
      showToast('请先保存项目', 'error');
      return { ok: false, msg: '项目未保存' };
    }

    // 自动保存
    const saveResult = await this.saveProject();
    if (!saveResult.ok) {
      showToast('保存项目失败: ' + saveResult.msg, 'error');
      return { ok: false, msg: saveResult.msg };
    }

    try {
      const code = generateSGLCode(this.project);
      const result = await invoke('export_code_to_project', { project: this.getProjectForRust(), projectPath: this.projectPath, code });
      showToast('代码已导出', 'success');
      return { ok: true, msg: result };
    } catch (e) {
      showToast('导出失败: ' + e, 'error');
      return { ok: false, msg: String(e) };
    }
  },

  // ============ 保存项目到文件 ============
  async saveProject() {
    try {
      let filePath = this.projectPath;
      if (!filePath) {
        filePath = await save({
          title: '保存项目',
          defaultPath: this.project.name + '.sgl',
          filters: [{ name: 'SGL 项目文件', extensions: ['sgl'] }]
        });
        if (!filePath) return { ok: false, msg: '取消保存' };
        if (!filePath.endsWith('.sgl')) filePath += '.sgl';
      }
      await invoke('save_project', { path: filePath, project: this.getProjectForRust() });
      // 保存后重新加载，确保资源路径与文件一致（Rust端会将路径转为相对路径保存）
      const saved = await invoke('load_project', { path: filePath });
      if (saved) {
        this.project = saved;
        this.migrateProject();
      }
      this.projectPath = filePath;
      this.save();
      return { ok: true, path: filePath };
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  },

  // ============ 从文件打开项目 ============
  async openProject() {
    try {
      const filePath = await open({
        title: '打开项目',
        filters: [{ name: 'SGL 项目文件', extensions: ['sgl'] }],
        multiple: false
      });
      if (!filePath) return { ok: false, msg: '取消打开' };
      const project = await invoke('load_project', { path: filePath });
      if (project && project.pages) {
        this.project = project;
        this.migrateProject();
        this.projectPath = filePath;
        this.currentPageId = this.project.pages.length > 0 ? this.project.pages[0].id : null;
        this.selectedWidgetIds.clear();
        this.save();
        return { ok: true, path: filePath };
      } else {
        return { ok: false, msg: '无效的项目文件' };
      }
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  },

  // ============ 持久化 ============
  save() {
    try {
      localStorage.setItem('sgl_project', JSON.stringify(this.project));
      localStorage.setItem('sgl_current', this.currentPageId || '');
      localStorage.setItem('sgl_selected', JSON.stringify([...this.selectedWidgetIds]));
      localStorage.setItem('sgl_proj_path', this.projectPath || '');
    } catch (e) {}
  },

  // 返回适合传给 Rust 命令的项目副本：把 Rust 期望为数字的字段中的空字符串转为 null
  getProjectForRust() {
    const project = JSON.parse(JSON.stringify(this.project));
    if (Array.isArray(project.pages)) {
      project.pages.forEach(page => {
        if (!Array.isArray(page.widgets)) return;
        page.widgets.forEach(w => {
          if (w.type === 'ext_img') {
            if (w.pivotX === '') w.pivotX = null;
            if (w.pivotY === '') w.pivotY = null;
          }
        });
      });
    }
    return project;
  },

  load() {
    try {
      const proj = localStorage.getItem('sgl_project');
      if (proj) {
        const p = JSON.parse(proj);
        if (p && p.pages) {
          this.project = p;
          this.migrateProject();
          this.currentPageId = localStorage.getItem('sgl_current') || null;
          try {
            const sel = JSON.parse(localStorage.getItem('sgl_selected') || '[]');
            this.selectedWidgetIds = new Set(Array.isArray(sel) ? sel : []);
          } catch { this.selectedWidgetIds = new Set(); }
          const savedPath = localStorage.getItem('sgl_proj_path');
          this.projectPath = savedPath || null;
        }
      }
    } catch (e) {}
  },

  // 项目迁移：补充缺失的属性字段（向后兼容旧项目文件）
  migrateProject() {
    const p = this.project;
    if (!p) return;
    // 补充 resources 字段（旧项目可能缺少）
    if (!p.resources) p.resources = { fonts: [], images: [] };
    if (!Array.isArray(p.resources.fonts)) p.resources.fonts = [];
    if (!Array.isArray(p.resources.images)) p.resources.images = [];
    if (!Array.isArray(p.ascii_fonts)) {
      p.ascii_fonts = [];
    }
    // 迁移旧 ascii_fonts 字符串数组为对象数组，补充缺失的 compress 字段
    p.ascii_fonts = p.ascii_fonts
      .map(item => {
        if (typeof item === 'string') {
          return { name: item, size: 16, bpp: p.ascii_font_bpp || 4, compress: 0 };
        }
        if (item.compress === undefined) item.compress = 0;
        return item;
      })
      .filter(item => item && typeof item === 'object');
    if (!p.sgl_config) {
      p.sgl_config = {
        fbdev_pixel_depth: 16,
        fbdev_rotation: 0,
        fbdev_even_coords: 0,
        use_fbdev_vram: 0,
        systick_ms: 10,
        event_queue_size: 16,
        dirty_area_num_max: 16,
        color16_swap: 0,
        focused_color: '#00FF00',
        focused_width: 1,
        dirty_area_trace: 0,
        dirty_area_trace_color: '#000000',
        monitor_trace: 0,
        pixmap_bilinear_interp: 0,
        animation: 1,
        debug: 1,
        log_color: 1,
        log_level: 0,
        obj_use_name: 0,
        font_compressed: 0,
        font_small_table: 0,
        boot_logo: 1,
        theme_dark: 0,
        heap_algo: 'lwmem',
        heap_memory_size: 102400,
        font_song23: 1,
        font_consolas14: 1,
        font_consolas23: 1,
        font_consolas24: 1,
        font_consolas32: 1,
        font_consolas24_compress: 1
      };
    } else {
      // 补充新增字段默认值（兼容旧项目数据）
      const cfg = p.sgl_config;
      if (cfg.fbdev_even_coords == null) cfg.fbdev_even_coords = 0;
      if (cfg.focused_color == null) cfg.focused_color = '#00FF00';
      if (cfg.focused_width == null) cfg.focused_width = 1;
      if (cfg.dirty_area_trace == null) cfg.dirty_area_trace = 0;
      if (cfg.dirty_area_trace_color == null) cfg.dirty_area_trace_color = '#000000';
      if (cfg.monitor_trace == null) cfg.monitor_trace = 0;
      if (cfg.pixmap_bilinear_interp == null) cfg.pixmap_bilinear_interp = 0;
      if (cfg.font_small_table == null) cfg.font_small_table = 0;
    }
    // 为每个 widget 补充缺失的默认属性（不覆盖已有值）
    // 解决旧项目文件因结构体字段缺失导致属性丢失的问题
    if (Array.isArray(p.pages)) {
      p.pages.forEach(page => {
        if (!Array.isArray(page.widgets)) return;
        page.widgets.forEach(w => {
          const defaults = createWidgetDefaults(w.type);
          if (defaults) {
            Object.keys(defaults).forEach(key => {
              if (w[key] === undefined || w[key] === null) {
                w[key] = defaults[key];
              }
            });
          }
          // 2dball 控件：SGL circle_zoom 将控件尺寸改为 2*radius，同步 width/height
          if (w.type === '2dball' && w.radius != null && w.radius > 0) {
            w.width = w.radius * 2;
            w.height = w.radius * 2;
          }
          // sprite 控件：SGL 只支持 ARGB4444 格式，强制重置 pixmapFormat
          if (w.type === 'sprite') {
            w.pixmapFormat = 'ARGB4444';
          }
        });
      });
    }
  },
  

  reset() {
    localStorage.removeItem('sgl_project');
    localStorage.removeItem('sgl_current');
    localStorage.removeItem('sgl_selected');
    localStorage.removeItem('sgl_proj_path');
    this.project = {
      name: '未命名项目',
      version: '0.1.0',
      color_depth: '16bit',
      screen_width: 480,
      screen_height: 320,
      screen_shape: 'rect',
      pages: [],
      resources: { fonts: [], images: [] },
      ascii_fonts: [],
      sgl_config: {
        fbdev_pixel_depth: 16,
        fbdev_rotation: 0,
        fbdev_even_coords: 0,
        use_fbdev_vram: 0,
        systick_ms: 10,
        event_queue_size: 16,
        dirty_area_num_max: 16,
        color16_swap: 0,
        focused_color: '#00FF00',
        focused_width: 1,
        dirty_area_trace: 0,
        dirty_area_trace_color: '#000000',
        monitor_trace: 0,
        pixmap_bilinear_interp: 0,
        animation: 1,
        debug: 1,
        log_color: 1,
        log_level: 0,
        obj_use_name: 0,
        font_compressed: 0,
        font_small_table: 0,
        boot_logo: 1,
        theme_dark: 0,
        heap_algo: 'lwmem',
        heap_memory_size: 102400,
        font_song23: 1,
        font_consolas14: 1,
        font_consolas23: 1,
        font_consolas24: 1,
        font_consolas32: 1,
        font_consolas24_compress: 1
      }
    };
    this.projectPath = null;
    this.currentPageId = null;
    this.selectedWidgetIds = new Set();
    this._undoStack = [];
    this._redoStack = [];
    this.init();
  }
};

// ============ 工具函数 ============
export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function uid() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function navigate(page) {
  window.location.href = page + '.html';
}

export function showToast(message, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export function initNav(activePage) {
  const navTabs = document.querySelectorAll('[data-nav]');
  navTabs.forEach(tab => {
    if (tab.dataset.nav === activePage) tab.classList.add('active');
  });
}

// ============ 应用更新检查（绑定按钮 + 启动自动检查） ============
// 在每个页面入口调用一次。按钮位于 nav-tabs 中"SGL配置"之后。
export async function setupUpdateChecker() {
  const btn = document.getElementById('btn-check-update');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  const { checkForUpdates, autoCheckOnStartup } = await import('./updater.js');
  btn.addEventListener('click', () => {
    checkForUpdates(false).catch(() => {});
  });
  // 启动时静默检查一次
  autoCheckOnStartup();
}

// ============ 自定义窗口标题栏（最小化/最大化/关闭 + 拖拽区域） ============
// decorations:false 时由前端接管窗口控制
let _windowControlsInjected = false;
export async function setupWindowControls() {
  if (_windowControlsInjected) return;
  const header = document.querySelector('.app-header');
  if (!header) return;
  _windowControlsInjected = true;

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();

  // 拖拽移动窗口：在 header 空白区域按下鼠标时触发
  // 排除按钮、输入框等交互元素，避免影响正常点击
  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 仅左键
    const t = e.target;
    // 点击落在交互元素上时不触发拖拽
    if (t.closest('button, input, select, textarea, .nav-tab, .nav-tab-action, .header-actions, .window-controls, .toolbar-divider')) return;
    win.startDragging();
  });

  // 双击 header 空白区域切换最大化/还原
  header.addEventListener('dblclick', (e) => {
    const t = e.target;
    if (t.closest('button, input, select, textarea, .nav-tab, .nav-tab-action, .header-actions, .window-controls, .toolbar-divider')) return;
    win.toggleMaximize();
  });

  const controls = document.createElement('div');
  controls.className = 'window-controls';
  controls.innerHTML = `
    <button class="win-btn win-minimize" title="最小化">
      <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" fill="currentColor"/></svg>
    </button>
    <button class="win-btn win-maximize" title="最大化/还原">
      <svg class="icon-max" width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      <svg class="icon-restore" width="12" height="12" viewBox="0 0 12 12" style="display:none;"><rect x="2.5" y="4" width="5.5" height="5.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M4 4 V2.5 H9.5 V8 H8" fill="none" stroke="currentColor" stroke-width="1"/></svg>
    </button>
    <button class="win-btn win-close" title="关闭">
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
    </button>
  `;
  header.appendChild(controls);

  // 初始化最大化图标状态
  const updateMaxIcon = async () => {
    try {
      const maximized = await win.isMaximized();
      controls.querySelector('.icon-max').style.display = maximized ? 'none' : '';
      controls.querySelector('.icon-restore').style.display = maximized ? '' : 'none';
    } catch (_) { /* 非 Tauri 环境 */ }
  };
  await updateMaxIcon();

  controls.querySelector('.win-minimize').addEventListener('click', () => win.minimize());
  controls.querySelector('.win-maximize').addEventListener('click', async () => {
    await win.toggleMaximize();
    await updateMaxIcon();
  });
  controls.querySelector('.win-close').addEventListener('click', () => win.close());

  // 监听窗口大小变化，同步最大化图标
  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('tauri://resize', updateMaxIcon);
  } catch (_) { /* 非 Tauri 环境 */ }
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function escapeAttr(str) {
  return escapeHtml(str);
}

export function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
