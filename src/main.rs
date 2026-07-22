#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;

use serde::{Deserialize, Deserializer, Serialize};
use base64::Engine;
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Widget {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(rename = "type")]
    widget_type: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    text: Option<String>,
    color: Option<String>,
    #[serde(default, rename = "bgColor")]
    bg_color: Option<String>,
    #[serde(rename = "borderColor")]
    border_color: Option<String>,
    #[serde(rename = "borderWidth")]
    border_width: Option<i32>,
    #[serde(rename = "borderAlpha")]
    border_alpha: Option<i32>,
    #[serde(rename = "mainAlpha")]
    main_alpha: Option<i32>,
    radius: Option<i32>,
    #[serde(rename = "tlRadius")]
    tl_radius: Option<i32>,
    #[serde(rename = "trRadius")]
    tr_radius: Option<i32>,
    #[serde(rename = "blRadius")]
    bl_radius: Option<i32>,
    #[serde(rename = "brRadius")]
    br_radius: Option<i32>,
    alpha: Option<i32>,
    pixmap: Option<String>,
    #[serde(rename = "pixmapFormat", default)]
    pixmap_format: Option<String>,
    #[serde(rename = "fontSize")]
    font_size: Option<i32>,
    #[serde(rename = "fontFamily")]
    font_family: Option<String>,
    #[serde(rename = "fontBpp")]
    font_bpp: Option<i32>,
    align: Option<String>,
    value: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_bool_or_string")]
    status: Option<bool>,
    src: Option<String>,
    direct: Option<i32>,
    #[serde(rename = "fillColor")]
    fill_color: Option<String>,
    #[serde(rename = "trackColor")]
    track_color: Option<String>,
    #[serde(rename = "knobColor")]
    knob_color: Option<String>,
    #[serde(rename = "textColor")]
    text_color: Option<String>,
    #[serde(rename = "boxColor", default)]
    box_color: Option<String>,
    #[serde(rename = "checkColor", default)]
    check_color: Option<String>,
    #[serde(rename = "onColor")]
    on_color: Option<String>,
    #[serde(rename = "knobMargin")]
    knob_margin: Option<i32>,
    #[serde(rename = "textOffsetX")]
    text_offset_x: Option<i32>,
    #[serde(rename = "textOffsetY")]
    text_offset_y: Option<i32>,
    #[serde(rename = "textRotation")]
    text_rotation: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_bool_or_string")]
    dashed: Option<bool>,
    #[serde(default, rename = "dashLen")]
    dash_len: Option<i32>,
    #[serde(default, rename = "gapLen")]
    gap_len: Option<i32>,
    #[serde(rename = "fillGap")]
    fill_gap: Option<i32>,
    #[serde(rename = "fillRadius")]
    fill_radius: Option<i32>,
    thickness: Option<i32>,
    #[serde(rename = "xOffset")]
    x_offset: Option<i32>,
    #[serde(rename = "yOffset")]
    y_offset: Option<i32>,
    #[serde(rename = "radiusIn")]
    radius_in: Option<i32>,
    #[serde(rename = "radiusOut")]
    radius_out: Option<i32>,
    #[serde(rename = "startAngle")]
    start_angle: Option<i32>,
    #[serde(rename = "endAngle")]
    end_angle: Option<i32>,
    #[serde(rename = "eventCb")]
    event_cb: Option<String>,
    #[serde(rename = "parentId", default)]
    parent_id: Option<String>,
    #[serde(default)]
    locked: Option<bool>,
    #[serde(default)]
    x1: Option<i32>,
    #[serde(default)]
    y1: Option<i32>,
    #[serde(default)]
    x2: Option<i32>,
    #[serde(default)]
    y2: Option<i32>,
    #[serde(rename = "lineWidth", default)]
    line_width: Option<i32>,
    #[serde(default)]
    vertices: Option<String>,
    #[serde(default)]
    options: Option<String>,
    // spectrum 控件属性
    #[serde(default, rename = "barColor")]
    bar_color: Option<String>,
    #[serde(default, rename = "barHatColor")]
    bar_hat_color: Option<String>,
    #[serde(default, rename = "barNum")]
    bar_num: Option<i32>,
    #[serde(default, rename = "barMode")]
    bar_mode: Option<i32>,
    #[serde(default, rename = "barHatHeight")]
    bar_hat_height: Option<i32>,
    #[serde(default, rename = "barValues")]
    bar_values: Option<String>,
    #[serde(default, rename = "bindTarget")]
    bind_target: Option<String>,
    // statusbar 控件属性
    #[serde(default, rename = "bgAlpha")]
    statusbar_bg_alpha: Option<i32>,
    #[serde(default, rename = "leftMargin")]
    left_margin: Option<i32>,
    #[serde(default, rename = "rightMargin")]
    right_margin: Option<i32>,
    #[serde(default, rename = "slotSpace")]
    slot_space: Option<i32>,
    #[serde(default, rename = "leftSlots")]
    left_slots: Option<String>,
    #[serde(default, rename = "rightSlots")]
    right_slots: Option<String>,
    #[serde(default, rename = "slotColor")]
    slot_color: Option<String>,
    #[serde(default, rename = "slotAlpha")]
    slot_alpha: Option<i32>,
    // canvas 控件属性
    #[serde(default, rename = "painterCb")]
    painter_cb: Option<String>,
    #[serde(default, rename = "privateData")]
    private_data: Option<String>,
    // ext_img 控件属性
    #[serde(default)]
    rotation: Option<i32>,
    #[serde(default, rename = "scaleUniform")]
    scale_uniform: Option<i32>,
    #[serde(default, rename = "pivotX")]
    pivot_x: Option<i32>,
    #[serde(default, rename = "pivotY")]
    pivot_y: Option<i32>,
    #[serde(default, rename = "readOps")]
    read_ops: Option<String>,
    // icon 控件属性
    #[serde(default)]
    icon: Option<String>,
    // qrcode 控件属性
    #[serde(default, rename = "qrText")]
    qr_text: Option<String>,
    #[serde(default, rename = "cellColor")]
    cell_color: Option<String>,
    #[serde(default, rename = "cellRadius")]
    cell_radius: Option<i32>,
    #[serde(default)]
    zone: Option<i32>,
    #[serde(default)]
    scale: Option<i32>,
    #[serde(default)]
    version: Option<i32>,
    #[serde(default)]
    ecc: Option<i32>,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default, rename = "logoRadius")]
    logo_radius: Option<i32>,
    // msgbox 控件属性
    #[serde(default, rename = "msgText")]
    msg_text: Option<String>,
    #[serde(default, rename = "leftBtnText")]
    left_btn_text: Option<String>,
    #[serde(default, rename = "rightBtnText")]
    right_btn_text: Option<String>,
    // win 控件属性
    #[serde(default, rename = "titleText")]
    title_text: Option<String>,
    #[serde(default, rename = "titleBgColor")]
    title_bg_color: Option<String>,
    #[serde(default, rename = "titleTextColor")]
    title_text_color: Option<String>,
    #[serde(default, rename = "closeBtnColor")]
    close_btn_color: Option<String>,
    #[serde(default, rename = "titleHeight")]
    title_height: Option<i32>,
    #[serde(default, rename = "titleAlign")]
    title_align: Option<String>,
    // arc_label 控件属性
    #[serde(default)]
    angle: Option<i32>,
    #[serde(default, rename = "offsetX")]
    arc_label_offset_x: Option<i32>,
    #[serde(default, rename = "offsetY")]
    arc_label_offset_y: Option<i32>,
    #[serde(default, rename = "bgFlag")]
    arc_label_bg_flag: Option<bool>,
    // numberkbd 控件属性
    #[serde(default, rename = "btnMargin")]
    btn_margin: Option<i32>,
    #[serde(default, rename = "btnColor")]
    btn_color: Option<String>,
    #[serde(default, rename = "btnBorderWidth")]
    btn_border_width: Option<i32>,
    #[serde(default, rename = "btnBorderColor")]
    btn_border_color: Option<String>,
    #[serde(default, rename = "btnRadius")]
    btn_radius: Option<i32>,
    // chart 控件属性
    #[serde(default, rename = "chartType")]
    chart_type: Option<String>,
    #[serde(default, rename = "seriesCount")]
    series_count: Option<i32>,
    #[serde(default, rename = "seriesData")]
    series_data: Option<String>,
    #[serde(default, rename = "seriesColors")]
    series_colors: Option<String>,
    #[serde(default, rename = "seriesLineAlpha")]
    series_line_alpha: Option<String>,
    #[serde(default, rename = "seriesLineWidth")]
    series_line_width: Option<String>,
    #[serde(default, rename = "xLabels")]
    x_labels: Option<String>,
    #[serde(default, rename = "barSpacing")]
    bar_spacing: Option<i32>,
    #[serde(default)]
    orientation: Option<i32>,
    #[serde(default, rename = "openAnim")]
    open_anim: Option<bool>,
    #[serde(default, rename = "openAnimDir")]
    open_anim_dir: Option<i32>,
    #[serde(default, rename = "openAnimDuration")]
    open_anim_duration: Option<i32>,
    #[serde(default, rename = "innerRadiusRate")]
    inner_radius_rate: Option<i32>,
    #[serde(default, rename = "sliceAlpha")]
    slice_alpha: Option<String>,
    #[serde(default)]
    smooth: Option<bool>,
    #[serde(default, rename = "legendEnable")]
    legend_enable: Option<bool>,
    #[serde(default, rename = "legendPos")]
    legend_pos: Option<i32>,
    #[serde(default, rename = "legendDir")]
    legend_dir: Option<i32>,
    #[serde(default, rename = "legendTextColor")]
    legend_text_color: Option<String>,
    #[serde(default, rename = "legendAreaSize")]
    legend_area_size: Option<i32>,
    #[serde(default, rename = "legendAlpha")]
    legend_alpha: Option<i32>,
    #[serde(default, rename = "legendBoxSize")]
    legend_box_size: Option<i32>,
    #[serde(default, rename = "legendPadding")]
    legend_padding: Option<i32>,
    #[serde(default, rename = "legendItemGap")]
    legend_item_gap: Option<i32>,
    #[serde(default, rename = "legendBg")]
    legend_bg: Option<bool>,
    #[serde(default, rename = "legendBgColor")]
    legend_bg_color: Option<String>,
    #[serde(default, rename = "legendBorderColor")]
    legend_border_color: Option<String>,
    #[serde(default, rename = "sliceCount")]
    slice_count: Option<i32>,
    #[serde(default, rename = "sliceValues")]
    slice_values: Option<String>,
    #[serde(default, rename = "sliceColors")]
    slice_colors: Option<String>,
    #[serde(default, rename = "sliceLabels")]
    slice_labels: Option<String>,
    #[serde(default, rename = "gridColor")]
    grid_color: Option<String>,
    #[serde(default, rename = "gridDashed")]
    grid_dashed: Option<bool>,
    #[serde(default, rename = "minValue")]
    min_value: Option<i32>,
    #[serde(default, rename = "maxValue")]
    max_value: Option<i32>,
    #[serde(default, rename = "autoScale")]
    auto_scale: Option<bool>,
    #[serde(default, rename = "showYLabels")]
    show_y_labels: Option<bool>,
}

