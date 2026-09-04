import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { generateFontC } from './font_generator.js';

// ============ SGL 字体文件名 → 浏览器可用字体栈 映射 ============
export const SGL_FONT_MAP = {
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

// 字体加载完成后通知外部重绘的回调（带防抖，避免多个字体连续加载导致多次重绘）
let fontLoadCallback = null;
let fontLoadCallbackTimer = null;
export function setFontLoadCallback(cb) {
  fontLoadCallback = () => {
    if (fontLoadCallbackTimer) clearTimeout(fontLoadCallbackTimer);
    fontLoadCallbackTimer = setTimeout(() => {
      fontLoadCallbackTimer = null;
      cb();
    }, 50);
  };
}

const registeredFontFaces = new Map();
const FONT_FACE_LOAD_PROMISES = new Map();

// 根据字体完整路径生成稳定且唯一的 CSS 字体族名。
// 不能只取文件名做净化：CJK / 同名文件会让多个字体族名撞车，
// 导致 document.fonts 中多个 FontFace 共用一个 family，浏览器按字形混用 → 乱码。
// 这里保留可读前缀 + 路径哈希后缀，保证每个字体路径对应唯一族名。
function fontFamilyNameForPath(fontPath) {
  if (!fontPath) return 'sgl_font_default';
  const s = String(fontPath);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const suffix = (h >>> 0).toString(36);
  const fileName = s.replace(/[/\\]/g, '/').split('/').pop();
  const safe = (fileName.replace(/[^\w]/g, '_').slice(0, 24)) || 'f';
  return `sgl_font_${safe}_${suffix}`;
}

// 将本地资源路径转换为 Tauri 可访问的 asset URL（图片/字体通用）
export function toAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('asset://') || path.startsWith('file://')) return path;
  return convertFileSrc(path);
}

export function pixmapFormatHasAlpha(fmt) {
  return /^(RLE_)?ARGB/i.test(fmt || 'RGB565');
}

// ============ 图片 ImageData 缓存（用于 drawPixmap 像素级渲染）============
const pixmapImageCache = new Map();

/**
 * 异步加载图片为 ImageData（带缓存）
 * 通过后端命令获取 RGBA 像素数据，直接构建 ImageData，避免 canvas 污染问题
 * @param {string} path - 图片路径
 * @returns {Promise<ImageData|null>}
 */
export async function getPixmapImageData(path) {
  if (!path) return null;
  if (pixmapImageCache.has(path)) {
    return pixmapImageCache.get(path);
  }
  try {
    // 后端返回 { width, height, data(base64 RGBA) }
    const result = await invoke('get_image_data_url', { path });
    const binary = atob(result.data);
    const arr = new Uint8ClampedArray(binary.length);
    for (let i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    const imgData = new ImageData(arr, result.width, result.height);
    pixmapImageCache.set(path, imgData);
    return imgData;
  } catch (e) {
    console.error('getPixmapImageData error:', e, path);
    pixmapImageCache.set(path, null);
    return null;
  }
}

/**
 * 同步获取已缓存的 ImageData（未缓存返回 null）
 * @param {string} path
 * @returns {ImageData|null}
 */
export function getCachedPixmapImageData(path) {
  return pixmapImageCache.get(path) || null;
}

/**
 * 预加载图片到缓存（异步，加载完成后调用回调触发重绘）
 * @param {string} path
 * @param {Function} [onLoaded] 加载完成回调，参数为 path
 */
export function preloadPixmapImage(path, onLoaded) {
  if (!path || pixmapImageCache.has(path)) return;
  getPixmapImageData(path).then(imgData => {
    if (onLoaded && imgData) onLoaded(path);
  });
}

/** 清空图片缓存（切换项目时调用） */
export function clearPixmapImageCache() {
  pixmapImageCache.clear();
}

const opaqueImageCache = new Map();

// 通过 Rust 后端将带透明通道的图片按指定底色合成，生成不带 alpha 的 data URL，用于非 Alpha 格式预览
export async function getOpaqueImageUrl(originalPath, fillColor) {
  const key = originalPath + '|' + (fillColor || '#000000');
  if (opaqueImageCache.has(key)) {
    return opaqueImageCache.get(key);
  }
  try {
    const dataUrl = await invoke('get_opaque_image_data_url', {
      path: originalPath,
      fillColor: fillColor || '#000000'
    });
    opaqueImageCache.set(key, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('getOpaqueImageUrl error:', err);
    return toAssetUrl(originalPath);
  }
}

export async function registerFontFile(fontPath) {
  if (!fontPath) return null;
  if (registeredFontFaces.has(fontPath)) {
    return registeredFontFaces.get(fontPath);
  }
  if (FONT_FACE_LOAD_PROMISES.has(fontPath)) {
    return FONT_FACE_LOAD_PROMISES.get(fontPath);
  }
  const promise = (async () => {
    try {
      const fileName = fontPath.replace(/[/\\]/g, '/').split('/').pop();
      const familyName = fontFamilyNameForPath(fontPath);
      const url = convertFileSrc(fontPath);
      // TTC/OTC 集合字体：Tauri asset 协议可能返回错误 MIME 类型导致 FontFace 拒绝加载
      // 改用 fetch + ArrayBuffer 方式，浏览器直接解析字体二进制，绕过 Content-Type 问题
      const lowerName = fileName.toLowerCase();
      let fontFace;
      if (lowerName.endsWith('.ttc') || lowerName.endsWith('.otc')) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`fetch 失败: ${resp.status}`);
          const buf = await resp.arrayBuffer();
          fontFace = new FontFace(familyName, buf);
        } catch (fetchErr) {
          // fetch 失败时回退到 URL 方式
          console.warn('TTC fetch 加载失败，回退到 URL 方式:', fontPath, fetchErr);
          fontFace = new FontFace(familyName, `url("${url}")`);
        }
      } else {
        fontFace = new FontFace(familyName, `url("${url}")`);
      }
      await fontFace.load();
      document.fonts.add(fontFace);
      registeredFontFaces.set(fontPath, familyName);
      FONT_FACE_LOAD_PROMISES.delete(fontPath);
      if (fontLoadCallback) fontLoadCallback();
      return familyName;
    } catch (err) {
      console.warn('字体加载失败:', fontPath, err);
      FONT_FACE_LOAD_PROMISES.delete(fontPath);
      return null;
    }
  })();
  FONT_FACE_LOAD_PROMISES.set(fontPath, promise);
  return promise;
}

