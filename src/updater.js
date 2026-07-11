// ============ 应用更新检查模块 ============
// 通过 GitHub Release API 检查最新版本，提示用户前往下载
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { showToast } from './app.js';

const REPO_OWNER = 'jialiangbo';
const REPO_NAME = 'sgl-ui-designer';
const RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// 静默检查的最小间隔（毫秒），避免短时间内重复请求
const SILENT_MIN_INTERVAL = 30 * 60 * 1000; // 30 分钟
const SILENT_CACHE_KEY = 'sgl_upd_last_check_ts';

let _checking = false; // 防止并发检查
let _logger = null; // 外部注入的日志回调（如编辑器控制台 logMessage）

/**
 * 注入日志回调，检查结果将输出到该回调（如编辑器控制台）
 * 不注入时回退到 showToast
 * @param {(msg: string, type?: string) => void} fn
 */
export function setLogger(fn) {
  _logger = typeof fn === 'function' ? fn : null;
}

/**
 * 统一消息通知：优先用注入的 logger，否则回退到 toast
 */
function notify(msg, type = 'info') {
  if (_logger) {
    _logger(msg, type);
  } else {
    showToast(msg, type === 'info' ? '' : type);
  }
}

/**
 * 比较两个语义化版本号
 * @returns {number} v1 > v2 返回 1，v1 < v2 返回 -1，相等返回 0
 */
function compareVersions(v1, v2) {
  const a = String(v1).replace(/^v/i, '').split('.');
  const b = String(v2).replace(/^v/i, '').split('.');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(a[i] || '0', 10);
    const nb = parseInt(b[i] || '0', 10);
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * 从 GitHub API 获取最新 release 信息
 */
async function fetchLatestRelease() {
  const resp = await fetch(RELEASE_API, {
    headers: { 'Accept': 'application/vnd.github+json' }
  });
  if (!resp.ok) {
    throw new Error(`GitHub API 返回 ${resp.status}`);
  }
  return await resp.json();
}

/**
 * 显示"发现新版本"提示对话框
 */
function showUpdateAvailableDialog(tagName, releaseName, body) {
  const releaseNotes = (body || '').split('\r?\n').slice(0, 8).join('\n');
  const msg = `发现新版本 ${tagName}！\n\n` +
              `版本名称：${releaseName || tagName}\n` +
              (releaseNotes ? `\n更新说明：\n${releaseNotes}\n\n` : '') +
              `点击"确定"前往下载页面，"取消"暂不更新。`;
  // eslint-disable-next-line no-alert
  if (window.confirm(msg)) {
    open(RELEASE_PAGE).catch(() => {
      showToast('打开下载页面失败，请手动访问：' + RELEASE_PAGE, 'error');
    });
  }
}

/**
 * 检查更新
 * @param {boolean} silent - true: 静默检查（启动时），仅在有新版本时提示；false: 手动触发，无新版本也给反馈
 * @returns {Promise<{hasUpdate: boolean, latest: string|null, current: string}>}
 */
export async function checkForUpdates(silent = false) {
  if (_checking) {
    return { hasUpdate: false, latest: null, current: null, skipped: true };
  }
  _checking = true;

  // 静默模式做最小间隔限制，避免每次刷新页面都请求 GitHub API
  if (silent) {
    const last = parseInt(localStorage.getItem(SILENT_CACHE_KEY) || '0', 10);
    if (Date.now() - last < SILENT_MIN_INTERVAL) {
      _checking = false;
      return { hasUpdate: false, latest: null, current: null, skipped: true };
    }
  }

  try {
    let currentVersion = '0.0.0';
    try {
      currentVersion = await getVersion();
    } catch (_) { /* 非 Tauri 环境（开发预览）兜底 */ }

    // 静默模式：仅当注入了 logger 才输出；非静默模式：始终输出（logger 优先，否则 toast）
    const log = (msg, type) => {
      if (silent) { if (_logger) _logger(msg, type); }
      else notify(msg, type);
    };

    log(`正在检查更新（当前版本 v${currentVersion}）...`, 'info');
    const release = await fetchLatestRelease();
    const latestTag = release.tag_name || '0.0.0';
    const hasUpdate = compareVersions(latestTag, currentVersion) > 0;

    if (silent) localStorage.setItem(SILENT_CACHE_KEY, String(Date.now()));

    if (hasUpdate) {
      log(`发现新版本 ${latestTag}（当前 v${currentVersion}）`, 'success');
      showUpdateAvailableDialog(latestTag, release.name, release.body);
    } else {
      log(`已是最新版本（v${currentVersion}）`, 'success');
    }
    return { hasUpdate, latest: latestTag, current: currentVersion };
  } catch (err) {
    if (silent) { if (_logger) _logger('检查更新失败：' + (err && err.message ? err.message : err), 'error'); }
    else notify('检查更新失败：' + (err && err.message ? err.message : err), 'error');
    console.error('[updater] 检查更新失败:', err);
    return { hasUpdate: false, latest: null, current: null, error: String(err) };
  } finally {
    _checking = false;
  }
}

/**
 * 启动时自动检查更新（静默模式）
 * 延迟 1.5 秒，避免阻塞应用启动
 */
export function autoCheckOnStartup() {
  setTimeout(() => {
    checkForUpdates(true).catch(() => {});
  }, 1500);
}
