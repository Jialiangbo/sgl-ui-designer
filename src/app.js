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
      use_fbdev_vram: 0,
      systick_ms: 10,
      event_queue_size: 16,
      dirty_area_num_max: 16,
      color16_swap: 0,
      animation: 1,
      debug: 1,
      log_color: 1,
      log_level: 0,
      obj_use_name: 0,
      font_compressed: 0,
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
  },
  projectPath: null, // 项目文件保存路径（未保存时为 null）
  currentPageId: null,
  selectedWidgetIds: new Set(),
  zoom: 1,
  listeners: [],

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
    page.widgets.push(widget);
    this.selectedWidgetIds.clear();
    this.selectedWidgetIds.add(id);
    this.notify();
    return widget;
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
        // ring 控件：圆环大小由 radiusOut 决定
        // 如果用户还没设置过 radiusOut，则按宽高计算内外径
        // 如果已经设置过，则保持内外径不变
        const newDiameter = Math.max(nw, nh);
        if (w.radiusOut == null) {
          w.radiusOut = Math.round(newDiameter / 2);
          w.radiusIn = w.radiusOut - 2;
        }
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
        // polygon 控件：缩放时同步按比例缩放顶点坐标
        const scaleX = nw / w.width;
        const scaleY = nh / w.height;
        if (w.vertices) {
          w.vertices = w.vertices.split(';').map(p => {
            const [vx, vy] = p.split(',').map(v => parseInt(v.trim()) || 0);
            return `${Math.round(vx * scaleX)},${Math.round(vy * scaleY)}`;
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
      const result = await invoke('export_code_to_project', { project: this.project, projectPath: this.projectPath, code });
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
      await invoke('save_project', { path: filePath, project: this.project });
      // 保存后重新加载，确保资源路径与文件一致（Rust端会将路径转为相对路径保存）
      const saved = await invoke('load_project', { path: filePath });
      if (saved) {
        this.project = saved;
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

  load() {
    try {
      const proj = localStorage.getItem('sgl_project');
      if (proj) {
        const p = JSON.parse(proj);
        if (p && p.pages) {
          this.project = p;
          if (!Array.isArray(this.project.ascii_fonts)) {
            this.project.ascii_fonts = [];
          }
          // 迁移旧 ascii_fonts 字符串数组为对象数组，补充缺失的 compress 字段
          this.project.ascii_fonts = this.project.ascii_fonts
            .map(item => {
              if (typeof item === 'string') {
                return { name: item, size: 16, bpp: this.project.ascii_font_bpp || 4, compress: 0 };
              }
              if (item.compress === undefined) item.compress = 0;
              return item;
            })
            .filter(item => item && typeof item === 'object');
          if (!this.project.sgl_config) {
            this.project.sgl_config = {
              fbdev_pixel_depth: 16,
              fbdev_rotation: 0,
              use_fbdev_vram: 0,
              systick_ms: 10,
              event_queue_size: 16,
              dirty_area_num_max: 16,
              color16_swap: 0,
              animation: 1,
              debug: 1,
              log_color: 1,
              log_level: 0,
              obj_use_name: 0,
              font_compressed: 0,
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
          }
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
        use_fbdev_vram: 0,
        systick_ms: 10,
        event_queue_size: 16,
        dirty_area_num_max: 16,
        color16_swap: 0,
        animation: 1,
        debug: 1,
        log_color: 1,
        log_level: 0,
        obj_use_name: 0,
        font_compressed: 0,
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