// 兼容前端传来的字符串布尔值（"true"/"false"）
fn deserialize_bool_or_string<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum BoolOrString {
        Bool(bool),
        String(String),
    }

    match Option::<BoolOrString>::deserialize(deserializer)? {
        None => Ok(None),
        Some(BoolOrString::Bool(b)) => Ok(Some(b)),
        Some(BoolOrString::String(s)) => {
            let lower = s.to_lowercase();
            if lower == "true" {
                Ok(Some(true))
            } else if lower == "false" {
                Ok(Some(false))
            } else {
                Err(D::Error::custom(format!("expected boolean string: {}", s)))
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Page {
    id: String,
    name: String,
    width: i32,
    height: i32,
    bg_color: String,
    #[serde(default)]
    pixmap: Option<String>,
    #[serde(default, rename = "pixmapFormat")]
    pixmap_format: Option<String>,
    #[serde(default)]
    alpha: Option<u8>,
    widgets: Vec<Widget>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ResourceItem {
    name: String,
    #[serde(default)]
    path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Resources {
    fonts: Vec<ResourceItem>,
    images: Vec<ResourceItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct SglConfig {
    #[serde(rename = "fbdev_pixel_depth", default)]
    fbdev_pixel_depth: i32,
    #[serde(rename = "fbdev_rotation", default)]
    fbdev_rotation: i32,
    #[serde(rename = "fbdev_runtime_rotation", default)]
    fbdev_runtime_rotation: i32,
    #[serde(rename = "fbdev_even_coords", default)]
    fbdev_even_coords: i32,
    #[serde(rename = "use_fbdev_vram", default)]
    use_fbdev_vram: i32,
    #[serde(rename = "systick_ms", default)]
    systick_ms: i32,
    #[serde(rename = "event_queue_size", default)]
    event_queue_size: i32,
    #[serde(rename = "dirty_area_num_max", default)]
    dirty_area_num_max: i32,
    #[serde(rename = "color16_swap", default)]
    color16_swap: i32,
    #[serde(rename = "animation", default)]
    animation: i32,
    #[serde(rename = "debug", default)]
    debug: i32,
    #[serde(rename = "log_color", default)]
    log_color: i32,
    #[serde(rename = "log_level", default)]
    log_level: i32,
    #[serde(rename = "obj_use_name", default)]
    obj_use_name: i32,
    #[serde(rename = "font_compressed", default)]
    font_compressed: i32,
    #[serde(rename = "boot_logo", default)]
    boot_logo: i32,
    #[serde(rename = "theme_dark", default)]
    theme_dark: i32,
    #[serde(rename = "heap_algo", default)]
    heap_algo: String,
    #[serde(rename = "heap_memory_size", default)]
    heap_memory_size: i32,
    #[serde(rename = "label_rotation", default)]
    label_rotation: i32,
    #[serde(rename = "font_song23", default)]
    font_song23: i32,
    #[serde(rename = "font_consolas14", default)]
    font_consolas14: i32,
    #[serde(rename = "font_consolas23", default)]
    font_consolas23: i32,
    #[serde(rename = "font_consolas24", default)]
    font_consolas24: i32,
    #[serde(rename = "font_consolas32", default)]
    font_consolas32: i32,
    #[serde(rename = "font_consolas24_compress", default)]
    font_consolas24_compress: i32,
    #[serde(rename = "focused_color", default = "default_focused_color")]
    focused_color: String,
    #[serde(rename = "focused_width", default = "default_focused_width")]
    focused_width: i32,
    #[serde(rename = "dirty_area_trace", default)]
    dirty_area_trace: i32,
    #[serde(rename = "dirty_area_trace_color", default = "default_dirty_area_trace_color")]
    dirty_area_trace_color: String,
    #[serde(rename = "monitor_trace", default)]
    monitor_trace: i32,
    #[serde(rename = "pixmap_bilinear_interp", default)]
    pixmap_bilinear_interp: i32,
    #[serde(rename = "font_small_table", default)]
    font_small_table: i32,
}

fn default_focused_color() -> String {
    "#00FF00".to_string()
}

fn default_focused_width() -> i32 {
    1
}

fn default_dirty_area_trace_color() -> String {
    "#000000".to_string()
}

/// 将 sgl_rgb(0xRR, 0xGG, 0xBB) 格式解析为 #RRGGBB hex 字符串
/// 解析失败时返回 default_hex
fn parse_sgl_rgb_to_hex(value: &str, default_hex: &str) -> String {
    // 提取括号内部分
    let inner = match value.find('(') {
        Some(i) => &value[i + 1..],
        None => return default_hex.to_string(),
    };
    let inner = match inner.rfind(')') {
        Some(i) => &inner[..i],
        None => return default_hex.to_string(),
    };
    // 按逗号分割，解析三个分量
    let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
    if parts.len() != 3 {
        return default_hex.to_string();
    }
    let parse_component = |s: &str| -> u8 {
        let s = s.trim();
        if s.starts_with("0x") || s.starts_with("0X") {
            u8::from_str_radix(&s[2..], 16).unwrap_or(0)
        } else {
            s.parse::<u8>().unwrap_or(0)
        }
    };
    let r = parse_component(parts[0]);
    let g = parse_component(parts[1]);
    let b = parse_component(parts[2]);
    format!("#{:02X}{:02X}{:02X}", r, g, b)
}

/// 将 #RRGGBB hex 字符串转换为 sgl_rgb(0xRR, 0xGG, 0xBB) 格式
fn hex_to_sgl_rgb(hex: &str) -> String {
    if hex.len() != 7 || !hex.starts_with('#') {
        return "sgl_rgb(0x00, 0x00, 0x00)".to_string();
    }
    let r = u8::from_str_radix(&hex[1..3], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[3..5], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[5..7], 16).unwrap_or(0);
    format!("sgl_rgb(0x{:02X}, 0x{:02X}, 0x{:02X})", r, g, b)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct AsciiFontConfig {
    #[serde(rename = "name")]
    name: String,
    #[serde(rename = "size", default)]
    size: i32,
    #[serde(rename = "bpp", default)]
    bpp: i32,
    #[serde(rename = "compress", default)]
    compress: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Project {
    name: String,
    version: String,
    #[serde(rename = "color_depth")]
    color_depth: String,
    #[serde(rename = "screen_width")]
    screen_width: i32,
    #[serde(rename = "screen_height")]
    screen_height: i32,
    pages: Vec<Page>,
    #[serde(default = "default_resources")]
    resources: Resources,
    #[serde(default)]
    ascii_fonts: Vec<AsciiFontConfig>,
    #[serde(default)]
    sgl_config: SglConfig,
}

fn default_resources() -> Resources {
    Resources {
        fonts: vec![],
        images: vec![],
    }
}

fn sanitize_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect()
}

// 根据图片路径和格式生成合法的 C 变量名（用于 sgl_pixmap_t* 引用）
fn pixmap_var_name(pixmap_path: &str, format: &str) -> String {
    let normalized = pixmap_path.replace('\\', "/");
    let base = normalized.rsplit('/').next().unwrap_or(pixmap_path);
    let stem = base.rsplit_once('.').map(|(s, _)| s).unwrap_or(base);
    let sanitized: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    let sanitized = if sanitized.starts_with(|c: char| c.is_numeric()) {
        format!("_{}", sanitized)
    } else {
        sanitized
    };
    format!("pixmap_{}_{}", sanitized, format.replace('-', "_"))
}

fn icon_var_name(icon_path: &str) -> String {
    let normalized = icon_path.replace('\\', "/");
    let base = normalized.rsplit('/').next().unwrap_or(icon_path);
    let stem = base.rsplit_once('.').map(|(s, _)| s).unwrap_or(base);
    let sanitized: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    let sanitized = if sanitized.starts_with(|c: char| c.is_numeric()) {
        format!("_{}", sanitized)
    } else {
        sanitized
    };
    format!("icon_{}", sanitized)
}

fn sgl_color(hex: &str) -> String {
    if hex.is_empty() || !hex.starts_with('#') || hex.len() != 7 {
        return "SGL_COLOR_BLACK".to_string();
    }
    let r = u8::from_str_radix(&hex[1..3], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[3..5], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[5..7], 16).unwrap_or(0);
    format!("sgl_rgb({}, {}, {})", r, g, b)
}

fn resolve_font_path(family: &str) -> Option<String> {
    // "default" 不需要生成字模
    if family == "default" {
        return None;
    }
    // 如果已经是完整路径（包含路径分隔符），直接使用
    if family.contains('/') || family.contains('\\') {
        return Some(family.to_string());
    }
    // 内置字体：在系统字体目录中查找
    let sys_font_dirs = [
        std::path::PathBuf::from("C:/Windows/Fonts"),
    ];
    for dir in &sys_font_dirs {
        let p = dir.join(family);
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    // 找不到则返回文件名（让 sgl_font_conv 自己尝试查找）
    Some(family.to_string())
}

fn collect_fonts(project: &Project) -> Vec<(String, String, i32, i32, i32, String)> {
    // (font_name, font_path, size, bpp, compress, symbols)
    use std::collections::{HashMap, HashSet};
    // 控件字体默认不压缩，ASCII 字模配置可独立指定 compress
    let mut map: HashMap<(String, i32, i32, i32), (String, HashSet<char>)> = HashMap::new();

    // 可打印 ASCII 字符（0x20-0x7E）
    const ASCII_SYMBOLS: &str = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

    for page in &project.pages {
        for w in &page.widgets {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let bpp = w.font_bpp.unwrap_or(4);
                // 控件字体默认不压缩
                let compress = 0;
                // 提取文件名用于去重
                let font_name = fam.replace('\\', "/").rsplit('/').next().unwrap_or(fam).to_string();
                // 跳过 "default" 字体
                if font_name == "default" {
                    continue;
                }
                // 解析字体文件路径
                let font_path = resolve_font_path(fam).unwrap_or_else(|| fam.clone());
                let entry = map
                    .entry((font_name.clone(), sz, bpp, compress))
                    .or_insert((font_path, HashSet::new()));
                // 收集该控件使用的文本字符
                if let Some(ref text) = w.text {
                    for ch in text.chars() {
                        // 跳过控制字符，但保留普通空格
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // dropdown/roller/textlist 使用 options 作为显示文本
                if let Some(ref opts) = w.options {
                    for ch in opts.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // win 使用 titleText 作为标题文本
                if let Some(ref title) = w.title_text {
                    for ch in title.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // numberkbd 用 char-31 作为字体表索引直接访问（sgl_numberkbd.c: kbd_digits[r][c] - 31）
                // 绕过 sgl_search_unicode_ch_index，要求字体表包含完整 ASCII 字符集
                // 因此收集完整 ASCII_SYMBOLS，与手动添加 ASCII 字模配置效果一致
                if w.widget_type == "numberkbd" {
                    for ch in ASCII_SYMBOLS.chars() {
                        entry.1.insert(ch);
                    }
                }
                // keyboard 内部固定字符表（3种模式所有按键文本）
                // UPPER: QWERTYUIOPASDFGHJKLZXCVBNM
                // LOWER: qwertyuiopasdfghjklzxcvbnm
                // SPEC: 1234567890+-/*=%!?#\<>@${}[];"'
                // 通用: _-.,:1# (多字符按键 "1#" 中的字符)
                if w.widget_type == "keyboard" {
                    for ch in "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890_-.,:+-/*=%!?#<>\\@${}[];\"'".chars() {
                        entry.1.insert(ch);
                    }
                }
                // msgbox 使用 msgText / leftBtnText / rightBtnText 作为文本
                if let Some(ref msg) = w.msg_text {
                    for ch in msg.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                if let Some(ref left) = w.left_btn_text {
                    for ch in left.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                if let Some(ref right) = w.right_btn_text {
                    for ch in right.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
            }
        }
    }

    // 为设置列表中的资源配置生成 ASCII 字符集
    // 每项可独立指定字体、字号、bpp、compress；如果控件中已使用同字体同尺寸同压缩，则合并 ASCII 字符
    let ascii_chars: Vec<char> = ASCII_SYMBOLS.chars().collect();
    for cfg in &project.ascii_fonts {
        let Some(res) = project.resources.fonts.iter().find(|f| {
            f.name == cfg.name || f.path == cfg.name
        }) else {
            continue;
        };
        let font_name = res.name.replace('\\', "/").rsplit('/').next().unwrap_or(&res.name).to_string();
        if font_name == "default" {
            continue;
        }
        let font_path = resolve_font_path(&res.path)
            .or_else(|| resolve_font_path(&res.name))
            .unwrap_or_else(|| res.path.clone());
        let sz = if cfg.size > 0 { cfg.size } else { 16 };
        let bpp = if cfg.bpp > 0 { cfg.bpp } else { 4 };
        let compress = if cfg.compress > 0 { 1 } else { 0 };
        let entry = map
            .entry((font_name, sz, bpp, compress))
            .or_insert((font_path, HashSet::new()));
        for ch in &ascii_chars {
            entry.1.insert(*ch);
        }
    }

    map.into_iter()
        .map(|((name, sz, bpp, compress), (path, set))| {
            let symbols: String = set.into_iter().collect();
            (name, path, sz, bpp, compress, symbols)
        })
        .filter(|(_, _, _, _, _, symbols)| !symbols.is_empty())
        .collect()
}

fn font_id_from_family(family: &str, size: i32, bpp: i32, compress: i32) -> String {
    // 从完整路径提取文件名用于生成 font_id
    let binding = family.replace('\\', "/");
    let name = binding.rsplit('/').next().unwrap_or(family);
    let clean: String = name.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    let compress_suffix = if compress > 0 { "_compress" } else { "" };
    format!("sgl_font_{}_{}_bpp{}{}", clean, size, bpp, compress_suffix)
}

fn font_filename(family: &str, size: i32, bpp: i32, compress: i32) -> String {
    let clean: String = family.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    let compress_suffix = if compress > 0 { "_compress" } else { "" };
    format!("sgl_font_{}_{}_bpp{}{}.c", clean, size, bpp, compress_suffix)
}

/// 确保 sgl-port 的 CMakeLists.txt 会自动收集 demo/fonts/*.c 字模源文件
/// 返回是否修改了文件
fn ensure_cmake_fonts_glob(cmake_path: &std::path::Path) -> Result<bool, String> {
    if !cmake_path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(cmake_path)
        .map_err(|e| format!("读取 CMakeLists.txt 失败: {}", e))?;

    // 已包含 demo/fonts 字模源文件收集逻辑则跳过
    if content.contains("DEMO_FONT_SOURCES") || content.contains("${DEMO_DIR}/fonts/*.c") {
        return Ok(false);
    }

    // 在 set(DEMO_SOURCES ...) 结束后的位置插入
    if let Some(start) = content.find("set(DEMO_SOURCES") {
        if let Some(end) = content[start..].find("\n)") {
            let pos = start + end + 2;
            let insert = "\n# Auto-generated: include font bitmap sources\nfile(GLOB DEMO_FONT_SOURCES ${DEMO_DIR}/fonts/*.c)\nlist(APPEND DEMO_SOURCES ${DEMO_FONT_SOURCES})\n";
            let new_content = format!("{}{}{}", &content[..pos], insert, &content[pos..]);
            std::fs::write(cmake_path, new_content)
                .map_err(|e| format!("写入 CMakeLists.txt 失败: {}", e))?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn run_font_conv(
    conv: &str,
    name: &str,
    path: &str,
    sz: i32,
    bpp: i32,
    compress: i32,
    symbols: &str,
    fonts_dir: &std::path::Path,
) -> Result<(), String> {
    // 字体文件名不能包含中文或特殊字符
    if has_non_ascii(name) {
        return Err(format!("字体文件名不能包含中文或特殊字符: {}", name));
    }

    // 使用清理后的字体文件名，避免空格等特殊字符导致 sgl_font_conv 解析失败
    let clean_name: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();

    // 将原始字体文件复制到 fonts_dir 并使用清理后的文件名
    let src_path = std::path::Path::new(path);
    let temp_font_path = fonts_dir.join(&clean_name);
    if src_path != temp_font_path.as_path() {
        std::fs::copy(src_path, &temp_font_path)
            .map_err(|e| format!("复制字体文件 {} 失败: {}", path, e))?;
    }

    // 压缩字体文件名添加 _compress 后缀以区分
    let compress_suffix = if compress > 0 { "_compress" } else { "" };
    let out_file = fonts_dir.join(format!("sgl_font_{}_{}_bpp{}{}.c", clean_name, sz, bpp, compress_suffix));
    let out_str = out_file.to_string_lossy().to_string();
    let font_arg = temp_font_path.to_string_lossy().to_string();

    let mut cmd = std::process::Command::new(conv);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x08000000): 隐藏控制台窗口，避免 sgl_font_conv.exe 弹出黑窗
        cmd.creation_flags(0x08000000);
    }
    cmd.arg("--font").arg(&font_arg)
        .arg("--size").arg(sz.to_string())
        .arg("--bpp").arg(bpp.to_string())
        .arg("--output").arg(&out_str);

    // 启用 RLE 压缩（仅 bpp 2/4 有效）
    if compress > 0 {
        cmd.arg("--compress");
    }

    if !symbols.is_empty() {
        let symbols_file = fonts_dir.join(format!("symbols_{}_{}_bpp{}{}.txt", clean_name, sz, bpp, compress_suffix));
        std::fs::write(&symbols_file, symbols)
            .map_err(|e| format!("写入 symbols 文件失败: {}", e))?;
        cmd.arg("--symbols-file").arg(&symbols_file);
    }

    let output = cmd.output().map_err(|e| format!("调用 sgl_font_conv 失败: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "sgl_font_conv 返回非零状态 {:?}\nstdout: {}\nstderr: {}",
            output.status.code(), stdout, stderr
        ))
    }
}

// ============ 图片取模 / pixmap 生成 ============

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum PixmapFormat {
    RGB332,
    ARGB2222,
    RGB565,
    ARGB4444,
    RGB888,
    ARGB8888,
    RLE_RGB332,
    RLE_ARGB2222,
    RLE_RGB565,
    RLE_ARGB4444,
    RLE_RGB888,
    RLE_ARGB8888,
}

impl PixmapFormat {
    fn from_str(s: &str) -> Self {
        match s {
            "RGB332" => Self::RGB332,
            "ARGB2222" => Self::ARGB2222,
            "RGB565" => Self::RGB565,
            "ARGB4444" => Self::ARGB4444,
            "RGB888" => Self::RGB888,
            "ARGB8888" => Self::ARGB8888,
            "RLE_RGB332" => Self::RLE_RGB332,
            "RLE_ARGB2222" => Self::RLE_ARGB2222,
            "RLE_RGB565" => Self::RLE_RGB565,
            "RLE_ARGB4444" => Self::RLE_ARGB4444,
            "RLE_RGB888" => Self::RLE_RGB888,
            "RLE_ARGB8888" => Self::RLE_ARGB8888,
            _ => Self::RGB565,
        }
    }

    fn sgl_name(&self) -> &'static str {
        match self {
            Self::RGB332 => "SGL_PIXMAP_FMT_RGB332",
            Self::ARGB2222 => "SGL_PIXMAP_FMT_ARGB2222",
            Self::RGB565 => "SGL_PIXMAP_FMT_RGB565",
            Self::ARGB4444 => "SGL_PIXMAP_FMT_ARGB4444",
            Self::RGB888 => "SGL_PIXMAP_FMT_RGB888",
            Self::ARGB8888 => "SGL_PIXMAP_FMT_ARGB8888",
            Self::RLE_RGB332 => "SGL_PIXMAP_FMT_RLE_RGB332",
            Self::RLE_ARGB2222 => "SGL_PIXMAP_FMT_RLE_ARGB2222",
            Self::RLE_RGB565 => "SGL_PIXMAP_FMT_RLE_RGB565",
            Self::RLE_ARGB4444 => "SGL_PIXMAP_FMT_RLE_ARGB4444",
            Self::RLE_RGB888 => "SGL_PIXMAP_FMT_RLE_RGB888",
            Self::RLE_ARGB8888 => "SGL_PIXMAP_FMT_RLE_ARGB8888",
        }
    }

    /// 是否为 RLE 压缩格式
    fn is_rle(&self) -> bool {
        matches!(
            self,
            Self::RLE_RGB332
                | Self::RLE_ARGB2222
                | Self::RLE_RGB565
                | Self::RLE_ARGB4444
                | Self::RLE_RGB888
                | Self::RLE_ARGB8888
        )
    }

    /// 返回对应的未压缩格式（RLE 格式返回其基础格式）
    fn base_format(&self) -> Self {
        match self {
            Self::RLE_RGB332 => Self::RGB332,
            Self::RLE_ARGB2222 => Self::ARGB2222,
            Self::RLE_RGB565 => Self::RGB565,
            Self::RLE_ARGB4444 => Self::ARGB4444,
            Self::RLE_RGB888 => Self::RGB888,
            Self::RLE_ARGB8888 => Self::ARGB8888,
            _ => *self,
        }
    }

    fn bytes_per_pixel(&self) -> usize {
        match self {
            Self::RGB332 | Self::ARGB2222 | Self::RLE_RGB332 | Self::RLE_ARGB2222 => 1,
            Self::RGB565 | Self::ARGB4444 | Self::RLE_RGB565 | Self::RLE_ARGB4444 => 2,
            Self::RGB888 | Self::RLE_RGB888 => 3,
            Self::ARGB8888 | Self::RLE_ARGB8888 => 4,
        }
    }

    fn has_alpha(&self) -> bool {
        matches!(
            self,
            Self::ARGB2222 | Self::ARGB4444 | Self::ARGB8888
                | Self::RLE_ARGB2222
                | Self::RLE_ARGB4444
                | Self::RLE_ARGB8888
        )
    }

    fn encode(&self, r: u8, g: u8, b: u8, a: u8) -> Vec<u8> {
        match self {
            Self::RGB332 | Self::RLE_RGB332 => vec![((r & 0xE0) | ((g >> 3) & 0x1C) | ((b >> 6) & 0x03))],
            Self::ARGB2222 | Self::RLE_ARGB2222 => vec![((a >> 6) << 6) | ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)],
            Self::RGB565 | Self::RLE_RGB565 => {
                let v = (((r as u16) & 0xF8) << 8) | (((g as u16) & 0xFC) << 3) | ((b as u16) >> 3);
                vec![(v & 0xFF) as u8, ((v >> 8) & 0xFF) as u8]
            }
            Self::ARGB4444 | Self::RLE_ARGB4444 => {
                let v = (((a as u16) & 0xF0) << 8) | (((r as u16) & 0xF0) << 4) | ((g as u16) & 0xF0) | ((b as u16) >> 4);
                vec![(v & 0xFF) as u8, ((v >> 8) & 0xFF) as u8]
            }
            Self::RGB888 | Self::RLE_RGB888 => vec![b, g, r],
            Self::ARGB8888 | Self::RLE_ARGB8888 => vec![b, g, r, a],
        }
    }
}

fn convert_image_to_pixmap(path: &str, fmt: PixmapFormat) -> Result<(u32, u32, Vec<u8>), String> {
    let img = image::open(path).map_err(|e| format!("无法打开图片 {}: {}", path, e))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let bpp = fmt.bytes_per_pixel();
    let mut bytes = Vec::with_capacity((w * h) as usize * bpp);
    for pix in rgba.pixels() {
        let [r, g, b, a] = pix.0;
        // 非 Alpha 格式：将透明/半透明像素按黑色背景合成，避免导出后透明区域残留异常颜色
        let (r, g, b, a) = if fmt.has_alpha() {
            (r, g, b, a)
        } else {
            let a = a as u32;
            let r = ((r as u32 * a) / 255) as u8;
            let g = ((g as u32 * a) / 255) as u8;
            let b = ((b as u32 * a) / 255) as u8;
            (r, g, b, 255)
        };
        bytes.extend_from_slice(&fmt.encode(r, g, b, a));
    }

    // RLE 压缩格式：对原始像素数据按行进行 RLE 编码
    // 编码格式：[计数字节][像素数据字节序列]，计数表示像素重复次数（1-255）
    if fmt.is_rle() {
        bytes = rle_encode_pixmap(&bytes, w, h, bpp);
    }

    Ok((w, h, bytes))
}

/// 对 pixmap 像素数据按行进行 RLE 编码
/// 编码格式：[计数字节][像素数据字节序列]，每行独立编码
/// 计数字节表示像素重复次数（1-255），超过 255 则分段
fn rle_encode_pixmap(raw: &[u8], w: u32, h: u32, bpp: usize) -> Vec<u8> {
    let w = w as usize;
    let h = h as usize;
    let row_bytes = w * bpp;
    let mut out = Vec::new();

    for y in 0..h {
        let row_start = y * row_bytes;
        let mut x = 0;
        while x < w {
            let pixel_start = row_start + x * bpp;
            let pixel = &raw[pixel_start..pixel_start + bpp];
            // 统计连续相同像素数
            let mut count = 1usize;
            while x + count < w
                && &raw[pixel_start + count * bpp..pixel_start + (count + 1) * bpp] == pixel
            {
                count += 1;
                if count == 255 {
                    break;
                }
            }
            // 写入：[计数][像素数据]
            out.push(count as u8);
            out.extend_from_slice(pixel);
            x += count;
        }
    }
    out
}

fn parse_hex_color(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

/// 返回原始图片的 RGBA 像素数据（base64 编码），前端用 new ImageData 构建
/// 避免 PNG 编解码开销和 Tauri WebView canvas 污染问题
#[derive(Serialize)]
struct ImageRgbaData {
    width: u32,
    height: u32,
    data: String, // base64 编码的 RGBA 字节数组
}

#[tauri::command]
fn get_image_data_url(path: String) -> Result<ImageRgbaData, String> {
    let img = image::open(&path).map_err(|e| format!("无法打开图片 {}: {}", path, e))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let base64 = base64::engine::general_purpose::STANDARD.encode(rgba.as_raw());
    Ok(ImageRgbaData {
        width: w,
        height: h,
        data: base64,
    })
}

#[tauri::command]
fn get_opaque_image_data_url(path: String, fill_color: String) -> Result<String, String> {
    let img = image::open(&path).map_err(|e| format!("无法打开图片 {}: {}", path, e))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let (fr, fg, fb) = parse_hex_color(&fill_color).unwrap_or((0, 0, 0));

    let mut output = image::RgbaImage::new(w, h);
    for (x, y, pix) in rgba.enumerate_pixels() {
        let [r, g, b, a] = pix.0;
        let alpha = a as f32 / 255.0;
        let inv_alpha = 1.0 - alpha;
        let nr = (r as f32 * alpha + fr as f32 * inv_alpha) as u8;
        let ng = (g as f32 * alpha + fg as f32 * inv_alpha) as u8;
        let nb = (b as f32 * alpha + fb as f32 * inv_alpha) as u8;
        output.put_pixel(x, y, image::Rgba([nr, ng, nb, 255]));
    }

    let mut png_bytes = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_bytes);
    output.write_with_encoder(encoder).map_err(|e| format!("PNG 编码失败: {}", e))?;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{}", base64))
}

fn collect_pixmaps(project: &Project) -> Vec<(String, PixmapFormat)> {
    let mut used: Vec<(String, PixmapFormat)> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for page in &project.pages {
        if let Some(ref p) = page.pixmap {
            if !p.is_empty() {
                let fmt = PixmapFormat::from_str(page.pixmap_format.as_deref().unwrap_or("RGB565"));
                if seen.insert((p.clone(), fmt)) {
                    used.push((p.clone(), fmt));
                }
            }
        }
        for w in &page.widgets {
            if let Some(ref p) = w.pixmap {
                if !p.is_empty() {
                    let fmt = PixmapFormat::from_str(w.pixmap_format.as_deref().unwrap_or("RGB565"));
                    if seen.insert((p.clone(), fmt)) {
                        used.push((p.clone(), fmt));
                    }
                }
            }
            // qrcode 的 logo 图片也需要生成取模文件
            if w.widget_type == "qrcode" {
                if let Some(ref logo) = w.logo {
                    if !logo.is_empty() {
                        let fmt = PixmapFormat::from_str(w.pixmap_format.as_deref().unwrap_or("RGB565"));
                        if seen.insert((logo.clone(), fmt)) {
                            used.push((logo.clone(), fmt));
                        }
                    }
                }
            }
        }
    }

    used
}

/// 收集项目中所有 icon 控件引用的图标资源路径（去重）
fn collect_icons(project: &Project) -> Vec<String> {
    let mut used: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for page in &project.pages {
        for w in &page.widgets {
            if w.widget_type == "icon" {
                if let Some(ref icon) = w.icon {
                    if !icon.is_empty() && seen.insert(icon.clone()) {
                        used.push(icon.clone());
                    }
                }
            }
        }
    }
    used
}

fn has_non_ascii(s: &str) -> bool {
    s.chars().any(|c| !c.is_ascii())
}

fn pixmap_filename(path: &str, fmt: &PixmapFormat) -> String {
    let var = pixmap_var_name(path, &fmt.sgl_name().replace("SGL_PIXMAP_FMT_", ""));
    format!("{}.c", var)
}

fn generate_pixmap_includes(project: &Project) -> Result<String, String> {
    let used = collect_pixmaps(project);
    if used.is_empty() {
        return Ok(String::new());
    }

    let mut out = String::new();
    out.push_str("/* ============================================\n");
    out.push_str(" * 图片取模数据\n");
    out.push_str(" * ============================================ */\n");

    for (path, fmt) in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图片文件名不能包含中文或特殊字符: {}", name));
        }
        out.push_str(&format!(
            "#include \"pixmaps/{}\"\n",
            pixmap_filename(path, fmt)
        ));
    }
    out.push('\n');
    Ok(out)
}

/// 生成 icon 取模 include 代码段
fn generate_icon_includes(project: &Project) -> Result<String, String> {
    let used = collect_icons(project);
    if used.is_empty() {
        return Ok(String::new());
    }
    let mut out = String::new();
    out.push_str("/* ============================================\n");
    out.push_str(" * icon 图标取模数据 (4bpp alpha 蒙版)\n");
    out.push_str(" * ============================================ */\n");
    for path in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图标文件名不能包含中文或特殊字符: {}", name));
        }
        out.push_str(&format!("#include \"icons/{}.c\"\n", icon_var_name(path)));
    }
    out.push('\n');
    Ok(out)
}

/// 将图片转换为 SGL icon 4bpp alpha 蒙版格式
/// 每字节存储2个像素，偶数像素在高4位，奇数像素在低4位
/// 若宽度为奇数则右侧填充1列透明像素，保证 width 为偶数（SGL 使用 width>>1 计算行字节数）
fn convert_image_to_icon(path: &str) -> Result<(u16, u16, Vec<u8>), String> {
    let img = image::open(path).map_err(|e| format!("无法打开图片 {}: {}", path, e))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    // 确保宽度为偶数（SGL 使用 width>>1 计算行字节数）
    let actual_w = if w % 2 == 1 { w + 1 } else { w };
    let bytes_per_row = (actual_w / 2) as usize;
    let mut bytes = vec![0u8; bytes_per_row * h as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            let pixel = rgba.get_pixel(x as u32, y as u32);
            let alpha = pixel.0[3];
            let alpha_4bpp = alpha >> 4;
            let byte_index = y * bytes_per_row + (x >> 1);
            if x & 1 == 0 {
                bytes[byte_index] |= alpha_4bpp << 4;
            } else {
                bytes[byte_index] |= alpha_4bpp;
            }
        }
    }
    Ok((actual_w as u16, h as u16, bytes))
}

/// 生成 icon 取模 .c 文件到 icons/ 子目录
fn generate_icon_files(project: &Project, icons_dir: &std::path::Path) -> Result<(), String> {
    let resolve_path = |p: &str| -> Option<String> {
        if p.is_empty() { return None; }
        let path = std::path::Path::new(p);
        if path.is_absolute() && path.exists() {
            return Some(p.to_string());
        }
        if path.exists() {
            return Some(path.canonicalize().unwrap_or(path.to_path_buf()).to_string_lossy().to_string());
        }
        None
    };

    let used = collect_icons(project);
    if used.is_empty() {
        return Ok(());
    }

    std::fs::create_dir_all(icons_dir)
        .map_err(|e| format!("创建 icons 目录失败: {}", e))?;

    for path in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图标文件名不能包含中文或特殊字符: {}", name));
        }
        let var = icon_var_name(path);
        let resolved = resolve_path(path)
            .ok_or_else(|| format!("图标取模失败: 无法解析图片路径 {}", path))?;
        let (w, h, bytes) = convert_image_to_icon(&resolved)
            .map_err(|e| format!("图标取模失败 {}: {}", path, e))?;
        let out_file = icons_dir.join(format!("{}.c", var));
        let mut out = String::new();
        out.push_str("/* ============================================\n");
        out.push_str(" * icon 图标取模数据 (4bpp alpha 蒙版)\n");
        out.push_str(&format!(" * source: {}\n", name));
        out.push_str(" * ============================================ */\n");
        out.push_str(&format!("static const uint8_t {}_bitmap[] = {{\n    ", var));
        for (i, b) in bytes.iter().enumerate() {
            out.push_str(&format!("0x{:02X},", b));
            if (i + 1) % 16 == 0 {
                out.push_str("\n    ");
            } else {
                out.push(' ');
            }
        }
        if bytes.len() % 16 != 0 {
            out.push('\n');
        }
        out.push_str("};\n");
        out.push_str(&format!(
            "const sgl_icon_pixmap_t {} = {{ .width = {}, .height = {}, .bitmap = {}_bitmap }};\n",
            var, w, h, var
        ));
        std::fs::write(&out_file, out)
            .map_err(|e| format!("写入图标取模文件 {} 失败: {}", out_file.to_string_lossy(), e))?;
    }
    Ok(())
}

fn generate_pixmap_files(project: &Project, pixmaps_dir: &std::path::Path) -> Result<(), String> {
    // 解析实际用于读取的图片路径
    let resolve_path = |p: &str| -> Option<String> {
        if p.is_empty() { return None; }
        let path = std::path::Path::new(p);
        if path.is_absolute() && path.exists() {
            return Some(p.to_string());
        }
        if path.exists() {
            return Some(path.canonicalize().unwrap_or(path.to_path_buf()).to_string_lossy().to_string());
        }
        None
    };

    let used = collect_pixmaps(project);
    if used.is_empty() {
        return Ok(());
    }

    std::fs::create_dir_all(pixmaps_dir)
        .map_err(|e| format!("创建 pixmaps 目录失败: {}", e))?;

    for (path, fmt) in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图片文件名不能包含中文或特殊字符: {}", name));
        }

        let var = pixmap_var_name(path, &fmt.sgl_name().replace("SGL_PIXMAP_FMT_", ""));
        let resolved = resolve_path(path)
            .ok_or_else(|| format!("图片取模失败: 无法解析图片路径 {}", path))?;
        let (w, h, bytes) = convert_image_to_pixmap(&resolved, *fmt)
            .map_err(|e| format!("图片取模失败 {}: {}", path, e))?;

        let out_file = pixmaps_dir.join(pixmap_filename(path, fmt));
        let mut out = String::new();
        out.push_str("/* ============================================\n");
        out.push_str(" * 图片取模数据\n");
        out.push_str(" * ============================================ */\n");
        out.push_str(&format!("static const uint8_t {}_data[] = {{\n    ", var));
        for (i, b) in bytes.iter().enumerate() {
            out.push_str(&format!("0x{:02X},", b));
            if (i + 1) % 16 == 0 {
                out.push_str("\n    ");
            } else {
                out.push(' ');
            }
        }
        if bytes.len() % 16 != 0 {
            out.push('\n');
        }
        out.push_str("};\n");
        out.push_str(&format!(
            "const sgl_pixmap_t {} = {{ .width = {}, .height = {}, .format = {}, .bitmap = {{ .array = {}_data }} }};\n",
            var, w, h, fmt.sgl_name(), var
        ));
        std::fs::write(&out_file, out)
            .map_err(|e| format!("写入图片取模文件 {} 失败: {}", out_file.to_string_lossy(), e))?;
    }

    Ok(())
}

#[tauri::command]
fn generate_code(project: Project, window: tauri::Window) -> Result<String, String> {
    // 检查 canvas 控件是否设置了 painter_cb / private_data，未设置时通过 build-log 事件推送警告到前端控制台
    for page in &project.pages {
        for w in &page.widgets {
            if w.widget_type == "canvas" {
                if w.painter_cb.as_deref().map(|s| s.trim()).unwrap_or("").is_empty() {
                    let _ = window.emit(
                        "build-log",
                        serde_json::json!({
                            "message": format!("[WARN] canvas 控件 '{}' (id={}) 未设置绘制回调函数 (painterCb)，运行时将无法绘制", w.name.as_deref().unwrap_or(""), w.id),
                            "level": "warn"
                        }),
                    );
                }
                if w.private_data.as_deref().map(|s| s.trim()).unwrap_or("").is_empty() {
                    let _ = window.emit(
                        "build-log",
                        serde_json::json!({
                            "message": format!("[WARN] canvas 控件 '{}' (id={}) 未设置私有数据指针 (privateData)", w.name.as_deref().unwrap_or(""), w.id),
                            "level": "warn"
                        }),
                    );
                }
            }
            if w.widget_type == "ext_img" {
                if w.pixmap.as_deref().map(|s| s.trim()).unwrap_or("") != "" {
                    if w.read_ops.as_deref().map(|s| s.trim()).unwrap_or("").is_empty() {
                        let _ = window.emit(
                            "build-log",
                            serde_json::json!({
                                "message": format!("[WARN] ext_img 控件 '{}' (id={}) 设置了图片但未设置外部读取函数 (readOps)，运行时将无法从外部 Flash 读取图片", w.name.as_deref().unwrap_or(""), w.id),
                                "level": "warn"
                            }),
                        );
                    }
                }
            }
        }
    }

    let fonts = collect_fonts(&project);
    let mut code = String::new();
    code.push_str("/* ============================================\n");
    code.push_str(" * SGL UI Designer - Auto Generated Code\n");
    code.push_str(&format!(" * Project: {}\n", project.name));
    code.push_str(&format!(" * Screen: {}x{}\n", project.screen_width, project.screen_height));
    code.push_str(&format!(" * Color Depth: {}\n", project.color_depth));
    code.push_str(" * ============================================ */\n\n");
    code.push_str("#include \"sgl.h\"\n");
    if !fonts.is_empty() {
        code.push_str("\n/* ============================================\n");
        code.push_str(" * 字体字模声明\n");
        code.push_str(" * 在导出目录的 fonts/ 子目录中运行以下命令生成字模文件：\n");
        for (name, path, sz, bpp, compress, _symbols) in &fonts {
            let compress_arg = if *compress > 0 { " --compress" } else { "" };
            code.push_str(&format!(" *   sgl_font_conv.exe --font {} --size {} --bpp {}{} --output fonts/{}\n",
                path, sz, bpp, compress_arg, font_filename(name, *sz, *bpp, *compress)));
        }
        code.push_str(" * ============================================ */\n");
        for (name, _path, sz, bpp, _compress, _symbols) in &fonts {
            code.push_str(&format!("extern const sgl_font_t {};\n", font_id_from_family(name, *sz, *bpp, *_compress)));
        }
    }
    code.push('\n');

    // 生成图片取模 include
    let pixmap_includes = generate_pixmap_includes(&project)?;
    if !pixmap_includes.is_empty() {
        code.push_str(&pixmap_includes);
    }

    // 生成 icon 图标取模 include
    let icon_includes = generate_icon_includes(&project)?;
    if !icon_includes.is_empty() {
        code.push_str(&icon_includes);
    }

    // 收集所有事件回调函数名，生成前向声明
    let mut event_cbs: Vec<String> = Vec::new();
    for page in &project.pages {
        for w in &page.widgets {
            if let Some(ref cb) = w.event_cb {
                if !cb.is_empty() && !event_cbs.contains(cb) {
                    event_cbs.push(cb.clone());
                }
            }
        }
    }
    if !event_cbs.is_empty() {
        code.push_str("/* ============================================\n");
        code.push_str(" * 事件回调函数声明（用户实现）\n");
        code.push_str(" * ============================================ */\n");
        for cb in &event_cbs {
            code.push_str(&format!("void {}(sgl_event_t *e);\n", cb));
        }
        code.push('\n');
    }

    for page in &project.pages {
        let page_id = sanitize_id(&page.id);
        code.push_str(&format!("void ui_page_{}_create(void)\n{{\n", page_id));
        // 获取当前活动屏幕对象，不需要创建新页面
        code.push_str(&format!(
            "    sgl_obj_t *page_{} = sgl_screen_act();\n",
            page_id
        ));
        // 页面背景：优先使用图片，否则使用颜色
        if let Some(ref pixmap) = page.pixmap {
            if !pixmap.is_empty() {
                let fmt = page.pixmap_format.as_deref().unwrap_or("RGB565");
                code.push_str(&format!("    sgl_page_set_pixmap(page_{}, &{});\n", page_id, pixmap_var_name(pixmap, fmt)));
            } else if !page.bg_color.is_empty() {
                code.push_str(&format!("    sgl_page_set_color(page_{}, {});\n", page_id, sgl_color(&page.bg_color)));
            }
        } else if !page.bg_color.is_empty() {
            code.push_str(&format!("    sgl_page_set_color(page_{}, {});\n", page_id, sgl_color(&page.bg_color)));
        }
        // 页面透明度
        if let Some(alpha) = page.alpha {
            if alpha < 255 {
                code.push_str(&format!("    sgl_page_set_alpha(page_{}, {});\n", page_id, alpha));
            }
        }
        code.push('\n');

        for w in &page.widgets {
            let obj_id = sanitize_id(&w.id);
            // chart 控件根据 chartType 选择不同的 create 函数
            let create_fn = if w.widget_type == "chart" {
                match w.chart_type.as_deref().unwrap_or("linechart") {
                    "piechart" => "sgl_piechart_create",
                    "barchart" => "sgl_barchart_create",
                    _ => "sgl_linechart_create",
                }
            } else {
                get_create_fn(&w.widget_type)
            };
            code.push_str(&format!("    /* {} */\n", w.widget_type));
            code.push_str(&format!("    sgl_obj_t *{} = {}(page_{});\n", obj_id, create_fn, page_id));
            code.push_str(&format!("    sgl_obj_set_pos({}, {}, {});\n", obj_id, w.x, w.y));
            code.push_str(&format!("    sgl_obj_set_size({}, {}, {});\n", obj_id, w.width, w.height));

            emit_setters(&mut code, &w, &obj_id);

            // 事件回调绑定
            if let Some(ref cb) = w.event_cb {
                if !cb.is_empty() {
                    code.push_str(&format!("    sgl_obj_set_event_cb({}, {}, NULL);\n", obj_id, cb));
                }
            }
            code.push('\n');
        }
        code.push_str("}\n\n");
    }

    code.push_str("void ui_init(void)\n{\n");
    for page in &project.pages {
        let page_id = sanitize_id(&page.id);
        code.push_str(&format!("    ui_page_{}_create();\n", page_id));
    }
    code.push_str("}\n");
    Ok(code)
}

fn get_create_fn(t: &str) -> &'static str {
    match t {
        "rect" => "sgl_rect_create",
        "rect_ext" => "sgl_rect_ext_create",
        "circle" => "sgl_circle_create",
        "ring" => "sgl_ring_create",
        "arc" => "sgl_arc_create",
        "line" => "sgl_line_create",
        "polygon" => "sgl_polygon_create",
        "button" => "sgl_button_create",
        "switch" => "sgl_switch_create",
        "checkbox" => "sgl_checkbox_create",
        "slider" => "sgl_slider_create",
        "numberkbd" => "sgl_numberkbd_create",
        "keyboard" => "sgl_keyboard_create",
        "label" => "sgl_label_create",
        "textbox" => "sgl_textbox_create",
        "textline" => "sgl_textline_create",
        "textlist" => "sgl_textlist_create",
        "progress" => "sgl_progress_create",
        "bar" => "sgl_bar_create",
        "gauge" => "sgl_gauge_create",
        "spectrum" => "sgl_spectrum_create",
        "battery" => "sgl_battery_create",
        "icon" => "sgl_icon_create",
        "led" => "sgl_led_create",
        "msgbox" => "sgl_msgbox_create",
        "viewlist" => "sgl_viewlist_create",
        "dropdown" => "sgl_dropdown_create",
        "scroll" => "sgl_scroll_create",
        "box" => "sgl_box_create",
        "win" => "sgl_win_create",
        "qrcode" => "sgl_qrcode_create",
        "scope" => "sgl_scope_create",
        "chart" => "sgl_piechart_create",
        "canvas" => "sgl_canvas_create",
        "2dball" => "sgl_2dball_create",
        "sprite" => "sgl_sprite_create",
        "analogclock" => "sgl_analogclock_create",
        "ext_img" => "sgl_img_ext_create",
        _ => "sgl_rect_create",
    }
}

fn emit_setters(code: &mut String, w: &Widget, obj: &str) {
    let t = &w.widget_type;
    macro_rules! c {
        ($fn:expr, $v:expr) => {
            if let Some(v) = &$v {
                code.push_str(&format!("    {}({}, {});\n", $fn, obj, v));
            }
        };
    }
    macro_rules! cstr {
        ($fn:expr, $v:expr) => {
            if let Some(v) = &$v {
                let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
                code.push_str(&format!("    {}({}, \"{}\");\n", $fn, obj, escaped));
            }
        };
    }
    macro_rules! cclr {
        ($fn:expr, $v:expr) => {
            if let Some(v) = &$v {
                if !v.is_empty() {
                    code.push_str(&format!("    {}({}, {});\n", $fn, obj, sgl_color(v)));
                }
            }
        };
    }

    match t.as_str() {
        "rect" => {
            // rect: 图片和背景色二选一
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_rect_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                } else if let Some(ref c) = w.color {
                    if !c.is_empty() {
                        code.push_str(&format!("    sgl_rect_set_color({}, {});\n", obj, sgl_color(c)));
                    }
                }
            } else if let Some(ref c) = w.color {
                if !c.is_empty() {
                    code.push_str(&format!("    sgl_rect_set_color({}, {});\n", obj, sgl_color(c)));
                }
            }
            if let Some(ref bc) = w.border_color {
                if !bc.is_empty() {
                    code.push_str(&format!("    sgl_rect_set_border_color({}, {});\n", obj, sgl_color(bc)));
                }
            }
            if let Some(bw) = w.border_width {
                code.push_str(&format!("    sgl_rect_set_border_width({}, {});\n", obj, bw as i32));
            }
            if let Some(ba) = w.border_alpha {
                code.push_str(&format!("    sgl_rect_set_border_alpha({}, {});\n", obj, ba as i32));
            }
            if let Some(r) = w.radius {
                code.push_str(&format!("    sgl_rect_set_radius({}, {});\n", obj, r as i32));
            }
            if let Some(ma) = w.main_alpha {
                code.push_str(&format!("    sgl_rect_set_main_alpha({}, {});\n", obj, ma as i32));
            }
            if let Some(a) = w.alpha {
                code.push_str(&format!("    sgl_rect_set_alpha({}, {});\n", obj, a as i32));
            }
        }
        "rect_ext" => {
            // rect_ext: 四角独立圆角矩形，图片和背景色二选一
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_rect_ext_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                } else if let Some(ref c) = w.color {
                    if !c.is_empty() {
                        code.push_str(&format!("    sgl_rect_ext_set_color({}, {});\n", obj, sgl_color(c)));
                    }
                }
            } else if let Some(ref c) = w.color {
                if !c.is_empty() {
                    code.push_str(&format!("    sgl_rect_ext_set_color({}, {});\n", obj, sgl_color(c)));
                }
            }
            cclr!("sgl_rect_ext_set_border_color", w.border_color);
            c!( "sgl_rect_ext_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_rect_ext_set_border_alpha", w.border_alpha.map(|v| v as u8));
            if let (Some(tl), Some(tr), Some(bl), Some(br)) = (w.tl_radius, w.tr_radius, w.bl_radius, w.br_radius) {
                code.push_str(&format!("    sgl_rect_ext_set_radius({}, {}, {}, {}, {});\n", obj, tl, tr, bl, br));
            }
            c!( "sgl_rect_ext_set_main_alpha", w.main_alpha.map(|v| v as u8));
            c!( "sgl_rect_ext_set_alpha", w.alpha.map(|v| v as u8));
        }
        "circle" => {
            // 颜色或图片二选一
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_circle_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                } else if let Some(ref c) = w.color {
                    if !c.is_empty() {
                        code.push_str(&format!("    sgl_circle_set_color({}, {});\n", obj, sgl_color(c)));
                    }
                }
            } else if let Some(ref c) = w.color {
                if !c.is_empty() {
                    code.push_str(&format!("    sgl_circle_set_color({}, {});\n", obj, sgl_color(c)));
                }
            }
            cclr!("sgl_circle_set_border_color", w.border_color);
            c!( "sgl_circle_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_circle_set_radius", w.radius.map(|v| v as u16));
            c!( "sgl_circle_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_circle_set_x_offset", w.x_offset.map(|v| v as i8));
            c!( "sgl_circle_set_y_offset", w.y_offset.map(|v| v as i8));
        }
        "line" => {
            cclr!("sgl_line_set_color", w.color);
            c!( "sgl_line_set_width", w.line_width.map(|v| v as u8).or_else(|| w.border_width.map(|v| v as u8)));
            c!( "sgl_line_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_line_set_dashed", w.dashed.map(|v| v as u8));
            if w.dashed == Some(true) {
                let dl = w.dash_len.unwrap_or(10);
                let gl = w.gap_len.unwrap_or(5);
                code.push_str(&format!("    sgl_line_set_dash_pattern({}, {}, {});\n", obj, dl, gl));
            }
            // line 控件：x1/y1, x2/y2 是中心线端点坐标（SGL 语义）
            let abs_x1 = w.x1.unwrap_or(w.x);
            let abs_y1 = w.y1.unwrap_or(w.y);
            let abs_x2 = w.x2.unwrap_or(w.x + w.width - 1);
            let abs_y2 = w.y2.unwrap_or(w.y + w.height - 1);
            code.push_str(&format!("    sgl_line_set_pos({}, {}, {}, {}, {});\n", obj, abs_x1, abs_y1, abs_x2, abs_y2));
        }
        "button" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_button_set_font({}, &{});\n", obj, fid));
            }
            cstr!("sgl_button_set_text", w.text);
            cclr!("sgl_button_set_color", w.color);
            cclr!("sgl_button_set_text_color", w.text_color);
            cclr!("sgl_button_set_border_color", w.border_color);
            c!( "sgl_button_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_button_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_button_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(a) = &w.align {
                let align_macro = match a.as_str() {
                    "TOP_LEFT" => "SGL_ALIGN_TOP_LEFT",
                    "TOP_MID" => "SGL_ALIGN_TOP_MID",
                    "TOP_RIGHT" => "SGL_ALIGN_TOP_RIGHT",
                    "LEFT_MID" => "SGL_ALIGN_LEFT_MID",
                    "CENTER" => "SGL_ALIGN_CENTER",
                    "RIGHT_MID" => "SGL_ALIGN_RIGHT_MID",
                    "BOT_LEFT" => "SGL_ALIGN_BOT_LEFT",
                    "BOT_MID" => "SGL_ALIGN_BOT_MID",
                    "BOT_RIGHT" => "SGL_ALIGN_BOT_RIGHT",
                    "LEFT" => "SGL_ALIGN_LEFT_MID",
                    "RIGHT" => "SGL_ALIGN_RIGHT_MID",
                    "TOP" => "SGL_ALIGN_TOP_MID",
                    "BOTTOM" | "DOWN" => "SGL_ALIGN_BOT_MID",
                    _ => "SGL_ALIGN_CENTER",
                };
                code.push_str(&format!("    sgl_button_set_text_align({}, {});\n", obj, align_macro));
            }
            if let Some(pix) = &w.pixmap {
                if !pix.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_button_set_pixmap({}, &{});\n", obj, pixmap_var_name(pix, fmt)));
                }
            }
        }
        "label" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_label_set_font({}, &{});\n", obj, fid));
            }
            cstr!("sgl_label_set_text", w.text);
            cclr!("sgl_label_set_text_color", w.text_color);
            cclr!("sgl_label_set_bg_color", w.bg_color);
            c!( "sgl_label_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(a) = &w.align {
                let align_macro = match a.as_str() {
                    "TOP_LEFT" => "SGL_ALIGN_TOP_LEFT",
                    "TOP_MID" => "SGL_ALIGN_TOP_MID",
                    "TOP_RIGHT" => "SGL_ALIGN_TOP_RIGHT",
                    "LEFT_MID" => "SGL_ALIGN_LEFT_MID",
                    "CENTER" => "SGL_ALIGN_CENTER",
                    "RIGHT_MID" => "SGL_ALIGN_RIGHT_MID",
                    "BOT_LEFT" => "SGL_ALIGN_BOT_LEFT",
                    "BOT_MID" => "SGL_ALIGN_BOT_MID",
                    "BOT_RIGHT" => "SGL_ALIGN_BOT_RIGHT",
                    "LEFT" => "SGL_ALIGN_LEFT_MID",
                    "RIGHT" => "SGL_ALIGN_RIGHT_MID",
                    "TOP" => "SGL_ALIGN_TOP_MID",
                    "BOTTOM" | "DOWN" => "SGL_ALIGN_BOT_MID",
                    _ => "SGL_ALIGN_CENTER",
                };
                code.push_str(&format!("    sgl_label_set_text_align({}, {});\n", obj, align_macro));
            }
            c!( "sgl_label_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_label_set_text_offset", w.text_offset_x.zip(w.text_offset_y).map(|(x, y)| format!("{}, {}", x as i8, y as i8)));
            if let Some(r) = w.text_rotation {
                code.push_str(&format!("    sgl_label_set_text_rotation({}, {});\n", obj, r));
            }
        }
        "textbox" => {
            cstr!("sgl_textbox_set_text", w.text);
            cclr!("sgl_textbox_set_text_color", w.text_color);
            cclr!("sgl_textbox_set_bg_color", w.bg_color);
            cclr!("sgl_textbox_set_border_color", w.border_color);
            c!( "sgl_textbox_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_textbox_set_radius", w.radius.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_textbox_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "switch" => {
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_switch_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cclr!("sgl_switch_set_color", w.on_color);
            cclr!("sgl_switch_set_bg_color", w.bg_color);
            cclr!("sgl_switch_set_knob_color", w.knob_color);
            cclr!("sgl_switch_set_border_color", w.border_color);
            c!( "sgl_switch_set_border_width", w.border_width.map(|v| v as i16));
            c!( "sgl_switch_set_radius", w.radius.map(|v| v as u16));
            c!( "sgl_switch_set_knob_margin", w.knob_margin.map(|v| v as u8));
            c!( "sgl_switch_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(pix) = &w.pixmap {
                if !pix.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_switch_set_pixmap({}, &{});\n", obj, pixmap_var_name(pix, fmt)));
                }
            }
        }
        "slider" => {
            c!( "sgl_slider_set_value", w.value.map(|v| v as u8));
            c!( "sgl_slider_set_direct", w.direct);
            cclr!("sgl_slider_set_fill_color", w.fill_color);
            cclr!("sgl_slider_set_track_color", w.track_color);
            cclr!("sgl_slider_set_knob_color", w.knob_color);
            c!( "sgl_slider_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_slider_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_slider_set_thickness", w.thickness.map(|v| v as u8));
        }
        "progress" => {
            c!( "sgl_progress_set_value", w.value.map(|v| v as u8));
            cclr!("sgl_progress_set_fill_color", w.fill_color);
            cclr!("sgl_progress_set_track_color", w.track_color);
            cclr!("sgl_progress_set_border_color", w.border_color);
            c!( "sgl_progress_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_progress_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_progress_set_fill_gap", w.fill_gap.map(|v| v as u8));
            c!( "sgl_progress_set_fill_radius", w.fill_radius.map(|v| v as u8));
            c!( "sgl_progress_set_track_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_progress_set_fill_alpha", w.alpha.map(|v| v as u8));
        }
        "gauge" => {
            cclr!("sgl_gauge_set_bg_color", w.bg_color);
            cclr!("sgl_gauge_set_arc_color", w.color);
            cclr!("sgl_gauge_set_scale_color", w.border_color);
            cclr!("sgl_gauge_set_text_color", w.text_color);
            c!( "sgl_gauge_set_value", w.value.map(|v| v as i16));
            c!( "sgl_gauge_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_gauge_set_font({}, &{});\n", obj, fid));
            }
        }
        "bar" => {
            cclr!("sgl_bar_set_fill_color", w.color);
            cclr!("sgl_bar_set_track_color", w.bg_color);
            cclr!("sgl_bar_set_border_color", w.border_color);
            c!( "sgl_bar_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_bar_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_bar_set_value", w.value.map(|v| v as u8));
            c!( "sgl_bar_set_alpha", w.alpha.map(|v| v as u8));
        }
        "battery" => {
            cclr!("sgl_battery_set_fill_color", w.color);
            cclr!("sgl_battery_set_bg_color", w.bg_color);
            cclr!("sgl_battery_set_border_color", w.border_color);
            c!( "sgl_battery_set_level", w.value.map(|v| v as u8));
        }
        "led" => {
            cclr!("sgl_led_set_on_color", w.color);
            cclr!("sgl_led_set_off_color", w.bg_color);
            c!( "sgl_led_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_led_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_led_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
        }
        "arc" => {
            cclr!("sgl_arc_set_color", w.color);
            cclr!("sgl_arc_set_bg_color", w.bg_color);
            c!( "sgl_arc_set_alpha", w.alpha.map(|v| v as u8));
        }
        "ring" => {
            cclr!("sgl_ring_set_color", w.color);
            if let (Some(r_in), Some(r_out)) = (w.radius_in, w.radius_out) {
                code.push_str(&format!("    sgl_ring_set_radius({}, {}, {});\n", obj, r_in, r_out));
            }
            c!( "sgl_ring_set_alpha", w.alpha.map(|v| v as u8));
        }
        "checkbox" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_checkbox_set_font({}, &{});\n", obj, fid));
            }
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_checkbox_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cstr!("sgl_checkbox_set_text", w.text);
            // checkbox 新 API：拆分为 text_color / box_color / check_color
            // text_color 优先用 textColor，回退到 color（兼容前端现有属性）
            let cb_text_clr = w.text_color.clone().or_else(|| w.color.clone());
            cclr!("sgl_checkbox_set_text_color", cb_text_clr);
            cclr!("sgl_checkbox_set_box_color", w.box_color);
            cclr!("sgl_checkbox_set_check_color", w.check_color);
            c!( "sgl_checkbox_set_alpha", w.alpha.map(|v| v as u8));
        }
        "win" => {
            cclr!("sgl_win_set_title_bg_color", w.title_bg_color.clone());
            cclr!("sgl_win_set_title_text_color", w.title_text_color.clone());
            cclr!("sgl_win_set_close_btn_color", w.close_btn_color.clone());
            cclr!("sgl_win_set_color", w.bg_color.clone());
            cclr!("sgl_win_set_border_color", w.border_color.clone());
            c!( "sgl_win_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_win_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_win_set_title_height", w.title_height.map(|v| v as u16));
            // title_align: 字符串转 SGL_ALIGN_ 宏
            if let Some(ref align) = w.title_align {
                let align_macro = match align.as_str() {
                    "TOP_LEFT" => "SGL_ALIGN_TOP_LEFT",
                    "TOP_MID" => "SGL_ALIGN_TOP_MID",
                    "TOP_RIGHT" => "SGL_ALIGN_TOP_RIGHT",
                    "LEFT_MID" => "SGL_ALIGN_LEFT_MID",
                    "CENTER" => "SGL_ALIGN_CENTER",
                    "RIGHT_MID" => "SGL_ALIGN_RIGHT_MID",
                    "BOT_LEFT" => "SGL_ALIGN_BOT_LEFT",
                    "BOT_MID" => "SGL_ALIGN_BOT_MID",
                    "BOT_RIGHT" => "SGL_ALIGN_BOT_RIGHT",
                    _ => "SGL_ALIGN_LEFT_MID",
                };
                code.push_str(&format!("    sgl_win_set_title_text_align({}, {});\n", obj, align_macro));
            }
            // pixmap 背景图片
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_win_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                }
            }
            // 标题字体（必须在 title_text 之前设置，因为 title_text 会触发 sgl_obj_update_area）
            if let Some(ref font_family) = w.font_family {
                if !font_family.is_empty() && font_family != "default" {
                    let font_size = w.font_size.unwrap_or(14);
                    let font_bpp = w.font_bpp.unwrap_or(4);
                    let font_var = font_id_from_family(font_family, font_size, font_bpp, 0);
                    code.push_str(&format!("    sgl_win_set_title_font({}, &{});\n", obj, font_var));
                }
            }
            // title_text 必须在 title_height 和 title_font 之后调用
            // SGL: sgl_win_set_title_text 内部调用 sgl_obj_update_area(area.y2 = area.y1 + title_h)
            cstr!("sgl_win_set_title_text", w.title_text.clone());
            c!( "sgl_win_set_alpha", w.alpha.map(|v| v as u8));
        }
        "msgbox" => {
            cclr!("sgl_msgbox_set_color", w.color);
            cclr!("sgl_msgbox_set_border_color", w.border_color);
            c!( "sgl_msgbox_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_msgbox_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_msgbox_set_alpha", w.alpha.map(|v| v as u8));
        }
        "dropdown" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_dropdown_set_text_font({}, &{});\n", obj, fid));
            }
            cclr!("sgl_dropdown_set_bg_color", w.color);
            cclr!("sgl_dropdown_set_selected_color", w.bg_color);
            cclr!("sgl_dropdown_set_border_color", w.border_color);
            cclr!("sgl_dropdown_set_text_color", w.text_color);
            c!( "sgl_dropdown_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_dropdown_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_dropdown_set_alpha", w.alpha.map(|v| v as u8));
        }
        "textline" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_textline_set_text_font({}, &{});\n", obj, fid));
            }
            cstr!("sgl_textline_set_text", w.text);
            cclr!("sgl_textline_set_text_color", w.text_color);
            cclr!("sgl_textline_set_bg_color", w.bg_color);
            c!( "sgl_textline_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_textline_set_alpha", w.alpha.map(|v| v as u8));
        }
        "textlist" => {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_textlist_set_text_font({}, &{});\n", obj, fid));
            }
            cclr!("sgl_textlist_set_text_color", w.text_color);
            cclr!("sgl_textlist_set_bg_color", w.bg_color);
            cclr!("sgl_textlist_set_border_color", w.border_color);
            c!( "sgl_textlist_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_textlist_set_alpha", w.alpha.map(|v| v as u8));
        }
        "viewlist" => {
            cclr!("sgl_viewlist_set_bg_color", w.bg_color);
            cclr!("sgl_viewlist_set_border_color", w.border_color);
            c!( "sgl_viewlist_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_viewlist_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_viewlist_set_alpha", w.alpha.map(|v| v as u8));
        }
        "scroll" => {
            cclr!("sgl_scroll_set_color", w.color);
            cclr!("sgl_scroll_set_border_color", w.border_color);
            c!( "sgl_scroll_set_alpha", w.alpha.map(|v| v as u8));
        }
        "box" => {
            cclr!("sgl_box_set_bg_color", w.bg_color);
            cclr!("sgl_box_set_border_color", w.border_color);
            c!( "sgl_box_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_box_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_box_set_alpha", w.alpha.map(|v| v as u8));
        }
        "canvas" => {
            // 绘制回调和私有数据必须始终生成 API；未填写时使用 NULL
            let painter = w.painter_cb.as_deref().filter(|s| !s.is_empty()).unwrap_or("NULL");
            code.push_str(&format!("    sgl_canvas_set_painter_cb({}, {});\n", obj, painter));
            let private = w.private_data.as_deref().filter(|s| !s.is_empty()).unwrap_or("NULL");
            code.push_str(&format!("    sgl_canvas_set_private({}, {});\n", obj, private));
        }
        "scope" => {
            cclr!("sgl_scope_set_bg_color", w.bg_color);
            cclr!("sgl_scope_set_grid_color", w.color);
            cclr!("sgl_scope_set_border_color", w.border_color);
            c!( "sgl_scope_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_scope_set_alpha", w.alpha.map(|v| v as u8));
        }
        "polygon" => {
            cclr!("sgl_polygon_set_fill_color", w.fill_color);
            cclr!("sgl_polygon_set_border_color", w.border_color);
            c!( "sgl_polygon_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_polygon_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(ref vertices) = w.vertices {
                let coords: Vec<(i32, i32)> = vertices.split(';')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .filter_map(|s| {
                        let mut parts = s.split(',');
                        if let (Some(x), Some(y)) = (parts.next(), parts.next()) {
                            let x = x.trim().parse::<i32>().ok()?;
                            let y = y.trim().parse::<i32>().ok()?;
                            Some((x, y))
                        } else {
                            None
                        }
                    })
                    .collect();
                if coords.len() >= 3 {
                    let pairs = coords.iter()
                        .map(|(x, y)| format!("{{{}, {}}}", x, y))
                        .collect::<Vec<_>>()
                        .join(", ");
                    code.push_str(&format!("    sgl_polygon_set_vertex_array({}, (int16_t[][2]){{{}}}, {});\n", obj, pairs, coords.len()));
                }
            }
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_polygon_set_font({}, &{});\n", obj, fid));
            }
            if let Some(ref text) = w.text {
                if !text.is_empty() {
                    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
                    code.push_str(&format!("    sgl_polygon_set_text({}, \"{}\");\n", obj, escaped));
                }
            }
            cclr!("sgl_polygon_set_text_color", w.text_color);
            // sgl_polygon_set_pixmap 在 sgl 头文件中声明被注释（waiting for support），暂不生成调用
        }
        "numberkbd" => {
            // 按 SGL 头文件声明顺序生成全部 setter (sgl_numberkbd.h)
            cclr!("sgl_numberkbd_set_color", w.cell_color.clone());
            c!( "sgl_numberkbd_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_numberkbd_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_numberkbd_set_border_width", w.border_width.map(|v| v as u8));
            cclr!("sgl_numberkbd_set_border_color", w.border_color);
            // numberkbd 必须有字体，否则仿真崩溃
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_numberkbd_set_text_font({}, &{});\n", obj, fid));
            }
            cclr!("sgl_numberkbd_set_text_color", w.text_color);
            c!( "sgl_numberkbd_set_btn_margin", w.btn_margin.map(|v| v as u8));
            cclr!("sgl_numberkbd_set_btn_color", w.btn_color);
            c!( "sgl_numberkbd_set_btn_border_width", w.btn_border_width.map(|v| v as u8));
            cclr!("sgl_numberkbd_set_btn_border_color", w.btn_border_color);
            c!( "sgl_numberkbd_set_btn_radius", w.btn_radius.map(|v| v as u8));
        }
        "keyboard" => {
            cclr!("sgl_keyboard_set_color", w.color);
            cclr!("sgl_keyboard_set_border_color", w.border_color);
            cclr!("sgl_keyboard_set_text_color", w.text_color);
            c!( "sgl_keyboard_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_keyboard_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_keyboard_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_keyboard_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "qrcode" => {
            cstr!("sgl_qrcode_set_text", w.qr_text.clone());
            cclr!("sgl_qrcode_set_cell_color", w.cell_color.clone());
            cclr!("sgl_qrcode_set_bg_color", w.bg_color.clone());
            c!("sgl_qrcode_set_cell_radius", w.cell_radius);
            c!("sgl_qrcode_set_scale", w.scale);
            c!("sgl_qrcode_set_zone", w.zone);
            c!("sgl_qrcode_set_version", w.version);
            c!("sgl_qrcode_set_ecc", w.ecc);
            // logo 图片
            if let Some(ref logo) = w.logo {
                if !logo.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_qrcode_set_logo({}, &{});\n", obj, pixmap_var_name(logo, fmt)));
                }
            }
            c!("sgl_qrcode_set_logo_radius", w.logo_radius);
            c!("sgl_qrcode_set_alpha", w.alpha.map(|v| v as u8));
        }
        "icon" => {
            cclr!("sgl_icon_set_color", w.color);
            // align: 字符串转 SGL_ALIGN_ 宏
            if let Some(ref align) = w.align {
                let align_macro = match align.as_str() {
                    "TOP_LEFT" => "SGL_ALIGN_TOP_LEFT",
                    "TOP_MID" => "SGL_ALIGN_TOP_MID",
                    "TOP_RIGHT" => "SGL_ALIGN_TOP_RIGHT",
                    "LEFT_MID" => "SGL_ALIGN_LEFT_MID",
                    "CENTER" => "SGL_ALIGN_CENTER",
                    "RIGHT_MID" => "SGL_ALIGN_RIGHT_MID",
                    "BOT_LEFT" => "SGL_ALIGN_BOT_LEFT",
                    "BOT_MID" => "SGL_ALIGN_BOT_MID",
                    "BOT_RIGHT" => "SGL_ALIGN_BOT_RIGHT",
                    _ => "SGL_ALIGN_CENTER",
                };
                code.push_str(&format!("    sgl_icon_set_align({}, {});\n", obj, align_macro));
            }
            if let Some(ref icon) = w.icon {
                if !icon.is_empty() {
                    code.push_str(&format!("    sgl_icon_set_icon({}, &{});\n", obj, icon_var_name(icon)));
                }
            }
            c!( "sgl_icon_set_alpha", w.alpha.map(|v| v as u8));
        }
        "sprite" => {
            c!( "sgl_sprite_set_alpha", w.alpha.map(|v| v as u8));
        }
        "2dball" => {
            cclr!("sgl_2dball_set_color", w.color);
            cclr!("sgl_2dball_set_bg_color", w.bg_color);
            c!( "sgl_2dball_set_radius", w.radius.map(|v| v as u16));
            c!( "sgl_2dball_set_alpha", w.alpha.map(|v| v as u8));
        }
        "ext_img" => {
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_img_ext_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                }
            }
            c!( "sgl_img_ext_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_img_ext_set_rotation", w.rotation.map(|v| v as i16));
            c!( "sgl_img_ext_set_scale_uniform", w.scale_uniform.map(|v| v as i8));
            if let (Some(px), Some(py)) = (w.pivot_x, w.pivot_y) {
                code.push_str(&format!("    sgl_img_ext_set_pivot({}, {}, {});\n", obj, px, py));
            }
            if let Some(ref read_ops) = w.read_ops {
                if !read_ops.trim().is_empty() {
                    code.push_str(&format!("    sgl_img_ext_set_read_ops({}, {});\n", obj, read_ops.trim()));
                }
            }
        }
        "spectrum" => {
            // bar_number 必须先调用：分配 bar_value 数组，bar_mode 的 HAT 分配也依赖 bar_num
            if let Some(bar_num) = w.bar_num {
                if bar_num > 0 {
                    c!("sgl_spectrum_set_bar_number", Some(bar_num as u16));
                }
            }
            cclr!("sgl_spectrum_set_bar_color", w.bar_color);
            cclr!("sgl_spectrum_set_bar_hat_color", w.bar_hat_color);
            c!("sgl_spectrum_set_bar_mode", w.bar_mode.map(|v| v as u8));
            c!("sgl_spectrum_set_bar_hat_height", w.bar_hat_height.map(|v| v as u8));
            if let Some(ref bar_values) = w.bar_values {
                if !bar_values.is_empty() {
                    let bar_num = w.bar_num.unwrap_or(0);
                    if bar_num > 0 {
                        bar_values.split(';')
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .take(bar_num as usize)
                            .enumerate()
                            .for_each(|(idx, val)| {
                                if let Ok(v) = val.parse::<i32>() {
                                    code.push_str(&format!("    sgl_spectrum_set_bar_value({}, {}, {});\n", obj, idx, v));
                                }
                            });
                    }
                }
            }
            c!("sgl_spectrum_set_alpha", w.alpha.map(|v| v as u8));
        }
        "analogclock" => {
            cclr!("sgl_analogclock_set_bg_color", w.bg_color);
            cclr!("sgl_analogclock_set_border_color", w.border_color);
            c!( "sgl_analogclock_set_alpha", w.alpha.map(|v| v as u8));
        }
        "chart" => {
            let chart_type = w.chart_type.as_deref().unwrap_or("linechart");
            let prefix = match chart_type {
                "piechart" => "sgl_piechart",
                "barchart" => "sgl_barchart",
                _ => "sgl_linechart",
            };
            let axis_y = match chart_type {
                "barchart" => "SGL_BARCHART_AXIS_Y",
                _ => "SGL_LINECHART_AXIS_Y",
            };
            // 公共属性
            cclr!(format!("{}_set_bg_color", prefix), w.bg_color);
            c!(format!("{}_set_alpha", prefix), w.alpha.map(|v| v as u8));

            if chart_type == "piechart" {
                // piechart 专用
                c!(format!("{}_set_start_angle", prefix), w.start_angle);
                c!(format!("{}_set_inner_radius_rate", prefix), w.inner_radius_rate.map(|v| v as u8));
                c!(format!("{}_set_radius", prefix), w.radius.map(|v| v as u16));
                if let Some(true) = w.smooth {
                    code.push_str(&format!("    {}_set_smooth({}, true);\n", prefix, obj));
                }
                if let Some(true) = w.open_anim {
                    code.push_str(&format!("    {}_enable_open_anim({}, true);\n", prefix, obj));
                }
                // 扇区透明度
                if let Some(ref sa) = w.slice_alpha {
                    for (idx, val) in sa.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        if let Ok(v) = val.parse::<u32>() {
                            code.push_str(&format!("    {}_set_slice_alpha({}, {}, {});\n", prefix, obj, idx, v));
                        }
                    }
                }
                // 图例
                if let Some(true) = w.legend_enable {
                    code.push_str(&format!("    {}_enable_legend({}, true);\n", prefix, obj));
                    c!(format!("{}_set_legend_pos", prefix), w.legend_pos.map(|v| v as u8));
                    c!(format!("{}_set_legend_dir", prefix), w.legend_dir.map(|v| v as u8));
                    cclr!(format!("{}_set_legend_text_color", prefix), w.legend_text_color);
                    c!(format!("{}_set_legend_area_size", prefix), w.legend_area_size.map(|v| v as u16));
                    c!(format!("{}_set_legend_alpha", prefix), w.legend_alpha.map(|v| v as u8));
                    c!(format!("{}_set_legend_box_size", prefix), w.legend_box_size.map(|v| v as u8));
                    c!(format!("{}_set_legend_padding", prefix), w.legend_padding.map(|v| v as u8));
                    c!(format!("{}_set_legend_item_gap", prefix), w.legend_item_gap.map(|v| v as u8));
                    if let Some(true) = w.legend_bg {
                        code.push_str(&format!("    {}_enable_legend_bg({}, true);\n", prefix, obj));
                    }
                    cclr!(format!("{}_set_legend_bg_color", prefix), w.legend_bg_color);
                    cclr!(format!("{}_set_legend_border_color", prefix), w.legend_border_color);
                }
                // 扇区数据
                c!(format!("{}_set_slice_count", prefix), w.slice_count.map(|v| v as u8));
                if let Some(ref sv) = w.slice_values {
                    for (idx, val) in sv.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        if let Ok(v) = val.parse::<i32>() {
                            code.push_str(&format!("    {}_set_slice_value({}, {}, {});\n", prefix, obj, idx, v));
                        }
                    }
                }
                if let Some(ref sc) = w.slice_colors {
                    for (idx, color) in sc.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        if !color.is_empty() {
                            code.push_str(&format!("    {}_set_slice_color({}, {}, {});\n", prefix, obj, idx, sgl_color(color)));
                        }
                    }
                }
                if let Some(ref sl) = w.slice_labels {
                    for (idx, label) in sl.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        let escaped = label.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    {}_set_slice_label({}, {}, \"{}\");\n", prefix, obj, idx, escaped));
                    }
                }
            } else {
                // linechart / barchart 共用
                c!(format!("{}_set_bg_alpha", prefix), w.statusbar_bg_alpha.map(|v| v as u8));
                cclr!(format!("{}_set_border_color", prefix), w.border_color);
                // Y 轴范围
                if w.min_value.is_some() || w.max_value.is_some() {
                    code.push_str(&format!("    {}_set_axis_range({}, {}, {}, {});\n", prefix, obj, axis_y, w.min_value.unwrap_or(0), w.max_value.unwrap_or(100)));
                }
                if let Some(b) = w.auto_scale {
                    code.push_str(&format!("    {}_enable_axis_auto_scale({}, {}, {});\n", prefix, obj, axis_y, if b { "true" } else { "false" }));
                }
                if let Some(b) = w.show_y_labels {
                    let axis_x = match chart_type {
                        "barchart" => "SGL_BARCHART_AXIS_X",
                        _ => "SGL_LINECHART_AXIS_X",
                    };
                    code.push_str(&format!("    {}_enable_axis_labels({}, {}, {});\n", prefix, obj, axis_x, if b { "true" } else { "false" }));
                    code.push_str(&format!("    {}_enable_axis_labels({}, {}, {});\n", prefix, obj, axis_y, if b { "true" } else { "false" }));
                }
                // 网格
                if w.grid_color.is_some() {
                    let enable = w.grid_color.as_deref().map(|c| !c.is_empty() && c != "transparent").unwrap_or(false);
                    code.push_str(&format!("    {}_enable_axis_grid({}, {}, {});\n", prefix, obj, axis_y, if enable { "true" } else { "false" }));
                    if enable {
                        if let Some(ref gc) = w.grid_color {
                            code.push_str(&format!("    {}_set_axis_grid_color({}, {}, {}, 255);\n", prefix, obj, axis_y, sgl_color(gc)));
                        }
                    }
                    let dashed = if let Some(true) = w.grid_dashed { 1 } else { 0 };
                    code.push_str(&format!("    {}_set_axis_grid_style({}, {}, {});\n", prefix, obj, axis_y, dashed));
                }
                // 字体：同时设置 X 轴和 Y 轴的 label_font，确保 SGL 仿真中两轴都有 margin
                if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                    let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                    let axis_x = match chart_type {
                        "barchart" => "SGL_BARCHART_AXIS_X",
                        _ => "SGL_LINECHART_AXIS_X",
                    };
                    code.push_str(&format!("    {}_set_axis_label_font({}, {}, &{});\n", prefix, obj, axis_x, fid));
                    code.push_str(&format!("    {}_set_axis_label_font({}, {}, &{});\n", prefix, obj, axis_y, fid));
                }
                cclr!(format!("{}_set_axis_label_color", prefix), w.text_color);
                // 序列
                c!(format!("{}_set_series_count", prefix), w.series_count.map(|v| v as u8));
                // 序列数据 (格式: "1,2,3,4,5; 2,3,4,5,6" → 生成C数组)
                if let Some(ref sd) = w.series_data {
                    for (idx, data) in sd.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        let vals: Vec<&str> = data.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                        if !vals.is_empty() {
                            let arr_name = format!("chart_{}_series{}_ydata", obj, idx);
                            code.push_str(&format!("    static const int32_t {}[] = {{{}}};\n", arr_name, vals.join(", ")));
                            code.push_str(&format!("    {}_set_series_y_array({}, {}, {}, {});\n", prefix, obj, idx, arr_name, vals.len()));
                        }
                    }
                }
                // 序列颜色
                if let Some(ref sc) = w.series_colors {
                    for (idx, color) in sc.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                        if !color.is_empty() {
                            if chart_type == "barchart" {
                                code.push_str(&format!("    {}_set_series_color({}, {}, {}, 255);\n", prefix, obj, idx, sgl_color(color)));
                            } else {
                                code.push_str(&format!("    {}_set_series_line_color({}, {}, {});\n", prefix, obj, idx, sgl_color(color)));
                                code.push_str(&format!("    {}_set_series_fill_color({}, {}, {}, 0);\n", prefix, obj, idx, sgl_color(color)));
                            }
                        }
                    }
                }
                // X 轴标签
                if let Some(ref xl) = w.x_labels {
                    let labels: Vec<&str> = xl.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                    if !labels.is_empty() {
                        let escaped_labels: Vec<String> = labels.iter().map(|l| format!("\"{}\"", l.replace('\\', "\\\\").replace('"', "\\\""))).collect();
                        code.push_str(&format!("    const char *x_labels_{}[] = {{{}}};\n", obj, escaped_labels.join(", ")));
                        code.push_str(&format!("    {}_set_x_labels({}, x_labels_{}, {});\n", prefix, obj, obj, labels.len()));
                    }
                }
                // linechart 专用
                if chart_type == "linechart" {
                    if let Some(ref sla) = w.series_line_alpha {
                        for (idx, val) in sla.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                            if let Ok(v) = val.parse::<u32>() {
                                code.push_str(&format!("    {}_set_series_line_alpha({}, {}, {});\n", prefix, obj, idx, v));
                            }
                        }
                    }
                    if let Some(ref slw) = w.series_line_width {
                        for (idx, val) in slw.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).enumerate() {
                            if let Ok(v) = val.parse::<u32>() {
                                code.push_str(&format!("    {}_set_series_line_width({}, {}, {});\n", prefix, obj, idx, v));
                            }
                        }
                    }
                }
                // barchart 专用
                if chart_type == "barchart" {
                    if let Some(bs) = w.bar_spacing {
                        code.push_str(&format!("    {}_set_bar_spacing({}, {}, 10);\n", prefix, obj, bs));
                    }
                    c!(format!("{}_set_orientation", prefix), w.orientation.map(|v| v as u8));
                }
                // 开屏动画
                if let Some(true) = w.open_anim {
                    code.push_str(&format!("    {}_enable_open_anim({}, true);\n", prefix, obj));
                    c!(format!("{}_set_open_anim_dir", prefix), w.open_anim_dir.map(|v| v as u8));
                    if chart_type == "barchart" {
                        c!(format!("{}_set_open_anim_duration", prefix), w.open_anim_duration.map(|v| v as u16));
                    }
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
fn save_project(path: String, mut project: Project) -> Result<(), String> {
    let proj_dir = std::path::Path::new(&path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;

    // 创建资源目录
    let fonts_dir = proj_dir.join("resources").join("fonts");
    let images_dir = proj_dir.join("resources").join("images");
    std::fs::create_dir_all(&fonts_dir).map_err(|e| format!("创建字体目录失败: {}", e))?;
    std::fs::create_dir_all(&images_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;

    // 复制字体文件并更新路径为相对路径，处理同名冲突
    {
        let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        for font in &mut project.resources.fonts {
            let src = std::path::Path::new(&font.path);
            let mut dest_name = font.name.clone();
            // 处理同名冲突
            let mut counter = 1u32;
            let base_name = dest_name.clone();
            while used_names.contains(&dest_name) {
                let ext = std::path::Path::new(&base_name)
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                let stem = std::path::Path::new(&base_name)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| base_name.clone());
                dest_name = format!("{}_{}{}", stem, counter, ext);
                counter += 1;
            }
            used_names.insert(dest_name.clone());

            if src.exists() {
                let dest = fonts_dir.join(&dest_name);
                if src.canonicalize().unwrap_or_default() != dest.canonicalize().unwrap_or_default() {
                    let _ = std::fs::copy(src, &dest);
                }
            }
            font.path = format!("resources/fonts/{}", dest_name);
            font.name = dest_name;
        }
    }

    // 复制图片文件并更新路径为相对路径，处理同名冲突
    {
        let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        for img in &mut project.resources.images {
            let src = std::path::Path::new(&img.path);
            let mut dest_name = img.name.clone();
            let mut counter = 1u32;
            let base_name = dest_name.clone();
            while used_names.contains(&dest_name) {
                let ext = std::path::Path::new(&base_name)
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                let stem = std::path::Path::new(&base_name)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| base_name.clone());
                dest_name = format!("{}_{}{}", stem, counter, ext);
                counter += 1;
            }
            used_names.insert(dest_name.clone());

            if src.exists() {
                let dest = images_dir.join(&dest_name);
                if src.canonicalize().unwrap_or_default() != dest.canonicalize().unwrap_or_default() {
                    let _ = std::fs::copy(src, &dest);
                }
            }
            img.path = format!("resources/images/{}", dest_name);
            img.name = dest_name;
        }
    }

    let content = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_project(path: String) -> Result<Project, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut project: Project = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // 将相对路径还原为绝对路径
    let proj_dir = std::path::Path::new(&path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;

    for font in &mut project.resources.fonts {
        let p = std::path::Path::new(&font.path);
        if !p.is_absolute() {
            let abs = proj_dir.join(p);
            font.path = abs.to_string_lossy().to_string();
        }
    }

    for img in &mut project.resources.images {
        let p = std::path::Path::new(&img.path);
        if !p.is_absolute() {
            let abs = proj_dir.join(p);
            img.path = abs.to_string_lossy().to_string();
        }
    }

    Ok(project)
}

#[tauri::command]
fn export_code(path: String, code: String, mut project: Project) -> Result<(), String> {
    // 如果输出路径在项目目录下，尝试将图片资源相对路径转换为绝对路径
    if let Some(parent) = std::path::Path::new(&path).parent() {
        for img in &mut project.resources.images {
            let p = std::path::Path::new(&img.path);
            if !p.is_absolute() {
                let abs = parent.join(p);
                if abs.exists() {
                    img.path = abs.to_string_lossy().to_string();
                }
            }
        }
    }

    let fonts = collect_fonts(&project);

    // 创建输出目录
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // 生成图片取模文件到 pixmaps/ 子目录
    let out_dir = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new("."));
    let pixmaps_dir = out_dir.join("pixmaps");
    if pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;

    // 生成 icon 图标取模文件到 icons/ 子目录
    let icons_dir = out_dir.join("icons");
    if icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;

    std::fs::write(&path, code).map_err(|e| e.to_string())?;

    // 如果有字体配置，调用 sgl_font_conv.exe 生成字模文件
    if !fonts.is_empty() {
        let fonts_dir = out_dir.join("fonts");

        // 清空旧字模和 symbols 文件，避免残留垃圾
        if fonts_dir.exists() {
            let _ = std::fs::remove_dir_all(&fonts_dir);
        }
        std::fs::create_dir_all(&fonts_dir)
            .map_err(|e| format!("创建 fonts 目录失败: {}", e))?;

        let conv_path = find_sgl_font_conv();
        if let Some(conv) = conv_path {
            for (name, path, sz, bpp, compress, symbols) in &fonts {
                run_font_conv(&conv, name, path, *sz, *bpp, *compress, symbols, &fonts_dir)
                    .map_err(|e| format!("生成字模 {} 失败: {}", name, e))?;
            }
        } else {
            return Err("未找到 sgl_font_conv.exe，请确保其在设计器 exe 同目录或 PATH 中".to_string());
        }
    }
    Ok(())
}

const SGL_FONT_CONV_EXE: &[u8] = include_bytes!("../resources/sgl_font_conv.exe");

// ============ 编译相关命令 ============

/// 在 PATH 中查找命令，返回完整路径
fn which_command_path(name: &str) -> Option<String> {
    if let Ok(paths) = std::env::var("PATH") {
        for p in std::env::split_paths(&paths) {
            let full = p.join(format!("{}.exe", name));
            if full.exists() {
                return Some(full.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// 执行命令并将 stdout/stderr 实时推送到前端控制台（build-log 事件）
fn run_command_stream(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
    window: &tauri::Window,
) -> Result<std::process::ExitStatus, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let mut child = Command::new(program)
        .current_dir(cwd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", program, e))?;

    let stdout = child.stdout.take().ok_or("无法捕获标准输出")?;
    let stderr = child.stderr.take().ok_or("无法捕获标准错误")?;
    let w_out = window.clone();
    let w_err = window.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_out.emit("build-log", serde_json::json!({"message": l, "level": "info"}));
            }
        }
    });

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_err.emit("build-log", serde_json::json!({"message": l, "level": "error"}));
            }
        }
    });

    child.wait().map_err(|e| format!("等待 {} 结束失败: {}", program, e))
}

