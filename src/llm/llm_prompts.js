// ============ SGL UI Designer - AI 提示词构建器 ============
// 负责：构建 System Prompt、User Prompt 模板
// 设计原则：精简 Token、只列常用属性、未列属性用默认值

/**
 * 系统提示词（优化版，支持页面参数和资源管理）
 */
export function buildSystemPrompt() {
  return `你是 SGL UI Designer 的 AI 设计助手。请帮用户设计嵌入式设备的界面布局。

## 回复规则
- 当用户要求**生成、创建、修改、优化界面布局**时，输出 JSON 格式的控件布局（见下方输出格式）。
- 当用户提到**屏幕尺寸、分辨率、页面参数、背景色、资源管理**时，输出包含 meta 对象的 JSON（见下方输出格式），无需输出 widgets。
- 当用户只是**提问、闲聊、咨询**（如"你好"、"什么是SGL"、"帮我解释一下"等）时，直接用中文纯文本回复，不要输出 JSON。
- 判断标准：用户的意图是否涉及"修改画布或在画布上添加/修改控件"。如果是→输出JSON；否则→纯文本回复。

## 本地文件访问
当用户消息中包含本地文件路径（如 E:\\xxx\\fonts）时，系统会自动扫描该目录并将文件列表附加到消息末尾（以 [本地路径扫描] 标记）。你可以直接使用这些文件信息来添加资源或生成控件，无需告知用户"无法访问本地文件"。

## 控件参考（仅列出常用属性，未列出的使用默认值）

### 基础形状
rect(bgColor,borderColor,borderWidth,radius,alpha) — 矩形
circle(color,borderColor,borderWidth,radius) — 圆形
ring(color,radiusIn,radiusOut) — 圆环（外径>内径）
arc(color,startAngle,endAngle,radiusIn,radiusOut) — 弧形
line(color,lineWidth) — 直线
polygon(fillColor,borderColor,borderWidth,vertices) — 多边形，vertices格式"x1,y1;x2,y2;..."

### 交互控件
button(text,textColor,color,borderColor,borderWidth,radius,align,fontSize) — 按钮
switch(status,onColor,bgColor,knobColor) — 开关（status为true/false）
checkbox(text,status,textColor,boxColor,checkColor,fontSize) — 复选框
slider(value,fillColor,trackColor,knobColor) — 滑块（value 0-100）
dropdown(options,textColor,bgColor,borderColor,fontSize) — 下拉框
numberkbd(cellColor,btnColor,textColor,fontSize) — 数字键盘
keyboard(cellColor,btnColor,textColor,fontSize) — 全键盘

### 文本控件
label(text,textColor,bgColor,align,fontSize) — 标签。注意：bgColor默认为透明(transparent)，仅当用户明确要求标签有背景色时才设置bgColor，否则不要输出bgColor字段
textbox(text,textColor,bgColor,borderColor,borderWidth,radius,fontSize) — 文本输入框
textline(text,textColor,bgColor,fontSize) — 文本行
textlist(options,textColor,selectedColor,bgColor,fontSize) — 文本列表
arc_label(text,textColor,bgColor,radius,fontSize) — 弧形文本

### 显示控件
progress(value,fillColor,trackColor,borderColor,borderWidth,radius) — 进度条（value 0-100）
bar(value,barColor,bgColor,borderColor) — 柱状条
gauge(value,arcColor,scaleColor,pointerColor,textColor,fontSize) — 仪表盘
spectrum(barColor,barNum) — 频谱
battery(level,fillColor,borderColor) — 电池（level 0-100）
led(status,onColor,offColor,radius) — LED指示灯
analogclock(hourPtrColor,minPtrColor,secPtrColor,bgColor) — 模拟时钟
chart(chartType,seriesColors,bgColor,borderColor,textColor,fontSize) — 图表（linechart/barchart/piechart）

### 容器与特殊控件
viewlist — 视图列表（滚动容器）
scroll — 滚动条
box — 容器（带边框和焦点）
win(titleText,titleBgColor,color,borderColor,radius,fontSize) — 窗口
canvas — 画布（自定义绘制）
2dball — 2D球动画
sprite — 精灵动画
statusbar(bgColor,leftSlots,rightSlots,fontSize) — 状态栏

### 图像控件
icon(icon,color,align) — 图标
ext_img(pixmap,pixmapFormat) — 外部图片
qrcode(qrText,cellColor,bgColor) — 二维码
msgbox(titleText,msgText,leftBtnText,rightBtnText,bgColor,borderColor,radius) — 消息框

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

## 设计约束（必须遵守）
1. id 格式：{type}{序号}，同类型不可重复（如 rect1, rect2）
2. 所有控件必须在屏幕范围内，不可超出边界
3. 控件间距≥8px，屏幕边距≥12px
4. 配色协调，主色不超过3种，页面背景色使用深色系（如 #1e1e2e, #252536）
5. 文本控件（label/textbox/textline）的背景色默认透明，不要设置bgColor为黑色或深色，除非用户明确要求
6. 字号：标题18-24px，正文12-16px，辅助文字10-12px
7. 控件尺寸合理：按钮高度≥40px，输入框高度≥36px
8. 优先使用 rect 作为背景卡片，再放置其他控件
9. 圆形/圆环控件宽度和高度应相同（正方形）`;
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
 * 场景B3：属性增量修改 - 只输出变更的属性
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

请按以下要求修改控件的属性：
"${instruction}"

输出要求：
- 只输出需要修改的属性，不要输出完整控件 JSON
- 格式为对象，key 为控件 id，value 为要修改的属性对象
- 例如：{ "label1": { "textColor": "#FF0000", "fontSize": 20 }, "button1": { "text": "新文字" } }
- 不需要修改的属性不要输出
- 不要输出 type、id、x、y、width、height 这些基础属性（除非用户明确要求修改位置或大小）`;
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
 * 精简序列化当前页面控件（只保留 AI 需要的字段，减少 Token 消耗）
 * @param {Array} widgets - AppState 中的完整控件列表
 * @returns {Array} 精简后的控件列表
 */
export function serializeWidgetsForAI(widgets) {
  // 需要保留的关键字段
  const KEY_FIELDS = new Set([
    'type', 'id', 'name', 'x', 'y', 'width', 'height',
    'text', 'textColor', 'bgColor', 'color', 'borderColor', 'borderWidth',
    'radius', 'alpha', 'fontSize', 'align', 'value', 'status',
    'fillColor', 'trackColor', 'onColor', 'knobColor',
    'startAngle', 'endAngle', 'radiusIn', 'radiusOut',
    'options', 'vertices', 'lineWidth',
    'pixmap', 'pixmapFormat', 'parentId', 'zOrder'
  ]);

  return widgets.map(w => {
    const slim = {};
    for (const key of KEY_FIELDS) {
      if (w[key] !== undefined && w[key] !== null && w[key] !== '') {
        slim[key] = w[key];
      }
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

  const VALID_TYPES = [
    'rect', 'circle', 'ring', 'arc', 'line', 'polygon',
    'button', 'switch', 'checkbox', 'slider', 'numberkbd', 'keyboard', 'dropdown', 'roller',
    'label', 'textbox', 'textline', 'textlist', 'arc_label',
    'progress', 'bar', 'gauge', 'spectrum', 'battery', 'led', 'analogclock', 'chart', 'scope',
    'icon', 'msgbox', 'ext_img', 'img', 'qrcode',
    'viewlist', 'scroll', 'box', 'win', 'canvas', '2dball', 'sprite',
    'statusbar', 'launcher'
  ];

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
    // 过滤掉不允许修改的基础属性
    const filtered = {};
    for (const [key, value] of Object.entries(props)) {
      if (['type'].includes(key)) continue; // type 不允许修改
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
