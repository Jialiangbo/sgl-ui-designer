import { AppState, showToast, initNav, navigate, setupUpdateChecker, setupWindowControls } from './app.js';
import { generateSGLCode, setCodegenLogCallback } from './sgl_api.js';

initNav('components');
setupWindowControls();
setupUpdateChecker();
setCodegenLogCallback((message, level) => {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(message);
});

let code = '';

function refreshCode() {
  AppState.init();
  code = generateSGLCode(AppState.project);
  document.getElementById('code-output').textContent = code;
  document.getElementById('code-meta').textContent = `项目: ${AppState.project.name} · 屏幕 ${AppState.project.screen_width}×${AppState.project.screen_height} · SGL v2.0`;
  document.getElementById('status-project').textContent = '项目: ' + AppState.project.name;
  document.getElementById('status-pages').textContent = '页面: ' + AppState.project.pages.length;
  const totalWidgets = AppState.project.pages.reduce((acc, p) => acc + (p.widgets ? p.widgets.length : 0), 0);
  document.getElementById('status-total').textContent = '组件总数: ' + totalWidgets;
}

refreshCode();
window.addEventListener('pageshow', refreshCode);
window.addEventListener('focus', refreshCode);

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
  await AppState.exportCodeToProject('导出代码');
});

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});