/// 带超时和环境变量的 run_command_stream（用于 git 网络操作）
/// timeout_secs: 总超时秒数（0 表示不超时）
/// envs: 额外环境变量（如 GIT_HTTP_LOW_SPEED_TIME 用于低速检测）
/// 超时会杀掉子进程并返回错误，避免网络问题导致无限卡住
fn run_command_stream_with_timeout(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
    window: &tauri::Window,
    timeout_secs: u64,
    envs: &[(&str, &str)],
) -> Result<std::process::ExitStatus, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::time::Duration;

    let mut cmd = Command::new(program);
    cmd.current_dir(cwd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in envs {
        cmd.env(k, v);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", program, e))?;

    let stdout = child.stdout.take().ok_or("无法捕获标准输出")?;
    let stderr = child.stderr.take().ok_or("无法捕获标准错误")?;
    let w_out = window.clone();
    let w_err = window.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_out.emit("build-log", serde_json::json!({"message": l, "level": "info"}));
            }
        }
    });

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_err.emit("build-log", serde_json::json!({"message": l, "level": "error"}));
            }
        }
    });

    // 轮询等待，超时则杀掉进程
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                if timeout_secs > 0 && start.elapsed() >= Duration::from_secs(timeout_secs) {
                    let _ = child.kill();
                    return Err(format!(
                        "{} 执行超时（{} 秒），可能无法访问 GitHub，请检查网络连接",
                        program, timeout_secs
                    ));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("等待 {} 结束失败: {}", program, e)),
        }
    }
}

