#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod font_generator;

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
    /// 额外纳入字模的文本（设计时可不显示，导出时合并）
    #[serde(default, rename = "fontGlyphExtra")]
    font_glyph_extra: Option<String>,
    /// 是否把可打印 ASCII (0x20-0x7E) 全部纳入字模
    #[serde(default, rename = "fontIncludeAscii", deserialize_with = "deserialize_bool_or_string")]
    font_include_ascii: Option<bool>,
    /// Unicode 范围，如 `0x4E00-0x9FA5,A-Z,0-9`（多段用逗号/分号分隔）
    #[serde(default, rename = "fontGlyphRanges")]
    font_glyph_ranges: Option<String>,
    /// 字符间距（像素，写入字模 adv_w，对齐 sgl_font_conv --spacing）
    #[serde(default, rename = "fontSpacing")]
    font_spacing: Option<i32>,
    /// 智能等宽（按文种分组统一字宽，对齐 sgl_font_conv --smart-mono）
    #[serde(default, rename = "fontSmartMono", deserialize_with = "deserialize_bool_or_string")]
    font_smart_mono: Option<bool>,
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
    /// arc 绘制模式：0 NORMAL / 1 RING / 2 NORMAL_SMOOTH / 3 RING_SMOOTH
    #[serde(default)]
    mode: Option<i32>,
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
    #[serde(default, rename = "infiniteMode")]
    infinite_mode: Option<bool>,
    // battery 控件属性
    #[serde(default)]
    level: Option<i32>,
    #[serde(default, rename = "lowColor")]
    low_color: Option<String>,
    #[serde(default, rename = "mediumColor")]
    medium_color: Option<String>,
    #[serde(default, rename = "highColor")]
    high_color: Option<String>,
    #[serde(default)]
    vertical: Option<bool>,
    #[serde(default)]
    charging: Option<bool>,
    #[serde(default, rename = "chargingColor")]
    charging_color: Option<String>,
    #[serde(default, rename = "showPercentage")]
    show_percentage: Option<bool>,
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
    // img_ext 控件属性
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
    // label/label_ext/arc_label 共用：文本缓冲与格式化
    #[serde(default, rename = "textBuffer")]
    text_buffer: Option<String>,
    #[serde(default, rename = "textFmt")]
    text_fmt: Option<String>,
    #[serde(default, rename = "textFmtDynamic")]
    text_fmt_dynamic: Option<String>,
    // label long_mode（长文本滚动模式）
    #[serde(default, rename = "longMode")]
    long_mode: Option<bool>,
    #[serde(default, rename = "longModeSpeed")]
    long_mode_speed: Option<u32>,
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
    #[serde(default, rename = "btnPixmap")]
    btn_pixmap: Option<String>,
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
    #[serde(default, rename = "categoryGap")]
    category_gap: Option<i32>,
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
    // gauge / analogclock 共用
    #[serde(default, rename = "arcColor")]
    arc_color: Option<String>,
    #[serde(default, rename = "scaleColor")]
    scale_color: Option<String>,
    #[serde(default, rename = "pointerColor")]
    pointer_color: Option<String>,
    #[serde(default, rename = "hubColor")]
    hub_color: Option<String>,
    #[serde(default, rename = "arcWidth")]
    arc_width: Option<i32>,
    #[serde(default, rename = "scaleWidth")]
    scale_width: Option<i32>,
    #[serde(default, rename = "scaleLength")]
    scale_length: Option<i32>,
    #[serde(default, rename = "pointerWidth")]
    pointer_width: Option<i32>,
    #[serde(default, rename = "hubRadius")]
    hub_radius: Option<i32>,
    #[serde(default, rename = "scaleStart")]
    scale_start: Option<i32>,
    #[serde(default, rename = "scaleStep")]
    scale_step: Option<i32>,
    #[serde(default, rename = "scaleAngle")]
    scale_angle: Option<i32>,
    #[serde(default, rename = "textInterval")]
    text_interval: Option<i32>,
    #[serde(default, rename = "scaleWarning")]
    scale_warning: Option<i32>,
    // led / dropdown / roller 共用
    #[serde(default, rename = "offColor")]
    off_color: Option<String>,
    #[serde(default, rename = "selectedColor")]
    selected_color: Option<String>,
    #[serde(default, rename = "visibleRows")]
    visible_rows: Option<i32>,
    #[serde(default, rename = "optionDynamic", deserialize_with = "deserialize_bool_or_string")]
    option_dynamic: Option<bool>,
    // launcher 控件属性
    #[serde(default, rename = "iconSize")]
    icon_size: Option<i32>,
    #[serde(default, rename = "gridCol")]
    grid_col: Option<i32>,
    #[serde(default, rename = "gridRow")]
    grid_row: Option<i32>,
    #[serde(default, rename = "marginLeft")]
    margin_left: Option<i32>,
    #[serde(default, rename = "marginTop")]
    margin_top: Option<i32>,
    #[serde(default, rename = "marginRight")]
    margin_right: Option<i32>,
    #[serde(default, rename = "marginBottom")]
    margin_bottom: Option<i32>,
    #[serde(default, rename = "labelColor")]
    label_color: Option<String>,
    #[serde(default, rename = "navigbarColor")]
    navigbar_color: Option<String>,
    #[serde(default, rename = "currentPage")]
    current_page: Option<i32>,
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

/// 前端生成的字模 C 文件（替代 sgl_font_conv.exe 调用）
#[derive(Serialize, Deserialize, Clone, Debug)]
struct FontCFile {
    #[serde(rename = "fontId")]
    font_id: String,
    #[serde(rename = "fileName")]
    file_name: String,
    content: String,
    /// 外闪字模 bitmap 原始字节（写入同名 .bin）
    #[serde(default, skip_serializing)]
    bitmap_bin: Option<Vec<u8>>,
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
    /// CONFIG_SGL_FLASH_FONT：字模 bitmap 存外闪
    #[serde(rename = "flash_font", default)]
    flash_font: i32,
    /// 单字形临时缓冲字节数
    #[serde(rename = "flash_font_glyph_buf_size", default = "default_flash_font_glyph_buf_size")]
    flash_font_glyph_buf_size: i32,
    /// 外闪字模打包起始地址（十六进制字符串，如 0x00100000）
    #[serde(rename = "flash_font_base_addr", default = "default_flash_font_base_addr")]
    flash_font_base_addr: String,
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

fn default_flash_font_glyph_buf_size() -> i32 {
    512
}

fn default_flash_font_base_addr() -> String {
    "0x00100000".to_string()
}

fn parse_flash_font_base_addr(s: &str) -> u32 {
    let t = s.trim();
    if t.is_empty() {
        return 0x0010_0000;
    }
    let hex = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")).unwrap_or(t);
    u32::from_str_radix(hex, 16).unwrap_or(0x0010_0000)
}

fn align4_u32(v: u32) -> u32 {
    (v + 3) & !3
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
    let chars: Vec<char> = hex.chars().collect();
    if chars.len() != 7 {
        return "sgl_rgb(0x00, 0x00, 0x00)".to_string();
    }
    let r = u8::from_str_radix(&format!("{}{}", chars[1], chars[2]), 16).unwrap_or(0);
    let g = u8::from_str_radix(&format!("{}{}", chars[3], chars[4]), 16).unwrap_or(0);
    let b = u8::from_str_radix(&format!("{}{}", chars[5], chars[6]), 16).unwrap_or(0);
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
    let chars: Vec<char> = hex.chars().collect();
    if chars.len() != 7 {
        return "SGL_COLOR_BLACK".to_string();
    }
    let r = u8::from_str_radix(&format!("{}{}", chars[1], chars[2]), 16).unwrap_or(0);
    let g = u8::from_str_radix(&format!("{}{}", chars[3], chars[4]), 16).unwrap_or(0);
    let b = u8::from_str_radix(&format!("{}{}", chars[5], chars[6]), 16).unwrap_or(0);
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
    // 找不到则返回文件名（让前端字体加载逻辑尝试查找）
    Some(family.to_string())
}

/// 统一解析控件的 (font_family, font_size, font_bpp) 三元组，
/// 确保 collect_fonts、extern 声明、setter 调用 三处完全一致。
/// 规则：
/// - 必须存在 font_family，且不能是空白、不能是 "default"；否则返回 None
/// - font_size 缺失时默认 14（与 sgl_api.js win 标题字体 unwrap_or(14) 对齐）
/// - font_bpp 缺失时默认 4
fn resolve_widget_font_spec(w: &Widget) -> Option<(String, i32, i32)> {
    let fam = w.font_family.as_ref().filter(|s| !s.trim().is_empty() && s.as_str() != "default")?;
    let sz = w.font_size.unwrap_or(14);
    let bpp = w.font_bpp.unwrap_or(4);
    Some((fam.clone(), sz, bpp))
}

/// 解析单个码点：`0x4E00` / `U+4E00` / 十进制 / 单字符
fn parse_glyph_codepoint(s: &str) -> Option<u32> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let hex = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .or_else(|| s.strip_prefix("U+"))
        .or_else(|| s.strip_prefix("u+"));
    if let Some(h) = hex {
        return u32::from_str_radix(h, 16).ok();
    }
    if s.chars().count() == 1 {
        return s.chars().next().map(|c| c as u32);
    }
    s.parse::<u32>().ok()
}

/// 将字模范围规格展开并插入集合。格式示例：`0x4E00-0x9FA5,A-Z,0-9,U+3000`
fn insert_glyph_ranges(set: &mut std::collections::HashSet<char>, spec: &str) {
    const MAX_RANGE_CHARS: usize = 30_000;
    let mut added = 0usize;
    for part in spec.split(|c| c == ',' || c == ';' || c == '\n' || c == '|') {
        let part = part.trim();
        if part.is_empty() || added >= MAX_RANGE_CHARS {
            continue;
        }
        if let Some((a, b)) = part.split_once('-').or_else(|| part.split_once('~')) {
            let (Some(start), Some(end)) = (parse_glyph_codepoint(a), parse_glyph_codepoint(b)) else {
                continue;
            };
            let (lo, hi) = if start <= end { (start, end) } else { (end, start) };
            for cp in lo..=hi {
                if added >= MAX_RANGE_CHARS {
                    break;
                }
                if let Some(ch) = char::from_u32(cp) {
                    if (!ch.is_control() || ch == ' ') && set.insert(ch) {
                        added += 1;
                    }
                }
            }
        } else if let Some(cp) = parse_glyph_codepoint(part) {
            if let Some(ch) = char::from_u32(cp) {
                if !ch.is_control() || ch == ' ' {
                    set.insert(ch);
                    added += 1;
                }
            }
        } else {
            for ch in part.chars() {
                if added >= MAX_RANGE_CHARS {
                    break;
                }
                if !ch.is_control() || ch == ' ' {
                    if set.insert(ch) {
                        added += 1;
                    }
                }
            }
        }
    }
}

/// 控件属性中的额外字模覆盖（额外文本 / ASCII / 范围），写入同一字体条目的 HashSet，天然去重

/// 控件字模变体：全局压缩 + 控件间距/等宽
/// 开启 CONFIG_SGL_FLASH_FONT 时强制不压缩（format 与 EXT_FLASH 互斥）
fn font_variant_for_widget(project: &Project, w: &Widget) -> Option<(String, i32, i32, i32, i32, bool)> {
    let (fam, sz, bpp) = resolve_widget_font_spec(w)?;
    let compress = if project.sgl_config.flash_font != 0 {
        0
    } else if project.sgl_config.font_compressed != 0 {
        1
    } else {
        0
    };
    let spacing = w.font_spacing.unwrap_or(0).max(0);
    let smart_mono = w.font_smart_mono.unwrap_or(false);
    Some((fam, sz, bpp, compress, spacing, smart_mono))
}

fn font_id_for_widget(project: &Project, w: &Widget) -> Option<String> {
    let (fam, sz, bpp, compress, spacing, mono) = font_variant_for_widget(project, w)?;
    Some(font_id_from_family(&fam, sz, bpp, compress, spacing, mono))
}

fn insert_widget_glyph_coverage(w: &Widget, set: &mut std::collections::HashSet<char>, ascii_symbols: &str) {
    if w.font_include_ascii == Some(true) {
        for ch in ascii_symbols.chars() {
            set.insert(ch);
        }
    }
    if let Some(ref extra) = w.font_glyph_extra {
        for ch in extra.chars() {
            if !ch.is_control() || ch == ' ' {
                set.insert(ch);
            }
        }
    }
    if let Some(ref ranges) = w.font_glyph_ranges {
        if !ranges.trim().is_empty() {
            insert_glyph_ranges(set, ranges);
        }
    }
}

