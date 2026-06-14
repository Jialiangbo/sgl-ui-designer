import { AppState, showToast, initNav, navigate, downloadFile } from './app.js';
import { generateSGLCode } from './sgl_api.js';
import { invoke } from '@tauri-apps/api/core';

initNav('components');
AppState.init();

const code = generateSGLCode(AppState.project);
document.getElementById('code-output').textContent = code;
document.getElementById('code-meta').textContent = `项目: ${AppState.project.name} · 屏幕 ${AppState.project.screen_width}×${AppState.project.screen_height} · SGL v2.0`;
document.getElementById('status-project').textContent = '项目: ' + AppState.project.name;
document.getElementById('status-pages').textContent = '页面: ' + AppState.project.pages.length;
const totalWidgets = AppState.project.pages.reduce((acc, p) => acc + p.widgets.length, 0);
document.getElementById('status-total').textContent = '组件总数: ' + totalWidgets;

document.getElementById('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(code);
    showToast('代码已复制到剪贴板', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = code; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('代码已复制到剪贴板', 'success');
  }
});

document.getElementById('btn-download').addEventListener('click', async () => {
  if (!AppState.projectPath) {
    showToast('请先在编辑器中保存项目', 'error');
    return;
  }
  try {
    const result = await AppState.exportCode();
    if (result.ok) {
      showToast('代码已导出到: code_output/', 'success');
    } else {
      showToast('导出失败: ' + result.msg, 'error');
    }
  } catch (e) {
    showToast('导出失败: ' + e, 'error');
  }
});

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});