/// 快速检测 GitHub 是否可达（git ls-remote 测试，5 秒超时）
/// 返回 true 表示可达，false 表示不可达
fn check_github_reachable(window: &tauri::Window) -> bool {
    let _ = window.emit(
        "build-log",
        serde_json::json!({"message": "正在检测 GitHub 网络连通性...", "level": "info"}),
    );
    // 用 git ls-remote 测试 GitHub 连通性，5 秒超时
    // GIT_HTTP_LOW_SPEED_TIME=3 + GIT_HTTP_LOW_SPEED_LIMIT=1000 表示连续 3 秒速度低于 1KB/s 即中止
    let result = run_command_stream_with_timeout(
        "git",
        &["ls-remote", "--heads", "https://github.com/sgl-org/sgl.git"],
        std::path::Path::new("."),
        window,
        8,
        &[
            ("GIT_HTTP_LOW_SPEED_TIME", "3"),
            ("GIT_HTTP_LOW_SPEED_LIMIT", "1000"),
        ],
    );
    match result {
        Ok(status) if status.success() => {
            let _ = window.emit(
                "build-log",
                serde_json::json!({"message": "GitHub 网络连通性正常", "level": "info"}),
            );
            true
        }
        _ => {
            let _ = window.emit(
                "build-log",
                serde_json::json!({"message": "无法访问 GitHub，请检查网络连接或代理设置", "level": "error"}),
            );
            false
        }
    }
}

