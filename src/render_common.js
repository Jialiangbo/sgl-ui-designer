import { invoke, convertFileSrc } from '@tauri-apps/api/core';

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
      const familyName = `sgl_font_${fileName.replace(/[^\w]/g, '_')}`;
      const url = convertFileSrc(fontPath);
      const fontFace = new FontFace(familyName, `url("${url}")`);
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
// 调用后端 generate_font_c_content 生成字体 C 文件，解析为字模数据并缓存到 SGLRenderer

const _fontDataPromises = new Map(); // key → Promise<fontData>
const _failedFontKeys = new Set(); // 加载失败的 key，避免重复尝试导致死循环

/**
 * 加载 SGL 字模位图数据
 * 调用后端 sgl_font_conv.exe 生成字体 C 文件，解析为字模数据，注册到 SGLRenderer
 * @param {string} fontPath - 字体文件路径（如 'simsun.ttc' 或完整路径）
 * @param {number} size - 字号
 * @param {number} bpp - bpp (1/2/4)
 * @param {string} [symbols] - 可选字符集
 * @returns {Promise<object|null>} 字模数据对象
 */
export async function loadSglFontData(fontPath, size, bpp, symbols) {
  if (!fontPath || fontPath === 'default') return null;
  const key = `${fontPath}|${size}|${bpp}`;

  // 已缓存
  if (window.SGLRenderer && window.SGLRenderer.getFontData(key)) {
    return window.SGLRenderer.getFontData(key);
  }
  // 之前加载失败，不再重试（避免 renderCanvas → load → fail → renderCanvas 死循环）
  if (_failedFontKeys.has(key)) return null;
  // 正在加载
  if (_fontDataPromises.has(key)) {
    return _fontDataPromises.get(key);
  }

  const promise = (async () => {
    try {
      const cContent = await invoke('generate_font_c_content', {
        fontPath, size, bpp, symbols: symbols || null,
      });
      const fontData = window.SGLRenderer.parseFontCFile(cContent);
      window.SGLRenderer.registerFontData(key, fontData);
      return fontData;
    } catch (err) {
      console.warn('加载 SGL 字模数据失败:', fontPath, size, bpp, err);
      _failedFontKeys.add(key); // 记录失败，避免重复加载
      return null;
    } finally {
      _fontDataPromises.delete(key);
    }
  })();
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
export function getSglFontData(fontPath, size, bpp) {
  if (!fontPath || fontPath === 'default') return null;
  if (!window.SGLRenderer) return null;
  return window.SGLRenderer.getFontData(`${fontPath}|${size}|${bpp}`);
}

/**
 * 预加载项目所有字体的字模数据
 * @param {Array} fonts - 项目字体资源列表 [{path, size, bpp}]
 * @param {string} [symbols] - 可选字符集
 */
export async function preloadSglFontData(fonts, symbols) {
  if (!fonts || !window.SGLRenderer) return;
  await Promise.all(fonts.map(f =>
    loadSglFontData(f.path, f.size || 14, f.bpp || 4, symbols)
  ));
}

export function getCssFontStack(family) {
  if (!family || family === 'default') return SGL_FONT_MAP['default'];
  if (SGL_FONT_MAP[family]) return SGL_FONT_MAP[family];
  const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
  if (SGL_FONT_MAP[fileName]) return SGL_FONT_MAP[fileName];
  const familyName = `sgl_font_${fileName.replace(/[^\w]/g, '_')}`;
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