export async function preloadProjectFonts(fonts) {
  await Promise.all((fonts || []).map(f => registerFontFile(f.path)));
}

// ============ SGL 字模位图数据加载（所见即所得） ============
// 前端 generateFontC 直接生成字体 C 文件内容，解析为字模数据并缓存到 SGLRenderer

const _fontDataPromises = new Map(); // key → Promise<fontData>
const _failedFontKeys = new Set(); // 加载失败的 key，避免重复尝试导致死循环
const _fontErrors = new Map(); // key → 错误信息字符串
const _warnedMissingGlyphKeys = new Set(); // 缺字形警告去重

/** 字体缺字形警告（编辑器控制台；可选 toast） */
function warnMissingGlyphs(fontPath, size, bpp, missingGlyphs, { toast = true } = {}) {
  if (!missingGlyphs || !missingGlyphs.length) return;
  const fontLabel = String(fontPath).replace(/\\/g, '/').split('/').pop() || fontPath;
  const warnKey = `${fontPath}|${size}|${bpp}|${missingGlyphs.join(',')}`;
  if (_warnedMissingGlyphKeys.has(warnKey)) return;
  _warnedMissingGlyphKeys.add(warnKey);
  const preview = missingGlyphs.slice(0, 12).join(', ');
  const more = missingGlyphs.length > 12 ? ` 等共 ${missingGlyphs.length} 个` : '';
  const msg = `字体缺少字形，取模已跳过: ${fontLabel} (${size}px) — ${preview}${more}`;
  console.warn('[font]', msg);
  try {
    import('./app.js').then(m => {
      if (m.AppState && typeof m.AppState.logger === 'function') {
        m.AppState.logger(msg, 'warn');
      }
      if (toast && typeof m.showToast === 'function') {
        m.showToast(msg, 'warn');
      }
    }).catch(() => {});
  } catch (_e) { /* ignore */ }
}

// 字体生成队列控制：限制同时进行的字体生成任务数，避免后端阻塞
const FONT_QUEUE_MAX_CONCURRENT = 8; // 最多同时进行 8 个字体生成任务
let _fontQueueRunning = 0;
const _fontQueue = []; // 等待队列

function runFontQueue() {
  while (_fontQueue.length > 0 && _fontQueueRunning < FONT_QUEUE_MAX_CONCURRENT) {
    const { promise, resolver, rejecter } = _fontQueue.shift();
    _fontQueueRunning++;
    promise().then(result => {
      resolver(result);
    }).catch(err => {
      rejecter(err);
    }).finally(() => {
      _fontQueueRunning--;
      runFontQueue();
    });
  }
}

function enqueueFontTask(taskFn) {
  return new Promise((resolve, reject) => {
    _fontQueue.push({
      promise: taskFn,
      resolver: resolve,
      rejecter: reject
    });
    runFontQueue();
  });
}

/** 获取字体加载失败的错误信息 */

/** Normalize font variant options (spacing / smartMono / compress). */
export function normalizeFontOpts(opts = {}) {
  return {
    spacing: Math.max(0, parseInt(opts.spacing, 10) || 0),
    smartMono: !!opts.smartMono,
    compress: !!opts.compress,
  };
}