fn copy_dir_contents(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("创建目录 {} 失败: {}", dst.to_string_lossy(), e))?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("读取目录 {} 失败: {}", src.to_string_lossy(), e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(src_path.file_name().unwrap_or_default());
        if src_path.is_dir() {
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "复制 {} 到 {} 失败: {}",
                    src_path.to_string_lossy(),
                    dst_path.to_string_lossy(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

/// 获取指定 git 仓库的 HEAD commit hash（失败返回 None）
fn git_head_hash(repo_dir: &std::path::Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .current_dir(repo_dir)
        .args(&["rev-parse", "HEAD"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let h = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if h.is_empty() { None } else { Some(h) }
}

/// 判断 local 仓库的 HEAD 是否是 target 仓库 HEAD 的祖先（即 local 版本落后于 target）
/// 通过 git merge-base --is-ancestor 实现
/// 返回 Some(true) 表示 local 落后于 target；Some(false) 表示 local 不落后；None 表示无法判断
fn git_is_ancestor(_local_repo: &std::path::Path, local_hash: &str, target_repo: &std::path::Path, target_hash: &str) -> Option<bool> {
    // 在 target 仓库中判断 local_hash 是否是 target_hash 的祖先
    // 需要 target 仓库能识别 local_hash（通常两仓库同源，commit hash 通用）
    let out = std::process::Command::new("git")
        .current_dir(target_repo)
        .args(&["merge-base", "--is-ancestor", local_hash, target_hash])
        .output()
        .ok()?;
    // exit 0: local 是 target 的祖先（local 落后）；exit 1: 不是；其他: 错误
    match out.status.code() {
        Some(0) => Some(true),
        Some(1) => Some(false),
        _ => None,
    }
}

/// 比较设计器本地 sgl 与用户项目 sgl 的版本，判断是否可以安全同步源码
/// 只有设计器本地版本 >= 用户项目版本时才返回 true（可以同步）
/// 无法判断版本关系时保守返回 true（保持原有同步行为，避免破坏正常工作流）
fn sgl_version_compare_for_sync(
    local_sgl_dir: &std::path::Path,
    port_sgl_dir: &std::path::Path,
    window: &tauri::Window,
) -> bool {
    // 任一目录不是 git 仓库则无法比较，保守允许同步
    let local_hash = match git_head_hash(local_sgl_dir) {
        Some(h) => h,
        None => return true,
    };
    let port_hash = match git_head_hash(port_sgl_dir) {
        Some(h) => h,
        None => return true,
    };

    // 版本相同，可以同步（用于同步设计器对 sgl 的修改）
    if local_hash == port_hash {
        return true;
    }

    // 判断设计器本地是否落后于用户项目
    match git_is_ancestor(local_sgl_dir, &local_hash, port_sgl_dir, &port_hash) {
        Some(true) => {
            // 设计器本地落后，不允许同步（避免覆盖用户项目的最新 sgl）
            let _ = window.emit(
                "build-log",
                serde_json::json!({
                    "message": format!(
                        "设计器内置 SGL 库({}) 落后于用户项目 SGL 库({})，跳过源码同步",
                        &local_hash[..7.min(local_hash.len())],
                        &port_hash[..7.min(port_hash.len())]
                    ),
                    "level": "warn"
                }),
            );
            false
        }
        Some(false) => {
            // 设计器本地领先或分叉，可以同步
            true
        }
        None => {
            // 无法判断（如分叉历史），保守允许同步
            let _ = window.emit(
                "build-log",
                serde_json::json!({
                    "message": "无法判断设计器与用户项目 SGL 库的版本关系，保守执行源码同步",
                    "level": "info"
                }),
            );
            true
        }
    }
}

/// 简单的字节哈希（FNV-1a 32位），用于检测文件内容变化
fn simple_hash(bytes: &[u8]) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for &b in bytes {
        hash ^= b as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{:08x}", hash)
}

/// 列出字模目录下所有 .c 文件名（排序后用换行拼接），用于检测字模增删
fn list_font_files(fonts_dir: &std::path::Path) -> String {
    let mut files: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(fonts_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "c" {
                    if let Some(name) = entry.file_name().to_str() {
                        files.push(name.to_string());
                    }
                }
            }
        }
    }
    files.sort();
    files.join("\n")
}

/// 递归同步 SGL 库源码（仅 .c 和 .h 文件，排除 sgl_config.h 以免覆盖 demo 同步的配置）
/// 总是用 copy 覆盖目标文件（更新时间戳），确保 make 检测到 .c 比 .obj 新而重新编译
/// 返回真正发生内容变化的文件数（用于决定是否清理 build 目录）
fn sync_sgl_source(src: &std::path::Path, dst: &std::path::Path) -> Result<usize, String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("创建目录 {} 失败: {}", dst.to_string_lossy(), e))?;
    let mut count = 0;
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("读取目录 {} 失败: {}", src.to_string_lossy(), e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(src_path.file_name().unwrap_or_default());
        if src_path.is_dir() {
            count += sync_sgl_source(&src_path, &dst_path)?;
        } else if let Some(ext) = src_path.extension() {
            // 同步 .c/.h 源文件（排除 sgl_config.h）和 .cmake 构建配置文件
            // .cmake 文件（如 widgets/build.cmake）定义了哪些源文件参与编译，
            // 必须与源码一起同步，否则新增的控件源文件（如 chart）不会被加入编译
            let is_syncable = (ext == "c" || ext == "h" || ext == "cmake")
                && src_path.file_name() != Some(std::ffi::OsStr::new("sgl_config.h"));
            if is_syncable {
                let src_bytes = std::fs::read(&src_path)
                    .map_err(|e| format!("读取源文件 {} 失败: {}", src_path.to_string_lossy(), e))?;
                let dst_bytes = std::fs::read(&dst_path).unwrap_or_default();
                if src_bytes != dst_bytes {
                    // 内容变化才写入，保留未变化文件的时间戳，让 make 按时间戳增量编译
                    std::fs::write(&dst_path, &src_bytes).map_err(|e| {
                        format!("同步 {} 失败: {}", src_path.to_string_lossy(), e)
                    })?;
                    count += 1;
                }
                // 内容相同则不写入，保留原文件时间戳，make 不会重编译该文件
            }
        }
    }
    Ok(count)
}

/// 导出代码到项目目录的 code/ 子文件夹
#[tauri::command]
fn export_code_to_project(mut project: Project, project_path: String, code: String) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let code_dir = proj_dir.join("code");
    std::fs::create_dir_all(&code_dir).map_err(|e| format!("创建 code 目录失败: {}", e))?;

    // 将图片资源相对路径转换为绝对路径，便于取模
    for img in &mut project.resources.images {
        let p = std::path::Path::new(&img.path);
        if !p.is_absolute() {
            img.path = proj_dir.join(p).to_string_lossy().to_string();
        }
    }

    // 生成代码
    let fonts = collect_fonts(&project);

    // 生成图片取模文件到 code/pixmaps/ 子目录
    let pixmaps_dir = code_dir.join("pixmaps");
    if pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;

    // 生成 icon 图标取模文件到 code/icons/ 子目录
    let icons_dir = code_dir.join("icons");
    if icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;

    // 写入 code/ui.c
    let ui_c = code_dir.join("ui.c");
    std::fs::write(&ui_c, &code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

    // 生成 sgl_config.h 到 code 目录
    let pixel_depth = match project.color_depth.as_str() {
        "8bit" => 8,
        "16bit" => 16,
        "24bit" => 24,
        _ => 32,
    };
    project.sgl_config.fbdev_pixel_depth = pixel_depth;
    let code_config_path = code_dir.join("sgl_config.h");
    generate_sgl_config_h(&project.sgl_config, &code_config_path)?;

    // 生成字模文件到 code/fonts/ 目录
    if !fonts.is_empty() {
        let fonts_dir = code_dir.join("fonts");
        if fonts_dir.exists() {
            let _ = std::fs::remove_dir_all(&fonts_dir);
        }
        std::fs::create_dir_all(&fonts_dir)
            .map_err(|e| format!("创建 fonts 目录失败: {}", e))?;

        let conv_path = find_sgl_font_conv();
        if let Some(conv) = conv_path {
            for (name, path, sz, bpp, compress, symbols) in &fonts {
                run_font_conv(&conv, name, path, *sz, *bpp, *compress, symbols, &fonts_dir)
                    .map_err(|e| format!("生成字模 {} 失败: {}", name, e))?;
            }
        } else {
            return Err("未找到 sgl_font_conv.exe".to_string());
        }
    }

    Ok(format!("代码已导出到 {}", code_dir.to_string_lossy()))
}

/// 检查编译工具链
#[tauri::command]
fn check_toolchain(project_path: String) -> Result<serde_json::Value, String> {
    let mut result = serde_json::Map::new();

    // 检查 gcc（从 PATH 查找）
    let gcc_path = which_command_path("gcc");
    result.insert("gcc_found".into(), serde_json::Value::Bool(gcc_path.is_some()));
    if let Some(ref p) = gcc_path {
        result.insert("gcc_path".into(), serde_json::Value::String(p.clone()));
    }

    // 检查 g++（C++ 编译器，部分 SGL 依赖可能需要）
    let gpp_path = which_command_path("g++");
    result.insert("gpp_found".into(), serde_json::Value::Bool(gpp_path.is_some()));

    // 检查 mingw32-make（MinGW 构建工具）
    let mingw_make_path = which_command_path("mingw32-make");
    result.insert("mingw32_make_found".into(), serde_json::Value::Bool(mingw_make_path.is_some()));
    if let Some(ref p) = mingw_make_path {
        result.insert("mingw32_make_path".into(), serde_json::Value::String(p.clone()));
    }

    // 检查 cmake
    let cmake_path = which_command_path("cmake");
    result.insert("cmake_found".into(), serde_json::Value::Bool(cmake_path.is_some()));
    if let Some(ref p) = cmake_path {
        result.insert("cmake_path".into(), serde_json::Value::String(p.clone()));
    }

    // 检查 git
    let git_path = which_command_path("git");
    result.insert("git_found".into(), serde_json::Value::Bool(git_path.is_some()));

    // 检查 sgl-port 项目是否已存在
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    let sgl_port_exists = sgl_port_dir.exists()
        && sgl_port_dir.join("CMakelists.txt").exists()
        && sgl_port_dir.join("demo").exists();
    result.insert("sgl_port_exists".into(), serde_json::Value::Bool(sgl_port_exists));
    result.insert("sgl_port_path".into(), serde_json::Value::String(sgl_port_dir.to_string_lossy().to_string()));

    // 检查 SDL2 开发库（sgl-port 自带，检查是否存在）
    let sdl_dir = sgl_port_dir.join("demo").join("sdl");
    let sdl_include = sdl_dir.join("include").join("SDL2").join("SDL.h");
    let sdl_lib = sdl_dir.join("lib").join("libSDL2.a");
    let sdl_dll = sdl_dir.join("bin").join("SDL2.dll");
    result.insert(
        "sdl2_found".into(),
        serde_json::Value::Bool(sdl_include.exists() && sdl_lib.exists() && sdl_dll.exists()),
    );

    // 检查 code 目录是否已导出
    let code_dir = proj_dir.join("code");
    result.insert("code_exported".into(), serde_json::Value::Bool(code_dir.join("ui.c").exists()));

    Ok(serde_json::Value::Object(result))
}

/// 检查 sgl 子模块是否为最新版本（不更新，仅检查）
#[tauri::command]
fn check_sgl_submodule_status(
    project_path: String,
    window: tauri::Window,
) -> Result<serde_json::Value, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");

    if !sgl_port_dir.exists() {
        return Ok(serde_json::json!({ "exists": false, "up_to_date": false, "msg": "sgl-port 项目不存在" }));
    }

    let submodule_path = sgl_submodule_path(&sgl_port_dir);
    if !submodule_path.exists() || !submodule_path.join(".git").exists() {
        return Ok(serde_json::json!({ "exists": false, "up_to_date": false, "msg": "sgl 子模块尚未初始化" }));
    }

    // 同时检测设计器自身 sgl 库是否落后远程（不影响子模块状态判断，仅供前端提示）
    let designer_sgl_outdated = check_designer_sgl_outdated(&window);

    match is_sgl_submodule_up_to_date(&sgl_port_dir, &window) {
        Ok(true) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": true,
            "designer_sgl_outdated": designer_sgl_outdated,
            "msg": if designer_sgl_outdated {
                "用户项目 sgl 子模块已是最新，但设计器内置 SGL 库有新版本可用（建议更新设计器）".to_string()
            } else {
                "sgl 子模块已是最新版本".to_string()
            }
        })),
        Ok(false) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": false,
            "designer_sgl_outdated": designer_sgl_outdated,
            "msg": "sgl 子模块有新版本可用".to_string()
        })),
        Err(e) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": false,
            "designer_sgl_outdated": designer_sgl_outdated,
            "msg": format!("检查失败: {}", e)
        })),
    }
}

