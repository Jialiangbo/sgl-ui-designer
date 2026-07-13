// ============ 应用更新检查模块 ============
// 通过 GitHub Release API 检查最新版本，支持自动下载安装
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
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
 * 从 release assets 中找到最佳安装包下载链接
 * 仅支持 msi 和 exe 安装包的自动下载安装；zip 免安装版不自动安装
 */
function pickDownloadAsset(assets) {
  if (!assets || !Array.isArray(assets) || assets.length === 0) return null;
  // 优先查找 x64 msi
  let msi = assets.find(a => a.name.toLowerCase().endsWith('.msi') && a.name.toLowerCase().includes('x64'));
  if (!msi) msi = assets.find(a => a.name.toLowerCase().endsWith('.msi'));
  if (msi) return { url: msi.browser_download_url, name: msi.name, size: msi.size, ext: 'msi', autoInstall: true };
  // 其次 exe
  let exe = assets.find(a => a.name.toLowerCase().endsWith('.exe') && a.name.toLowerCase().includes('x64'));
  if (!exe) exe = assets.find(a => a.name.toLowerCase().endsWith('.exe') && !a.name.toLowerCase().includes('portable'));
  if (exe) return { url: exe.browser_download_url, name: exe.name, size: exe.size, ext: 'exe', autoInstall: true };
  // zip 免安装版仅用于手动下载，不自动安装
  return null;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (!bytes) return '未知';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return (bytes / 1024).toFixed(1) + ' KB';
  return mb.toFixed(1) + ' MB';
}

/**
 * 显示"发现新版本"提示对话框，支持自动下载安装
 */
function showUpdateAvailableDialog(tagName, releaseName, body, asset) {
  const releaseNotes = (body || '').split('\r?\n').slice(0, 8).join('\n');
  let msg = `发现新版本 ${tagName}！\n\n` +
            `版本名称：${releaseName || tagName}\n`;
  if (releaseNotes) {
    msg += `\n更新说明：\n${releaseNotes}\n\n`;
  }
  if (asset) {
    msg += `安装包：${asset.name}（${formatSize(asset.size)}）\n\n` +
           `点击"确定"自动下载并安装，\n` +
           `点击"取消"暂不更新。`;
  } else {
    msg += `\n点击"确定"前往下载页面，\n` +
           `点击"取消"暂不更新。`;
  }

  if (window.confirm(msg)) {
    if (asset) {
      // 自动下载安装
      autoDownloadAndInstall(asset);
    } else {
      // 没有 asset，打开浏览器
      open(RELEASE_PAGE).catch(() => {
        showToast('打开下载页面失败，请手动访问：' + RELEASE_PAGE, 'error');
      });
    }
  }
}

/**
 * 自动下载并安装更新
 */
async function autoDownloadAndInstall(asset) {
  notify(`正在下载 ${asset.name}（${formatSize(asset.size)}）...`, 'info');
  try {
    const result = await invoke('download_and_install_update', { url: asset.url });
    notify('下载完成，正在启动安装程序...', 'success');
    // 安装程序启动后应用会退出，这里不会真正执行
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    notify('自动安装失败：' + errMsg + '，请手动下载安装', 'error');
    // 失败后回退到打开浏览器
    open(RELEASE_PAGE).catch(() => {});
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
      const asset = pickDownloadAsset(release.assets);
      showUpdateAvailableDialog(latestTag, release.name, release.body, asset);
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