/** Build opts from widget + global SGL config. */
export function fontOptsFromWidget(w) {
  const cfg = (typeof AppState !== 'undefined' && AppState.project && AppState.project.sgl_config)
    ? AppState.project.sgl_config
    : null;
  return normalizeFontOpts({
    spacing: (w && w.fontSpacing) || 0,
    smartMono: !!(w && w.fontSmartMono),
    compress: !!(cfg && cfg.font_compressed),
  });
}

/** Memory / preload key: path|size|bpp|spacing|mono|compress */
export function makeFontDataKey(fontPath, size, bpp, opts = {}) {
  const o = normalizeFontOpts(opts);
  return `${fontPath}|${size}|${bpp}|${o.spacing}|${o.smartMono ? 1 : 0}|${o.compress ? 1 : 0}`;
}

export function parseFontDataKey(key) {
  const parts = String(key || '').split('|');
  if (parts.length < 3) {
    return { fontPath: '', size: 14, bpp: 4, spacing: 0, smartMono: false, compress: false };
  }
  return {
    fontPath: parts[0],
    size: parseInt(parts[1], 10) || 14,
    bpp: parseInt(parts[2], 10) || 4,
    spacing: parseInt(parts[3] || '0', 10) || 0,
    smartMono: parts[4] === '1',
    compress: parts[5] === '1',
  };
}

export function getFontError(fontPath, size, bpp, opts = {}) {
  const key = makeFontDataKey(fontPath, size, bpp, opts);
  return _fontErrors.get(key) || null;
}

/**
 * 加载 SGL 字模位图数据
 * 调用前端 generateFontC 生成字体 C 文件，解析为字模数据，注册到 SGLRenderer
 * @param {string} fontPath - 字体文件路径（如 'simsun.ttc' 或完整路径）
 * @param {number} size - 字号
 * @param {number} bpp - bpp (1/2/4)
 * @param {string} [symbols] - 可选字符集
 * @returns {Promise<object|null>} 字模数据对象
 */
// localStorage 字模缓存 key 前缀（v9: 强制清除 v8 旧缓存，解决字模位图内容损坏导致的乱码）
// v11: 修复 TTC/SimSun 等 MONO 内嵌位图被误当 8bit 灰度导致文字不可读
const FONT_CACHE_PREFIX = 'sgl_font_cache_v12_';
// 字体文件指纹（大小+修改时间）缓存：避免每次读缓存都 invoke Rust
const FONT_FP_CACHE = new Map();

function getFontCacheKey(fontPath, size, bpp, fingerprint, opts = {}) {
  const fp = fingerprint || '';
  const o = normalizeFontOpts(opts);
  return `${FONT_CACHE_PREFIX}${fontPath.replace(/[/\\]/g, '_')}_${size}_${bpp}_sp${o.spacing}_m${o.smartMono ? 1 : 0}_c${o.compress ? 1 : 0}_${fp}`;
}

async function getFontFileFingerprint(fontPath) {
  if (!fontPath) return '';
  if (FONT_FP_CACHE.has(fontPath)) return FONT_FP_CACHE.get(fontPath);
  try {
    const fp = await invoke('get_font_file_fingerprint', { fontPath });
    FONT_FP_CACHE.set(fontPath, fp || '');
    return fp || '';
  } catch (e) {
    console.warn('获取字体指纹失败:', fontPath, e);
    FONT_FP_CACHE.set(fontPath, '');
    return '';
  }
}

async function getCachedFontC(fontPath, size, bpp, opts = {}) {
  try {
    const fp = await getFontFileFingerprint(fontPath);
    const cacheKey = getFontCacheKey(fontPath, size, bpp, fp, opts);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { symbols: cachedSymbols, cContent, missingGlyphs } = JSON.parse(cached);
      return { cachedSymbols, cContent, missingGlyphs: missingGlyphs || [] };
    }
  } catch (e) {
    console.warn('读取字模缓存失败:', e);
  }
  return null;
}

function getCachedFontCSync(fontPath, size, bpp, opts = {}) {
  // sync: only when fingerprint already in memory
  try {
    const fp = FONT_FP_CACHE.get(fontPath);
    if (!fp) return null;
    const cacheKey = getFontCacheKey(fontPath, size, bpp, fp, opts);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { symbols: cachedSymbols, cContent } = JSON.parse(cached);
      return { cachedSymbols, cContent };
    }
  } catch (e) {
    console.warn('读取字模缓存失败:', e);
  }
  return null;
}

async function setCachedFontC(fontPath, size, bpp, symbols, cContent, opts = {}, missingGlyphs = []) {
  try {
    const fp = await getFontFileFingerprint(fontPath);
    const cacheKey = getFontCacheKey(fontPath, size, bpp, fp, opts);
    localStorage.setItem(cacheKey, JSON.stringify({ symbols, cContent, missingGlyphs }));
  } catch (e) {
    console.warn('保存字模缓存失败:', e);
  }
}