/// 检测设计器自身 sgl 库（CARGO_MANIFEST_DIR/sgl）是否落后远程仓库
/// 返回 true 表示落后（有新版本可用），false 表示最新或无法判断
fn check_designer_sgl_outdated(window: &tauri::Window) -> bool {
    let app_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let local_sgl_dir = app_dir.join("sgl");
    if !local_sgl_dir.exists() || !local_sgl_dir.join(".git").exists() {
        return false;
    }

    // 带超时的 fetch（复用子模块的 fetch 逻辑，15 秒超时）
    match run_git_fetch_with_timeout(&local_sgl_dir, window, 15) {
        Ok(status) if status.success() => {}
        _ => {
            // fetch 失败（网络问题等），无法判断，不阻塞用户
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "无法获取设计器内置 SGL 库的远程版本（可能无法访问 GitHub）", "level": "info" }),
            );
            return false;
        }
    }

    let local_hash = match git_head_hash(&local_sgl_dir) {
        Some(h) => h,
        None => return false,
    };

    // 获取远程 main 分支的 commit
    let remote_out = std::process::Command::new("git")
        .current_dir(&local_sgl_dir)
        .args(&["rev-parse", "origin/main"])
        .output();
    let remote_hash = match remote_out {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => return false,
    };

    if remote_hash.is_empty() {
        return false;
    }

    let outdated = local_hash != remote_hash;
    if outdated {
        let _ = window.emit(
            "build-log",
            serde_json::json!({
                "message": format!(
                    "设计器内置 SGL 库有新版本可用（本地: {}, 远程: {}），建议更新设计器的 sgl 目录",
                    &local_hash[..7.min(local_hash.len())],
                    &remote_hash[..7.min(remote_hash.len())]
                ),
                "level": "warn"
            }),
        );
    }
    outdated
}

fn sgl_submodule_path(sgl_port_dir: &std::path::Path) -> std::path::PathBuf {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(sgl_port_dir)
        .args(&["config", "-f", ".gitmodules", "--get", "submodule.sgl.path"])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let p = String::from_utf8_lossy(&o.stdout).trim().to_string();
            sgl_port_dir.join(p)
        }
        _ => sgl_port_dir.join("sgl"),
    }
}

fn sgl_submodule_branch(sgl_port_dir: &std::path::Path) -> String {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(sgl_port_dir)
        .args(&["config", "-f", ".gitmodules", "--get", "submodule.sgl.branch"])
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "main".to_string(),
    }
}

/// 带超时的 git fetch（国内访问 GitHub 可能失败，设置 15 秒总超时 + 网络低速超时）
/// GIT_HTTP_LOW_SPEED_TIME=5 表示连续 5 秒速度低于 GIT_HTTP_LOW_SPEED_LIMIT(1000 字节/秒) 即中止
fn run_git_fetch_with_timeout(
    submodule_path: &std::path::Path,
    window: &tauri::Window,
    timeout_secs: u64,
) -> Result<std::process::ExitStatus, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::time::Duration;

    let mut child = Command::new("git")
        .current_dir(submodule_path)
        .args(&["fetch", "origin"])
        .env("GIT_HTTP_LOW_SPEED_TIME", "5")
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "1000")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 git fetch 失败: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法捕获标准输出")?;
    let stderr = child.stderr.take().ok_or("无法捕获标准错误")?;
    let w_out = window.clone();
    let w_err = window.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_out.emit("build-log", serde_json::json!({"message": l, "level": "info"}));
            }
        }
    });

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w_err.emit("build-log", serde_json::json!({"message": l, "level": "error"}));
            }
        }
    });

    // 轮询等待，超时则杀掉进程
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) => {
                if start.elapsed() >= Duration::from_secs(timeout_secs) {
                    let _ = child.kill();
                    return Err(format!("git fetch 超时（{} 秒），可能无法访问 GitHub", timeout_secs));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(format!("等待 git fetch 结束失败: {}", e)),
        }
    }
}

/// 检查 sgl 子模块本地版本是否与远程一致（git fetch 日志实时输出到控制台）
fn is_sgl_submodule_up_to_date(
    sgl_port_dir: &std::path::Path,
    window: &tauri::Window,
) -> Result<bool, String> {
    use std::process::Command;
    let submodule_path = sgl_submodule_path(sgl_port_dir);
    if !submodule_path.exists() || !submodule_path.join(".git").exists() {
        return Ok(false);
    }
    let branch = sgl_submodule_branch(sgl_port_dir);

    // 带超时的 fetch，避免国内访问 GitHub 长时间挂起
    let fetch_status = run_git_fetch_with_timeout(&submodule_path, window, 15)
        .map_err(|e| format!("获取 sgl 子模块远程信息失败: {}", e))?;
    if !fetch_status.success() {
        return Err("获取 sgl 子模块远程信息失败（可能无法访问 GitHub）".to_string());
    }

    let local = Command::new("git")
        .current_dir(&submodule_path)
        .args(&["rev-parse", "HEAD"])
        .output()
        .map_err(|e| format!("获取 sgl 子模块本地版本失败: {}", e))?;
    let local_rev = String::from_utf8_lossy(&local.stdout).trim().to_string();

    let remote = Command::new("git")
        .current_dir(&submodule_path)
        .args(&["rev-parse", &format!("origin/{}", branch)])
        .output()
        .map_err(|e| format!("获取 sgl 子模块远程版本失败: {}", e))?;
    let remote_rev = String::from_utf8_lossy(&remote.stdout).trim().to_string();

    Ok(!local_rev.is_empty() && !remote_rev.is_empty() && local_rev == remote_rev)
}

/// 将 sgl-port 仓库的 sgl 子模块更新到远程最新分支；先检查版本，已最新则跳过
fn update_sgl_submodules_to_latest(
    sgl_port_dir: &std::path::Path,
    window: &tauri::Window,
) -> Result<String, String> {
    use std::process::Command;

    // 让子模块跟踪 main 分支（仅对 sgl 子模块做此配置）
    let _ = Command::new("git")
        .current_dir(sgl_port_dir)
        .args(&["config", "-f", ".gitmodules", "submodule.sgl.branch", "main"])
        .output();
    let _ = Command::new("git")
        .current_dir(sgl_port_dir)
        .args(&["submodule", "sync", "--recursive"])
        .output();

    // sync_sgl_source 会修改 sgl-port/sgl/source 下的文件，导致子模块有本地修改
    // 更新前必须清理这些修改（git checkout），否则 git submodule update 会因 checkout 冲突失败
    // 注：这些修改是设计器 sync_sgl_source 产生的，清理后会在更新后重新同步，安全
    let submodule_path = sgl_submodule_path(sgl_port_dir);
    if submodule_path.exists() && submodule_path.join(".git").exists() {
        let _ = window.emit(
            "build-log",
            serde_json::json!({"message": "清理 sgl 子模块本地修改（sync_sgl_source 产生）", "level": "info"}),
        );
        // git checkout . 会还原已跟踪文件的修改，git clean -fd 会删除未跟踪文件和目录
        let _ = Command::new("git")
            .current_dir(&submodule_path)
            .args(&["checkout", "."])
            .output();
        let _ = Command::new("git")
            .current_dir(&submodule_path)
            .args(&["clean", "-fd"])
            .output();
    }

    // 先对比本地与远程版本，已最新则跳过网络更新
    match is_sgl_submodule_up_to_date(sgl_port_dir, window) {
        Ok(true) => return Ok("sgl 子模块已是最新版本，跳过更新".to_string()),
        Ok(false) => {}
        Err(e) => eprintln!("检查 sgl 子模块版本失败，继续尝试更新: {}", e),
    }

    // 网络预检测：GitHub 不可达时直接返回错误，避免 submodule update 卡住
    if !check_github_reachable(window) {
        return Err("无法访问 GitHub，已跳过子模块更新。请检查网络连接或代理设置后重试".to_string());
    }

    // 拉取子模块远程最新代码，并实时输出到控制台
    // 设置 90 秒总超时 + 低速检测（连续 5 秒速度低于 1KB/s 即中止），避免网络问题无限卡住
    let status = run_command_stream_with_timeout(
        "git",
        &["submodule", "update", "--init", "--recursive", "--remote"],
        sgl_port_dir,
        window,
        90,
        &[
            ("GIT_HTTP_LOW_SPEED_TIME", "5"),
            ("GIT_HTTP_LOW_SPEED_LIMIT", "1000"),
        ],
    )
    .map_err(|e| format!("初始化/更新子模块失败: {}", e))?;

    if !status.success() {
        return Err("子模块更新失败: 无法访问 GitHub，请检查网络连接".to_string());
    }

    Ok("sgl 子模块已更新到最新版本".to_string())
}

/// 独立的 SGL 子模块更新命令（前端在 build_project 之前调用）
/// 返回 JSON：{ success: bool, msg: string }
/// 失败时不中断流程，让前端可以弹窗询问用户是否以旧代码继续编译
#[tauri::command]
fn update_sgl_submodules(
    project_path: String,
    window: tauri::Window,
) -> Result<serde_json::Value, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");

    if !sgl_port_dir.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "msg": "sgl-port 项目不存在，无法更新子模块"
        }));
    }

    match update_sgl_submodules_to_latest(&sgl_port_dir, &window) {
        Ok(msg) => Ok(serde_json::json!({ "success": true, "msg": msg })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "msg": format!("SGL 库更新失败: {}", e)
        })),
    }
}

/// 克隆 sgl-port-windows-vscode 到项目目录
#[tauri::command]
fn clone_sgl_port(project_path: String, window: tauri::Window) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");

    // 检查 git
    if which_command_path("git").is_none() {
        return Err("未找到 git，请先安装 Git 并添加到环境变量".to_string());
    }

    // 如果不存在则克隆，从 GitHub 主仓库拉取，并实时输出到控制台
    if !sgl_port_dir.exists() || !sgl_port_dir.join("CMakelists.txt").exists() {
        // 网络预检测：GitHub 不可达时直接返回错误，避免 clone 卡住
        if !check_github_reachable(&window) {
            return Err("无法访问 GitHub，已跳过克隆。请检查网络连接或代理设置后重试".to_string());
        }
        let github_url = "https://github.com/sgl-org/sgl-port-windows-vscode.git";

        // clone 下载量较大，设置 180 秒总超时 + 低速检测
        let status = run_command_stream_with_timeout(
            "git",
            &["clone", github_url, sgl_port_dir.to_string_lossy().as_ref()],
            proj_dir,
            &window,
            180,
            &[
                ("GIT_HTTP_LOW_SPEED_TIME", "5"),
                ("GIT_HTTP_LOW_SPEED_LIMIT", "1000"),
            ],
        )
        .map_err(|e| format!("执行 git clone 失败: {}", e))?;

        if !status.success() {
            return Err("克隆失败: 无法从 GitHub 拉取 sgl-port-windows-vscode".to_string());
        }
    }

    // 确保子模块已初始化并更新到远程最新 main 分支（用户无感）
    let _submodule_msg = update_sgl_submodules_to_latest(&sgl_port_dir, &window)?;

    // 复制 sgl_config.h
    let config_src = sgl_port_dir.join("demo").join("sgl_config.h");
    let config_dst = sgl_port_dir.join("sgl").join("source").join("sgl_config.h");
    if config_src.exists() {
        let _ = std::fs::copy(&config_src, &config_dst);
    }

    // 删除原始的 demo/bg.c 和 demo/test.c，只使用设计器生成的 ui.c
    let demo_dir = sgl_port_dir.join("demo");
    let _ = std::fs::remove_file(demo_dir.join("bg.c"));
    let _ = std::fs::remove_file(demo_dir.join("test.c"));

    // 修改 CMakelists.txt：将 test.c 和 bg.c 替换为 ui.c
    let cmake_path = sgl_port_dir.join("CMakelists.txt");
    if let Ok(cmake_content) = std::fs::read_to_string(&cmake_path) {
        let updated = cmake_content
            .replace("${DEMO_DIR}/test.c", "${DEMO_DIR}/ui.c")
            .replace("${DEMO_DIR}/bg.c", "");
        // 清理可能产生的空行
        let cleaned: String = updated.lines()
            .filter(|line| line.trim().len() > 0 || !line.contains("DEMO_DIR"))
            .collect::<Vec<_>>()
            .join("\n");
        let _ = std::fs::write(&cmake_path, cleaned);
    }

    Ok("sgl-port 项目已就绪".to_string())
}

