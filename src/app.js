// ============ SGL UI Designer - 全局状态管理 ============
import { SGL_WIDGET_TYPES, createWidgetDefaults, generateSGLCode } from './sgl_api.js';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export const AppState = {
  project: {
    name: '未命名项目',
    version: '0.1.0',
    color_depth: '16bit',
    screen_width: 480,
    screen_height: 320,
    pages: [],
    resources: { fonts: [], images: [] }
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
    // 兼容旧项目：确保 resources 字段存在
    if (!this.project.resources) {
      this.project.resources = { fonts: [], images: [] };
    }
    if (this.project.pages.length === 0) {
      this.addPage('主页面');
    }
    if (!this.currentPageId && this.project.pages.length > 0) {
      this.currentPageId = this.project.pages[0].id;
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
      bg_color: '#1e1e2e',
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
    const widget = {
      id,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      ...defaults
    };
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
    if (w) { w.x = Math.round(x); w.y = Math.round(y); this.notify(); }
  },

  resizeWidget(id, x, y, w0, h0) {
    const w = this.getWidget(id);
    if (w) {
      w.x = Math.round(x); w.y = Math.round(y);
      w.width = Math.max(20, Math.round(w0)); w.height = Math.max(20, Math.round(h0));
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

  // 兼容属性：获取第一个选中的控件ID
  get selectedWidgetId() {
    return this.selectedWidgetIds.size > 0 ? [...this.selectedWidgetIds][0] : null;
  },

  // 批量删除选中控件
  removeSelectedWidgets() {
    const page = this.getCurrentPage();
    if (!page) return;
    page.widgets = page.widgets.filter(w => !this.selectedWidgetIds.has(w.id));
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
      await invoke('export_code', { path: codePath, project: this.project });
      return { ok: true, path: codePath };
    } catch (e) {
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
      pages: [],
      resources: { fonts: [], images: [] }
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