fn collect_fonts(project: &Project) -> Vec<(String, String, i32, i32, i32, i32, bool, String)> {
    // (font_name, font_path, size, bpp, compress, spacing, smart_mono, symbols)
    use std::collections::{HashMap, HashSet};
    // 合并键：字体 + 字号 + bpp + 全局压缩 + 控件间距/等宽
    let mut map: HashMap<(String, i32, i32, i32, i32, bool), (String, HashSet<char>)> = HashMap::new();

    // 可打印 ASCII 字符（0x20-0x7E）
    const ASCII_SYMBOLS: &str = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

    for page in &project.pages {
        for w in &page.widgets {
            if let Some((fam, sz, bpp, compress, spacing, smart_mono)) = font_variant_for_widget(project, w) {
                let font_path = resolve_font_path(&fam).unwrap_or_else(|| fam.clone());
                let path_normalized = font_path.replace('\\', "/");
                let file_name = path_normalized.rsplit('/').next().unwrap_or(&path_normalized).to_string();
                let font_key: String = file_name.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
                if font_key == "default" {
                    continue;
                }
                let entry = map
                    .entry((font_key.clone(), sz, bpp, compress, spacing, smart_mono))
                    .or_insert((font_path, HashSet::new()));
                // 收集该控件使用的文本字符（以下原有 if let text / options / title_text / numberkbd / keyboard / msgbox / leftBtnText / rightBtnText 的代码全部保留不变）
                if let Some(ref text) = w.text {
                    for ch in text.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // 动态文本：textBuffer / textFmt / textFmtDynamic 运行时写入的字符
                // 设计时 text 常为空，若不收集则字模缺数字/符号，sgl_font_get_string_width 会踩空表
                let has_dyn_text = w
                    .text_buffer
                    .as_deref()
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || w.text_fmt.as_deref().map(|s| !s.is_empty()).unwrap_or(false)
                    || w
                        .text_fmt_dynamic
                        .as_deref()
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);
                if has_dyn_text {
                    for ch in "0123456789.-+ %".chars() {
                        entry.1.insert(ch);
                    }
                    for fmt_opt in [&w.text_fmt, &w.text_fmt_dynamic] {
                        if let Some(ref fmt) = fmt_opt {
                            for ch in fmt.chars() {
                                if !ch.is_control() || ch == ' ' {
                                    entry.1.insert(ch);
                                }
                            }
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
                // numberkbd 用 char-31 作为字体表索引直接访问
                if w.widget_type == "numberkbd" {
                    for ch in ASCII_SYMBOLS.chars() {
                        entry.1.insert(ch);
                    }
                }
                // keyboard 内部固定字符表
                if w.widget_type == "keyboard" {
                    for ch in "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890_-.,:+-/*=%!?#<>\\@${}[];\"'".chars() {
                        entry.1.insert(ch);
                    }
                }
                // msgbox 使用 msgText / leftBtnText / rightBtnText
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
                // statusbar 槽位文本
                if let Some(ref left) = w.left_slots {
                    for ch in left.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                if let Some(ref right) = w.right_slots {
                    for ch in right.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // chart / gauge 数值与标签（scope 无文本，不收集字模）
                if w.widget_type == "chart" || w.widget_type == "gauge" {
                    for ch in "0123456789.-".chars() {
                        entry.1.insert(ch);
                    }
                }
                // battery 百分比文本 "N%"
                if w.widget_type == "battery" && w.show_percentage == Some(true) {
                    for ch in "0123456789%".chars() {
                        entry.1.insert(ch);
                    }
                }
                if let Some(ref xl) = w.x_labels {
                    for ch in xl.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                if let Some(ref sl) = w.slice_labels {
                    for ch in sl.chars() {
                        if !ch.is_control() || ch == ' ' {
                            entry.1.insert(ch);
                        }
                    }
                }
                // 属性面板：额外文本 / 勾选 ASCII / Unicode 范围（与其它控件同字体同字号时在 HashSet 中去重合并）
                insert_widget_glyph_coverage(w, &mut entry.1, ASCII_SYMBOLS);
            }
        }
    }

    map.into_iter()
        .map(|((name, sz, bpp, compress, spacing, smart_mono), (path, set))| {
            let symbols: String = set.into_iter().collect();
            (name, path, sz, bpp, compress, spacing, smart_mono, symbols)
        })
        .filter(|(_, _, _, _, _, _, _, symbols)| !symbols.is_empty())
        .collect()
}

fn font_id_from_family(family: &str, size: i32, bpp: i32, compress: i32, spacing: i32, smart_mono: bool) -> String {
    let binding = family.replace('\\', "/");
    let name = binding.rsplit('/').next().unwrap_or(family);
    let clean: String = name.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    let mut suffix = String::new();
    if compress > 0 { suffix.push_str("_compress"); }
    if smart_mono { suffix.push_str("_mono"); }
    if spacing > 0 { suffix.push_str(&format!("_sp{}", spacing)); }
    format!("sgl_font_{}_{}_bpp{}{}", clean, size, bpp, suffix)
}

fn font_filename(family: &str, size: i32, bpp: i32, compress: i32, spacing: i32, smart_mono: bool) -> String {
    format!("{}.c", font_id_from_family(family, size, bpp, compress, spacing, smart_mono))
}

/// 写入 demo 资源目录的 *.cmake（显式列出源文件供 CMakelists.txt include）
fn write_demo_sources_cmake(
    cmake_path: &std::path::Path,
    relative_dir: &str,
    file_names: &[String],
) -> Result<(), String> {
    if let Some(parent) = cmake_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    if file_names.is_empty() {
        if cmake_path.exists() {
            let _ = std::fs::remove_file(cmake_path);
        }
        return Ok(());
    }
    let mut names = file_names.to_vec();
    names.sort();
    let mut content = String::from(
        "# Auto-generated by SGL UI Designer - do not edit manually\n\
         list(APPEND DEMO_SOURCES\n",
    );
    for name in &names {
        if !is_safe_filename(name) {
            return Err(format!("非法资源文件名（含路径分隔符）: {}", name));
        }
        content.push_str(&format!("    ${{DEMO_DIR}}/{}/{}\n", relative_dir, name));
    }
    content.push_str(")\n");
    std::fs::write(cmake_path, content)
        .map_err(|e| format!("写入 {} 失败: {}", cmake_path.to_string_lossy(), e))?;
    Ok(())
}

/// 写入 demo/fonts/fonts.cmake
fn write_fonts_cmake(font_files: &[FontCFile], fonts_dir: &std::path::Path) -> Result<(), String> {
    let names: Vec<String> = font_files.iter().map(|f| f.file_name.clone()).collect();
    write_demo_sources_cmake(&fonts_dir.join("fonts.cmake"), "fonts", &names)
}

/// 按 font_id 排序生成全部字模；开启 flash_font 时累加偏移并产出 .bin 载荷
fn generate_project_font_c_files(
    project: &Project,
    fonts: &[(String, String, i32, i32, i32, i32, bool, String)],
    resolved_font_paths: &std::collections::HashMap<String, std::path::PathBuf>,
    proj_dir: &std::path::Path,
    skip_missing: bool,
) -> Result<(Vec<FontCFile>, Vec<(String, u32, u32)>), String> {
    let flash_on = project.sgl_config.flash_font != 0;
    let mut work: Vec<&(String, String, i32, i32, i32, i32, bool, String)> = fonts.iter().collect();
    work.sort_by(|a, b| {
        let id_a = font_id_from_family(&a.1, a.2, a.3, a.4, a.5, a.6);
        let id_b = font_id_from_family(&b.1, b.2, b.3, b.4, b.5, b.6);
        id_a.cmp(&id_b)
    });

    let mut generated: Vec<FontCFile> = Vec::new();
    let mut map_entries: Vec<(String, u32, u32)> = Vec::new();
    let mut next_off: u32 = 0;

    for (_font_name, font_path_str, size, bpp, compress, spacing, smart_mono, symbols) in work {
        let font_abs_path = {
            if let Some(p) = resolved_font_paths.get(font_path_str) {
                p.clone()
            } else {
                let p = std::path::Path::new(font_path_str);
                if p.is_absolute() {
                    p.to_path_buf()
                } else {
                    proj_dir.join(p)
                }
            }
        };

        if !font_abs_path.exists() {
            if skip_missing {
                continue;
            }
            return Err(format!(
                "字体文件不存在，无法生成字模: {}（解析路径: {}）",
                font_path_str,
                font_abs_path.display()
            ));
        }

        let font_id = font_id_from_family(font_path_str, *size, *bpp, *compress, *spacing, *smart_mono);
        let flash = if flash_on {
            Some(font_generator::FlashFontExport {
                flash_offset: next_off,
            })
        } else {
            None
        };

        match font_generator::generate_font_c(
            &font_abs_path,
            *size,
            *bpp,
            symbols,
            *compress > 0,
            &font_id,
            *spacing,
            *smart_mono,
            flash,
        ) {
            Ok(result) => {
                if !result.missing_glyphs.is_empty() {
                    eprintln!(
                        "[font] 警告: {} 缺少 {} 个字形，已跳过取模: {}",
                        font_id,
                        result.missing_glyphs.len(),
                        result
                            .missing_glyphs
                            .iter()
                            .take(12)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                }
                if flash_on {
                    map_entries.push((font_id.clone(), next_off, result.bitmap_size));
                    next_off = align4_u32(next_off.saturating_add(result.bitmap_size));
                }
                generated.push(FontCFile {
                    font_id: font_id.clone(),
                    file_name: format!("{}.c", font_id),
                    content: result.content,
                    bitmap_bin: result.bitmap_blob,
                });
            }
            Err(e) => {
                return Err(format!("生成字模失败 {}: {}", font_id, e));
            }
        }
    }

    Ok((generated, map_entries))
}

fn finish_write_font_outputs(
    project: &Project,
    fonts_dir: &std::path::Path,
    generated: &[FontCFile],
    map_entries: &[(String, u32, u32)],
) -> Result<(), String> {
    write_font_c_files(generated, fonts_dir)?;
    write_fonts_cmake(generated, fonts_dir)?;
    if project.sgl_config.flash_font != 0 {
        let base = parse_flash_font_base_addr(&project.sgl_config.flash_font_base_addr);
        write_fonts_flash_map(fonts_dir, base, map_entries)?;
    } else {
        let map_path = fonts_dir.join("fonts_flash_map.h");
        if map_path.exists() {
            let _ = std::fs::remove_file(map_path);
        }
        // 清理旧 .bin
        if let Ok(rd) = std::fs::read_dir(fonts_dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) == Some("bin") {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }
    let _ = std::fs::write(fonts_dir.join(".sgl_auto_gen"), "");
    Ok(())
}

/// 写入 demo/pixmaps/pixmaps.cmake（根据目录中已有 .c 文件）
fn write_pixmaps_cmake(pixmaps_dir: &std::path::Path) -> Result<(), String> {
    let mut names: Vec<String> = Vec::new();
    if pixmaps_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(pixmaps_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map(|e| e == "c").unwrap_or(false) {
                    if let Some(n) = entry.file_name().to_str() {
                        names.push(n.to_string());
                    }
                }
            }
        }
    }
    write_demo_sources_cmake(&pixmaps_dir.join("pixmaps.cmake"), "pixmaps", &names)
}

/// 写入 demo/icons/icons.cmake
fn write_icons_cmake(icons_dir: &std::path::Path) -> Result<(), String> {
    let mut names: Vec<String> = Vec::new();
    if icons_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(icons_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map(|e| e == "c").unwrap_or(false) {
                    if let Some(n) = entry.file_name().to_str() {
                        names.push(n.to_string());
                    }
                }
            }
        }
    }
    write_demo_sources_cmake(&icons_dir.join("icons.cmake"), "icons", &names)
}

/// 确保 sgl-port 的 CMakelists.txt include fonts/pixmaps/icons 的 cmake 列表
/// 返回是否修改了文件
fn ensure_cmake_fonts_glob(cmake_path: &std::path::Path) -> Result<bool, String> {
    if !cmake_path.exists() {
        return Ok(false);
    }
    let mut content = std::fs::read_to_string(cmake_path)
        .map_err(|e| format!("读取 CMakeLists.txt 失败: {}", e))?;

    const MARKER: &str = "SGL_DESIGNER_DEMO_ASSETS_CMAKE";
    const OLD_MARKER: &str = "SGL_DESIGNER_FONTS_CMAKE";
    if content.contains(MARKER) {
        return Ok(false);
    }

    // 升级：移除旧版仅 fonts 的 include 块或 GLOB 补丁
    if content.contains(OLD_MARKER) || content.contains("DEMO_FONT_SOURCES") {
        if let Some(idx) = content.find(OLD_MARKER) {
            let line_start = content[..idx].rfind('\n').map(|i| i + 1).unwrap_or(0);
            if let Some(endif_rel) = content[idx..].find("endif()") {
                let mut end = idx + endif_rel + "endif()".len();
                while end < content.len() && (content.as_bytes()[end] == b'\n' || content.as_bytes()[end] == b'\r') {
                    end += 1;
                }
                content = format!("{}{}", &content[..line_start], &content[end..]);
            }
        }
        content = content
            .replace(
                "\n# Auto-generated: include font bitmap sources\nfile(GLOB DEMO_FONT_SOURCES ${DEMO_DIR}/fonts/*.c)\nlist(APPEND DEMO_SOURCES ${DEMO_FONT_SOURCES})\n",
                "\n",
            )
            .replace(
                "\n# Auto-generated: include font bitmap sources\nfile(GLOB DEMO_FONT_SOURCES CONFIGURE_DEPENDS \"${DEMO_DIR}/fonts/*.c\")\nlist(APPEND DEMO_SOURCES ${DEMO_FONT_SOURCES})\n",
                "\n",
            );
    }

    let insert = concat!(
        "\n# ",
        "SGL_DESIGNER_DEMO_ASSETS_CMAKE\n",
        "# Auto-generated by SGL UI Designer: link fonts / pixmaps / icons via CMake\n",
        "if(EXISTS \"${DEMO_DIR}/fonts/fonts.cmake\")\n",
        "  include(\"${DEMO_DIR}/fonts/fonts.cmake\")\n",
        "endif()\n",
        "if(EXISTS \"${DEMO_DIR}/pixmaps/pixmaps.cmake\")\n",
        "  include(\"${DEMO_DIR}/pixmaps/pixmaps.cmake\")\n",
        "endif()\n",
        "if(EXISTS \"${DEMO_DIR}/icons/icons.cmake\")\n",
        "  include(\"${DEMO_DIR}/icons/icons.cmake\")\n",
        "endif()\n",
    );

    if let Some(pos) = content.find("add_executable(sgl_simulator") {
        content = format!("{}{}{}", &content[..pos], insert, &content[pos..]);
        std::fs::write(cmake_path, content)
            .map_err(|e| format!("写入 CMakeLists.txt 失败: {}", e))?;
        return Ok(true);
    }

    if let Some(start) = content.find("set(DEMO_SOURCES") {
        if let Some(end) = content[start..].find("\n)") {
            let pos = start + end + 2;
            content = format!("{}{}{}", &content[..pos], insert, &content[pos..]);
            std::fs::write(cmake_path, content)
                .map_err(|e| format!("写入 CMakeLists.txt 失败: {}", e))?;
            return Ok(true);
        }
    }
    Ok(false)
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
    let chars: Vec<char> = hex.chars().collect();
    if chars.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&format!("{}{}", chars[0], chars[1]), 16).ok()?;
    let g = u8::from_str_radix(&format!("{}{}", chars[2], chars[3]), 16).ok()?;
    let b = u8::from_str_radix(&format!("{}{}", chars[4], chars[5]), 16).ok()?;
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

/// 验证路径扩展名为常见图片格式，防止任意文件读取
fn is_image_file(path: &str) -> bool {
    let p = std::path::Path::new(path);
    if let Some(ext) = p.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        matches!(
            ext_lower.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "ico"
        )
    } else {
        false
    }
}

#[tauri::command]
fn get_image_data_url(path: String) -> Result<ImageRgbaData, String> {
    if !is_image_file(&path) {
        return Err("只允许读取常见图片格式文件".to_string());
    }
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
    if !is_image_file(&path) {
        return Err("只允许读取常见图片格式文件".to_string());
    }
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
            if let Some(ref p) = w.btn_pixmap {
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
    out.push_str(" * 图片取模声明（.c 由设计器生成到 pixmaps/，经 CMake 链接）\n");
    out.push_str(" * ============================================ */\n");

    for (path, fmt) in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图片文件名不能包含中文或特殊字符: {}", name));
        }
        let var = pixmap_var_name(path, &fmt.sgl_name().replace("SGL_PIXMAP_FMT_", ""));
        out.push_str(&format!("extern const sgl_pixmap_t {};\n", var));
    }
    out.push('\n');
    Ok(out)
}

/// 生成 icon 取模 extern 声明
fn generate_icon_includes(project: &Project) -> Result<String, String> {
    let used = collect_icons(project);
    if used.is_empty() {
        return Ok(String::new());
    }
    let mut out = String::new();
    out.push_str("/* ============================================\n");
    out.push_str(" * icon 图标取模声明（.c 由设计器生成到 icons/，经 CMake 链接）\n");
    out.push_str(" * ============================================ */\n");
    for path in &used {
        let name = std::path::Path::new(path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if has_non_ascii(&name) {
            return Err(format!("图标文件名不能包含中文或特殊字符: {}", name));
        }
        out.push_str(&format!("extern const sgl_icon_pixmap_t {};\n", icon_var_name(path)));
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
        out.push_str("#include <sgl.h>\n\n");
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
        out.push_str("#include <sgl.h>\n\n");
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

#[derive(Default)]
struct TextBufferDecl {
    size: u16,
    init_text: Option<String>,
}

fn parse_text_buffer_spec(raw: &str) -> Option<(String, u16)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split(',').map(|s| s.trim()).collect();
    let name = parts[0];
    if name.is_empty()
        || !name
            .chars()
            .next()
            .map(|c| c.is_ascii_alphabetic() || c == '_')
            .unwrap_or(false)
        || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return None;
    }
    let size = if parts.len() >= 2 && !parts[1].is_empty() {
        parts[1].parse::<u16>().ok().filter(|&n| n >= 1)?
    } else {
        64
    };
    Some((name.to_string(), size))
}

fn collect_text_buffer_vars(project: &Project) -> std::collections::BTreeMap<String, TextBufferDecl> {
    let mut buffers: std::collections::BTreeMap<String, TextBufferDecl> = std::collections::BTreeMap::new();
    let types = ["label", "label_ext", "arc_label"];
    for page in &project.pages {
        for w in &page.widgets {
            if !types.contains(&w.widget_type.as_str()) {
                continue;
            }
            let Some(buf_raw) = w.text_buffer.as_deref() else {
                continue;
            };
            let Some((name, size)) = parse_text_buffer_spec(buf_raw) else {
                continue;
            };
            if let Some(existing) = buffers.get_mut(&name) {
                existing.size = existing.size.max(size);
                if existing.init_text.is_none() {
                    if let Some(ref text) = w.text {
                        if !text.trim().is_empty() {
                            existing.init_text = Some(text.clone());
                        }
                    }
                }
            } else {
                let init_text = w.text.as_ref().and_then(|t| {
                    if t.trim().is_empty() {
                        None
                    } else {
                        Some(t.clone())
                    }
                });
                buffers.insert(name, TextBufferDecl { size, init_text });
            }
        }
    }
    buffers
}

fn escape_c_string_literal(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
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
            if w.widget_type == "img_ext" {
                if w.pixmap.as_deref().map(|s| s.trim()).unwrap_or("") != "" {
                    if w.read_ops.as_deref().map(|s| s.trim()).unwrap_or("").is_empty() {
                        let _ = window.emit(
                            "build-log",
                            serde_json::json!({
                                "message": format!("[WARN] img_ext 控件 '{}' (id={}) 设置了图片但未设置外部读取函数 (readOps)，运行时将无法从外部 Flash 读取图片", w.name.as_deref().unwrap_or(""), w.id),
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
        code.push_str(" * 字体字模声明（字模 C 文件由设计器自动生成到 fonts/ 子目录）\n");
        code.push_str(" * ============================================ */\n");
        // 先从控件实际设置计算 font_id，再通过 collect_fonts 入口名(clean文件名)映射；
        // 为了避免 extern 声明遗漏：除了 collect_fonts 返回的集合外，
        // 再扫描一次所有控件，通过 resolve_widget_font_spec 补充未命中的
        // (如 win 控件 font_size 缺失时默认 14 可能因 widgets 合并规则被意外覆盖)
        let mut declared = std::collections::HashSet::new();
        for (name, _path, sz, bpp, compress, spacing, smart_mono, _symbols) in &fonts {
            let id = font_id_from_family(name, *sz, *bpp, *compress, *spacing, *smart_mono);
            if declared.insert(id.clone()) {
                code.push_str(&format!("extern const sgl_font_t {};\n", id));
            }
        }
        for page in &project.pages {
            for w in &page.widgets {
                if let Some(id) = font_id_for_widget(&project, w) {
                    if declared.insert(id.clone()) {
                        code.push_str(&format!("extern const sgl_font_t {};\n", id));
                    }
                }
            }
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

    let text_buffers = collect_text_buffer_vars(&project);
    if !text_buffers.is_empty() {
        code.push_str("/* ============================================\n");
        code.push_str(" * 标签文本缓冲区（label / label_ext / arc_label）\n");
        code.push_str(" * ============================================ */\n");
        for (name, decl) in &text_buffers {
            if let Some(ref init) = decl.init_text {
                let escaped = escape_c_string_literal(init);
                code.push_str(&format!("char {}[{}] = \"{}\";\n", name, decl.size, escaped));
            } else {
                code.push_str(&format!("char {}[{}];\n", name, decl.size));
            }
        }
        code.push('\n');
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

            emit_setters(&mut code, &project, &w, &obj_id);

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
        "label_ext" => "sgl_label_ext_create",
        "arc_label" => "sgl_arc_label_create",
        "img" => "sgl_img_create",
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
        "box" => "sgl_box_create",
        "win" => "sgl_win_create",
        "qrcode" => "sgl_qrcode_create",
        "scope" => "sgl_scope_create",
        "chart" => "sgl_piechart_create",
        "canvas" => "sgl_canvas_create",
        "2dball" => "sgl_2dball_create",
        "sprite" => "sgl_sprite_create",
        "analogclock" => "sgl_analogclock_create",
        "img_ext" => "sgl_img_ext_create",
        "roller" => "sgl_roller_create",
        "statusbar" => "sgl_statusbar_create",
        "launcher" => "sgl_launcher_create",
        _ => "sgl_rect_create",
    }
}

fn emit_setters(code: &mut String, project: &Project, w: &Widget, obj: &str) {
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
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_label_set_font({}, &{});\n", obj, fid));
            }
            // 文本缓冲区优先：设置 text_buffer 后用动态缓冲，否则用静态 text
            let has_buffer = w.text_buffer.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
            if has_buffer {
                if let Some(buf) = &w.text_buffer {
                    // 格式: "变量名,大小" 或纯变量名
                    let parts: Vec<&str> = buf.split(',').map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        if let Ok(sz) = parts[1].parse::<u16>() {
                            code.push_str(&format!("    sgl_label_set_text_buffer({}, {}, {});\n", obj, parts[0], sz));
                        }
                    } else {
                        code.push_str(&format!("    sgl_label_set_text_buffer({}, {}, 64);\n", obj, parts[0]));
                    }
                }
                if let Some(fmt) = &w.text_fmt {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_label_set_text_fmt({}, \"{}\");\n", obj, escaped));
                    }
                } else if let Some(fmt) = &w.text_fmt_dynamic {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_label_set_text_fmt_dynamic({}, \"{}\");\n", obj, escaped));
                    }
                }
            } else {
                cstr!("sgl_label_set_text", w.text);
            }
            cclr!("sgl_label_set_text_color", w.text_color);
            // bgColor 为 transparent 时不生成 set_bg_color（避免误设 bg_flag）
            if let Some(bg) = &w.bg_color {
                if !bg.is_empty() && bg != "transparent" {
                    code.push_str(&format!("    sgl_label_set_bg_color({}, {});\n", obj, sgl_color(bg)));
                }
            }
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
            // 仅非 0 时生成，避免冗余调用
            if let Some(ox) = w.text_offset_x {
                if ox != 0 {
                    code.push_str(&format!("    sgl_label_set_text_offset({}, {});\n", obj, ox as i8));
                }
            }
            // long_mode（长文本滚动模式，需 CONFIG_SGL_ANIMATION）
            // SGL: speed = 像素/秒
            if let Some(true) = w.long_mode {
                let speed = w.long_mode_speed.unwrap_or(50).max(1);
                code.push_str(&format!("    sgl_label_set_long_mode({}, {}, true);\n", obj, speed));
            }
        }
        "label_ext" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_label_ext_set_font({}, &{});\n", obj, fid));
            }
            let has_buffer = w.text_buffer.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
            if has_buffer {
                if let Some(buf) = &w.text_buffer {
                    let parts: Vec<&str> = buf.split(',').map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        if let Ok(sz) = parts[1].parse::<u16>() {
                            code.push_str(&format!("    sgl_label_ext_set_text_buffer({}, {}, {});\n", obj, parts[0], sz));
                        }
                    } else {
                        code.push_str(&format!("    sgl_label_ext_set_text_buffer({}, {}, 64);\n", obj, parts[0]));
                    }
                }
                if let Some(fmt) = &w.text_fmt {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_label_ext_set_text_fmt({}, \"{}\");\n", obj, escaped));
                    }
                } else if let Some(fmt) = &w.text_fmt_dynamic {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_label_ext_set_text_fmt_dynamic({}, \"{}\");\n", obj, escaped));
                    }
                }
            } else {
                cstr!("sgl_label_ext_set_text", w.text);
            }
            cclr!("sgl_label_ext_set_text_color", w.text_color);
            // label_ext 的 set_bg_color 会自动置位 bg_flag
            if let Some(bg) = &w.bg_color {
                if !bg.is_empty() && bg != "transparent" {
                    code.push_str(&format!("    sgl_label_ext_set_bg_color({}, {});\n", obj, sgl_color(bg)));
                }
            }
            c!( "sgl_label_ext_set_alpha", w.alpha.map(|v| v as u8));
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
                code.push_str(&format!("    sgl_label_ext_set_text_align({}, {});\n", obj, align_macro));
            }
            c!( "sgl_label_ext_set_radius", w.radius.map(|v| v as u8));
            // label_ext 支持 offset_x/offset_y；仅非默认时生成
            {
                let ox = w.text_offset_x.unwrap_or(0);
                let oy = w.text_offset_y.unwrap_or(0);
                if ox != 0 || oy != 0 {
                    code.push_str(&format!(
                        "    sgl_label_ext_set_text_offset({}, {}, {});\n",
                        obj, ox as i8, oy as i8
                    ));
                }
            }
            if let Some(r) = w.text_rotation {
                code.push_str(&format!("    sgl_label_ext_set_text_rotation({}, {});\n", obj, r));
            }
        }
        "arc_label" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_arc_label_set_font({}, &{});\n", obj, fid));
            }
            let has_buffer = w.text_buffer.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
            if has_buffer {
                if let Some(buf) = &w.text_buffer {
                    let parts: Vec<&str> = buf.split(',').map(|s| s.trim()).collect();
                    if parts.len() == 2 {
                        if let Ok(sz) = parts[1].parse::<u16>() {
                            code.push_str(&format!("    sgl_arc_label_set_text_buffer({}, {}, {});\n", obj, parts[0], sz));
                        }
                    } else {
                        code.push_str(&format!("    sgl_arc_label_set_text_buffer({}, {}, 64);\n", obj, parts[0]));
                    }
                }
                if let Some(fmt) = &w.text_fmt {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_arc_label_set_text_fmt({}, \"{}\");\n", obj, escaped));
                    }
                } else if let Some(fmt) = &w.text_fmt_dynamic {
                    if !fmt.is_empty() {
                        let escaped = fmt.replace('\\', "\\\\").replace('"', "\\\"");
                        code.push_str(&format!("    sgl_arc_label_set_text_fmt_dynamic({}, \"{}\");\n", obj, escaped));
                    }
                }
            } else {
                cstr!("sgl_arc_label_set_text", w.text);
            }
            cclr!("sgl_arc_label_set_text_color", w.text_color);
            // 旋转模式（angle!=0）下必须设置 bg_color，否则文本不可见
            let angle_nonzero = w.angle.map(|a| a != 0).unwrap_or(false);
            let need_bg = w.arc_label_bg_flag.unwrap_or(false) || angle_nonzero;
            if need_bg {
                let bg = w.bg_color.as_deref().filter(|s| !s.is_empty() && *s != "transparent")
                    .unwrap_or("#FFFFFF");
                code.push_str(&format!("    sgl_arc_label_set_bg_color({}, {});\n", obj, sgl_color(bg)));
            }
            c!( "sgl_arc_label_set_alpha", w.alpha.map(|v| v as u8));
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
                code.push_str(&format!("    sgl_arc_label_set_text_align({}, {});\n", obj, align_macro));
            }
            c!( "sgl_arc_label_set_radius", w.radius.map(|v| v as u8));
            // transform 是 union：angle 与 offset 不能同时设置
            if angle_nonzero {
                code.push_str(&format!("    sgl_arc_label_set_orig_pos({}, {}, {});\n", obj, w.x, w.y));
                code.push_str(&format!("    sgl_arc_label_set_orig_size({}, {}, {});\n", obj, w.width, w.height));
                if let Some(angle) = w.angle {
                    code.push_str(&format!("    sgl_arc_label_set_angle({}, {});\n", obj, angle as i16));
                }
            } else {
                let ox = w.arc_label_offset_x.unwrap_or(0);
                let oy = w.arc_label_offset_y.unwrap_or(0);
                if ox != 0 || oy != 0 {
                    code.push_str(&format!(
                        "    sgl_arc_label_set_text_offset({}, {}, {});\n",
                        obj, ox as i8, oy as i8
                    ));
                }
            }
        }
        "img" => {
            if let Some(pix) = &w.pixmap {
                if !pix.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_img_set_pixmap({}, &{});\n", obj, pixmap_var_name(pix, fmt)));
                }
            }
            c!( "sgl_img_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(read_ops) = &w.read_ops {
                if !read_ops.is_empty() {
                    code.push_str(&format!("    sgl_img_set_read_ops({}, {});\n", obj, read_ops.trim()));
                }
            }
        }
        "textbox" => {
            cstr!("sgl_textbox_set_text", w.text);
            cclr!("sgl_textbox_set_text_color", w.text_color);
            cclr!("sgl_textbox_set_bg_color", w.bg_color);
            cclr!("sgl_textbox_set_border_color", w.border_color);
            c!( "sgl_textbox_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_textbox_set_radius", w.radius.map(|v| v as u8));
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_gauge_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_gauge_set_value", w.value.map(|v| v as i16));
            cclr!("sgl_gauge_set_arc_color", w.arc_color);
            cclr!("sgl_gauge_set_scale_color", w.scale_color);
            cclr!("sgl_gauge_set_pointer_color", w.pointer_color);
            cclr!("sgl_gauge_set_text_color", w.text_color);
            cclr!("sgl_gauge_set_hub_color", w.hub_color);
            cclr!("sgl_gauge_set_bg_color", w.bg_color);
            if w.start_angle.is_some() || w.end_angle.is_some() {
                code.push_str(&format!(
                    "    sgl_gauge_set_angle_range({}, {}, {});\n",
                    obj,
                    w.start_angle.unwrap_or(0),
                    w.end_angle.unwrap_or(360)
                ));
            }
            c!( "sgl_gauge_set_arc_width", w.arc_width.map(|v| v as u8));
            c!( "sgl_gauge_set_scale_width", w.scale_width.map(|v| v as u8));
            c!( "sgl_gauge_set_scale_length", w.scale_length.map(|v| v as u8));
            c!( "sgl_gauge_set_pointer_width", w.pointer_width.map(|v| v as u8));
            c!( "sgl_gauge_set_hub_radiue", w.hub_radius.map(|v| v as u8));
            c!( "sgl_gauge_set_scale_start_value", w.scale_start.map(|v| v as i16));
            if let Some(step) = w.scale_step {
                code.push_str(&format!("    sgl_gauge_set_scale_step_value({}, {});\n", obj, step.max(1)));
            }
            if let Some(angle) = w.scale_angle {
                code.push_str(&format!("    sgl_gauge_set_scale_angle({}, {});\n", obj, angle.max(1)));
            }
            c!( "sgl_gauge_set_text_interval", w.text_interval.map(|v| v as u8));
            c!( "sgl_gauge_set_scale_warning_value", w.scale_warning.map(|v| v as i16));
            c!( "sgl_gauge_set_alpha", w.alpha.map(|v| v as u8));
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
            // 对齐 sgl_api.js / SGL battery API：level、fillColor（空=自动色）等
            let level = w.level.or(w.value).unwrap_or(100) as u8;
            code.push_str(&format!("    sgl_battery_set_level({}, {});\n", obj, level));
            if let Some(ref fc) = w.fill_color {
                if !fc.trim().is_empty() {
                    cclr!("sgl_battery_set_fill_color", w.fill_color.clone());
                }
            }
            cclr!("sgl_battery_set_low_color", w.low_color);
            cclr!("sgl_battery_set_medium_color", w.medium_color);
            cclr!("sgl_battery_set_high_color", w.high_color);
            cclr!("sgl_battery_set_bg_color", w.bg_color);
            cclr!("sgl_battery_set_border_color", w.border_color);
            if let Some(v) = w.vertical {
                code.push_str(&format!("    sgl_battery_set_vertical({}, {});\n", obj, if v { 1 } else { 0 }));
            }
            if let Some(c) = w.charging {
                code.push_str(&format!("    sgl_battery_set_charging({}, {});\n", obj, if c { "true" } else { "false" }));
            }
            cclr!("sgl_battery_set_charging_color", w.charging_color);
            if let Some(sp) = w.show_percentage {
                code.push_str(&format!("    sgl_battery_show_percentage({}, {});\n", obj, if sp { "true" } else { "false" }));
            }
            cclr!("sgl_battery_set_text_color", w.text_color);
            c!( "sgl_battery_set_alpha", w.alpha.map(|v| v as u8));
            if w.show_percentage == Some(true) {
                if let Some(fid) = font_id_for_widget(&project, w) {
                    code.push_str(&format!("    sgl_battery_set_font({}, &{});\n", obj, fid));
                }
            }
        }
        "led" => {
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_led_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cclr!("sgl_led_set_on_color", w.on_color);
            cclr!("sgl_led_set_off_color", w.off_color);
            cclr!("sgl_led_set_bg_color", w.bg_color);
            c!( "sgl_led_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_led_set_alpha", w.alpha.map(|v| v as u8));
        }
        "arc" => {
            cclr!("sgl_arc_set_color", w.color);
            cclr!("sgl_arc_set_bg_color", w.bg_color);
            c!( "sgl_arc_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(m) = w.mode {
                let mode_macro = match m {
                    1 => "SGL_ARC_MODE_RING",
                    2 => "SGL_ARC_MODE_NORMAL_SMOOTH",
                    3 => "SGL_ARC_MODE_RING_SMOOTH",
                    _ => "SGL_ARC_MODE_NORMAL",
                };
                code.push_str(&format!("    sgl_arc_set_mode({}, {});\n", obj, mode_macro));
            }
            if let (Some(r_in), Some(r_out)) = (w.radius_in, w.radius_out) {
                code.push_str(&format!("    sgl_arc_set_radius({}, {}, {});\n", obj, r_in, r_out));
            }
            c!("sgl_arc_set_start_angle", w.start_angle);
            c!("sgl_arc_set_end_angle", w.end_angle);
        }
        "ring" => {
            cclr!("sgl_ring_set_color", w.color);
            if let (Some(r_in), Some(r_out)) = (w.radius_in, w.radius_out) {
                code.push_str(&format!("    sgl_ring_set_radius({}, {}, {});\n", obj, r_in, r_out));
            }
            c!( "sgl_ring_set_alpha", w.alpha.map(|v| v as u8));
        }
        "checkbox" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            if let Some(font_var) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_win_set_title_font({}, &{});\n", obj, font_var));
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
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_dropdown_set_text_font({}, &{});\n", obj, fid));
            }
            if let Some(ref opts) = w.options {
                if !opts.is_empty() {
                    let escaped = opts.replace('\\', "\\\\").replace('"', "\\\"");
                    if w.option_dynamic.unwrap_or(false) {
                        code.push_str(&format!("    sgl_dropdown_set_option_dynamic({}, \"{}\");\n", obj, escaped));
                    } else {
                        code.push_str(&format!("    sgl_dropdown_set_option_static({}, \"{}\");\n", obj, escaped));
                    }
                }
            }
            cclr!("sgl_dropdown_set_text_color", w.text_color);
            cclr!("sgl_dropdown_set_bg_color", w.bg_color);
            cclr!("sgl_dropdown_set_border_color", w.border_color);
            c!( "sgl_dropdown_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_dropdown_set_radius", w.radius.map(|v| v as u8));
            cclr!("sgl_dropdown_set_selected_color", w.selected_color);
            c!( "sgl_dropdown_set_visible_rows", w.visible_rows.map(|v| v as u8));
            c!( "sgl_dropdown_set_alpha", w.alpha.map(|v| v as u8));
        }
        "textline" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_textline_set_text_font({}, &{});\n", obj, fid));
            }
            cstr!("sgl_textline_set_text", w.text);
            cclr!("sgl_textline_set_text_color", w.text_color);
            cclr!("sgl_textline_set_bg_color", w.bg_color);
            c!( "sgl_textline_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_textline_set_alpha", w.alpha.map(|v| v as u8));
        }
        "textlist" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            // 完整 buffers/vrange 由前端 sgl_api.js 生成；此处补齐颜色边框（grid 用 grid_color）
            cclr!("sgl_scope_set_bg_color", w.bg_color);
            cclr!("sgl_scope_set_grid_color", w.grid_color);
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
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            if let Some(fid) = font_id_for_widget(&project, w) {
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
            if let Some(fid) = font_id_for_widget(&project, w) {
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
        "img_ext" => {
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
                if let Some(fid) = font_id_for_widget(&project, w) {
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
                    if w.bar_spacing.is_some() || w.category_gap.is_some() {
                        let bs = w.bar_spacing.unwrap_or(4);
                        let cg = w.category_gap.unwrap_or(10);
                        code.push_str(&format!("    {}_set_bar_spacing({}, {}, {});\n", prefix, obj, bs, cg));
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
        "roller" => {
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_roller_set_text_font({}, &{});\n", obj, fid));
            }
            if let Some(ref opts) = w.options {
                if !opts.is_empty() {
                    let escaped = opts.replace('\\', "\\\\").replace('"', "\\\"");
                    if w.option_dynamic.unwrap_or(false) {
                        code.push_str(&format!("    sgl_roller_set_option_dynamic({}, \"{}\");\n", obj, escaped));
                    } else {
                        code.push_str(&format!("    sgl_roller_set_option_static({}, \"{}\");\n", obj, escaped));
                    }
                }
            }
            c!( "sgl_roller_set_visible_rows", w.visible_rows.map(|v| v as u8));
            if let Some(v) = w.infinite_mode {
                code.push_str(&format!("    sgl_roller_set_infinite_mode({}, {});\n", obj, if v { "true" } else { "false" }));
            }
            cclr!("sgl_roller_set_text_color", w.text_color);
            cclr!("sgl_roller_set_selected_color", w.selected_color);
            cclr!("sgl_roller_set_bg_color", w.bg_color);
            cclr!("sgl_roller_set_border_color", w.border_color);
            c!( "sgl_roller_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_roller_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_roller_set_alpha", w.alpha.map(|v| v as u8));
        }
        "statusbar" => {
            cclr!("sgl_statusbar_set_bg_color", w.bg_color);
            c!( "sgl_statusbar_set_bg_alpha", w.statusbar_bg_alpha.map(|v| v as u8));
            c!( "sgl_statusbar_set_bg_radius", w.radius.map(|v| v as u8));
            if w.left_margin.is_some() || w.right_margin.is_some() {
                code.push_str(&format!(
                    "    sgl_statusbar_set_slot_margin({}, {}, {});\n",
                    obj,
                    w.left_margin.unwrap_or(0),
                    w.right_margin.unwrap_or(0)
                ));
            }
            c!( "sgl_statusbar_set_slot_space", w.slot_space.map(|v| v as u8));
            if let Some(fid) = font_id_for_widget(&project, w) {
                code.push_str(&format!("    sgl_statusbar_set_font({}, &{});\n", obj, fid));
            }
            if let Some(ref left) = w.left_slots {
                for (i, slot) in left.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).take(4).enumerate() {
                    let escaped = slot.replace('\\', "\\\\").replace('"', "\\\"");
                    code.push_str(&format!("    sgl_statusbar_set_left_slot({}, {}, \"{}\");\n", obj, i, escaped));
                }
            }
            if let Some(ref right) = w.right_slots {
                for (i, slot) in right.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).take(8).enumerate() {
                    let escaped = slot.replace('\\', "\\\\").replace('"', "\\\"");
                    code.push_str(&format!("    sgl_statusbar_set_right_slot({}, {}, \"{}\");\n", obj, i, escaped));
                }
            }
            if w.slot_color.is_some() || w.slot_alpha.is_some() {
                let color = w.slot_color.as_deref().filter(|s| !s.is_empty()).unwrap_or("#FFFFFF");
                let alpha = w.slot_alpha.unwrap_or(255) as u8;
                let color_expr = sgl_color(color);
                for i in 0..4 {
                    code.push_str(&format!("    sgl_statusbar_set_left_slot_color({}, {}, {});\n", obj, i, color_expr));
                }
                for i in 0..8 {
                    code.push_str(&format!("    sgl_statusbar_set_right_slot_color({}, {}, {});\n", obj, i, color_expr));
                }
                for i in 0..4 {
                    code.push_str(&format!("    sgl_statusbar_set_left_slot_alpha({}, {}, {});\n", obj, i, alpha));
                }
                for i in 0..8 {
                    code.push_str(&format!("    sgl_statusbar_set_right_slot_alpha({}, {}, {});\n", obj, i, alpha));
                }
            }
        }
        "launcher" => {
            cclr!("sgl_launcher_set_label_color", w.label_color);
            cclr!("sgl_launcher_set_navigbar_color", w.navigbar_color);
            c!( "sgl_launcher_set_current_page", w.current_page.map(|v| v as u8));
        }
        _ => {}
    }
}