/// 根据项目配置生成 sgl_config.h
fn generate_sgl_config_h(config: &SglConfig, path: &std::path::Path) -> Result<(), String> {
    let content = format!(
        r#"//********************************************************************
//* SGL Configuration File                                           //
//* You can modify the following parameters according to your needs. //
//********************************************************************

#ifndef  __SGL_CONFIG_H__
#define  __SGL_CONFIG_H__


#define  CONFIG_SGL_FBDEV_PIXEL_DEPTH                      {}
#define  CONFIG_SGL_FBDEV_ROTATION                         {}
#define  CONFIG_SGL_FBDEV_RUNTIME_ROTATION                 {}
#define  CONFIG_SGL_FBDEV_EVEN_COORDS                      {}
#define  CONFIG_SGL_USE_FBDEV_VRAM                         {}
#define  CONFIG_SGL_SYSTICK_MS                             {}
#define  CONFIG_SGL_EVENT_QUEUE_SIZE                       {}
#define  CONFIG_SGL_DIRTY_AREA_NUM_MAX                     {}
#define  CONFIG_SGL_COLOR16_SWAP                           {}
#define  CONFIG_SGL_FOCUSED_COLOR                          {}
#define  CONFIG_SGL_FOCUSED_WIDTH                          {}
#define  CONFIG_SGL_DIRTY_AREA_TRACE                       {}
#define  CONFIG_SGL_DIRTY_AREA_TRACE_COLOR                 {}
#define  CONFIG_SGL_MONITOR_TRACE                          {}
#define  CONFIG_SGL_PIXMAP_BILINEAR_INTERP                 {}
#define  CONFIG_SGL_ANIMATION                              {}
#define  CONFIG_SGL_DEBUG                                  {}
#define  CONFIG_SGL_LOG_COLOR                              {}
#define  CONFIG_SGL_LOG_LEVEL                              {}
#define  CONFIG_SGL_OBJ_USE_NAME                           {}
#define  CONFIG_SGL_FONT_COMPRESSED                        {}
#define  CONFIG_SGL_FONT_SMALL_TABLE                       {}
#define  CONFIG_SGL_BOOT_LOGO                              {}
#define  CONFIG_SGL_THEME_DARK                             {}
#define  CONFIG_SGL_HEAP_ALGO                              {}
#define  CONFIG_SGL_HEAP_MEMORY_SIZE                       {}
#define  CONFIG_SGL_LABEL_ROTATION                         {}
#define  CONFIG_SGL_FONT_SONG23                            {}
#define  CONFIG_SGL_FONT_CONSOLAS14                        {}
#define  CONFIG_SGL_FONT_CONSOLAS23                        {}
#define  CONFIG_SGL_FONT_CONSOLAS24                        {}
#define  CONFIG_SGL_FONT_CONSOLAS32                        {}
#define  CONFIG_SGL_FONT_CONSOLAS24_COMPRESS               {}


#endif  //!__SGL_CONFIG_H__
"#,
        config.fbdev_pixel_depth,
        config.fbdev_rotation,
        config.fbdev_runtime_rotation,
        config.fbdev_even_coords,
        config.use_fbdev_vram,
        config.systick_ms,
        config.event_queue_size,
        config.dirty_area_num_max,
        config.color16_swap,
        hex_to_sgl_rgb(&config.focused_color),
        config.focused_width,
        config.dirty_area_trace,
        hex_to_sgl_rgb(&config.dirty_area_trace_color),
        config.monitor_trace,
        config.pixmap_bilinear_interp,
        config.animation,
        config.debug,
        config.log_color,
        config.log_level,
        config.obj_use_name,
        config.font_compressed,
        config.font_small_table,
        config.boot_logo,
        config.theme_dark,
        config.heap_algo,
        config.heap_memory_size,
        config.label_rotation,
        config.font_song23,
        config.font_consolas14,
        config.font_consolas23,
        config.font_consolas24,
        config.font_consolas32,
        config.font_consolas24_compress
    );
    std::fs::write(path, content).map_err(|e| format!("写入 sgl_config.h 失败: {}", e))
}

/// 复制导出的代码到 sgl-port 项目并编译
#[tauri::command]
fn build_project(
    mut project: Project,
    project_path: String,
    code: String,
    update_sgl: Option<bool>,
    window: tauri::Window,
) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    let code_dir = proj_dir.join("code");

    // 编译工具链检查（双重保险，防止前端绕过）
    let missing = {
        let mut v = vec![];
        if which_command_path("gcc").is_none() { v.push("gcc"); }
        if which_command_path("g++").is_none() { v.push("g++"); }
        if which_command_path("mingw32-make").is_none() { v.push("mingw32-make"); }
        if which_command_path("cmake").is_none() { v.push("cmake"); }
        v
    };
    if !missing.is_empty() {
        return Err(format!(
            "缺少编译工具：{}。请安装 MinGW-w64 和 CMake，并添加到系统环境变量 PATH 中。",
            missing.join("、")
        ));
    }

    // 将图片资源相对路径转换为绝对路径，便于取模
    for img in &mut project.resources.images {
        let p = std::path::Path::new(&img.path);
        if !p.is_absolute() {
            img.path = proj_dir.join(p).to_string_lossy().to_string();
        }
    }

    // 检查 sgl-port 项目，不存在则自动克隆
    if !sgl_port_dir.exists() || !sgl_port_dir.join("CMakelists.txt").exists() {
        clone_sgl_port(project_path.clone(), window.clone())?;
    }

    // SGL 子模块更新已由前端通过 update_sgl_submodules 命令独立完成（支持失败时弹窗询问用户）
    // 这里保留 update_sgl 参数仅为向后兼容，不再实际执行更新
    let submodule_msg = if update_sgl.unwrap_or(false) {
        "SGL 子模块更新已由前端独立完成".to_string()
    } else {
        "已跳过 sgl 子模块更新".to_string()
    };

    // 同步设计器内置 SGL 库源码（sgl/source/）到 sgl-port-windows-vscode/sgl/source/
    // 确保设计器对 SGL 库的修改（如 sgl_draw_rect.c 格式解码、sgl_checkbox.h 新 API）在仿真器中生效
    // 源路径使用编译时设计器项目根目录，而非用户项目目录（用户项目可能没有 sgl/ 子目录）
    //
    // 版本保护：只有当设计器本地 sgl 版本 >= 用户项目 sgl 版本时才同步源码，
    // 避免设计器本地 sgl 落后时覆盖用户项目的最新 sgl（导致编译失败）
    let app_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let local_sgl_source = app_dir.join("sgl").join("source");
    let port_sgl_source = sgl_port_dir.join("sgl").join("source");
    let mut sgl_source_changed = false;
    if local_sgl_source.exists() {
        // 比较设计器本地 sgl 与用户项目 sgl 的 git 版本
        let local_sgl_dir = app_dir.join("sgl");
        let port_sgl_dir = sgl_port_dir.join("sgl");
        let can_sync = sgl_version_compare_for_sync(&local_sgl_dir, &port_sgl_dir, &window);
        if can_sync {
            match sync_sgl_source(&local_sgl_source, &port_sgl_source) {
                Ok(n) => {
                    if n > 0 {
                        sgl_source_changed = true;
                        let _ = window.emit(
                            "build-log",
                            serde_json::json!({ "message": format!("已同步 {} 个 SGL 库源文件，make 将增量重编译这些文件", n), "level": "info" }),
                        );
                    }
                }
                Err(e) => {
                    let _ = window.emit(
                        "build-log",
                        serde_json::json!({ "message": format!("同步 SGL 库源码失败: {}", e), "level": "warn" }),
                    );
                }
            }
        } else {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "设计器内置 SGL 库版本落后于用户项目，跳过源码同步以保留用户项目的最新版本", "level": "warn" }),
            );
        }
    }

    // 清理旧的 demo/bg.c 和 demo/test.c，只使用设计器生成的 ui.c
    let demo_dir = sgl_port_dir.join("demo");
    let _ = std::fs::remove_file(demo_dir.join("bg.c"));
    let _ = std::fs::remove_file(demo_dir.join("test.c"));

    // 确保 CMakelists.txt 使用 ui.c 而非 test.c 和 bg.c，并修复 widgets GLOB 递归问题
    let cmake_path = sgl_port_dir.join("CMakelists.txt");
    if let Ok(cmake_content) = std::fs::read_to_string(&cmake_path) {
        let mut updated = cmake_content
            .replace("${DEMO_DIR}/test.c", "${DEMO_DIR}/ui.c")
            .replace("${DEMO_DIR}/bg.c\n", "\n")
            .replace("${DEMO_DIR}/bg.c", "");
        // sgl-port 的 CMakeLists.txt 使用 file(GLOB ... widgets/*/*.c) 只匹配一层深度，
        // 但 chart 控件源文件在 widgets/chart/piechart/ 等两层深度目录中，需要 GLOB_RECURSE
        updated = updated.replace(
            "file(GLOB SGL_WIDGETS_SOURCES ${SGL_ROOT_DIR}/sgl/source/widgets/*/*.c)",
            "file(GLOB_RECURSE SGL_WIDGETS_SOURCES ${SGL_ROOT_DIR}/sgl/source/widgets/*/*.c)",
        );
        let _ = std::fs::write(&cmake_path, &updated);
    }
    // 确保 CMakeLists.txt 自动收集 demo/fonts 下的字模源文件
    let cmake_modified = ensure_cmake_fonts_glob(&cmake_path).unwrap_or(false);

    // 智能 reconfigure 检测：只有 CMakeLists.txt 内容变化或字模文件增删时才删 CMakeCache.txt
    // 避免每次编译都重新 cmake configure（3-5秒开销）
    let build_dir = sgl_port_dir.join("build");
    let need_reconfigure = if !build_dir.exists() {
        true // 首次编译
    } else {
        // 检测 CMakeLists.txt 内容是否变化（ensure_cmake_fonts_glob 可能修改了它）
        let cmake_hash_file = build_dir.join(".cmake_hash");
        let current_cmake_bytes = std::fs::read(&cmake_path).unwrap_or_default();
        let current_cmake_hash = simple_hash(&current_cmake_bytes);
        let prev_cmake_hash = std::fs::read_to_string(&cmake_hash_file).unwrap_or_default();
        let cmake_changed = cmake_modified || current_cmake_hash != prev_cmake_hash;

        // 检测字模文件列表是否变化（新增/删除字模需要 reconfigure 让 GLOB 重新收集）
        let fonts_dir = sgl_port_dir.join("demo").join("fonts");
        let current_fonts_list = list_font_files(&fonts_dir);
        let fonts_manifest_file = build_dir.join(".fonts_manifest");
        let prev_fonts_list = std::fs::read_to_string(&fonts_manifest_file).unwrap_or_default();
        let fonts_changed = current_fonts_list != prev_fonts_list;

        if cmake_changed {
            let _ = std::fs::write(&cmake_hash_file, &current_cmake_hash);
        }
        if fonts_changed {
            let _ = std::fs::write(&fonts_manifest_file, &current_fonts_list);
        }

        if cmake_changed {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "CMakeLists.txt 已变化，触发重新 configure", "level": "info" }),
            );
        }
        if fonts_changed {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "字模文件列表已变化，触发重新 configure", "level": "info" }),
            );
        }

        cmake_changed || fonts_changed
    };

    if need_reconfigure {
        // 删除缓存文件，触发重新 cmake configure
        let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
        let _ = std::fs::remove_file(build_dir.join("Makefile"));
    }
    // 不再强制删除 sgl.dir，让 make 按时间戳增量编译 SGL 库
    // sync_sgl_source 已改为内容变化才写入，时间戳准确反映内容变化，make 能正确增量编译
    if sgl_source_changed {
        let _ = window.emit(
            "build-log",
            serde_json::json!({ "message": "SGL 库源码有变化，make 将按时间戳增量重编译变化的文件", "level": "info" }),
        );
    }

    // 检查 gcc
    if which_command_path("gcc").is_none() {
        return Err("未找到 gcc，请安装 MinGW 并将 bin 目录添加到系统环境变量 PATH 中".to_string());
    }

    // 检查 cmake
    if which_command_path("cmake").is_none() {
        return Err("未找到 cmake，请安装 CMake 并添加到系统环境变量 PATH 中".to_string());
    }

    // 先导出代码到 code/ 目录
    let fonts = collect_fonts(&project);

    // 生成图片取模文件到 code/pixmaps/ 子目录
    let pixmaps_dir = code_dir.join("pixmaps");
    if pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;

    // 生成 icon 图标取模文件到 code/icons/ 子目录
    let icons_dir = code_dir.join("icons");
    if icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;

    std::fs::create_dir_all(&code_dir).map_err(|e| format!("创建 code 目录失败: {}", e))?;
    let ui_c = code_dir.join("ui.c");
    std::fs::write(&ui_c, &code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

    // 生成字模文件
    if !fonts.is_empty() {
        let fonts_dir = code_dir.join("fonts");
        if fonts_dir.exists() {
            let _ = std::fs::remove_dir_all(&fonts_dir);
        }
        std::fs::create_dir_all(&fonts_dir)
            .map_err(|e| format!("创建 fonts 目录失败: {}", e))?;
        let conv_path = find_sgl_font_conv();
        if let Some(conv) = conv_path {
            for (name, path, sz, bpp, compress, symbols) in &fonts {
                run_font_conv(&conv, name, path, *sz, *bpp, *compress, symbols, &fonts_dir)
                    .map_err(|e| format!("生成字模 {} 失败: {}", name, e))?;
            }
        } else {
            return Err("未找到 sgl_font_conv.exe".to_string());
        }
    }

    // 复制 UI 代码到 sgl-port 的 demo/ui.c
    let demo_dir = sgl_port_dir.join("demo");
    let ui_c_dest = demo_dir.join("ui.c");
    std::fs::copy(&ui_c, &ui_c_dest).map_err(|e| format!("复制代码到 sgl-port 失败: {}", e))?;

    // 复制图片取模文件到 demo/pixmaps/
    let demo_pixmaps_dir = demo_dir.join("pixmaps");
    if demo_pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&demo_pixmaps_dir);
    }
    if pixmaps_dir.exists() {
        copy_dir_contents(&pixmaps_dir, &demo_pixmaps_dir)
            .map_err(|e| format!("复制图片取模文件到 demo 失败: {}", e))?;
    }

    // 复制 icon 图标取模文件到 demo/icons/
    let demo_icons_dir = demo_dir.join("icons");
    if demo_icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&demo_icons_dir);
    }
    if icons_dir.exists() {
        copy_dir_contents(&icons_dir, &demo_icons_dir)
            .map_err(|e| format!("复制 icon 图标取模文件到 demo 失败: {}", e))?;
    }

    // 复制字模文件到 demo/fonts/
    let fonts_dir = code_dir.join("fonts");
    let demo_fonts_dir = demo_dir.join("fonts");
    if demo_fonts_dir.exists() {
        let _ = std::fs::remove_dir_all(&demo_fonts_dir);
    }
    if fonts_dir.exists() {
        copy_dir_contents(&fonts_dir, &demo_fonts_dir)
            .map_err(|e| format!("复制字模文件到 demo 失败: {}", e))?;
    }

    // 生成干净的 main.c，不引用 gImage_test 等外部资源
    let mut main_content = String::new();
    main_content.push_str("#include <SDL.h>\n");
    main_content.push_str("#include <stdlib.h>\n");
    main_content.push_str("#include <stdio.h>\n");
    main_content.push_str("#include <sgl.h>\n");
    main_content.push_str("#include <sgl_font.h>\n\n");
    main_content.push_str("typedef struct sgl_port_sdl2 sgl_port_sdl2_t;\n");
    main_content.push_str("sgl_port_sdl2_t *sgl_port_sdl2_init(void);\n");
    main_content.push_str("void sgl_port_sdl2_increase_frame_count(sgl_port_sdl2_t *sdl2_dev);\n");
    main_content.push_str("void sgl_port_sdl2_deinit(sgl_port_sdl2_t *sdl2_dev);\n\n");
    // 声明页面创建函数
    for page in &project.pages {
        let page_id = sanitize_id(&page.id);
        main_content.push_str(&format!("void ui_page_{}_create(void);\n", page_id));
    }
    main_content.push_str("\nint main(int argc, char *argv[]) {\n");
    main_content.push_str("    SGL_UNUSED(argc);\n");
    main_content.push_str("    SGL_UNUSED(argv);\n");
    main_content.push_str("    int quit = 0;\n");
    main_content.push_str("    SDL_Event MouseEvent;\n");
    main_content.push_str("    sgl_port_sdl2_t* sdl2_dev = sgl_port_sdl2_init();\n");
    main_content.push_str("    if(sdl2_dev == NULL) return -1;\n\n");
    // 调用页面创建函数
    for page in &project.pages {
        let page_id = sanitize_id(&page.id);
        main_content.push_str(&format!("    ui_page_{}_create();\n", page_id));
    }
    main_content.push_str("\n    while (!quit) {\n");
    main_content.push_str("        SDL_PollEvent(&MouseEvent);\n");
    main_content.push_str("        if (MouseEvent.type == SDL_QUIT) quit = 1;\n");
    main_content.push_str("        sgl_task_handler();\n");
    main_content.push_str("        sgl_port_sdl2_increase_frame_count(sdl2_dev);\n");
    main_content.push_str("    }\n");
    main_content.push_str("    sgl_port_sdl2_deinit(sdl2_dev);\n");
    main_content.push_str("    return 0;\n");
    main_content.push_str("}\n");
    let main_c_path = demo_dir.join("main.c");
    std::fs::write(&main_c_path, &main_content).map_err(|e| format!("写入 main.c 失败: {}", e))?;

    // 根据用户项目设置生成 sgl_config.h
    let pixel_depth = match project.color_depth.as_str() {
        "8bit" => 8,
        "16bit" => 16,
        "24bit" => 24,
        _ => 32,
    };
    project.sgl_config.fbdev_pixel_depth = pixel_depth;
    let sgl_config_path = demo_dir.join("sgl_config.h");
    generate_sgl_config_h(&project.sgl_config, &sgl_config_path)?;

    // 根据用户项目设置修改 sgl_port_sdl2.c（屏幕宽高）
    let sdl2_port_path = demo_dir.join("sgl_port_sdl2.c");
    if let Ok(port_content) = std::fs::read_to_string(&sdl2_port_path) {
        let mut updated = port_content;
        // 替换 CONFIG_SGL_PANEL_WIDTH
        if let Some(pos) = updated.find("CONFIG_SGL_PANEL_WIDTH") {
            if let Some(line_end) = updated[pos..].find('\n') {
                let line_start = updated[..pos].rfind('#').unwrap_or(0);
                updated = format!(
                    "{}#define  CONFIG_SGL_PANEL_WIDTH         {}{}",
                    &updated[..line_start],
                    project.screen_width,
                    &updated[pos + line_end..]
                );
            }
        }
        // 替换 CONFIG_SGL_PANEL_HEIGHT
        if let Some(pos) = updated.find("CONFIG_SGL_PANEL_HEIGHT") {
            if let Some(line_end) = updated[pos..].find('\n') {
                let line_start = updated[..pos].rfind('#').unwrap_or(0);
                updated = format!(
                    "{}#define  CONFIG_SGL_PANEL_HEIGHT        {}{}",
                    &updated[..line_start],
                    project.screen_height,
                    &updated[pos + line_end..]
                );
            }
        }
        // 替换 CONFIG_SGL_PANEL_BUFFER_LINE（取高度的 1/4，最小 20）
        let buffer_line = std::cmp::max(project.screen_height / 4, 20);
        if let Some(pos) = updated.find("CONFIG_SGL_PANEL_BUFFER_LINE") {
            if let Some(line_end) = updated[pos..].find('\n') {
                let line_start = updated[..pos].rfind('#').unwrap_or(0);
                updated = format!(
                    "{}#define  CONFIG_SGL_PANEL_BUFFER_LINE   {}{}",
                    &updated[..line_start],
                    buffer_line,
                    &updated[pos + line_end..]
                );
            }
        }
        let _ = std::fs::write(&sdl2_port_path, &updated);
    }

    // 复制字模文件到 demo/fonts/
    let code_fonts_dir = code_dir.join("fonts");
    let demo_fonts_dir = demo_dir.join("fonts");
    if code_fonts_dir.exists() {
        let _ = std::fs::create_dir_all(&demo_fonts_dir);
        if let Ok(entries) = std::fs::read_dir(&code_fonts_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map(|e| e == "c").unwrap_or(false) {
                    let name = entry.file_name();
                    let _ = std::fs::copy(entry.path(), demo_fonts_dir.join(&name));
                }
            }
        }
    }

    // 编译
    let build_dir = sgl_port_dir.join("build");
    std::fs::create_dir_all(&build_dir).map_err(|e| format!("创建 build 目录失败: {}", e))?;

    // 检测 CMakeCache.txt 中缓存的 generator 是否与当前目标一致
    // 不一致（如用户之前用 MSYS2 的 Unix Makefiles 配置过）会导致 cmake 报错
    let target_generator = "MinGW Makefiles";
    let cache_file = build_dir.join("CMakeCache.txt");
    if cache_file.exists() {
        let cache_content = std::fs::read_to_string(&cache_file).unwrap_or_default();
        let cached_generator = cache_content
            .lines()
            .find_map(|line| {
                let trimmed = line.trim();
                if trimmed.starts_with("CMAKE_GENERATOR:") {
                    // 格式: CMAKE_GENERATOR:INTERNAL=Unix Makefiles
                    if let Some(idx) = trimmed.find('=') {
                        return Some(trimmed[idx + 1..].trim().to_string());
                    }
                }
                None
            })
            .unwrap_or_default();
        if !cached_generator.is_empty() && cached_generator != target_generator {
            let _ = window.emit(
                "build-log",
                serde_json::json!({
                    "message": format!("检测到 CMake 缓存的 generator 为 \"{}\"，与当前 \"{}\" 不一致，清理缓存重新配置", cached_generator, target_generator),
                    "level": "info"
                }),
            );
            let _ = std::fs::remove_file(&cache_file);
            let _ = std::fs::remove_file(build_dir.join("Makefile"));
            let cmake_files_dir = build_dir.join("CMakeFiles");
            if cmake_files_dir.exists() {
                let _ = std::fs::remove_dir_all(&cmake_files_dir);
            }
        }
    }

    // 重新 cmake 配置，确保字模源文件 GLOB 最新，并实时输出到控制台
    let cmake_status = run_command_stream(
        "cmake",
        &["..", "-G", "MinGW Makefiles"],
        &build_dir,
        &window,
    )
    .map_err(|e| format!("执行 cmake 失败: {}（请确认已安装 CMake）", e))?;

    if !cmake_status.success() {
        return Err("cmake 配置失败".to_string());
    }

    // 编译，并实时输出到控制台
    let make_status = run_command_stream(
        "cmake",
        &["--build", "."],
        &build_dir,
        &window,
    )
    .map_err(|e| format!("执行编译失败: {}", e))?;

    if !make_status.success() {
        return Err("编译失败".to_string());
    }

    Ok(format!("{}；编译成功！", submodule_msg))
}