/** 清除指定字体的所有 localStorage 缓存（兼容所有版本前缀，避免旧版本残留导致一致性问题） */
function removeFontCacheByKey(fontPath, size, bpp) {
  if (!fontPath) return;
  const pathKey = fontPath.replace(/[/\\]/g, '_');
  const suffix = `_${size}_${bpp}_`;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    // 匹配 sgl_font_cache_vN_<path>_<size>_<bpp>_<fingerprint>
    if (k.includes(pathKey) && k.includes(suffix) && /sgl_font_cache_v\d+_/.test(k)) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) localStorage.removeItem(k);
  console.log(`[removeFontCacheByKey] 清理 ${keysToRemove.length} 个缓存项: ${fontPath} size=${size} bpp=${bpp}`);
}

/** 字模 unicode 表是否包含指定码点（对齐 SGL search / editor fontContainsChar） */
export function fontContainsUnicode(font, unicode) {
  const code = font && font.unicode;
  if (!code || code.length === 0) return false;
  for (let i = 0; i < code.length; i++) {
    const seg = code[i];
    if (unicode >= seg.offset && unicode < seg.offset + seg.len) {
      if (seg.list === null) return true;
      for (let j = 0; j < seg.list.length; j++) {
        if (seg.list[j] === unicode - seg.offset) return true;
      }
    }
  }
  return false;
}

/** 字模是否覆盖 symbols；knownMissing 中的字符视为已尝试过、不再强制重取模 */
export function fontCoversSymbols(font, symbols, knownMissing = null) {
  if (!symbols) return true;
  if (!font) return false;
  const missingSet = knownMissing
    ? new Set(knownMissing)
    : (font._missingGlyphs ? new Set(font._missingGlyphs) : null);
  for (const ch of String(symbols)) {
    const code = ch.charCodeAt(0);
    if (code < 0x20) continue;
    if (fontContainsUnicode(font, code)) continue;
    if (missingSet && missingSet.has(ch)) continue;
    return false;
  }
  return true;
}

export async function hasLocalFontCache(fontPath, size, bpp, symbols, opts = {}) {
  const cached = await getCachedFontC(fontPath, size, bpp, opts);
  if (!cached || !cached.cContent) return false;
  if (!symbols) return true;
  // 仅当缓存记录的 symbols 字符串覆盖所需字符时视为命中；
  // 实际字形是否存在由 load / preload 再用 fontCoversSymbols 校验
  return [...String(symbols)].every(ch => cached.cachedSymbols.includes(ch));
}

/**
 * 从 localStorage 恢复字体数据到内存（支持带指纹的 v2 缓存）
 * 异步版：每次都会查询字体文件指纹，确保替换/删除字体后缓存失效
 * @param {Array} fontKeys - [{fontPath, size, bpp, symbols}] 需要恢复的字体列表
 * @returns {Promise<number>} 成功恢复的数量
 */
export async function restoreFontCache(fontKeys) {
  if (!window.SGLRenderer || !window.SGLRenderer.parseFontCFile) return 0;
  // 先批量拉取所有字体的指纹（避免每个字体单独 invoke）
  const fps = await Promise.all(fontKeys.map(async k => {
    if (!k.fontPath || k.fontPath === 'default') return '';
    return getFontFileFingerprint(k.fontPath);
  }));
  let restored = 0;
  for (let i = 0; i < fontKeys.length; i++) {
    const { fontPath, size, bpp, symbols } = fontKeys[i];
    if (!fontPath || fontPath === 'default') continue;
    const opts = normalizeFontOpts({ spacing: fontKeys[i].spacing, smartMono: fontKeys[i].smartMono, compress: fontKeys[i].compress });
    const key = makeFontDataKey(fontPath, size, bpp, opts);
    if (window.SGLRenderer.getFontData(key)) { restored++; continue; }
    try {
      const fp = fps[i] || '';
      const cacheKey = getFontCacheKey(fontPath, size, bpp, fp, opts);
      const raw = localStorage.getItem(cacheKey);
      if (!raw) continue;
      const { symbols: cachedSymbols, cContent, missingGlyphs } = JSON.parse(raw);
      const needSymbols = symbols || '';
      const hasAllChars = !needSymbols || needSymbols.split('').every(ch => cachedSymbols.includes(ch));
      if (!hasAllChars) continue;
      console.log(`[font] restoreFontCache ${fontPath} size=${size} bpp=${bpp} cContent.len=${cContent.length}`);
      const fontData = window.SGLRenderer.parseFontCFile(cContent);
      fontData._missingGlyphs = missingGlyphs || [];
      console.log(`[font] restoreFontCache parsed:`, {
        font_height: fontData.font_height,
        base_line: fontData.base_line,
        bpp: fontData.bpp,
        bitmap_len: fontData.bitmap.length,
        table_len: fontData.table.length,
        table_0: fontData.table[0],
        table_1: fontData.table[1],
        table_2: fontData.table[2],
        unicode_len: fontData.unicode.length,
        unicode_0: fontData.unicode[0],
      });
      // 一致性校验：bitmap_index 范围必须有效，否则丢弃缓存
      if (!validateFontData(fontData)) {
        console.log(`[font] restoreFontCache 字模一致性校验失败，丢弃缓存: ${key}`);
        removeFontCacheByKey(fontPath, size, bpp);
        continue;
      }
      window.SGLRenderer.registerFontData(key, fontData);
      restored++;
    } catch (e) {
      console.warn('恢复字体缓存失败:', fontPath, size, bpp, e);
    }
  }
  return restored;
}