/// 规范化路径：解析 . 和 .. 组件，返回简化后的路径
/// 规范化路径：解析 . 和 .. 组件，保留磁盘前缀（Windows）和根目录
fn normalize_path(path: &std::path::Path) -> std::path::PathBuf {
    let mut result = std::path::PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(c) => result.push(c),
            std::path::Component::ParentDir => { result.pop(); }
            // 保留 RootDir 和 Prefix（Windows 盘符如 C:），避免丢失绝对路径信息
            std::path::Component::RootDir => result.push(component.as_os_str()),
            std::path::Component::Prefix(prefix) => result.push(prefix.as_os_str()),
            std::path::Component::CurDir => {}
        }
    }
    result
}

/// 检查路径是否在项目目录内（防止路径遍历攻击）
/// 使用规范化后的路径逐个组件比较，避免字符串前缀误判
fn is_inside_project(path: &std::path::Path, proj_dir: &std::path::Path) -> bool {
    let norm_path = normalize_path(path);
    let norm_proj = normalize_path(proj_dir);
    // 使用 starts_with 进行路径前缀比较，确保子目录关系
    // 额外检查：path 必须比 proj_dir 长，或者两者相等
    let path_str = norm_path.to_string_lossy();
    let proj_str = norm_proj.to_string_lossy();
    let starts = path_str.starts_with(proj_str.as_ref());
    if !starts {
        return false;
    }
    // 确保不是部分匹配（如 /proj/foo 匹配 /proj/foobar）
    if path_str.len() == proj_str.len() {
        return true;
    }
    // proj_str 后面必须是路径分隔符
    path_str.as_bytes().get(proj_str.len()) == Some(&b'\\') || path_str.as_bytes().get(proj_str.len()) == Some(&b'/')
}

