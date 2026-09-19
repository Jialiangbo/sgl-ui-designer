# 交互预览改动记录

## 2026-09-01：阶段 1（重新实现）

本阶段只接入已有的预览 runtime，不修改画布布局、页面管理。

### `src/editor.js`

1. 扩展 import：`enterPreviewSimulator` / `exitPreviewSimulator` / `setPreviewDemoEnabled`
2. `_previewMode` 提前声明；`renderAll()` 预览态只刷 `previewRender`
3. 进出预览调用 simulator；演示动画默认关

---

## 2026-09-02：阶段 2 + 阶段 3

### 目标

- 阶段 2：预览壳 + 换页 + 布局重算 + 演示开关
- 阶段 3：属性面板提示 `preview:goto/set/toggle`（runtime 本已支持）

### 改动文件

| 文件 | 说明 |
|------|------|
| `src/editor.html` | `preview-toolbar` + `preview-stage` 包住 `preview-frame` |
| `src/styles.css` | 工具栏 / stage 纵向布局与样式 |
| `src/editor.js` | `bindPreviewLayoutWatcher`、←→ 换页；事件面板 preview 脚本提示 |
| `src/preview.js` | **未改核心逻辑**（复用已有 toolbar / navigate / executePreviewAction） |

### 阶段 2 明细

1. 工具栏：上一页 / 页名 / 下一页 / 演示:开|关
2. `enterPreviewMode`：`bindPreviewLayoutWatcher()`；演示仍默认关
3. 快捷键：预览中 ← → 调用 `navigatePreviewPage`（**不改** `AppState.currentPageId`）

### 阶段 3 明细

1. 事件回调输入框 placeholder / title / 底部说明支持：
   - `preview:goto:页面名`
   - `preview:set:控件变量:文本`
   - `preview:toggle:控件变量`
2. 不改变 C 代码生成：非 `preview:` 前缀仍按原回调名导出

### 明确未改

- 编辑画布缩放 / 平移 / 网格
- 默认页 / 新建页逻辑
- SGL 源码
- 新增控件类型

---

## 2026-09-02：预览换页与演示

### 改动

| 文件 | 说明 |
|------|------|
| `src/editor.html` | 移除 ←/→ 与「演示:关」按钮，仅保留页名标签 |
| `src/styles.css` | 工具栏居中；stage 支持滑动光标 |
| `src/editor.js` | 进入预览不再关闭演示；移除键盘 ←→ 换页 |
| `src/preview.js` | 左右滑动换页；进入预览自动开启演示动画 |

### 交互

1. **换页**：在预览区域左右滑动（左滑下一页，右滑上一页）；控件拖拽时不触发换页
2. **演示**：进入预览即开启波形/仪表等演示动画，无需手动开关
3. **退出**：Esc 或再次 F5