/**
 * 同步快速路径恢复：仅当 fingerprint 已在内存中存在时才使用 localStorage 缓存
 * 不会阻塞初始化，后续异步 loadSglFontData 会兜底重新生成
 * @param {Array} fontKeys
 * @returns {number}
 */
export function restoreFontCacheFast(fontKeys) {
  if (!window.SGLRenderer || !window.SGLRenderer.parseFontCFile) return 0;
  let restored = 0;
  for (const entry of fontKeys) {
    const { fontPath, size, bpp, symbols } = entry;
    if (!fontPath || fontPath === 'default') continue;
    const opts = normalizeFontOpts({ spacing: entry.spacing, smartMono: entry.smartMono, compress: entry.compress });
    const key = makeFontDataKey(fontPath, size, bpp, opts);
    if (window.SGLRenderer.getFontData(key)) { restored++; continue; }
    const cached = getCachedFontCSync(fontPath, size, bpp, opts);
    if (cached && cached.cContent) {
      const needSymbols = symbols || '';
      const hasAllChars = !needSymbols || needSymbols.split('').every(ch => cached.cachedSymbols.includes(ch));
      if (hasAllChars) {
        try {
          const fontData = window.SGLRenderer.parseFontCFile(cached.cContent);
          // 一致性校验：bitmap_index 范围必须有效，否则丢弃缓存
          if (!validateFontData(fontData)) {
            console.log(`[restoreFontCacheFast] 字模一致性校验失败，丢弃缓存: ${key}`);
            removeFontCacheByKey(fontPath, size, bpp);
            continue;
          }
          window.SGLRenderer.registerFontData(key, fontData);
          restored++;
        } catch (e) {
          console.warn('快速恢复字体缓存失败:', fontPath, size, bpp, e);
        }
      }
    }
  }
  return restored;
}