/// 保存时允许导入的字体扩展名（用户显式添加的项目外字体需要复制进 resources/fonts）
fn is_importable_font_ext(name: &str) -> bool {
    std::path::Path::new(name)
        .extension()
        .map(|e| {
            matches!(
                e.to_string_lossy().to_ascii_lowercase().as_str(),
                "ttf" | "otf" | "ttc" | "woff" | "woff2"
            )
        })
        .unwrap_or(false)
}

/// 保存时允许导入的图片扩展名
fn is_importable_image_ext(name: &str) -> bool {
    std::path::Path::new(name)
        .extension()
        .map(|e| {
            matches!(
                e.to_string_lossy().to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "bmp" | "gif" | "webp"
            )
        })
        .unwrap_or(false)
}

/// 解析资源源路径：绝对路径原样；相对路径基于项目目录
fn resolve_resource_src(path: &str, proj_dir: &std::path::Path) -> std::path::PathBuf {
    let p = std::path::Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        proj_dir.join(p)
    }
}

/// 将字体/图片复制到项目 resources，并返回是否已写入目标文件。
/// 允许项目外的用户所选文件（扩展名白名单）；禁止把不存在的外部路径改写成相对路径空壳。
fn import_resource_file(
    src_path: &str,
    dest: &std::path::Path,
    kind: &str,
    allow_ext: impl Fn(&str) -> bool,
) -> Result<(), String> {
    let dest_name = dest
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if !is_safe_filename(&dest_name) {
        return Err(format!("非法{}文件名: {}", kind, dest_name));
    }
    if !allow_ext(&dest_name) {
        return Err(format!("不支持的{}格式: {}", kind, dest_name));
    }
    let src = std::path::Path::new(src_path);
    if !src.exists() {
        // 相对路径且目标已存在：可能已导入过，跳过
        if !src.is_absolute() && dest.exists() {
            return Ok(());
        }
        return Err(format!(
            "{}文件不存在，无法导入项目: {}（目标: {}）",
            kind,
            src_path,
            dest.display()
        ));
    }
    let same = src
        .canonicalize()
        .ok()
        .zip(dest.canonicalize().ok())
        .map(|(a, b)| a == b)
        .unwrap_or(false);
    if same {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建{}目录失败: {}", kind, e))?;
    }
    std::fs::copy(src, dest).map_err(|e| {
        format!(
            "复制{}失败: {} -> {} ({})",
            kind,
            src_path,
            dest.display(),
            e
        )
    })?;
    Ok(())
}

/// 验证文件名为纯文件名（不含路径分隔符和 .. 组件），防止路径遍历写入
fn is_safe_filename(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    // 拒绝包含路径分隔符的文件名
    if name.contains('/') || name.contains('\\') {
        return false;
    }
    // 拒绝 .. 组件（防止 dir/../file 或 ..file 等变形）
    if name.contains("..") {
        return false;
    }
    // 拒绝空文件名、当前目录引用
    if name == "." || name == ".." {
        return false;
    }
    true
}

/// 验证导出路径为安全的代码文件扩展名，防止恶意写入系统文件
fn is_safe_export_path(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    let p = std::path::Path::new(path);
    if let Some(ext) = p.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        match ext_lower.as_str() {
            "c" | "h" | "cpp" | "hpp" | "txt" | "md" => true,
            _ => false,
        }
    } else {
        // 无扩展名：拒绝（可能是目录或恶意文件）
        false
    }
}

