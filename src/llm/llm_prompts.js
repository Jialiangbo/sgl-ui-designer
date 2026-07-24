// ============ SGL UI Designer - AI 提示词构建器 ============
// 负责：构建 System Prompt、User Prompt 模板
// 设计原则：精简 Token、只列常用属性、未列属性用默认值
import { SGL_WIDGET_TYPES, WIDGET_CATEGORIES, PROP_META } from '../sgl_api.js';

// 通用属性（所有控件都有，不在每个控件下列出以节省 Token）
const COMMON_PROPS = new Set([
  'locked', 'alpha', 'pixmap', 'pixmapFormat', 'fontFamily', 'fontBpp',
  'mainAlpha', 'borderAlpha', 'xOffset', 'yOffset'
]);

/**
 * 从 SGL_WIDGET_TYPES 动态生成控件参考文本
 * 保证 AI 看到的控件列表和设计器实际支持的完全一致
 */
function buildWidgetReference() {
  const typeMap = {};
  for (const w of SGL_WIDGET_TYPES) {
    typeMap[w.type] = w;
  }

  const lines = [];
  for (const cat of WIDGET_CATEGORIES) {
    lines.push(`### ${cat.name}`);
    for (const type of cat.types) {
      const def = typeMap[type];
      if (!def) continue;
      // 过滤通用属性，只保留控件特有的核心属性
      const coreProps = (def.properties || [])
        .filter(p => !COMMON_PROPS.has(p))
        .map(p => PROP_META[p] ? `${p}(${PROP_META[p].label})` : p);
      const propStr = coreProps.length > 0 ? coreProps.join(',') : '';
      lines.push(propStr
        ? `${type}(${propStr}) — ${def.name}`
        : `${type} — ${def.name}`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 动态生成合法控件类型列表（供校验用）
 */
function getValidTypes() {
  return SGL_WIDGET_TYPES.map(w => w.type);
}

/**
 * 系统提示词（动态生成控件参考，与设计器保持一致）
 * @param {Array} currentWidgets - 当前画布上的控件列表（可选，用于让 AI 感知画布状态）
 */
export function buildSystemPrompt(currentWidgets = null) {
  const widgetRef = buildWidgetReference();
  const validTypes = getValidTypes();

  let canvasInfo = '';
  if (currentWidgets && currentWidgets.length > 0) {
    const summary = currentWidgets.map(w =>
      `${w.type}(${w.id})@${w.x},${w.y} ${w.width}x${w.height}`
    ).join('; ');
    canvasInfo = `\n## 当前画布状态\n画布上已有 ${currentWidgets.length} 个控件：${summary}\n用户修改/添加控件时需注意不要与现有控件 id 重复，位置不要重叠。`;
  } else if (currentWidgets) {
    canvasInfo = '\n## 当前画布状态\n画布当前为空。';
  }

  return `你是 SGL UI Designer 的 AI 设计助手。请帮用户设计嵌入式设备的界面布局。

## 回复规则
- 当用户要求**生成、创建、修改、优化界面布局**时，输出 JSON 格式的控件布局（见下方输出格式）。
- 当用户提到**屏幕尺寸、分辨率、页面参数、背景色、资源管理**时，输出包含 meta 对象的 JSON（见下方输出格式），无需输出 widgets。
- 当用户只是**提问、闲聊、咨询**（如"你好"、"什么是SGL"、"帮我解释一下"等）时，直接用中文纯文本回复，不要输出 JSON。
- 判断标准：用户的意图是否涉及"修改画布或在画布上添加/修改控件"。如果是→输出JSON；否则→纯文本回复。

## 本地文件访问
当用户消息中包含本地文件路径（如 E:\\xxx\\fonts）时，系统会自动扫描该目录并将文件列表附加到消息末尾（以 [本地路径扫描] 标记）。你可以直接使用这些文件信息来添加资源或生成控件，无需告知用户"无法访问本地文件"。
${canvasInfo}
## 控件参考（从设计器控件定义动态生成，属性括号内为中文说明）

${widgetRef}

## 页面参数
你可以修改以下页面参数：
- screen_width: 屏幕宽度（像素）
- screen_height: 屏幕高度（像素）
- bg_color: 页面背景色（#RRGGBB）

## 资源管理
你可以添加字体和图片资源：
- fonts: [{name, size, bpp}] — name为字体文件名（不含路径），size为参考字号，bpp为字模位深（1/2/4/8）。字体是矢量的，同一字体只需添加一次，无需按不同字号重复添加。
- images: [{name, path}] — name为图片名称，path为图片相对路径

## 坐标系与颜色
- 左上角(0,0)，x向右，y向下，单位像素
- 颜色使用 #RRGGBB 十六进制格式
- align: TOP_LEFT, TOP_MID, TOP_RIGHT, LEFT_MID, CENTER, RIGHT_MID, BOT_LEFT, BOT_MID, BOT_RIGHT

## 输出格式（严格遵守）
当需要生成或修改控件时，输出 JSON 对象，包含 widgets 数组和可选的 meta 对象：
{
  "widgets": [{type:"rect","id":"rect1","x":0,"y":0,"width":480,"height":60,"bgColor":"#1e1e2e"}],
  "meta": {
    "screen_width": 480,
    "screen_height": 320,
    "bg_color": "#1e1e2e",
    "fonts": [{name:"font.ttf",size:16,bpp:4}],
    "images": [{name:"logo.png",path:"images/logo.png"}]
  }
}

meta 对象可选，只有需要修改页面参数或添加资源时才输出。
纯控件布局输出：[{"type":"rect","id":"rect1","x":0,"y":0,"width":480,"height":60,"bgColor":"#1e1e2e"}]

## 你的权限（完全控制设计器）
你拥有对设计器的完全控制权，可以执行以下所有操作：
1. **生成新布局**：输出完整 widgets 数组替换整个画布
2. **添加控件**：输出新控件 JSON 追加到现有画布
3. **修改任意属性**：通过属性增量格式修改控件的**任何**属性，包括但不限于：
   - 位置(x,y)、尺寸(width,height)
   - 颜色(color,bgColor,borderColor,textColor,fillColor 等)
   - 文字(text)、字号(fontSize)、对齐(align)
   - 状态(status)、数值(value)
   - 圆角(radius,tlRadius,trRadius,blRadius,brRadius)
   - 边框(borderWidth,borderColor)
   - 所有控件特有属性
4. **更换控件类型**：修改 type 字段将控件转为另一种类型
5. **删除控件**：输出 {"__delete": true} 删除指定控件
6. **修改页面参数**：通过 meta 对象修改屏幕尺寸、背景色
7. **管理资源**：通过 meta.fonts / meta.images 添加字体和图片资源

## 设计约束（必须遵守）
1. id 格式：{type}{序号}，同类型不可重复（如 rect1, rect2）
2. 所有控件必须在屏幕范围内，不可超出边界
3. 控件间距≥8px，屏幕边距≥12px
4. 配色协调，主色不超过3种
5. 字号建议：标题18-24px，正文12-16px，辅助文字10-12px
6. 控件尺寸合理：按钮高度≥40px，输入框高度≥36px
7. 优先使用 rect 作为背景卡片，再放置其他控件
8. 圆形/圆环控件宽度和高度应相同（正方形）`;
}

/**
 * 场景A：根据描述生成布局
 */
export function buildGeneratePrompt(screenWidth, screenHeight, description) {
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px
请根据以下描述生成界面布局：

"${description}"`;
}

/**
 * 场景B：优化/修改当前布局
 * @param {Array} widgets - 当前页面控件列表（已精简序列化）
 * @param {string} instruction - 用户的修改指令
 */
export function buildModifyPrompt(screenWidth, screenHeight, widgets, instruction) {
  const widgetsJson = JSON.stringify(widgets, null, 2);
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面控件列表（JSON）：
${widgetsJson}

请按以下要求修改控件布局：
"${instruction}"

输出修改后的完整控件 JSON 数组。`;
}

/**
 * 场景B2：局部修改 - 只修改选中的控件
 * @param {Array} allWidgets - 当前页面所有控件（用于上下文参考）
 * @param {Array} selectedWidgets - 选中的控件（需要修改的）
 * @param {string} instruction - 用户的修改指令
 */
export function buildPartialModifyPrompt(screenWidth, screenHeight, allWidgets, selectedWidgets, instruction) {
  const allJson = JSON.stringify(allWidgets, null, 2);
  const selectedJson = JSON.stringify(selectedWidgets, null, 2);
  const selectedIds = selectedWidgets.map(w => w.id).join(', ');
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面所有控件（供参考，了解上下文）：
${allJson}

当前选中的控件（需要你修改的，共 ${selectedWidgets.length} 个：${selectedIds}）：
${selectedJson}

请按以下要求**仅修改选中的控件**，保持其他控件不变：
"${instruction}"

输出要求：输出完整的选中控件 JSON 数组（只包含修改后的选中控件，不需要输出未选中的控件）。`;
}

/**
 * 场景B3：属性增量修改 - 可修改任意属性，支持删除控件
 * @param {Array} selectedWidgets - 选中的控件
 * @param {string} instruction - 用户的修改指令
 */
export function buildModifyPropsPrompt(screenWidth, screenHeight, selectedWidgets, instruction, mode = 'selected') {
  const selectedJson = JSON.stringify(selectedWidgets, null, 2);
  const selectedIds = selectedWidgets.map(w => w.id).join(', ');
  const contextLabel = mode === 'all' ? '当前页面所有控件' : '当前选中的控件';
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

${contextLabel}（共 ${selectedWidgets.length} 个：${selectedIds}）：
${selectedJson}

请按以下要求修改控件：
"${instruction}"

输出要求：
- 格式为对象，key 为控件 id，value 为要修改的属性对象
- 你可以修改控件的**任意属性**，包括位置(x,y)、尺寸(width,height)、颜色、文字、字号、状态、值等所有字段
- 若需更换控件类型，可修改 type 字段（必须是合法控件类型）
- 若需删除某控件，将其值设为 {"__delete": true}
- 只输出需要变更的控件，未列出的控件保持不变
- 示例：
  { "label1": { "textColor": "#FF0000", "fontSize": 20, "x": 10, "y": 20 }, "button1": { "text": "确定", "width": 100 }, "oldWidget": { "__delete": true } }`;
}

/**
 * 场景B4：添加控件 - 追加到现有页面
 * @param {Array} allWidgets - 当前页面所有控件（供参考）
 * @param {string} instruction - 用户的添加指令
 */
export function buildAddWidgetsPrompt(screenWidth, screenHeight, allWidgets, instruction) {
  const allJson = JSON.stringify(allWidgets, null, 2);
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面控件列表（供参考，了解现有布局）：
${allJson}

请在当前页面中添加以下控件：
"${instruction}"

输出要求：
- 只输出需要新增的控件 JSON 数组
- 不要输出已有的控件
- 新增控件的 id 不能与现有控件重复
- 新增控件的位置要合理，不要与现有控件重叠`;
}

/**
 * 场景C：分析/解释当前布局
 */
export function buildAnalyzePrompt(screenWidth, screenHeight, widgets) {
  const widgetsJson = JSON.stringify(widgets, null, 2);
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面控件列表（JSON）：
${widgetsJson}

请分析这个界面布局，指出可以改进的地方（配色、间距、层次感等），并给出具体建议。用简洁的中文回答。`;
}

/**
 * 场景D：解释生成的 SGL C 代码
 */
export function buildExplainCodePrompt(code) {
  return `请解释以下 SGL C 代码的功能和结构，用简洁的中文说明主要逻辑和各个控件的作用：

\`\`\`c
${code}
\`\`\``;
}

/**
 * 场景E：截图生成布局（多模态，需要传 image base64）
 */
export function buildImageToLayoutPrompt(screenWidth, screenHeight, description) {
  const text = description
    ? `屏幕尺寸：${screenWidth} x ${screenHeight} px\n请分析这张 UI 图片，并生成尽可能还原的 SGL 控件布局 JSON。\n用户补充说明：${description}`
    : `屏幕尺寸：${screenWidth} x ${screenHeight} px\n请分析这张 UI 图片，并生成尽可能还原的 SGL 控件布局 JSON。`;
  return text;
}

/**
 * 序列化当前页面控件（保留所有可视/可修改属性，让 AI 拥有完整上下文）
 * @param {Array} widgets - AppState 中的完整控件列表
 * @returns {Array} 序列化后的控件列表
 */
export function serializeWidgetsForAI(widgets) {
  // 内部/运行时字段不传给 AI
  const SKIP_FIELDS = new Set([
    'locked', 'zIndex', 'name', 'parentId', 'zOrder'
  ]);

  return widgets.map(w => {
    const slim = {};
    for (const key in w) {
      if (SKIP_FIELDS.has(key)) continue;
      const v = w[key];
      if (v === undefined || v === null || v === '') continue;
      // 跳过对象/数组中嵌套过深的运行时数据（vertices/options 等业务数据保留）
      slim[key] = v;
    }
    // 确保必需字段存在
    slim.type = w.type;
    slim.id = w.id;
    slim.x = w.x;
    slim.y = w.y;
    slim.width = w.width;
    slim.height = w.height;
    return slim;
  });
}

/**
 * 从 AI 响应文本中提取 JSON 数组
 * 优先级：```json代码块 > ```代码块 > 第一个[到最后一个]
 */
function extractJsonArray(raw) {
  const text = raw.trim();

  // 1. 优先找 ```json ... ``` 代码块
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const m of jsonBlocks) {
    const content = m[1].trim();
    if (content.startsWith('[') || content.startsWith('{')) {
      return content;
    }
  }

  // 2. 找普通 ``` ... ``` 代码块中看起来像 JSON 的
  const codeBlocks = [...text.matchAll(/```\s*([\s\S]*?)```/g)];
  for (const m of codeBlocks) {
    const content = m[1].trim();
    if ((content.startsWith('[') && content.includes(']')) ||
        (content.startsWith('{') && content.includes('}'))) {
      return content;
    }
  }

  // 3. 找第一个 [ 和最后一个 ] 之间的内容（数组）
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  // 4. 找第一个 { 和最后一个 }（兜底，对象格式）
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

/**
 * 解析并校验 AI 返回的 JSON
 * @param {string} raw - LLM 返回的原始文本
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {{ valid: boolean, widgets?: Array, errors?: string[] }}
 */
export function parseAndValidateAIResponse(raw, screenWidth, screenHeight) {
  const jsonStr = extractJsonArray(raw);

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    // 如果原始文本不包含 [ 或 {，说明 AI 返回的是纯文本，不是 JSON
    if (!raw.includes('[') && !raw.includes('{')) {
      return { valid: false, errors: [], widgets: [], meta: null, isTextOnly: true };
    }
    return { valid: false, errors: [`JSON 解析失败: ${e.message}`], widgets: [], meta: null };
  }

  let widgets = [];
  let meta = null;

  if (!Array.isArray(data) && typeof data === 'object') {
    if (Array.isArray(data.widgets)) {
      widgets = data.widgets;
    }
    if (data.meta && typeof data.meta === 'object') {
      meta = data.meta;
    }
  } else if (Array.isArray(data)) {
    widgets = data;
  }

  if (!Array.isArray(widgets)) {
    return { valid: false, errors: ['期望 JSON 数组格式'], meta };
  }

  const VALID_TYPES = getValidTypes();

  const errors = [];
  const idSet = new Set();
  const validated = [];

  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    const prefix = `控件[${i}]`;

    if (!w.type) {
      errors.push(`${prefix}: 缺少 type 字段`);
      continue;
    }
    if (!VALID_TYPES.includes(w.type)) {
      errors.push(`${prefix}: 未知控件类型 "${w.type}"`);
      continue;
    }
    if (!w.id) {
      errors.push(`${prefix}(${w.type}): 缺少 id`);
      continue;
    }
    if (idSet.has(w.id)) {
      errors.push(`${prefix}: 重复的 id "${w.id}"`);
    }
    idSet.add(w.id);

    const x = typeof w.x === 'number' ? w.x : parseInt(w.x);
    const y = typeof w.y === 'number' ? w.y : parseInt(w.y);
    const width = typeof w.width === 'number' ? w.width : parseInt(w.width);
    const height = typeof w.height === 'number' ? w.height : parseInt(w.height);

    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
      errors.push(`${w.id}: x/y/width/height 必须是数字`);
      continue;
    }
    if (width <= 0 || height <= 0) {
      errors.push(`${w.id}: width/height 必须大于 0`);
      continue;
    }

    validated.push({ ...w, x, y, width, height });
  }

  if (errors.length > 0) {
    return { valid: false, errors, widgets: validated, meta };
  }

  return { valid: true, widgets: validated, meta };
}

/**
 * 解析并校验属性增量修改的 AI 响应
 * @param {string} raw - AI 原始回复
 * @param {string[]} validIds - 合法的控件 id 列表
 * @returns {{ valid: boolean, modifications?: Object, errors?: string[] }}
 */
export function parseAndValidatePropsModification(raw, validIds) {
  const jsonStr = extractJsonObject(raw);

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    // 如果原始文本不包含 {，说明 AI 返回的是纯文本，不是 JSON
    if (!raw.includes('{')) {
      return { valid: false, errors: [], modifications: {}, isTextOnly: true };
    }
    return { valid: false, errors: [`JSON 解析失败: ${e.message}`] };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['期望对象格式 { id: { props } }'] };
  }

  const validIdSet = new Set(validIds);
  const errors = [];
  const modifications = {};

  for (const [id, props] of Object.entries(data)) {
    if (!validIdSet.has(id)) {
      errors.push(`未知控件 id: "${id}"`);
      continue;
    }
    if (typeof props !== 'object' || props === null || Array.isArray(props)) {
      errors.push(`${id}: 属性必须是对象`);
      continue;
    }
    // 删除控件标记直接保留，不参与属性过滤
    if (props.__delete === true) {
      modifications[id] = { __delete: true };
      continue;
    }
    // 允许修改任意属性（包括 type、x、y、width、height）
    const filtered = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === '__delete') continue; // __delete 已单独处理
      filtered[key] = value;
    }
    if (Object.keys(filtered).length > 0) {
      modifications[id] = filtered;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, modifications };
  }

  return { valid: true, modifications };
}

/**
 * 从文本中提取 JSON 对象（第一个 { 到最后一个 }）
 */
function extractJsonObject(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text.trim();
}