export async function loadSglFontData(fontPath, size, bpp, symbols, opts = {}) {
  if (!fontPath || fontPath === 'default') return null;
  const fontOpts = normalizeFontOpts(opts);
  const key = makeFontDataKey(fontPath, size, bpp, fontOpts);
  const needSymbols = symbols || '';

  // 合并并发请求：等进行中的加载结束后再检查字符覆盖，不足则重新取模
  while (true) {
    const existing = window.SGLRenderer && window.SGLRenderer.getFontData(key);
    if (existing && fontCoversSymbols(existing, needSymbols)) {
      return existing;
    }
    if (_failedFontKeys.has(key)) return null;

    if (_fontDataPromises.has(key)) {
      try {
        await _fontDataPromises.get(key);
      } catch (_e) { /* 下方继续 */ }
      continue;
    }

    // 内存有旧字模但不含新字符 → 先清掉再生成
    if (existing) {
      window.SGLRenderer.removeFontData(key);
    }
    break;
  }

  const promise = enqueueFontTask(async () => {
    try {
      // 无字符时无法生成字模（后端/前端都会报「没有可渲染的字符」）；有旧缓存仍可恢复
      let cContent;
      let missingGlyphs = [];
      let fromCache = false;
      const cached = await getCachedFontC(fontPath, size, bpp, fontOpts);
      if (cached && cached.cContent) {
        const hasAllChars = !needSymbols || [...String(needSymbols)].every(ch => cached.cachedSymbols.includes(ch));
        if (hasAllChars) {
          cContent = cached.cContent;
          missingGlyphs = cached.missingGlyphs || [];
          fromCache = true;
        }
      }
      if (!cContent && !needSymbols) {
        console.log(`[font] loadSglFontData 跳过空字符集: ${fontPath} size=${size} bpp=${bpp}`);
        return null;
      }

      const fontName = `sgl_font_${fontPath.replace(/[/\\]/g, '/').split('/').pop().replace(/[^\w]/g, '_')}_${size}_bpp${bpp}`;
      
      // 没有缓存或缓存不包含所需字符，调用后端生成
      if (!cContent) {
        try {
          const result = await invoke('generate_font_c', {
            fontPath,
            size,
            bpp,
            symbols: needSymbols,
            compress: fontOpts.compress,
            fontName,
            spacing: fontOpts.spacing,
            smartMono: fontOpts.smartMono,
          });
          if (typeof result === 'string') {
            cContent = result;
            missingGlyphs = [];
          } else {
            cContent = result.content;
            missingGlyphs = result.missing_glyphs || result.missingGlyphs || [];
          }
        } catch (e) {
          console.warn('后端字模生成失败，回退到前端 Canvas 生成:', e);
          const familyName = await registerFontFile(fontPath);
          if (!familyName) {
            throw new Error('字体文件加载失败');
          }
          cContent = generateFontC(familyName, size, bpp, needSymbols, fontOpts.compress, fontName, fontOpts.spacing, fontOpts.smartMono);
          missingGlyphs = [];
        }
        // 缓存到 localStorage（v2 带指纹）
        await setCachedFontC(fontPath, size, bpp, needSymbols, cContent, fontOpts, missingGlyphs);
      }

      if (missingGlyphs.length) {
        warnMissingGlyphs(fontPath, size, bpp, missingGlyphs, { toast: !fromCache });
      }
      
      // 诊断日志：输出 C 文件内容长度和前 200 字符
      console.log(`[font] loadSglFontData ${fontPath} size=${size} bpp=${bpp} cContent.len=${cContent.length}`);
      console.log(`[font] cContent head:`, cContent.substring(0, 200));
      const fontData = window.SGLRenderer.parseFontCFile(cContent);
      // 诊断日志：输出字模数据关键字段
      console.log(`[font] parseFontCFile ${fontPath} size=${size} bpp=${bpp}:`, {
        font_height: fontData.font_height,
        base_line: fontData.base_line,
        bpp: fontData.bpp,
        compress: fontData.compress,
        bitmap_len: fontData.bitmap.length,
        table_len: fontData.table.length,
        table_0: fontData.table[0],
        table_1: fontData.table[1],
        table_2: fontData.table[2],
        unicode_len: fontData.unicode.length,
        unicode_0: fontData.unicode[0],
      });
      // 本地缓存声称含有字符，但解析后字模仍缺字且未记录 missing → 丢弃缓存并强制后端重生成一次
      if (fromCache && !fontCoversSymbols(fontData, needSymbols, missingGlyphs)) {
        console.warn(`[font] 本地字模缓存与字符集不一致，清除并重新生成: ${fontPath} size=${size}`);
        try { removeFontCacheByKey(fontPath, size, bpp); } catch (_e) { /* ignore */ }
        fromCache = false;
        cContent = null;
        missingGlyphs = [];
        // 同步再走一遍后端生成（不递归 loadSglFontData，避免 promise 表死锁）
        try {
          const result = await invoke('generate_font_c', {
            fontPath,
            size,
            bpp,
            symbols: needSymbols,
            compress: fontOpts.compress,
            fontName,
            spacing: fontOpts.spacing,
            smartMono: fontOpts.smartMono,
          });
          if (typeof result === 'string') {
            cContent = result;
            missingGlyphs = [];
          } else {
            cContent = result.content;
            missingGlyphs = result.missing_glyphs || result.missingGlyphs || [];
          }
          await setCachedFontC(fontPath, size, bpp, needSymbols, cContent, fontOpts, missingGlyphs);
          if (missingGlyphs.length) {
            warnMissingGlyphs(fontPath, size, bpp, missingGlyphs, { toast: true });
          }
          const fontData2 = window.SGLRenderer.parseFontCFile(cContent);
          fontData2._missingGlyphs = missingGlyphs || [];
          let _hasInk2 = false;
          for (let _i = 0; _i < fontData2.bitmap.length; _i++) {
            if (fontData2.bitmap[_i] !== 0) { _hasInk2 = true; break; }
          }
          if (!_hasInk2) {
            _failedFontKeys.add(key);
            return null;
          }
          window.SGLRenderer.registerFontData(key, fontData2);
          return fontData2;
        } catch (e) {
          console.warn('字模缓存失效后重新生成失败:', e);
          throw e;
        }
      }
      // 字模有效性校验：位图全 0 则丢弃并回退 CSS
      let _hasInk = false;
      const _bmp = fontData.bitmap;
      for (let _i = 0; _i < _bmp.length; _i++) {
        if (_bmp[_i] !== 0) { _hasInk = true; break; }
      }
      if (!_hasInk) {
        console.warn(`[font] 字模位图全空（无效字模，FreeType 渲染该字体返回空字形），丢弃并回退 CSS: ${fontPath} size=${size} bpp=${bpp}`);
        try { removeFontCacheByKey(fontPath, size, bpp); } catch (_e) { /* 忽略清缓存失败 */ }
        _failedFontKeys.add(key);
        return null;
      }
      fontData._missingGlyphs = missingGlyphs || [];
      window.SGLRenderer.registerFontData(key, fontData);
      return fontData;
    } catch (err) {
      const errMsg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
      _fontErrors.set(key, errMsg);
      console.warn('加载 SGL 字模数据失败:', fontPath, size, bpp, errMsg);
      _failedFontKeys.add(key);
      return null;
    } finally {
      _fontDataPromises.delete(key);
    }
  });
  _fontDataPromises.set(key, promise);
  return promise;
}

/**
 * 获取已缓存的 SGL 字模数据（同步）
 * @param {string} fontPath
 * @param {number} size
 * @param {number} bpp
 * @returns {object|null}
 */