/// 写入日志到项目目录的 log 文件
#[tauri::command]
fn append_log(project_path: String, message: String) -> Result<(), String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let log_dir = proj_dir.join("log");
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| format!("创建 log 目录失败: {}", e))?;
    }
    let now = std::time::SystemTime::now();
    let datetime: std::time::SystemTime = std::time::UNIX_EPOCH.into();
    let duration = now.duration_since(datetime).map_err(|e| format!("时间错误: {}", e))?;
    let secs = duration.as_secs();
    // 简单计算日期和时间（避免引入 chrono）
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    // 计算日期：从 1970-01-01 开始
    let (year, month, day) = days_to_date(days);
    let log_file_name = format!("{:04}-{:02}-{:02}.log", year, month, day);
    let log_file = log_dir.join(&log_file_name);
    let timestamp = format!("{:02}:{:02}:{:02}", hours, minutes, seconds);
    let line = format!("[{}] {}\n", timestamp, message);
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("打开日志文件失败: {}", e))?;
    f.write_all(line.as_bytes())
        .map_err(|e| format!("写入日志失败: {}", e))?;
    Ok(())
}

fn days_to_date(days_since_epoch: u64) -> (u64, u64, u64) {
    let mut y = 1970;
    let mut remaining = days_since_epoch;
    loop {
        let dy = if is_leap_year(y) { 366 } else { 365 };
        if remaining < dy { break; }
        remaining -= dy;
        y += 1;
    }
    let leap = is_leap_year(y);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0;
    for &md in &month_days {
        if remaining < md { break; }
        remaining -= md;
        m += 1;
    }
    (y, m + 1, remaining + 1)
}

fn is_leap_year(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// 读取项目根目录下 sgl-port-windows-vscode/demo/sgl_config.h，解析 CONFIG_XXX 宏并返回 SglConfig
/// 用于在进入 SGL 配置页面或编译仿真前同步外部修改的配置
/// 文件不存在时返回默认配置（后续编译时会用默认值生成 sgl_config.h 覆盖）
#[tauri::command]
fn read_sgl_config_from_file(project_path: String) -> Result<SglConfig, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let config_path = proj_dir
        .join("sgl-port-windows-vscode")
        .join("demo")
        .join("sgl_config.h");

    // 文件不存在时使用空内容，后续 get_i32/get_string 会返回默认值
    // 编译时会用这些默认值生成 sgl_config.h 覆盖
    let content = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .map_err(|e| format!("读取 sgl_config.h 失败: {}", e))?
    } else {
        String::new()
    };

    // 解析 #define CONFIG_SGL_XXX value
    // value 可能是整数、标识符（如 lwmem）或函数调用（如 sgl_rgb(0x00, 0xFF, 0x00)）
    fn parse_define(line: &str) -> Option<(String, String)> {
        let trimmed = line.trim();
        if !trimmed.starts_with("#define") {
            return None;
        }
        let rest = trimmed.trim_start_matches("#define").trim();
        // 分离 key 和 value：key 是第一个空白前的token
        let mut iter = rest.splitn(2, char::is_whitespace);
        let key = iter.next()?.to_string();
        let val = iter.next()?.trim().to_string();
        if val.is_empty() {
            return None;
        }
        Some((key, val))
    }

    // 从内容中查找宏值，提供默认值兜底
    fn get_i32(content: &str, key: &str, default: i32) -> i32 {
        for line in content.lines() {
            if let Some((k, v)) = parse_define(line) {
                if k == key {
                    return v.parse::<i32>().unwrap_or(default);
                }
            }
        }
        default
    }

    fn get_string(content: &str, key: &str, default: &str) -> String {
        for line in content.lines() {
            if let Some((k, v)) = parse_define(line) {
                if k == key {
                    return v;
                }
            }
        }
        default.to_string()
    }

    // 从内容中查找颜色宏（sgl_rgb 格式），转换为 #RRGGBB hex 返回
    fn get_color_hex(content: &str, key: &str, default_hex: &str) -> String {
        let raw = get_string(content, key, "");
        if raw.is_empty() {
            return default_hex.to_string();
        }
        parse_sgl_rgb_to_hex(&raw, default_hex)
    }

    let config = SglConfig {
        fbdev_pixel_depth: get_i32(&content, "CONFIG_SGL_FBDEV_PIXEL_DEPTH", 16),
        fbdev_rotation: get_i32(&content, "CONFIG_SGL_FBDEV_ROTATION", 0),
        fbdev_runtime_rotation: get_i32(&content, "CONFIG_SGL_FBDEV_RUNTIME_ROTATION", 0),
        fbdev_even_coords: get_i32(&content, "CONFIG_SGL_FBDEV_EVEN_COORDS", 0),
        use_fbdev_vram: get_i32(&content, "CONFIG_SGL_USE_FBDEV_VRAM", 0),
        systick_ms: get_i32(&content, "CONFIG_SGL_SYSTICK_MS", 10),
        event_queue_size: get_i32(&content, "CONFIG_SGL_EVENT_QUEUE_SIZE", 16),
        dirty_area_num_max: get_i32(&content, "CONFIG_SGL_DIRTY_AREA_NUM_MAX", 16),
        color16_swap: get_i32(&content, "CONFIG_SGL_COLOR16_SWAP", 0),
        animation: get_i32(&content, "CONFIG_SGL_ANIMATION", 1),
        debug: get_i32(&content, "CONFIG_SGL_DEBUG", 1),
        log_color: get_i32(&content, "CONFIG_SGL_LOG_COLOR", 1),
        log_level: get_i32(&content, "CONFIG_SGL_LOG_LEVEL", 0),
        obj_use_name: get_i32(&content, "CONFIG_SGL_OBJ_USE_NAME", 0),
        font_compressed: get_i32(&content, "CONFIG_SGL_FONT_COMPRESSED", 0),
        boot_logo: get_i32(&content, "CONFIG_SGL_BOOT_LOGO", 0),
        theme_dark: get_i32(&content, "CONFIG_SGL_THEME_DARK", 0),
        heap_algo: get_string(&content, "CONFIG_SGL_HEAP_ALGO", "lwmem"),
        heap_memory_size: get_i32(&content, "CONFIG_SGL_HEAP_MEMORY_SIZE", 10240),
        label_rotation: get_i32(&content, "CONFIG_SGL_LABEL_ROTATION", 0),
        font_song23: get_i32(&content, "CONFIG_SGL_FONT_SONG23", 0),
        font_consolas14: get_i32(&content, "CONFIG_SGL_FONT_CONSOLAS14", 1),
        font_consolas23: get_i32(&content, "CONFIG_SGL_FONT_CONSOLAS23", 0),
        font_consolas24: get_i32(&content, "CONFIG_SGL_FONT_CONSOLAS24", 0),
        font_consolas32: get_i32(&content, "CONFIG_SGL_FONT_CONSOLAS32", 0),
        font_consolas24_compress: get_i32(&content, "CONFIG_SGL_FONT_CONSOLAS24_COMPRESS", 0),
        focused_color: get_color_hex(&content, "CONFIG_SGL_FOCUSED_COLOR", "#00FF00"),
        focused_width: get_i32(&content, "CONFIG_SGL_FOCUSED_WIDTH", 1),
        dirty_area_trace: get_i32(&content, "CONFIG_SGL_DIRTY_AREA_TRACE", 0),
        dirty_area_trace_color: get_color_hex(&content, "CONFIG_SGL_DIRTY_AREA_TRACE_COLOR", "#000000"),
        monitor_trace: get_i32(&content, "CONFIG_SGL_MONITOR_TRACE", 0),
        pixmap_bilinear_interp: get_i32(&content, "CONFIG_SGL_PIXMAP_BILINEAR_INTERP", 0),
        font_small_table: get_i32(&content, "CONFIG_SGL_FONT_SMALL_TABLE", 0),
    };

    Ok(config)
}

/// 将配置写入项目根目录下 sgl-port-windows-vscode/demo/sgl_config.h
/// 用户在 SGL 配置页面修改参数后立即写入文件，保证配置文件与页面一致
#[tauri::command]
fn write_sgl_config_to_file(project_path: String, config: SglConfig) -> Result<(), String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    let config_path = sgl_port_dir.join("demo").join("sgl_config.h");

    // 若 sgl-port 目录不存在，静默返回（未克隆项目时不报错）
    if !sgl_port_dir.exists() {
        return Ok(());
    }

    generate_sgl_config_h(&config, &config_path)
}

/// 将 sgl 配置保存到用户指定的路径（用于在 SGL 配置页面手动触发，无需运行仿真）
#[tauri::command]
fn write_sgl_config_to_custom_path(config: SglConfig, target_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&target_path);
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    generate_sgl_config_h(&config, path)
}

/// 运行 sgl_simulator
#[tauri::command]
fn run_simulator(project_path: String) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    let simulator = sgl_port_dir.join("build").join("output").join("sgl_simulator.exe");

    if !simulator.exists() {
        return Err("未找到 sgl_simulator.exe，请先编译项目".to_string());
    }

    // 复制 SDL2.dll 到 output 目录
    let sdl_dll_src = sgl_port_dir.join("demo").join("sdl").join("bin").join("SDL2.dll");
    let sdl_dll_dst = sgl_port_dir.join("build").join("output").join("SDL2.dll");
    if sdl_dll_src.exists() {
        let _ = std::fs::copy(&sdl_dll_src, &sdl_dll_dst);
    }

    // 复制 lm.cfg 到 output 目录
    let cfg_src = sgl_port_dir.join("demo").join("lm.cfg");
    let cfg_dst = sgl_port_dir.join("build").join("output").join("lm.cfg");
    if cfg_src.exists() {
        let _ = std::fs::copy(&cfg_src, &cfg_dst);
    }

    use std::process::Command;
    Command::new(&simulator)
        .current_dir(simulator.parent().unwrap_or(&sgl_port_dir))
        .spawn()
        .map_err(|e| format!("启动模拟器失败: {}", e))?;

    Ok("模拟器已启动".to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ExecResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

/// 调用 sgl_font_conv.exe 生成字体 C 文件并返回内容，供前端解析为字模位图数据
/// 实现 SGL 内核字模位图渲染（所见即所得）
#[tauri::command]
fn generate_font_c_content(
    font_path: String,
    size: i32,
    bpp: i32,
    symbols: Option<String>,
) -> Result<String, String> {
    // 解析字体文件路径（与 collect_fonts/run_font_conv 一致的逻辑）
    let resolved = resolve_font_path(&font_path).unwrap_or_else(|| font_path.clone());
    let path = std::path::Path::new(&resolved);
    if !path.exists() {
        return Err(format!("字体文件不存在: {}", resolved));
    }

    // 字体名称（清理后）
    let name = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "font".to_string());
    let clean_name: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();

    // 查找 sgl_font_conv.exe
    let conv = find_sgl_font_conv()
        .ok_or_else(|| "未找到 sgl_font_conv.exe".to_string())?;

    // 临时输出目录
    let temp_dir = std::env::temp_dir().join("sgl_ui_designer_fonts");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("创建临时目录失败: {}", e))?;

    // 将字体文件复制到临时目录（使用清理后的文件名）
    let temp_font_path = temp_dir.join(&clean_name);
    if path != temp_font_path.as_path() {
        std::fs::copy(path, &temp_font_path)
            .map_err(|e| format!("复制字体文件失败: {}", e))?;
    }

    let out_file = temp_dir.join(format!(
        "sgl_font_{}_{}_bpp{}.c",
        clean_name, size, bpp
    ));
    let out_str = out_file.to_string_lossy().to_string();
    let font_arg = temp_font_path.to_string_lossy().to_string();

    let mut cmd = std::process::Command::new(&conv);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW (0x08000000): 隐藏控制台窗口，避免 sgl_font_conv.exe 弹出黑窗
        cmd.creation_flags(0x08000000);
    }
    cmd.arg("--font")
        .arg(&font_arg)
        .arg("--size")
        .arg(size.to_string())
        .arg("--bpp")
        .arg(bpp.to_string())
        .arg("--output")
        .arg(&out_str);

    // 符号表（可选）：指定字符集，减少字模大小
    if let Some(ref syms) = symbols {
        if !syms.is_empty() {
            let symbols_file = temp_dir.join(format!(
                "symbols_{}_{}_bpp{}.txt",
                clean_name, size, bpp
            ));
            std::fs::write(&symbols_file, syms)
                .map_err(|e| format!("写入 symbols 文件失败: {}", e))?;
            cmd.arg("--symbols-file").arg(&symbols_file);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("调用 sgl_font_conv 失败: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "sgl_font_conv 返回非零状态\nstdout: {}\nstderr: {}",
            stdout, stderr
        ));
    }

    // 读取生成的 C 文件内容
    let content = std::fs::read_to_string(&out_file)
        .map_err(|e| format!("读取字模 C 文件失败: {}", e))?;

    Ok(content)
}

/// 列出指定目录下的文件和子目录
#[tauri::command]
fn list_directory(path: String) -> Result<serde_json::Value, String> {
    use std::fs;
    let dir = std::path::Path::new(&path);
    if !dir.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }

    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut items = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let file_type = entry.file_type().map_err(|e| format!("获取文件类型失败: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().to_string_lossy().to_string();
            let extension = std::path::Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            items.push(serde_json::json!({
                "name": name,
                "path": path,
                "isDir": file_type.is_dir(),
                "isFile": file_type.is_file(),
                "extension": extension,
            }));
        }
    }

    // 按名称排序：目录在前，文件在后
    items.sort_by(|a, b| {
        let a_dir = a["isDir"].as_bool().unwrap_or(false);
        let b_dir = b["isDir"].as_bool().unwrap_or(false);
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let a_name = a["name"].as_str().unwrap_or("");
                let b_name = b["name"].as_str().unwrap_or("");
                a_name.cmp(b_name)
            }
        }
    });

    Ok(serde_json::json!({
        "path": path,
        "items": items
    }))
}

/// 在系统 shell 中执行命令（Windows 使用 cmd /c）
#[tauri::command]
fn exec_command(command: String, cwd: Option<String>) -> Result<ExecResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("cmd");
    cmd.arg("/c").arg(&command);

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    } else if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            cmd.current_dir(dir);
        }
    }

    let output = cmd.output().map_err(|e| format!("执行命令失败: {}", e))?;

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

fn find_sgl_font_conv() -> Option<String> {
    // 1. 当前 exe 同目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("sgl_font_conv.exe");
            if p.exists() { return Some(p.to_string_lossy().to_string()); }
        }
    }
    // 2. 释放内嵌的 sgl_font_conv.exe 到临时目录
    if let Ok(temp_dir) = std::env::var("TEMP") {
        let dir = std::path::PathBuf::from(&temp_dir);
        let p = dir.join("sgl_font_conv.exe");
        if p.exists() { return Some(p.to_string_lossy().to_string()); }
        // 释放
        if std::fs::write(&p, SGL_FONT_CONV_EXE).is_ok() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    // 3. 当前工作目录
    let p = std::path::PathBuf::from("sgl_font_conv.exe");
    if p.exists() { return Some(p.to_string_lossy().to_string()); }
    // 4. PATH
    if let Ok(paths) = std::env::var("PATH") {
        for p in std::env::split_paths(&paths) {
            let full = p.join("sgl_font_conv.exe");
            if full.exists() { return Some(full.to_string_lossy().to_string()); }
        }
    }
    None
}

/// 下载更新安装包并启动安装程序，然后退出当前应用
#[tauri::command]
async fn download_and_install_update(url: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    // 下载文件
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("下载失败: {}", e))?;

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("读取下载数据失败: {}", e))?;

    // 根据URL判断文件扩展名
    let ext = if url.contains(".msi") { "msi" }
              else if url.contains(".exe") { "exe" }
              else {
        return Err("不支持的安装包格式".to_string());
    };

    // 保存到临时目录
    let temp_dir = std::env::temp_dir();
    let file_name = format!("sgl-ui-designer-update.{}", ext);
    let file_path = temp_dir.join(&file_name);

    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    let path_str = file_path.to_string_lossy().to_string();

    // 启动安装程序
    if ext == "msi" {
        // MSI 安装包用 msiexec 启动
        std::process::Command::new("msiexec")
            .args(["/i", &path_str])
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;
    } else if ext == "exe" {
        // exe 安装程序直接启动
        std::process::Command::new(&path_str)
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;
    }

    // 退出当前应用
    app_handle.exit(0);

    Ok(path_str)
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            generate_code,
            save_project,
            load_project,
            export_code,
            export_code_to_project,
            check_toolchain,
            check_sgl_submodule_status,
            update_sgl_submodules,
            clone_sgl_port,
            build_project,
            run_simulator,
            read_sgl_config_from_file,
            write_sgl_config_to_file,
            write_sgl_config_to_custom_path,
            append_log,
            get_image_data_url,
            get_opaque_image_data_url,
            generate_font_c_content,
            list_directory,
            exec_command,
            download_and_install_update,
            // LLM 模块
            llm::load_llm_config,
            llm::save_llm_config,
            llm::llm_chat,
            llm::llm_stream_chat,
            llm::llm_test_connection,
            llm::llm_list_models,
            // AI 对话历史独立存储
            load_ai_chat_history,
            save_ai_chat_history,
            clear_ai_chat_history
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_widget(
        id: &str,
        widget_type: &str,
        text: Option<&str>,
        font_family: Option<&str>,
        font_size: Option<i32>,
        font_bpp: Option<i32>,
    ) -> Widget {
        Widget {
            id: id.to_string(),
            widget_type: widget_type.to_string(),
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            text: text.map(|s| s.to_string()),
            color: None,
            bg_color: None,
            border_color: None,
            border_width: None,
            border_alpha: None,
            main_alpha: None,
            radius: None,
            tl_radius: None,
            tr_radius: None,
            bl_radius: None,
            br_radius: None,
            alpha: None,
            pixmap: None,
            pixmap_format: None,
            font_size,
            font_family: font_family.map(|s| s.to_string()),
            font_bpp,
            align: None,
            value: None,
            status: None,
            src: None,
            direct: None,
            fill_color: None,
            track_color: None,
            knob_color: None,
            text_color: None,
            on_color: None,
            knob_margin: None,
            text_offset_x: None,
            text_offset_y: None,
            text_rotation: None,
            dashed: None,
            dash_len: None,
            gap_len: None,
            fill_gap: None,
            fill_radius: None,
            thickness: None,
            x_offset: None,
            y_offset: None,
            radius_in: None,
            radius_out: None,
            event_cb: None,
            parent_id: None,
            x1: None,
            y1: None,
            x2: None,
            y2: None,
            line_width: None,
            vertices: None,
        }
    }

    #[test]
    fn test_collect_fonts_gathers_symbols() {
        let project = Project {
            name: "test".to_string(),
            version: "1".to_string(),
            color_depth: "32bit".to_string(),
            screen_width: 480,
            screen_height: 320,
            pages: vec![Page {
                id: "page1".to_string(),
                name: "main".to_string(),
                width: 480,
                height: 320,
                bg_color: "#000000".to_string(),
                pixmap: None,
                pixmap_format: None,
                alpha: None,
                widgets: vec![
                    make_widget("btn1", "button", Some("确定"), Some("simsun.ttc"), Some(24), Some(4)),
                    make_widget("lbl1", "label", Some("取消"), Some("simsun.ttc"), Some(24), Some(4)),
                ],
            }],
            resources: Resources {
                fonts: vec![],
                images: vec![],
            },
            ascii_fonts: vec![],
            sgl_config: SglConfig::default(),
        };

        let fonts = collect_fonts(&project);
        assert_eq!(fonts.len(), 1);
        let (name, _path, sz, bpp, _compress, symbols) = &fonts[0];
        assert_eq!(name, "simsun.ttc");
        assert_eq!(*sz, 24);
        assert_eq!(*bpp, 4);
        let set: std::collections::HashSet<char> = symbols.chars().collect();
        assert!(set.contains(&'确'));
        assert!(set.contains(&'定'));
        assert!(set.contains(&'取'));
        assert!(set.contains(&'消'));
    }
}

/// 读取项目独立存储的 AI 对话历史（与项目文件分离，避免项目文件膨胀）
/// path 为项目文件路径，对话历史存储在同目录的 .ai_chat_history.json
#[tauri::command]
fn load_ai_chat_history(project_path: String) -> Result<serde_json::Value, String> {
    use std::fs;
    use std::path::PathBuf;

    let project_file = PathBuf::from(&project_path);
    let history_file = project_file
        .parent()
        .ok_or("无法获取项目目录")?
        .join(".ai_chat_history.json");

    if !history_file.exists() {
        return Ok(serde_json::json!([]));
    }

    let content = fs::read_to_string(&history_file)
        .map_err(|e| format!("读取对话历史失败: {}", e))?;

    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析对话历史失败: {}", e))?;

    Ok(value)
}

/// 保存项目独立存储的 AI 对话历史
/// 写入同目录的 .ai_chat_history.json，原子写入避免文件损坏
#[tauri::command]
fn save_ai_chat_history(project_path: String, history: serde_json::Value) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    let project_file = PathBuf::from(&project_path);
    let project_dir = project_file
        .parent()
        .ok_or("无法获取项目目录")?;

    // 确保目录存在
    if !project_dir.exists() {
        fs::create_dir_all(project_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let history_file = project_dir.join(".ai_chat_history.json");
    let tmp_file = project_dir.join(".ai_chat_history.json.tmp");

    let content = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("序列化对话历史失败: {}", e))?;

    // 原子写入：先写临时文件，再重命名
    fs::write(&tmp_file, content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    if history_file.exists() {
        fs::remove_file(&history_file).ok();
    }
    fs::rename(&tmp_file, &history_file)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}

/// 清理指定项目的 AI 对话历史
#[tauri::command]
fn clear_ai_chat_history(project_path: String) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    let project_file = PathBuf::from(&project_path);
    let history_file = project_file
        .parent()
        .ok_or("无法获取项目目录")?
        .join(".ai_chat_history.json");

    if history_file.exists() {
        fs::remove_file(&history_file)
            .map_err(|e| format!("删除对话历史失败: {}", e))?;
    }

    Ok(())
}