/// 验证字符串只包含字母、数字和下划线（用于 C 标识符类配置）
fn is_safe_c_identifier(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// 将绝对路径转为相对于 proj_dir 的相对路径（仅当文件在 proj_dir 下时转换）
fn path_to_rel(path: &str, proj_dir: &std::path::Path) -> String {
    if path.is_empty() {
        return path.to_string();
    }
    let p = std::path::Path::new(path);
    if !p.is_absolute() {
        return path.replace('\\', "/");
    }
    // 安全检查：只有 proj_dir 内的路径才允许转为相对路径
    if is_inside_project(p, proj_dir) {
        if let Ok(rel) = p.strip_prefix(proj_dir) {
            return rel.to_string_lossy().replace('\\', "/");
        }
    }
    // 不在项目目录内，返回空字符串（拒绝处理）
    String::new()
}

/// 将相对路径转为绝对路径（基于 proj_dir），阻止路径遍历
fn path_to_abs(path: &str, proj_dir: &std::path::Path) -> String {
    if path.is_empty() {
        return path.to_string();
    }
    let p = std::path::Path::new(path);
    let norm = if p.is_absolute() {
        normalize_path(p)
    } else {
        normalize_path(&proj_dir.join(p))
    };
    let norm_proj = normalize_path(proj_dir);
    if !is_inside_project(&norm, &norm_proj) {
        // 路径遍历检测：逃出项目目录时回退到项目目录
        return norm_proj.to_string_lossy().replace('\\', "/");
    }
    norm.to_string_lossy().replace('\\', "/")
}

#[tauri::command]
fn save_project(path: String, mut project: Project) -> Result<(), String> {
    // 安全检查：项目文件必须是 .json 或 .sgl 扩展名
    let p = std::path::Path::new(&path);
    if let Some(ext) = p.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        if ext_lower != "json" && ext_lower != "sgl" {
            return Err("项目文件必须是 .json 或 .sgl 格式".to_string());
        }
    } else {
        return Err("项目文件必须带有扩展名".to_string());
    }
    let proj_dir = p
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;

    // 创建资源目录
    let fonts_dir = proj_dir.join("resources").join("fonts");
    let images_dir = proj_dir.join("resources").join("images");
    std::fs::create_dir_all(&fonts_dir).map_err(|e| format!("创建字体目录失败: {}", e))?;
    std::fs::create_dir_all(&images_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;

    // 复制字体文件并更新路径为相对路径，处理同名冲突
    // 同时构建 原路径 -> 新相对路径 映射，用于同步更新控件的 font_family
    let mut font_path_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    {
        let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        for font in &mut project.resources.fonts {
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

            // 记录原路径到新路径的映射（用于同步控件 font_family）
            let new_rel_path = format!("resources/fonts/{}", dest_name);
            font_path_map.insert(font.path.clone(), new_rel_path.clone());
            // 同时记录规范化后的路径（正斜杠）以应对路径分隔符差异
            let normalized_old = font.path.replace('\\', "/");
            font_path_map.insert(normalized_old.clone(), new_rel_path.clone());
            // 按文件名匹配（应对绝对/相对路径写法不一致）
            let base_key = dest_name.to_lowercase();
            font_path_map.insert(base_key.clone(), new_rel_path.clone());
            if let Some(old_base) = std::path::Path::new(&normalized_old)
                .file_name()
                .map(|s| s.to_string_lossy().to_lowercase())
            {
                font_path_map.insert(old_base, new_rel_path.clone());
            }
            font_path_map.insert(new_rel_path.clone(), new_rel_path.clone());

            // 将项目外/内的字体统一复制到 resources/fonts（扩展名白名单，允许外部绝对路径导入）
            let src_abs = resolve_resource_src(&font.path, proj_dir);
            let dest = fonts_dir.join(&dest_name);
            import_resource_file(
                &src_abs.to_string_lossy(),
                &dest,
                "字体",
                is_importable_font_ext,
            )?;
            font.path = new_rel_path;
            font.name = dest_name;
        }
    }

    // 复制图片文件并更新路径为相对路径，处理同名冲突
    {
        let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
        for img in &mut project.resources.images {
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

            let src_abs = resolve_resource_src(&img.path, proj_dir);
            let dest = images_dir.join(&dest_name);
            import_resource_file(
                &src_abs.to_string_lossy(),
                &dest,
                "图片",
                is_importable_image_ext,
            )?;
            img.path = format!("resources/images/{}", dest_name);
            img.name = dest_name;
        }
    }

    // 将页面和控件中的绝对路径转为相对路径
    for page in &mut project.pages {
        if let Some(ref mut p) = page.pixmap {
            *p = path_to_rel(p, proj_dir);
        }
        for w in &mut page.widgets {
            if let Some(ref mut p) = w.pixmap {
                *p = path_to_rel(p, proj_dir);
            }
            if let Some(ref mut i) = w.icon {
                *i = path_to_rel(i, proj_dir);
            }
            if let Some(ref mut l) = w.logo {
                *l = path_to_rel(l, proj_dir);
            }
            if let Some(ref mut ff) = w.font_family {
                if ff.is_empty() {
                    continue;
                }
                // 优先使用 font_path_map 同步路径（保证控件 font_family 与 font.path 一致）
                // 这样即使字体不在项目目录下，控件 font_family 也能正确指向 resources/fonts/xxx
                if let Some(new_path) = font_path_map.get(ff) {
                    *ff = new_path.clone();
                } else {
                    let normalized = ff.replace('\\', "/");
                    if let Some(new_path) = font_path_map.get(&normalized) {
                        *ff = new_path.clone();
                    } else if let Some(base) = std::path::Path::new(&normalized)
                        .file_name()
                        .map(|s| s.to_string_lossy().to_lowercase())
                    {
                        if let Some(new_path) = font_path_map.get(&base) {
                            *ff = new_path.clone();
                        } else if ff.contains('/') || ff.contains('\\') {
                            // 仅当能得到非空相对路径时才替换，避免把有效字体路径清空
                            let rel = path_to_rel(ff, proj_dir);
                            if !rel.is_empty() {
                                *ff = rel;
                            }
                        }
                    } else if ff.contains('/') || ff.contains('\\') {
                        let rel = path_to_rel(ff, proj_dir);
                        if !rel.is_empty() {
                            *ff = rel;
                        }
                    }
                }
            }
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
            font.path = abs.to_string_lossy().replace('\\', "/");
        } else {
            font.path = font.path.replace('\\', "/");
        }
    }

    for img in &mut project.resources.images {
        let p = std::path::Path::new(&img.path);
        if !p.is_absolute() {
            let abs = proj_dir.join(p);
            img.path = abs.to_string_lossy().replace('\\', "/");
        } else {
            img.path = img.path.replace('\\', "/");
        }
    }

    // 将页面和控件中的相对路径还原为绝对路径
    for page in &mut project.pages {
        if let Some(ref mut p) = page.pixmap {
            *p = path_to_abs(p, proj_dir);
        }
        for w in &mut page.widgets {
            if let Some(ref mut p) = w.pixmap {
                *p = path_to_abs(p, proj_dir);
            }
            if let Some(ref mut i) = w.icon {
                *i = path_to_abs(i, proj_dir);
            }
            if let Some(ref mut l) = w.logo {
                *l = path_to_abs(l, proj_dir);
            }
            if let Some(ref mut ff) = w.font_family {
                if ff.contains('/') || ff.contains('\\') {
                    *ff = path_to_abs(ff, proj_dir);
                }
            }
        }
    }

    Ok(project)
}

#[tauri::command]
fn export_code(path: String, code: String, mut project: Project, font_files: Vec<FontCFile>) -> Result<(), String> {
    // 安全检查：导出路径必须是安全的代码文件扩展名
    if !is_safe_export_path(&path) {
        return Err("导出路径不安全：只允许 .c/.h/.cpp/.hpp/.txt/.md 文件".to_string());
    }
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
        // 还原页面和控件中的相对路径
        for page in &mut project.pages {
            if let Some(ref mut p) = page.pixmap {
                let pp = std::path::Path::new(p);
                if !p.is_empty() && !pp.is_absolute() {
                    let abs = parent.join(pp);
                    if abs.exists() {
                        *p = abs.to_string_lossy().to_string();
                    }
                }
            }
            for w in &mut page.widgets {
                if let Some(ref mut pm) = w.pixmap {
                    let pp = std::path::Path::new(pm);
                    if !pm.is_empty() && !pp.is_absolute() {
                        let abs = parent.join(pp);
                        if abs.exists() {
                            *pm = abs.to_string_lossy().to_string();
                        }
                    }
                }
                if let Some(ref mut ic) = w.icon {
                    let pp = std::path::Path::new(ic);
                    if !ic.is_empty() && !pp.is_absolute() {
                        let abs = parent.join(pp);
                        if abs.exists() {
                            *ic = abs.to_string_lossy().to_string();
                        }
                    }
                }
                if let Some(ref mut lg) = w.logo {
                    let pp = std::path::Path::new(lg);
                    if !lg.is_empty() && !pp.is_absolute() {
                        let abs = parent.join(pp);
                        if abs.exists() {
                            *lg = abs.to_string_lossy().to_string();
                        }
                    }
                }
                if let Some(ref mut ff) = w.font_family {
                    if ff.contains('/') || ff.contains('\\') {
                        let pp = std::path::Path::new(ff);
                        if !pp.is_absolute() {
                            let abs = parent.join(pp);
                            if abs.exists() {
                                *ff = abs.to_string_lossy().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    let _fonts = collect_fonts(&project); // 仅用于代码生成参考，字模 C 文件由后端 Rust 用 FreeType 生成

    // 创建输出目录
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // 生成图片取模文件到 pixmaps/ 子目录
    // 安全保护：只删除程序自己创建的目录（含标记文件），避免误删用户已有文件
    let out_dir = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new("."));
    let pixmaps_dir = out_dir.join("pixmaps");
    if pixmaps_dir.exists() && pixmaps_dir.join(".sgl_auto_gen").exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;
    write_pixmaps_cmake(&pixmaps_dir)?;
    let _ = std::fs::write(pixmaps_dir.join(".sgl_auto_gen"), "");

    // 生成 icon 图标取模文件到 icons/ 子目录
    let icons_dir = out_dir.join("icons");
    if icons_dir.exists() && icons_dir.join(".sgl_auto_gen").exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;
    write_icons_cmake(&icons_dir)?;
    let _ = std::fs::write(icons_dir.join(".sgl_auto_gen"), "");

    std::fs::write(&path, code).map_err(|e| e.to_string())?;

    // 用后端 Rust 调用 FreeType 生成字模 C 文件（与 sgl_font_conv 完全一致）
    let proj_dir = out_dir;
    let mut resolved_font_paths: std::collections::HashMap<String, std::path::PathBuf> = std::collections::HashMap::new();
    for font in &project.resources.fonts {
        let p = std::path::Path::new(&font.path);
        let abs_path = if p.is_absolute() {
            p.to_path_buf()
        } else {
            proj_dir.join(p)
        };
        resolved_font_paths.insert(font.path.clone(), abs_path.clone());
        let normalized = font.path.replace('\\', "/");
        resolved_font_paths.insert(normalized, abs_path);
    }

    let (generated_font_files, map_entries) = generate_project_font_c_files(
        &project,
        &_fonts,
        &resolved_font_paths,
        proj_dir,
        true,
    )?;

    // 写入字模 C 文件到 fonts/ 目录
    let fonts_dir = out_dir.join("fonts");
    if fonts_dir.exists() && fonts_dir.join(".sgl_auto_gen").exists() {
        let _ = std::fs::remove_dir_all(&fonts_dir);
    }
    finish_write_font_outputs(&project, &fonts_dir, &generated_font_files, &map_entries)?;
    Ok(())
}

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

#[cfg(windows)]
fn setup_hidden_window(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000);
}

#[cfg(not(windows))]
fn setup_hidden_window(_cmd: &mut std::process::Command) {}

/// 结束正在运行的 sgl_simulator，避免链接时 output\sgl_simulator.exe 被占用 (Permission denied)
fn kill_sgl_simulator(window: Option<&tauri::Window>) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/IM", "sgl_simulator.exe", "/T"]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        match cmd.output() {
            Ok(out) if out.status.success() => {
                if let Some(w) = window {
                    let _ = w.emit(
                        "build-log",
                        serde_json::json!({
                            "message": "已结束正在运行的 sgl_simulator，以便重新编译",
                            "level": "info"
                        }),
                    );
                }
                // 等待句柄释放，避免立刻链接仍 Permission denied
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
            _ => {}
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        let _ = std::process::Command::new("pkill")
            .args(["-f", "sgl_simulator"])
            .output();
    }
}

fn run_command_output_hidden(program: &str, args: &[&str], cwd: &std::path::Path) -> Result<std::process::Output, String> {
    let mut cmd = std::process::Command::new(program);
    cmd.current_dir(cwd).args(args);
    setup_hidden_window(&mut cmd);
    cmd.output().map_err(|e| format!("启动 {} 失败: {}", program, e))
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

    let mut cmd = Command::new(program);
    cmd.current_dir(cwd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    setup_hidden_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("启动 {} 失败: {}", program, e))?;

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

/// 判断 git stderr 行是否为网络慢/不可达类错误（低速中止属主动保护行为，
/// 原始英文 fatal 信息对用户有误导性，统一替换为一条友好提示）
fn is_git_network_error_line(line: &str) -> bool {
    line.contains("Operation too slow")
        || line.contains("unable to access")
        || line.contains("Could not connect")
        || line.contains("Failed to connect")
        || line.contains("Could not resolve host")
        || line.contains("Connection was reset")
        || line.contains("Recv failure")
        || line.contains("timed out")
        || line.contains("SSL_ERROR")
        || line.contains("GnuTLS recv error")
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
    setup_hidden_window(&mut cmd);

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
        let mut network_err_reported = false;
        for line in reader.lines() {
            if let Ok(l) = line {
                // 该函数仅用于 git 网络命令：git 把进度信息也写到 stderr，
                // 且网络慢导致的低速中止属预期保护行为，按 warn 输出避免误导性的红色错误
                if is_git_network_error_line(&l) {
                    if !network_err_reported {
                        network_err_reported = true;
                        let _ = w_err.emit("build-log", serde_json::json!({
                            "message": "网络连接 GitHub 过慢或中断，已中止本次网络操作",
                            "level": "warn"
                        }));
                    }
                    continue;
                }
                let _ = w_err.emit("build-log", serde_json::json!({"message": l, "level": "warn"}));
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
    let out = run_command_output_hidden("git", &["rev-parse", "HEAD"], repo_dir).ok()?;
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
    let out = run_command_output_hidden("git", &["merge-base", "--is-ancestor", local_hash, target_hash], target_repo).ok()?;
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
    _window: &tauri::Window,
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
            false
        }
        Some(false) => {
            // 设计器本地领先或分叉，可以同步
            true
        }
        None => {
            // 无法判断（如分叉历史），保守允许同步
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

/// 字模/图片/图标链接状态戳，用于触发 CMake 重新 configure
fn fonts_link_stamp(demo_dir: &std::path::Path) -> String {
    let mut stamp = String::new();
    for (subdir, cmake_name) in [
        ("fonts", "fonts.cmake"),
        ("pixmaps", "pixmaps.cmake"),
        ("icons", "icons.cmake"),
    ] {
        let dir = demo_dir.join(subdir);
        stamp.push_str(subdir);
        stamp.push(':');
        stamp.push_str(&list_font_files(&dir));
        stamp.push('\n');
        let cmake = dir.join(cmake_name);
        if let Ok(bytes) = std::fs::read(&cmake) {
            stamp.push_str(cmake_name);
            stamp.push(':');
            stamp.push_str(&simple_hash(&bytes));
            stamp.push('\n');
        }
    }
    stamp
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
fn export_code_to_project(mut project: Project, project_path: String, code: String, font_files: Vec<FontCFile>) -> Result<String, String> {
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

    // 生成图片取模文件到 code/pixmaps/ 子目录
    let pixmaps_dir = code_dir.join("pixmaps");
    if pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;
    write_pixmaps_cmake(&pixmaps_dir)?;

    // 生成 icon 图标取模文件到 code/icons/ 子目录
    let icons_dir = code_dir.join("icons");
    if icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;
    write_icons_cmake(&icons_dir)?;

    // 写入 code/ui.c
    let ui_c = code_dir.join("ui.c");
    // 保留 USER CODE 区域：同时读取 code/ui.c 与 sgl-port/demo/ui.c（用户常改后者）
    let demo_ui_c = proj_dir
        .join("sgl-port-windows-vscode")
        .join("demo")
        .join("ui.c");
    let final_code = prepare_ui_c_with_user_code(&code, &ui_c, Some(&demo_ui_c));
    std::fs::write(&ui_c, &final_code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

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

    // 用后端 Rust 调用 FreeType 生成字模 C 文件（与 sgl_font_conv 完全一致）
    let collected_fonts = collect_fonts(&project);

    // 解析字体路径为绝对路径
    let mut resolved_font_paths: std::collections::HashMap<String, std::path::PathBuf> = std::collections::HashMap::new();
    for font in &project.resources.fonts {
        let p = std::path::Path::new(&font.path);
        let abs_path = if p.is_absolute() {
            p.to_path_buf()
        } else {
            proj_dir.join(p)
        };
        resolved_font_paths.insert(font.path.clone(), abs_path.clone());
        let normalized = font.path.replace('\\', "/");
        resolved_font_paths.insert(normalized, abs_path);
    }

    let (generated_font_files, map_entries) = generate_project_font_c_files(
        &project,
        &collected_fonts,
        &resolved_font_paths,
        &proj_dir,
        true,
    )?;

    // 写入字模 C 文件到 code/fonts/ 目录
    let fonts_dir = code_dir.join("fonts");
    if fonts_dir.exists() {
        let _ = std::fs::remove_dir_all(&fonts_dir);
    }
    finish_write_font_outputs(&project, &fonts_dir, &generated_font_files, &map_entries)?;


    // 若项目目录下已克隆 sgl-port-windows-vscode 仓库（用户可能用 VSCode/CMake 手动编译），
    // 则把导出的 code/ui.c、fonts/、pixmaps/、icons/ 同步到 sgl-port/demo/，
    // 并确保 CMakelists.txt include demo/fonts/fonts.cmake，避免 undefined reference 链接错误。
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    if sgl_port_dir.exists()
        && sgl_port_dir.join("CMakelists.txt").exists()
        && sgl_port_dir.join("demo").exists()
    {
        let demo_dir = sgl_port_dir.join("demo");

        // 同步 ui.c
        let ui_c_dest = demo_dir.join("ui.c");
        let _ = std::fs::copy(&ui_c, &ui_c_dest);

        // 同步 pixmaps
        let demo_pixmaps_dir = demo_dir.join("pixmaps");
        if demo_pixmaps_dir.exists() {
            let _ = std::fs::remove_dir_all(&demo_pixmaps_dir);
        }
        let pixmaps_dir = code_dir.join("pixmaps");
        if pixmaps_dir.exists() {
            let _ = copy_dir_contents(&pixmaps_dir, &demo_pixmaps_dir);
        }

        // 同步 icons
        let demo_icons_dir = demo_dir.join("icons");
        if demo_icons_dir.exists() {
            let _ = std::fs::remove_dir_all(&demo_icons_dir);
        }
        let icons_dir = code_dir.join("icons");
        if icons_dir.exists() {
            let _ = copy_dir_contents(&icons_dir, &demo_icons_dir);
        }

        // 同步 fonts（字模 C 文件）
        let demo_fonts_dir = demo_dir.join("fonts");
        if demo_fonts_dir.exists() {
            let _ = std::fs::remove_dir_all(&demo_fonts_dir);
        }
        if fonts_dir.exists() {
            let _ = copy_dir_contents(&fonts_dir, &demo_fonts_dir);
        }

        // 写入 sgl_config.h 到 demo 目录
        let demo_config_path = demo_dir.join("sgl_config.h");
        let _ = generate_sgl_config_h(&project.sgl_config, &demo_config_path);

        // 确保 CMakelists.txt 使用 ui.c 而非 test.c/bg.c，修复 widgets GLOB 递归问题
        let cmake_path = sgl_port_dir.join("CMakelists.txt");
        if let Ok(cmake_content) = std::fs::read_to_string(&cmake_path) {
            let mut updated = cmake_content
                .replace("${DEMO_DIR}/test.c", "${DEMO_DIR}/ui.c")
                .replace("${DEMO_DIR}/bg.c`n", "`n")
                .replace("${DEMO_DIR}/bg.c", "");
            updated = updated.replace(
                "file(GLOB SGL_WIDGETS_SOURCES ${SGL_ROOT_DIR}/sgl/source/widgets/*/*.c)",
                "file(GLOB_RECURSE SGL_WIDGETS_SOURCES ${SGL_ROOT_DIR}/sgl/source/widgets/*/*.c)",
            );
            let _ = std::fs::write(&cmake_path, &updated);
        }

        // 确保 CMakelists.txt include demo/fonts/fonts.cmake
        let cmake_modified = ensure_cmake_fonts_glob(&cmake_path).unwrap_or(false);

        // 检测字模链接状态变化（fonts.cmake 或 .c 列表变化时重新 configure）
        let build_dir = sgl_port_dir.join("build");
        let fonts_changed = if build_dir.exists() {
            let manifest_file = build_dir.join(".fonts_manifest");
            let new_stamp = fonts_link_stamp(&demo_dir);
            let prev_stamp = std::fs::read_to_string(&manifest_file).unwrap_or_default();
            if new_stamp != prev_stamp {
                let _ = std::fs::write(&manifest_file, &new_stamp);
                let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
                let _ = std::fs::remove_file(build_dir.join("Makefile"));
                true
            } else {
                false
            }
        } else {
            false
        };

        if cmake_modified {
            if build_dir.exists() {
                let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
                let _ = std::fs::remove_file(build_dir.join("Makefile"));
            }
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

    match is_sgl_submodule_up_to_date(&sgl_port_dir, &window) {
        Ok((true, true)) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": true,
            "msg": "sgl 子模块已是最新版本".to_string()
        })),
        Ok((false, true)) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": false,
            "msg": "sgl 子模块有新版本可用".to_string()
        })),
        Ok((true, false)) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": true,
            "stale": true,
            "msg": "sgl 子模块可能是最新版本（基于上次缓存信息，网络获取失败）".to_string()
        })),
        Ok((false, false)) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": false,
            "stale": true,
            "msg": "sgl 子模块可能有新版本（基于上次缓存信息，网络获取失败）".to_string()
        })),
        Err(e) => Ok(serde_json::json!({
            "exists": true,
            "up_to_date": false,
            "check_failed": true,
            "msg": format!("检查失败: {}", e)
        })),
    }
}