/** 校验字模数据完整性（table/bitmap 索引范围一致性），返回 true 表示有效 */
export function validateFontData(fd) {
  if (!fd) return false;
  if (!fd.bitmap || !fd.table || fd.table.length < 2 || !fd.unicode || fd.unicode.length === 0) {
    console.log('[validateFontData] 基础字段无效', {
      bitmap_len: fd.bitmap?.length,
      table_len: fd.table?.length,
      unicode_len: fd.unicode?.length,
    });
    return false;
  }
  const t0 = fd.table[0];
  if (t0 && (t0.adv_w !== 0 || t0.box_w !== 0 || t0.box_h !== 0)) {
    console.log('[validateFontData] table[0] 非reserved entry', t0);
    return false;
  }
  const bpp = fd.bpp || 4;
  let invalidCount = 0;
  for (let i = 1; i < fd.table.length; i++) {
    const e = fd.table[i];
    if (!e || e.box_w <= 0 || e.box_h <= 0) continue;
    const neededBits = e.box_w * e.box_h * bpp;
    const neededBytes = Math.ceil(neededBits / 8);
    if (e.bitmap_index + neededBytes > fd.bitmap.length) {
      invalidCount++;
      if (invalidCount <= 3) {
        console.log(`[validateFontData] table[${i}] bitmap_index越界`, {
          bitmap_index: e.bitmap_index,
          needed_bytes: neededBytes,
          bitmap_len: fd.bitmap.length,
          box_w: e.box_w, box_h: e.box_h, bpp,
        });
      }
    }
  }
  if (invalidCount > 0) {
    console.log(`[validateFontData] 共 ${invalidCount} 个字形越界，判定为无效字模`);
    return false;
  }
  return true;
}

export function getSglFontData(fontPath, size, bpp, opts = {}) {
  if (!fontPath || fontPath === 'default') return null;
  if (!window.SGLRenderer) return null;
  const key = makeFontDataKey(fontPath, size, bpp, opts);
  const fd = window.SGLRenderer.getFontData(key);
  console.log(`[getSglFontData] key=${key} fd=${fd ? '存在' : 'null'}`, fd ? {
    bitmap_len: fd.bitmap?.length,
    table_len: fd.table?.length,
    unicode_len: fd.unicode?.length,
    compress: fd.compress,
  } : null);
  if (!fd) return null;
  const valid = validateFontData(fd);
  if (!valid) {
    console.log(`[getSglFontData] 字模一致性校验失败，移除内存缓存: ${key}`);
    window.SGLRenderer.removeFontData(key);
    return null;
  }
  return fd;
}

export function removeSglFontData(fontPath, size, bpp, opts = {}) {
  if (!window.SGLRenderer) return;
  const key = makeFontDataKey(fontPath, size, bpp, opts);
  window.SGLRenderer.removeFontData(key);
  console.log(`[removeSglFontData] 移除内存缓存: ${key}`);
}

/**
 * 预加载项目所有字体的字模数据
 * @param {Array} fonts - 项目字体资源列表 [{path, size, bpp}]
 * @param {string} [symbols] - 可选字符集
 */
export async function preloadSglFontData(fonts, symbols) {
  if (!fonts || !window.SGLRenderer) return;
  await Promise.all(fonts.map(f =>
    loadSglFontData(f.path, f.size || 14, f.bpp || 4, symbols, { spacing: f.spacing || 0, smartMono: !!f.smartMono, compress: !!f.compress })
  ));
}

export function getCssFontStack(family) {
  if (!family || family === 'default') return SGL_FONT_MAP['default'];
  // 已注册的本地字体优先用唯一族名，避免 SGL_FONT_MAP 按文件名映射到系统同名字体
  //（例如项目里的 simsun.ttc 与系统宋体混用），保证预览与资源一致。
  const familyName = fontFamilyNameForPath(family);
  if (registeredFontFaces.has(family) || FONT_FACE_LOAD_PROMISES.has(family)) {
    if (!registeredFontFaces.has(family)) registerFontFile(family);
    const mapped = SGL_FONT_MAP[family] || SGL_FONT_MAP[family.replace(/[/\\]/g, '/').split('/').pop()];
    return mapped ? `"${familyName}", ${mapped}` : `"${familyName}", ${SGL_FONT_MAP['default']}`;
  }
  if (SGL_FONT_MAP[family]) return SGL_FONT_MAP[family];
  const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
  if (SGL_FONT_MAP[fileName]) return SGL_FONT_MAP[fileName];
  if (!registeredFontFaces.has(family)) {
    registerFontFile(family);
  }
  return `"${familyName}", ${SGL_FONT_MAP['default']}`;
}

// SVG filter 定义安装标记
let bppFiltersInstalled = false;
/**
 * 在 document.body 插入隐藏的 SVG filter 定义，用于 bpp 量化文本抗锯齿
 * - 1bit: alpha 量化为 2 级（二值化，明显锯齿）
 * - 2bit: alpha 量化为 4 级
 * - 4bit: alpha 量化为 16 级
 * - 8bit: 256 级（不量化）
 */