fn sgl_submodule_path(sgl_port_dir: &std::path::Path) -> std::path::PathBuf {
    let output = run_command_output_hidden("git", &["config", "-f", ".gitmodules", "--get", "submodule.sgl.path"], sgl_port_dir);
    match output {
        Ok(o) if o.status.success() => {
            let p = String::from_utf8_lossy(&o.stdout).trim().to_string();
            sgl_port_dir.join(p)
        }
        _ => sgl_port_dir.join("sgl"),
    }
}

fn sgl_submodule_branch(sgl_port_dir: &std::path::Path) -> String {
    let output = run_command_output_hidden("git", &["config", "-f", ".gitmodules", "--get", "submodule.sgl.branch"], sgl_port_dir);
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

    let mut cmd = Command::new("git");
    cmd.current_dir(submodule_path)
        .args(&["fetch", "origin"])
        .env("GIT_HTTP_LOW_SPEED_TIME", "5")
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "1000")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    setup_hidden_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("启动 git fetch 失败: {}", e))?;

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
        let mut network_err_reported = false;
        for line in reader.lines() {
            if let Ok(l) = line {
                // git fetch 的进度和低速中止信息都走 stderr，属预期行为，按 warn 输出
                if is_git_network_error_line(&l) {
                    if !network_err_reported {
                        network_err_reported = true;
                        let _ = w_err.emit("build-log", serde_json::json!({
                            "message": "网络连接 GitHub 过慢或中断，已中止版本检查",
                            "level": "warn"
                        }));
                    }
                    continue;
                }
                let _ = w_err.emit("build-log", serde_json::json!({"message": l, "level": "warn"}));
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
/// 返回 (是否最新, fetch是否成功)，fetch失败时用本地缓存的 origin/branch 降级比较
fn is_sgl_submodule_up_to_date(
    sgl_port_dir: &std::path::Path,
    window: &tauri::Window,
) -> Result<(bool, bool), String> {
    use std::process::Command;
    let submodule_path = sgl_submodule_path(sgl_port_dir);
    if !submodule_path.exists() || !submodule_path.join(".git").exists() {
        return Ok((false, true));
    }
    let branch = sgl_submodule_branch(sgl_port_dir);

    // 先获取本地 HEAD
    let local = run_command_output_hidden("git", &["rev-parse", "HEAD"], &submodule_path)
        .map_err(|e| format!("获取 sgl 子模块本地版本失败: {}", e))?;
    let local_rev = String::from_utf8_lossy(&local.stdout).trim().to_string();

    // 带超时的 fetch，避免国内访问 GitHub 长时间挂起
    let fetch_result = run_git_fetch_with_timeout(&submodule_path, window, 30);
    let fetch_ok = match &fetch_result {
        Ok(status) => status.success(),
        Err(e) => {
            let _ = window.emit("build-log", serde_json::json!({
                "message": format!("git fetch 失败，尝试用本地缓存信息比较: {}", e),
                "level": "warn"
            }));
            false
        }
    };

    if !fetch_ok {
        // fetch 失败：尝试用本地已有的 origin/branch 缓存信息比较
        let remote = match run_command_output_hidden("git", &["rev-parse", &format!("origin/{}", branch)], &submodule_path) {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            _ => String::new(),
        };
        if local_rev.is_empty() || remote.is_empty() {
            return Err(format!(
                "无法获取远程版本且本地无缓存（本地: '{}'，origin/{}: '{}'）",
                local_rev, branch, remote
            ));
        }
        // fetch 失败但本地有缓存：返回比较结果，标记 fetch 未成功
        return Ok((local_rev == remote, false));
    }

    // fetch 成功：正常比较
    let remote = run_command_output_hidden("git", &["rev-parse", &format!("origin/{}", branch)], &submodule_path)
        .map_err(|e| format!("获取 sgl 子模块远程版本失败: {}", e))?;
    let remote_rev = String::from_utf8_lossy(&remote.stdout).trim().to_string();

    if local_rev.is_empty() || remote_rev.is_empty() {
        return Err(format!(
            "无法解析 sgl 子模块版本（本地: '{}'，远程 origin/{}: '{}'）",
            local_rev, branch, remote_rev
        ));
    }

    Ok((local_rev == remote_rev, true))
}

/// 将 sgl-port 仓库的 sgl 子模块更新到远程最新分支；先检查版本，已最新则跳过
fn update_sgl_submodules_to_latest(
    sgl_port_dir: &std::path::Path,
    window: &tauri::Window,
) -> Result<String, String> {
    use std::process::Command;

    // 让子模块跟踪 main 分支（仅对 sgl 子模块做此配置）
    let _ = run_command_output_hidden("git", &["config", "-f", ".gitmodules", "submodule.sgl.branch", "main"], sgl_port_dir);
    let _ = run_command_output_hidden("git", &["submodule", "sync", "--recursive"], sgl_port_dir);

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
        let _ = run_command_output_hidden("git", &["checkout", "."], &submodule_path);
        let _ = run_command_output_hidden("git", &["clean", "-fd"], &submodule_path);
    }

    // 先对比本地与远程版本，已最新则跳过网络更新
    match is_sgl_submodule_up_to_date(sgl_port_dir, window) {
        Ok((true, _)) => return Ok("sgl 子模块已是最新版本，跳过更新".to_string()),
        Ok((false, _)) => {}
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
        // 清理可能产生的空行（只删除被替换为空的行）
        let cleaned: String = updated.lines()
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        let _ = std::fs::write(&cmake_path, cleaned);
    }

    Ok("sgl-port 项目已就绪".to_string())
}

/// 根据项目配置生成 sgl_config.h
fn generate_sgl_config_h(config: &SglConfig, path: &std::path::Path) -> Result<(), String> {
    // 安全检查：heap_algo 必须是合法的 C 标识符，防止代码注入
    let safe_heap_algo = if is_safe_c_identifier(&config.heap_algo) {
        config.heap_algo.clone()
    } else {
        "tlsf".to_string()
    };
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
#define  CONFIG_SGL_FLASH_FONT                             {}
#define  CONFIG_SGL_FLASH_FONT_GLYPH_BUF_SIZE              {}
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
        if config.flash_font != 0 { 1 } else { 0 },
        if config.flash_font_glyph_buf_size > 0 {
            config.flash_font_glyph_buf_size
        } else {
            512
        },
        config.boot_logo,
        config.theme_dark,
        safe_heap_algo,
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

/// 从旧 ui.c 提取 USER CODE 区域：name -> 内容
fn extract_user_code_blocks(old_code: &str) -> std::collections::HashMap<String, String> {
    use std::collections::HashMap;
    let mut user_blocks: HashMap<String, String> = HashMap::new();
    let begin_prefix = "/* USER CODE BEGIN ";
    let end_prefix = "/* USER CODE END ";
    let mut lines = old_code.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim().trim_end_matches('\r');
        if let Some(rest) = trimmed.strip_prefix(begin_prefix) {
            if let Some(end_idx) = rest.find("*/") {
                let name = rest[..end_idx].trim().to_string();
                if name.is_empty() {
                    continue;
                }
                let end_marker = format!("{}{} */", end_prefix, name);
                let mut content_lines: Vec<String> = Vec::new();
                for inner_line in lines.by_ref() {
                    let inner_trim = inner_line.trim().trim_end_matches('\r');
                    if inner_trim == end_marker.trim() {
                        break;
                    }
                    content_lines.push(inner_line.trim_end_matches('\r').to_string());
                }
                while content_lines.last().map(|s| s.trim().is_empty()).unwrap_or(false) {
                    content_lines.pop();
                }
                while content_lines.first().map(|s| s.trim().is_empty()).unwrap_or(false) {
                    content_lines.remove(0);
                }
                user_blocks.insert(name, content_lines.join("\n"));
            }
        }
    }
    user_blocks
}

/// 将用户代码块写入新生成代码的对应 USER CODE 区域。
/// 新模板中 BEGIN/END 之间的占位内容全部丢弃，只保留提取到的用户代码。
fn apply_user_code_blocks(new_code: &str, user_blocks: &std::collections::HashMap<String, String>) -> String {
    if user_blocks.is_empty() {
        return new_code.to_string();
    }
    let begin_prefix = "/* USER CODE BEGIN ";
    let end_prefix = "/* USER CODE END ";
    let mut result_lines: Vec<String> = Vec::new();
    let mut in_user_block = false;
    let mut current_block_name = String::new();

    for line in new_code.lines() {
        let trimmed = line.trim().trim_end_matches('\r');
        if let Some(rest) = trimmed.strip_prefix(begin_prefix) {
            if let Some(end_idx) = rest.find("*/") {
                let name = rest[..end_idx].trim().to_string();
                if !name.is_empty() {
                    in_user_block = true;
                    current_block_name = name.clone();
                    result_lines.push(line.trim_end_matches('\r').to_string());
                    if let Some(content) = user_blocks.get(&name) {
                        if !content.is_empty() {
                            result_lines.push(content.clone());
                        }
                    }
                    continue;
                }
            }
        }
        if in_user_block {
            // 只认匹配当前区域名的 END；模板区内其它行全部跳过
            if let Some(rest) = trimmed.strip_prefix(end_prefix) {
                if let Some(end_idx) = rest.find("*/") {
                    let end_name = rest[..end_idx].trim();
                    if end_name == current_block_name {
                        in_user_block = false;
                        current_block_name.clear();
                        result_lines.push(line.trim_end_matches('\r').to_string());
                        continue;
                    }
                }
            }
            continue;
        }
        result_lines.push(line.trim_end_matches('\r').to_string());
    }

    result_lines.join("\n") + "\n"
}

fn user_block_has_real_code(content: &str) -> bool {
    content.lines().any(|l| {
        let t = l.trim();
        !t.is_empty()
            && !t.starts_with("/*")
            && !t.starts_with("//")
            && t != "(void)e;"
            && t != "(void)addr;"
    })
}

/// 从 new_code 中收集「独立函数体 USER CODE」区域名：
/// 形如 void name(...) { /* USER CODE BEGIN name */
fn collect_dedicated_fn_user_blocks(new_code: &str) -> Vec<String> {
    let mut names = Vec::new();
    let lines: Vec<&str> = new_code.lines().collect();
    for i in 0..lines.len() {
        let t = lines[i].trim();
        if let Some(rest) = t.strip_prefix("/* USER CODE BEGIN ") {
            if let Some(end_idx) = rest.find("*/") {
                let name = rest[..end_idx].trim();
                if name.is_empty() || name == "includes" || name == "functions" || name == "ui_init" {
                    continue;
                }
                let mut j = i;
                while j > 0 {
                    j -= 1;
                    if !lines[j].trim().is_empty() {
                        break;
                    }
                }
                if lines.get(j).map(|s| s.trim() == "{").unwrap_or(false) {
                    let mut k = j;
                    while k > 0 {
                        k -= 1;
                        if !lines[k].trim().is_empty() {
                            break;
                        }
                    }
                    let prev = lines.get(k).map(|s| s.trim()).unwrap_or("");
                    if prev.starts_with("void ") && prev.contains(&format!("{}(", name)) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    names
}

/// 从 functions 区域中抠出 `void name(...){...}`，返回 (函数体, 清理后的 functions)
fn extract_c_function_body(functions: &str, name: &str) -> Option<(String, String)> {
    let marker = format!("void {}", name);
    let bytes = functions.as_bytes();
    let text = functions;
    let mut search_from = 0;
    while let Some(rel) = text[search_from..].find(&marker) {
        let start = search_from + rel;
        let before_ok = start == 0
            || text.as_bytes()[start - 1].is_ascii_whitespace()
            || text.as_bytes()[start - 1] == b';'
            || text.as_bytes()[start - 1] == b'\n';
        if !before_ok {
            search_from = start + marker.len();
            continue;
        }
        let after_name = start + marker.len();
        let rest = &text[after_name..];
        let rest_trim_start = rest.trim_start_matches(|c: char| c == ' ' || c == '\t');
        if !rest_trim_start.starts_with('(') {
            search_from = after_name;
            continue;
        }
        let Some(brace_rel) = text[after_name..].find('{') else {
            search_from = after_name;
            continue;
        };
        let body_open = after_name + brace_rel;
        let mut depth = 0i32;
        let mut i = body_open;
        let mut body_close = None;
        while i < bytes.len() {
            let c = bytes[i] as char;
            if c == '{' {
                depth += 1;
            } else if c == '}' {
                depth -= 1;
                if depth == 0 {
                    body_close = Some(i);
                    break;
                }
            }
            i += 1;
        }
        let Some(body_close) = body_close else {
            search_from = after_name;
            continue;
        };
        let body = text[body_open + 1..body_close].trim();
        let body_clean: Vec<&str> = body
            .lines()
            .filter(|l| {
                let t = l.trim();
                !(t.starts_with("/* USER CODE BEGIN") || t.starts_with("/* USER CODE END"))
            })
            .collect();
        let body_str = body_clean.join("\n").trim().to_string();
        let mut cleaned = String::new();
        cleaned.push_str(text[..start].trim_end());
        let after = text[body_close + 1..].trim_start();
        if !cleaned.is_empty() && !after.is_empty() {
            cleaned.push_str("\n\n");
        }
        cleaned.push_str(after);
        return Some((body_str, cleaned.trim().to_string()));
    }
    None
}

fn strip_c_prototype(includes: &str, name: &str) -> String {
    let mut out = Vec::new();
    for line in includes.lines() {
        let t = line.trim();
        if t.starts_with("void ") && t.contains(&format!("{}(", name)) && t.ends_with(';') {
            continue;
        }
        out.push(line);
    }
    out.join("\n").trim().to_string()
}

/// 旧项目常把 flash_read 写在 includes/functions 且签名为 uint32_t；
/// 新模板改为独立 USER CODE + const size_t。迁移函数体并删除旧声明/定义。
fn migrate_legacy_fn_user_blocks(
    blocks: &mut std::collections::HashMap<String, String>,
    new_code: &str,
) {
    let names = collect_dedicated_fn_user_blocks(new_code);
    for name in names {
        let dedicated_ok = blocks
            .get(&name)
            .map(|c| user_block_has_real_code(c))
            .unwrap_or(false);
        if !dedicated_ok {
            if let Some(functions) = blocks.get("functions").cloned() {
                if let Some((body, cleaned)) = extract_c_function_body(&functions, &name) {
                    if user_block_has_real_code(&body) {
                        blocks.insert(name.clone(), body);
                    }
                    blocks.insert("functions".into(), cleaned);
                }
            }
        }
        if let Some(includes) = blocks.get("includes").cloned() {
            let cleaned = strip_c_prototype(&includes, &name);
            blocks.insert("includes".into(), cleaned);
        }
    }
}

/// 合并用户代码：从旧 ui.c 中提取 USER CODE BEGIN/END 区域内的内容，写入新生成的代码对应位置
/// 区域标记格式：/* USER CODE BEGIN <name> */ ... /* USER CODE END <name> */
fn merge_user_code(new_code: &str, old_code: &str) -> String {
    let mut blocks = extract_user_code_blocks(old_code);
    migrate_legacy_fn_user_blocks(&mut blocks, new_code);
    apply_user_code_blocks(new_code, &blocks)
}

/// 从多个旧文件合并用户代码（后者非空内容覆盖前者）。
/// 典型来源：code/ui.c（导出目录）+ sgl-port/.../demo/ui.c（用户常在此修改）
fn merge_user_code_from_sources(new_code: &str, old_sources: &[String]) -> String {
    use std::collections::HashMap;
    let mut merged: HashMap<String, String> = HashMap::new();
    for old in old_sources {
        if old.trim().is_empty() {
            continue;
        }
        for (name, content) in extract_user_code_blocks(old) {
            let has_real = user_block_has_real_code(&content);
            if has_real || !merged.contains_key(&name) {
                merged.insert(name, content);
            }
        }
    }
    migrate_legacy_fn_user_blocks(&mut merged, new_code);
    apply_user_code_blocks(new_code, &merged)
}

/// 读取 code/ui.c 与 demo/ui.c（若存在），合并用户保护区后返回最终 ui.c 文本
fn prepare_ui_c_with_user_code(new_code: &str, code_ui_c: &std::path::Path, demo_ui_c: Option<&std::path::Path>) -> String {
    let mut sources: Vec<String> = Vec::new();
    if code_ui_c.exists() {
        if let Ok(s) = std::fs::read_to_string(code_ui_c) {
            sources.push(s);
        }
    }
    if let Some(demo) = demo_ui_c {
        if demo.exists() {
            if let Ok(s) = std::fs::read_to_string(demo) {
                sources.push(s);
            }
        }
    }
    if sources.is_empty() {
        return new_code.to_string();
    }
    merge_user_code_from_sources(new_code, &sources)
}

/// 复制导出的代码到 sgl-port 项目并编译
#[tauri::command]
fn build_project(
    mut project: Project,
    project_path: String,
    code: String,
    font_files: Vec<FontCFile>,
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
    //
    // 版本保护：只有当设计器本地 sgl 版本 >= 用户项目 sgl 版本时才同步源码，
    // 避免设计器本地 sgl 落后时覆盖用户项目的最新 sgl（导致编译失败）
    let app_dir = if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            parent.to_path_buf()
        } else {
            std::path::PathBuf::from(".")
        }
    } else {
        std::path::PathBuf::from(".")
    };
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
    // 确保 CMakelists.txt include demo/fonts/fonts.cmake
    let cmake_modified = ensure_cmake_fonts_glob(&cmake_path).unwrap_or(false);

    // 智能 reconfigure 检测：CMakelists.txt 或字模链接状态变化时才删 CMakeCache.txt
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

        // 检测 demo 资源链接状态是否变化（fonts/pixmaps/icons cmake）
        let demo_dir_for_stamp = sgl_port_dir.join("demo");
        let current_fonts_stamp = fonts_link_stamp(&demo_dir_for_stamp);
        let fonts_manifest_file = build_dir.join(".fonts_manifest");
        let prev_fonts_stamp = std::fs::read_to_string(&fonts_manifest_file).unwrap_or_default();
        let fonts_changed = current_fonts_stamp != prev_fonts_stamp;

        if cmake_changed {
            let _ = std::fs::write(&cmake_hash_file, &current_cmake_hash);
        }
        if fonts_changed {
            let _ = std::fs::write(&fonts_manifest_file, &current_fonts_stamp);
        }

        if cmake_changed {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "CMakelists.txt 已变化，触发重新 configure", "level": "info" }),
            );
        }
        if fonts_changed {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": "字模链接状态已变化，触发重新 configure", "level": "info" }),
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
    // 字模 C 文件由后端 Rust 用 FreeType 直接生成（不再依赖前端 generateFontCFiles 或 sgl_font_conv.exe）
    // 优势：与 sgl_font_conv 完全一致（同用 FreeType），无需 emscripten，无需外部 exe

    // 收集所有控件使用的字体（font_name, font_path, size, bpp, compress, symbols）
    let collected_fonts = collect_fonts(&project);
    let _ = window.emit(
        "build-log",
        serde_json::json!({ "message": format!("收集到 {} 个字体需要生成字模", collected_fonts.len()), "level": "info" }),
    );

    // 解析字体路径为绝对路径（font_path 可能是相对路径如 resources/fonts/xxx.ttf）
    // 同时构建 font_path -> 绝对路径 的映射，便于后续处理
    let mut resolved_font_paths: std::collections::HashMap<String, std::path::PathBuf> = std::collections::HashMap::new();
    for font in &project.resources.fonts {
        let p = std::path::Path::new(&font.path);
        let abs_path = if p.is_absolute() {
            p.to_path_buf()
        } else {
            proj_dir.join(p)
        };
        resolved_font_paths.insert(font.path.clone(), abs_path.clone());
        // 兼容路径分隔符差异
        let normalized = font.path.replace('\\', "/");
        resolved_font_paths.insert(normalized, abs_path);
    }

    // 用 Rust 调用 FreeType 生成字模 C 文件（开启 flash_font 时按 font_id 排序累加地址）
    let (generated_font_files, map_entries) = match generate_project_font_c_files(
        &project,
        &collected_fonts,
        &resolved_font_paths,
        &proj_dir,
        false,
    ) {
        Ok(v) => v,
        Err(e) => {
            let _ = window.emit(
                "build-log",
                serde_json::json!({ "message": e.clone(), "level": "error" }),
            );
            return Err(e);
        }
    };
    for f in &generated_font_files {
        let _ = window.emit(
            "build-log",
            serde_json::json!({
                "message": format!(
                    "生成字模: {} (flash_bin={})",
                    f.font_id,
                    f.bitmap_bin.as_ref().map(|b| b.len()).unwrap_or(0)
                ),
                "level": "info"
            }),
        );
    }

    // 生成图片取模文件到 code/pixmaps/ 子目录
    let pixmaps_dir = code_dir.join("pixmaps");
    if pixmaps_dir.exists() {
        let _ = std::fs::remove_dir_all(&pixmaps_dir);
    }
    generate_pixmap_files(&project, &pixmaps_dir)?;
    write_pixmaps_cmake(&pixmaps_dir)?;

    // 生成 icon 图标取模文件到 code/icons/ 子目录
    let icons_dir = code_dir.join("icons");
    if icons_dir.exists() {
        let _ = std::fs::remove_dir_all(&icons_dir);
    }
    generate_icon_files(&project, &icons_dir)?;
    write_icons_cmake(&icons_dir)?;

    std::fs::create_dir_all(&code_dir).map_err(|e| format!("创建 code 目录失败: {}", e))?;
    let ui_c = code_dir.join("ui.c");
    // 保留 USER CODE：合并 code/ui.c 与 demo/ui.c（运行前用户改 demo 也能保住）
    let demo_ui_for_merge = sgl_port_dir.join("demo").join("ui.c");
    let final_code = prepare_ui_c_with_user_code(&code, &ui_c, Some(&demo_ui_for_merge));
    let preserved = extract_user_code_blocks(&final_code)
        .values()
        .filter(|c| c.lines().any(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with("/*") && !t.starts_with("//") && t != "(void)e;"
        }))
        .count();
    if preserved > 0 {
        let _ = window.emit(
            "build-log",
            serde_json::json!({
                "message": format!("已保留 {} 处 USER CODE 用户代码（来自 code/ui.c 和/或 demo/ui.c）", preserved),
                "level": "info"
            }),
        );
    }
    std::fs::write(&ui_c, &final_code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

    // 写入字模 C 文件到 code/fonts/ 目录
    let fonts_dir = code_dir.join("fonts");
    if fonts_dir.exists() {
        let _ = std::fs::remove_dir_all(&fonts_dir);
    }
    let _ = window.emit(
        "build-log",
        serde_json::json!({ "message": format!("后端生成字模文件数量: {}", generated_font_files.len()), "level": "info" }),
    );
    for f in &generated_font_files {
        let first_line = f.content.lines().next().unwrap_or("(空)").chars().take(80).collect::<String>();
        let _ = window.emit(
            "build-log",
            serde_json::json!({ "message": format!("字模文件: {} (fontId={}, 内容首行: {})", f.file_name, f.font_id, first_line), "level": "info" }),
        );
    }
    finish_write_font_outputs(&project, &fonts_dir, &generated_font_files, &map_entries)?;
    if project.sgl_config.flash_font != 0 {
        let base = parse_flash_font_base_addr(&project.sgl_config.flash_font_base_addr);
        let _ = window.emit(
            "build-log",
            serde_json::json!({
                "message": format!(
                    "外闪字模已打包: base=0x{:08X}, fonts={}, map=fonts_flash_map.h + *.bin",
                    base,
                    map_entries.len()
                ),
                "level": "info"
            }),
        );
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
    // 诊断日志：列出 demo/fonts 目录中的实际文件
    let _ = window.emit(
        "build-log",
        serde_json::json!({ "message": format!("demo/fonts 目录文件列表: {}", list_font_files(&demo_fonts_dir)), "level": "info" }),
    );

    // 字模文件写入 demo/fonts/ 后，检测链接状态是否变化
    // 若变化则删除 CMakeCache.txt，触发重新 configure 以加载 fonts.cmake
    if !build_dir.exists() {
        let _ = std::fs::create_dir_all(&build_dir);
    }
    let new_fonts_stamp = fonts_link_stamp(&demo_dir);
    let fonts_manifest_file = build_dir.join(".fonts_manifest");
    let prev_fonts_stamp = std::fs::read_to_string(&fonts_manifest_file).unwrap_or_default();
    if new_fonts_stamp != prev_fonts_stamp {
        let _ = std::fs::write(&fonts_manifest_file, &new_fonts_stamp);
        let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
        let _ = std::fs::remove_file(build_dir.join("Makefile"));
        let _ = window.emit(
            "build-log",
            serde_json::json!({ "message": "字模链接状态已变化，触发重新 configure", "level": "info" }),
        );
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

    // 链接前结束旧模拟器，否则 Windows 下 exe 被占用会导致 Permission denied
    kill_sgl_simulator(Some(&window));

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
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 将 UTC 秒数转换为本地时间（避免引入 chrono 依赖）
    let local_secs = unix_to_local_secs(now_secs);
    let days = local_secs / 86400;
    let time_of_day = local_secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
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

/// 将 UTC 秒数转换为本地时区的秒数
/// 通过调用系统 date 命令获取本地时间，避免引入 chrono 依赖
fn unix_to_local_secs(utc_secs: u64) -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 简化方案：估算 UTC 与本地时间偏差
    // 通过获取当前 SystemTime 两次（一次 UTC + 通过 date 命令获取本地时间戳）
    // 计算差值得到偏移，再对传入的 utc_secs 应用偏移
    let utc_now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let local_now = read_local_time_secs();
    if let Some(local) = local_now {
        let offset = local as i64 - utc_now as i64;
        (utc_secs as i64 + offset).max(0) as u64
    } else {
        utc_secs
    }
}

/// 通过系统 date 命令获取当前本地时间戳（秒）
/// 返回 None 表示无法获取（回退到 UTC）
fn read_local_time_secs() -> Option<u64> {
    #[cfg(windows)]
    {
        use std::process::Command;
        // Windows: 通过 cmd /c echo %date% %time% 不易解析，改用 powershell
        let output = run_command_output_hidden("powershell", &["-NoProfile", "-Command", "([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - [DateTimeOffset]::Now.ToUnixTimeSeconds())"], std::path::Path::new("."))
            .ok()?;
        // 输出是 UTC 减 local = 偏移秒数（CST 为 -28800 = UTC-8）
        if !output.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&output.stdout);
        let offset: i64 = s.trim().parse().ok()?;
        // 我们要的是 local_secs，需要：local = utc + offset
        // 这里 offset 是 utc - local，所以 local = utc - offset
        let utc_now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        Some((utc_now - offset).max(0) as u64)
    }
    #[cfg(unix)]
    {
        use std::process::Command;
        let output = Command::new("date")
            .arg("+%s")
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&output.stdout);
        s.trim().parse().ok()
    }
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
        flash_font: get_i32(&content, "CONFIG_SGL_FLASH_FONT", 0),
        flash_font_glyph_buf_size: get_i32(&content, "CONFIG_SGL_FLASH_FONT_GLYPH_BUF_SIZE", 512),
        flash_font_base_addr: default_flash_font_base_addr(),
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

    // 先结束旧实例，避免多开与文件占用
    kill_sgl_simulator(None);

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
    let mut cmd = Command::new(&simulator);
    cmd.current_dir(simulator.parent().unwrap_or(&sgl_port_dir));
    setup_hidden_window(&mut cmd);
    cmd.spawn().map_err(|e| format!("启动模拟器失败: {}", e))?;

    Ok("模拟器已启动".to_string())
}

/// 检查目录路径是否为敏感的系统目录，防止信息泄露
fn is_sensitive_system_dir(path: &std::path::Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    // Windows 系统敏感目录
    let sensitive = [
        "\\windows\\",
        "\\program files\\",
        "\\program files (x86)\\",
        "\\programdata\\",
        "\\users\\",
        "\\$recycle.bin",
        "\\system volume information",
        "\\config\\",
        "\\syswow64\\",
        "\\drivers\\",
    ];
    for s in &sensitive {
        if path_str.contains(s) {
            return true;
        }
    }
    false
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
    if is_sensitive_system_dir(dir) {
        return Err("拒绝访问系统敏感目录".to_string());
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

/// 将前端生成的字模 C 文件直接写入到 fonts 目录（替代 sgl_font_conv.exe 调用）
/// font_files: 前端 generateFontCFiles() 返回的 {fontId, fileName, content} 数组
/// fonts_dir: 目标 fonts 目录路径
fn write_font_c_files(font_files: &[FontCFile], fonts_dir: &std::path::Path) -> Result<(), String> {
    if font_files.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(fonts_dir)
        .map_err(|e| format!("创建 fonts 目录失败: {}", e))?;
    for f in font_files {
        // 安全检查：防止 file_name 包含路径遍历组件
        if !is_safe_filename(&f.file_name) {
            return Err(format!("非法字模文件名（含路径分隔符）: {}", f.file_name));
        }
        let path = fonts_dir.join(&f.file_name);
        std::fs::write(&path, &f.content)
            .map_err(|e| format!("写入字模文件 {} 失败: {}", f.file_name, e))?;
        if let Some(ref bin) = f.bitmap_bin {
            let bin_name = format!("{}.bin", f.font_id);
            if !is_safe_filename(&bin_name) {
                return Err(format!("非法字模 bin 文件名: {}", bin_name));
            }
            std::fs::write(fonts_dir.join(&bin_name), bin)
                .map_err(|e| format!("写入字模 bin {} 失败: {}", bin_name, e))?;
        }
    }
    Ok(())
}

/// 写入 fonts_flash_map.h：基址 + 各字模偏移/大小清单
fn write_fonts_flash_map(
    fonts_dir: &std::path::Path,
    base_addr: u32,
    entries: &[(String, u32, u32)],
) -> Result<(), String> {
    let mut out = String::new();
    out.push_str("/* Auto-generated by SGL UI Designer — external flash font map */\n");
    out.push_str("#ifndef SGL_FONTS_FLASH_MAP_H\n");
    out.push_str("#define SGL_FONTS_FLASH_MAP_H\n\n");
    out.push_str("#include <stdint.h>\n\n");
    out.push_str("/* Manual base address — only this value needs editing after packing */\n");
    out.push_str(&format!("#ifndef SGL_FLASH_FONT_BASE_ADDR\n#define SGL_FLASH_FONT_BASE_ADDR  0x{:08X}u\n#endif\n\n", base_addr));
    out.push_str("/* Platform flash read — implement in ui.c (USER CODE) */\n");
    out.push_str("int32_t sgl_flash_font_read(uint32_t addr, void *buf, uint32_t len);\n\n");
    out.push_str("/* Packed layout (font_id sorted, 4-byte aligned):\n");
    out.push_str(" *   name                              offset       size\n");
    for (id, off, sz) in entries {
        out.push_str(&format!(" *   {:<32} 0x{:08X}  {}\n", id, off, sz));
    }
    out.push_str(" */\n");
    for (id, off, sz) in entries {
        out.push_str(&format!("#define {}_FLASH_OFFSET  0x{:X}u\n", id.to_uppercase(), off));
        out.push_str(&format!("#define {}_FLASH_SIZE    {}u\n", id.to_uppercase(), sz));
    }
    out.push_str("\n#endif /* SGL_FONTS_FLASH_MAP_H */\n");
    std::fs::create_dir_all(fonts_dir).map_err(|e| format!("创建 fonts 目录失败: {}", e))?;
    std::fs::write(fonts_dir.join("fonts_flash_map.h"), out)
        .map_err(|e| format!("写入 fonts_flash_map.h 失败: {}", e))?;
    Ok(())
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

#[tauri::command]
fn save_png_to_desktop_or_dir(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    use std::path::PathBuf;

    fn get_desktop() -> Option<PathBuf> {
        if let Ok(home) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(&home).join("Desktop");
            if p.exists() { return Some(p); }
            let p2 = PathBuf::from(&home).join("OneDrive").join("Desktop");
            if p2.exists() { return Some(p2); }
        }
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(&home).join("Desktop");
            if p.exists() { return Some(p); }
        }
        None
    }

    // 优先保存到项目目录/screenshots 下（可通过最近一次打开的项目路径推断？这里先简化：桌面/screenshots）
    let target_dir: PathBuf = get_desktop().unwrap_or_else(|| std::env::temp_dir());

    // 若有 screenshots 子目录优先写入，否则直接写桌面
    let screenshots = target_dir.join("SGL UI 截图");
    let out_dir = if screenshots.exists() || std::fs::create_dir_all(&screenshots).is_ok() {
        screenshots
    } else {
        target_dir.clone()
    };
    // 保证文件名安全
    let safe_name: String = filename.chars().map(|c| match c {
        '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
        c => c,
    }).collect();
    let mut out_path = out_dir.join(&safe_name);
    if out_path.exists() {
        // 同名追加时间戳
        let stem = out_path.file_stem().and_then(|s| s.to_str()).unwrap_or("screenshot").to_string();
        let ext = out_path.extension().and_then(|s| s.to_str()).unwrap_or("png").to_string();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string());
        out_path = out_dir.join(format!("{}_{}.{}", stem, ts, ext));
    }
    std::fs::write(&out_path, bytes).map_err(|e| format!("写入截图失败: {}", e))?;
    Ok(out_path.to_string_lossy().to_string())
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
            list_directory,
            get_font_file_fingerprint,
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
            clear_ai_chat_history,
            generate_font_c,
            save_png_to_desktop_or_dir
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
            font_glyph_extra: None,
            font_include_ascii: None,
            font_glyph_ranges: None,
            font_spacing: None,
            font_smart_mono: None,
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
            start_angle: None,
            end_angle: None,
            mode: None,
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
        let (name, _path, sz, bpp, _compress, _spacing, _mono, symbols) = &fonts[0];
        assert_eq!(name, "simsun.ttc");
        assert_eq!(*sz, 24);
        assert_eq!(*bpp, 4);
        let set: std::collections::HashSet<char> = symbols.chars().collect();
        assert!(set.contains(&'确'));
        assert!(set.contains(&'定'));
        assert!(set.contains(&'取'));
        assert!(set.contains(&'消'));
    }

    #[test]
    fn test_merge_user_code_preserves_blocks() {
        let old = r#"
#include "sgl.h"
/* USER CODE BEGIN includes */
#include "my_app.h"
int g_flag = 1;
/* USER CODE END includes */
void ui_init(void)
{
    ui_page_create();
/* USER CODE BEGIN ui_init */
    g_flag = 2;
/* USER CODE END ui_init */
}
void btn_cb(sgl_event_t *e)
{
/* USER CODE BEGIN btn_cb */
    sgl_obj_set_hidden(e->obj, true);
/* USER CODE END btn_cb */
}
"#;
        let new = r#"
#include "sgl.h"
/* USER CODE BEGIN includes */
/* placeholder */
/* USER CODE END includes */
void ui_init(void)
{
    ui_page_create();
/* USER CODE BEGIN ui_init */
/* placeholder */
/* USER CODE END ui_init */
}
void btn_cb(sgl_event_t *e)
{
/* USER CODE BEGIN btn_cb */
    (void)e;
/* USER CODE END btn_cb */
}
"#;
        let merged = super::merge_user_code(new, old);
        assert!(merged.contains("#include \"my_app.h\""));
        assert!(merged.contains("int g_flag = 1;"));
        assert!(merged.contains("g_flag = 2;"));
        assert!(merged.contains("sgl_obj_set_hidden(e->obj, true);"));
        assert!(!merged.contains("(void)e;"), "template placeholder inside USER CODE should be replaced");
        assert!(!merged.contains("placeholder"));
    }

    #[test]
    fn test_merge_prefers_demo_over_code() {
        let code_ui = r#"
/* USER CODE BEGIN includes */
#include "from_code.h"
/* USER CODE END includes */
"#;
        let demo_ui = r#"
/* USER CODE BEGIN includes */
#include "from_demo.h"
int demo_only = 1;
/* USER CODE END includes */
"#;
        let new = r#"
/* USER CODE BEGIN includes */
/* USER CODE END includes */
"#;
        let merged = super::merge_user_code_from_sources(new, &[code_ui.to_string(), demo_ui.to_string()]);
        assert!(merged.contains("#include \"from_demo.h\""));
        assert!(merged.contains("int demo_only = 1;"));
        assert!(!merged.contains("from_code.h"));
    }
}