function ensureBppSvgFilters() {
  if (bppFiltersInstalled || typeof document === 'undefined' || !document.body) return;
  bppFiltersInstalled = true;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden';
  const levels = { 1: 2, 2: 4, 4: 16, 8: 256 };
  Object.keys(levels).forEach(bpp => {
    const n = levels[bpp];
    const vals = Array.from({ length: n }, (_, i) => (i / (n - 1)).toFixed(4)).join(' ');
    const filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', `sgl-bpp-${bpp}`);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const transfer = document.createElementNS(svgNS, 'feComponentTransfer');
    const funcA = document.createElementNS(svgNS, 'feFuncA');
    funcA.setAttribute('type', 'discrete');
    funcA.setAttribute('tableValues', vals);
    transfer.appendChild(funcA);
    filter.appendChild(transfer);
    svg.appendChild(filter);
  });
  document.body.appendChild(svg);
}

export function getFontBppCss(bpp) {
  // 保留兼容性：不再用 CSS font-smoothing（Tauri WebView 中不生效）
  // 实际 bpp 量化通过 applyBppFilter + CSS 变量 --sgl-bpp-filter 在 span 上应用
  return {};
}

/**
 * 在控件外层 el 上设置 bpp filter CSS 变量
 * 文本 span 通过 cssText 中的 `filter:var(--sgl-bpp-filter,none);` 引用
 * canvas 不受影响（没有 filter 属性）
 */
export function applyBppFilter(el, bpp) {
  ensureBppSvgFilters();
  const b = Number(bpp) || 4;
  if (b === 8) {
    el.style.setProperty('--sgl-bpp-filter', 'none');
  } else {
    el.style.setProperty('--sgl-bpp-filter', `url(#sgl-bpp-${b})`);
  }
}

export function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixColors(c1, c2, ratio = 0.5) {
  const hex1 = (c1 && c1.startsWith('#') && c1.length >= 7) ? c1 : '#000000';
  const hex2 = (c2 && c2.startsWith('#') && c2.length >= 7) ? c2 : '#000000';
  const r = Math.round(parseInt(hex1.slice(1, 3), 16) * (1 - ratio) + parseInt(hex2.slice(1, 3), 16) * ratio);
  const g = Math.round(parseInt(hex1.slice(3, 5), 16) * (1 - ratio) + parseInt(hex2.slice(3, 5), 16) * ratio);
  const b = Math.round(parseInt(hex1.slice(5, 7), 16) * (1 - ratio) + parseInt(hex2.slice(5, 7), 16) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getWidgetAbsPos(w, page) {
  const widgetMap = new Map();
  page.widgets.forEach(pw => widgetMap.set(pw.id, pw));
  let x = w.x, y = w.y;
  let current = w;
  while (current.parentId && widgetMap.has(current.parentId)) {
    current = widgetMap.get(current.parentId);
    x += current.x;
    y += current.y;
  }
  return { x, y };
}

export function sortWidgetsByHierarchy(widgets) {
  const widgetMap = new Map();
  widgets.forEach(w => widgetMap.set(w.id, w));

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

  return [...widgets].sort((a, b) => {
    const rootA = rootMap.get(a.id);
    const rootB = rootMap.get(b.id);
    if (rootA !== rootB) {
      const zA = widgetMap.get(rootA).zOrder || 0;
      const zB = widgetMap.get(rootB).zOrder || 0;
      return zA - zB;
    }
    return depthMap.get(a.id) - depthMap.get(b.id);
  });
}

export function flexAlign(align) {
  const jc = {
    TOP_LEFT: 'flex-start', TOP_MID: 'center', TOP_RIGHT: 'flex-end',
    LEFT_MID: 'flex-start', CENTER: 'center', RIGHT_MID: 'flex-end',
    BOT_LEFT: 'flex-start', BOT_MID: 'center', BOT_RIGHT: 'flex-end'
  }[align] || 'flex-start';
  const ai = {
    TOP_LEFT: 'flex-start', TOP_MID: 'flex-start', TOP_RIGHT: 'flex-start',
    LEFT_MID: 'center', CENTER: 'center', RIGHT_MID: 'center',
    BOT_LEFT: 'flex-end', BOT_MID: 'flex-end', BOT_RIGHT: 'flex-end'
  }[align] || 'center';
  return { justifyContent: jc, alignItems: ai };
}

export function textAlignCss(align) {
  const map = {
    TOP_LEFT: 'left', TOP_MID: 'center', TOP_RIGHT: 'right',
    LEFT_MID: 'left', CENTER: 'center', RIGHT_MID: 'right',
    BOT_LEFT: 'left', BOT_MID: 'center', BOT_RIGHT: 'right'
  };
  return map[align] || 'left';
}