/// 生成字模 C 文件（供设计器/预览页调用，确保前端渲染与 SGL 仿真使用同一份字模数据）
/// font_path: 字体文件绝对路径
/// size: 字号
/// bpp: 位深 (1/2/4)
/// symbols: 需要生成字模的字符
/// compress: 是否启用 RLE 压缩
/// font_name: 字体名称（用于生成变量名）
#[tauri::command]
fn generate_font_c(
    font_path: String,
    size: i32,
    bpp: i32,
    symbols: String,
    compress: bool,
    font_name: String,
    spacing: Option<i32>,
    smart_mono: Option<bool>,
) -> Result<font_generator::GenerateFontResult, String> {
    let path = std::path::Path::new(&font_path);
    if !path.exists() {
        return Err(format!("字体文件不存在: {}", font_path));
    }
    font_generator::generate_font_c(
        path,
        size,
        bpp,
        &symbols,
        compress,
        &font_name,
        spacing.unwrap_or(0),
        smart_mono.unwrap_or(false),
        None, // 设计器预览始终片内字模
    )
}

/// 返回字体文件指纹（大小+修改时间），用于前端缓存失效判定
/// 若文件不存在则返回空字符串
#[tauri::command]
fn get_font_file_fingerprint(font_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&font_path);
    if !path.exists() {
        return Ok(String::new());
    }
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(format!("{}_{}", size, modified))
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

    // 原子写入：先写临时文件，再 rename 覆盖（在 Windows 上 rename 替换现有文件也是原子的）
    fs::write(&tmp_file, content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    // Windows 上 fs::rename 不能直接覆盖现有文件，需要先备份旧文件再恢复
    // 但跨平台最简单可靠的做法：若目标已存在先 remove 再 rename
    if history_file.exists() {
        // 备份到带时间戳的临时文件，避免极端情况下历史丢失
        let backup_file = project_dir.join(format!(
            ".ai_chat_history.json.bak.{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        if let Err(e) = fs::rename(&history_file, &backup_file) {
            // 备份失败时直接清理旧文件，保证 rename 能成功
            let _ = fs::remove_file(&history_file);
            let _ = e;
        }
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
