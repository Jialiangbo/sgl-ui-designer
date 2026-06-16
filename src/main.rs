#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Widget {
    id: String,
    #[serde(rename = "type")]
    widget_type: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    text: Option<String>,
    color: Option<String>,
    bg_color: Option<String>,
    border_color: Option<String>,
    border_width: Option<i32>,
    radius: Option<i32>,
    alpha: Option<i32>,
    font_size: Option<i32>,
    font_family: Option<String>,
    font_bpp: Option<i32>,
    align: Option<String>,
    value: Option<i32>,
    status: Option<bool>,
    src: Option<String>,
    direct: Option<i32>,
    fill_color: Option<String>,
    track_color: Option<String>,
    knob_color: Option<String>,
    text_color: Option<String>,
    knob_radius: Option<i32>,
    knob_margin: Option<i32>,
    text_offset_x: Option<i32>,
    text_offset_y: Option<i32>,
    text_rotation: Option<i32>,
    dashed: Option<bool>,
    dash_len: Option<i32>,
    gap_len: Option<i32>,
    fill_gap: Option<i32>,
    fill_radius: Option<i32>,
    thickness: Option<i32>,
    x_offset: Option<i32>,
    y_offset: Option<i32>,
    event_cb: Option<String>,
    #[serde(rename = "parentId", default)]
    parent_id: Option<String>,
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
    #[serde(default)]
    alpha: Option<u8>,
    widgets: Vec<Widget>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ResourceItem {
    name: String,
    path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Resources {
    fonts: Vec<ResourceItem>,
    images: Vec<ResourceItem>,
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

fn collect_fonts(project: &Project) -> Vec<(String, String, i32, i32)> {
    // (font_name, font_path, size, bpp)
    use std::collections::HashSet;
    let mut fonts: Vec<(String, String, i32, i32)> = Vec::new();
    let mut seen = HashSet::new();
    for page in &project.pages {
        for w in &page.widgets {
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let bpp = w.font_bpp.unwrap_or(4);
                // 提取文件名用于去重
                let font_name = fam.replace('\\', "/").rsplit('/').next().unwrap_or(fam).to_string();
                // 跳过 "default" 字体
                if font_name == "default" {
                    continue;
                }
                let key = (font_name.clone(), sz, bpp);
                if seen.insert(key.clone()) {
                    // 解析字体文件路径
                    let font_path = resolve_font_path(fam).unwrap_or_else(|| fam.clone());
                    fonts.push((font_name, font_path, sz, bpp));
                }
            }
        }
    }
    fonts
}

fn font_id_from_family(family: &str, size: i32, bpp: i32) -> String {
    // 从完整路径提取文件名用于生成 font_id
    let binding = family.replace('\\', "/");
    let name = binding.rsplit('/').next().unwrap_or(family);
    let clean: String = name.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    format!("sgl_font_{}_{}_bpp{}", clean, size, bpp)
}

fn font_filename(family: &str, size: i32, bpp: i32) -> String {
    let clean: String = family.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    format!("font_{}_{}_bpp{}.c", clean, size, bpp)
}

#[tauri::command]
fn generate_code(project: Project) -> String {
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
        for (name, path, sz, bpp) in &fonts {
            code.push_str(&format!(" *   sgl_font_conv.exe --font {} --size {} --bpp {} --output fonts/{}\n",
                path, sz, bpp, font_filename(name, *sz, *bpp)));
        }
        code.push_str(" * ============================================ */\n");
        for (name, _path, sz, bpp) in &fonts {
            code.push_str(&format!("#include \"fonts/{}\"\n", font_filename(name, *sz, *bpp)));
        }
    }
    code.push('\n');

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
                code.push_str(&format!("    sgl_page_set_pixmap(page_{}, {});\n", page_id, pixmap));
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
            let create_fn = get_create_fn(&w.widget_type);
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
    code
}

fn get_create_fn(t: &str) -> &'static str {
    match t {
        "rect" => "sgl_rect_create",
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
        "ext_img" => "sgl_ext_img_create",
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
            cclr!("sgl_rect_set_color", w.color);
            cclr!("sgl_rect_set_border_color", w.border_color);
            c!( "sgl_rect_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_rect_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_rect_set_alpha", w.alpha.map(|v| v as u8));
        }
        "circle" => {
            cclr!("sgl_circle_set_color", w.color);
            cclr!("sgl_circle_set_border_color", w.border_color);
            c!( "sgl_circle_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_circle_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_circle_set_x_offset", w.x_offset.map(|v| v as i8));
            c!( "sgl_circle_set_y_offset", w.y_offset.map(|v| v as i8));
        }
        "line" => {
            cclr!("sgl_line_set_color", w.color);
            c!( "sgl_line_set_width", w.border_width.map(|v| v as u8));
            c!( "sgl_line_set_alpha", w.alpha.map(|v| v as u8));
            c!( "sgl_line_set_dashed", w.dashed.map(|v| v as u8));
            if let Some(dl) = w.dash_len {
                let gl = w.gap_len.unwrap_or(5);
                code.push_str(&format!("    sgl_line_set_dash_pattern({}, {}, {});\n", obj, dl, gl));
            }
        }
        "button" => {
            cstr!("sgl_button_set_text", w.text);
            cclr!("sgl_button_set_color", w.color);
            cclr!("sgl_button_set_text_color", w.text_color);
            cclr!("sgl_button_set_border_color", w.border_color);
            c!( "sgl_button_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_button_set_radius", w.radius.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_button_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_button_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(a) = &w.align {
                code.push_str(&format!("    sgl_button_set_text_align({}, SGL_ALIGN_{});\n", obj, a));
            }
        }
        "label" => {
            cstr!("sgl_label_set_text", w.text);
            cclr!("sgl_label_set_text_color", w.text_color);
            cclr!("sgl_label_set_bg_color", w.bg_color);
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_label_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_label_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(a) = &w.align {
                code.push_str(&format!("    sgl_label_set_text_align({}, SGL_ALIGN_{});\n", obj, a));
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
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_textbox_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "switch" => {
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_switch_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cclr!("sgl_switch_set_color", w.color);
            cclr!("sgl_switch_set_bg_color", w.bg_color);
            cclr!("sgl_switch_set_knob_color", w.knob_color);
            cclr!("sgl_switch_set_border_color", w.border_color);
            c!( "sgl_switch_set_border_width", w.border_width.map(|v| v as i16));
            c!( "sgl_switch_set_radius", w.radius.map(|v| v as u16));
            c!( "sgl_switch_set_knob_radius", w.knob_radius.map(|v| v as u8));
            c!( "sgl_switch_set_knob_margin", w.knob_margin.map(|v| v as u8));
            c!( "sgl_switch_set_alpha", w.alpha.map(|v| v as u8));
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
            c!( "sgl_slider_set_alpha", w.alpha.map(|v| v as u8));
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
            c!( "sgl_progress_set_alpha", w.alpha.map(|v| v as u8));
        }
        "gauge" => {
            cclr!("sgl_gauge_set_bg_color", w.bg_color);
            cclr!("sgl_gauge_set_arc_color", w.color);
            cclr!("sgl_gauge_set_scale_color", w.border_color);
            cclr!("sgl_gauge_set_text_color", w.text_color);
            c!( "sgl_gauge_set_value", w.value.map(|v| v as i16));
            c!( "sgl_gauge_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
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
            c!( "sgl_ring_set_alpha", w.alpha.map(|v| v as u8));
        }
        "checkbox" => {
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_checkbox_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cstr!("sgl_checkbox_set_text", w.text);
            cclr!("sgl_checkbox_set_color", w.color);
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_checkbox_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_checkbox_set_alpha", w.alpha.map(|v| v as u8));
        }
        "win" => {
            cclr!("sgl_win_set_color", w.color);
            cclr!("sgl_win_set_border_color", w.border_color);
            c!( "sgl_win_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_win_set_radius", w.radius.map(|v| v as u8));
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
            cclr!("sgl_dropdown_set_color", w.color);
            cclr!("sgl_dropdown_set_selected_color", w.bg_color);
            cclr!("sgl_dropdown_set_border_color", w.border_color);
            cclr!("sgl_dropdown_set_text_color", w.text_color);
            c!( "sgl_dropdown_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_dropdown_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_dropdown_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_dropdown_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "textline" => {
            cstr!("sgl_textline_set_text", w.text);
            cclr!("sgl_textline_set_text_color", w.text_color);
            cclr!("sgl_textline_set_bg_color", w.bg_color);
            c!( "sgl_textline_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_textline_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_textline_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "textlist" => {
            cclr!("sgl_textlist_set_text_color", w.text_color);
            cclr!("sgl_textlist_set_bg_color", w.bg_color);
            cclr!("sgl_textlist_set_border_color", w.border_color);
            c!( "sgl_textlist_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_textlist_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_textlist_set_text_font({}, &{});\n", obj, fid));
            }
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
            // canvas 只有 set_draw_cb 和 set_private_data，暂无通用属性
        }
        "scope" => {
            cclr!("sgl_scope_set_bg_color", w.bg_color);
            cclr!("sgl_scope_set_grid_color", w.color);
            cclr!("sgl_scope_set_border_color", w.border_color);
            c!( "sgl_scope_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_scope_set_alpha", w.alpha.map(|v| v as u8));
        }
        "polygon" => {
            cclr!("sgl_polygon_set_fill_color", w.color);
            cclr!("sgl_polygon_set_border_color", w.border_color);
            c!( "sgl_polygon_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_polygon_set_alpha", w.alpha.map(|v| v as u8));
        }
        "numberkbd" => {
            cclr!("sgl_numberkbd_set_color", w.color);
            cclr!("sgl_numberkbd_set_border_color", w.border_color);
            cclr!("sgl_numberkbd_set_text_color", w.text_color);
            c!( "sgl_numberkbd_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_numberkbd_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_numberkbd_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "keyboard" => {
            cclr!("sgl_keyboard_set_color", w.color);
            cclr!("sgl_keyboard_set_border_color", w.border_color);
            cclr!("sgl_keyboard_set_text_color", w.text_color);
            c!( "sgl_keyboard_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_keyboard_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_keyboard_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_keyboard_set_text_font({}, &{});\n", obj, fid));
            }
        }
        "qrcode" => {
            cclr!("sgl_qrcode_set_bg_color", w.bg_color);
            cclr!("sgl_qrcode_set_cell_color", w.color);
            c!( "sgl_qrcode_set_alpha", w.alpha.map(|v| v as u8));
        }
        "icon" => {
            cclr!("sgl_icon_set_color", w.color);
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
            c!( "sgl_ext_img_set_alpha", w.alpha.map(|v| v as u8));
        }
        "spectrum" => {
            cclr!("sgl_spectrum_set_bar_color", w.color);
            cclr!("sgl_spectrum_set_bar_hat_color", w.border_color);
            c!( "sgl_spectrum_set_alpha", w.alpha.map(|v| v as u8));
        }
        "analogclock" => {
            cclr!("sgl_analogclock_set_bg_color", w.bg_color);
            cclr!("sgl_analogclock_set_border_color", w.border_color);
            c!( "sgl_analogclock_set_alpha", w.alpha.map(|v| v as u8));
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
fn export_code(path: String, project: Project) -> Result<(), String> {
    let fonts = collect_fonts(&project);
    let code = generate_code(project);
    // 创建输出目录
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, code).map_err(|e| e.to_string())?;

    // 如果有字体配置，尝试调用 sgl_font_conv.exe 生成字模文件
    if !fonts.is_empty() {
        let out_dir = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new("."));
        let fonts_dir = out_dir.join("fonts");
        let _ = std::fs::create_dir_all(&fonts_dir);

        // 查找 sgl_font_conv.exe：优先在设计器 exe 同目录，其次项目根目录，最后 PATH
        let conv_path = find_sgl_font_conv();

        if let Some(conv) = conv_path {
            for (name, path, sz, bpp) in &fonts {
                let out_file = fonts_dir.join(font_filename(name, *sz, *bpp));
                let out_str = out_file.to_string_lossy().to_string();

                #[cfg(windows)]
                {
                    use std::process::Command;
                    let status = Command::new(&conv)
                        .arg("--font").arg(path)
                        .arg("--size").arg(sz.to_string())
                        .arg("--bpp").arg(bpp.to_string())
                        .arg("--output").arg(&out_str)
                        .status();
                    match status {
                        Ok(s) if s.success() => {}
                        Ok(s) => eprintln!("sgl_font_conv 返回非零状态 {:?}", s.code()),
                        Err(e) => eprintln!("调用 sgl_font_conv 失败: {}", e),
                    }
                }
                #[cfg(not(windows))]
                {
                    use std::process::Command;
                    let _ = Command::new(&conv)
                        .arg("--font").arg(path)
                        .arg("--size").arg(sz.to_string())
                        .arg("--bpp").arg(bpp.to_string())
                        .arg("--output").arg(&out_str)
                        .status();
                }
            }
        } else {
            eprintln!("未找到 sgl_font_conv.exe，请确保其在设计器 exe 同目录或 PATH 中");
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

/// 导出代码到项目目录的 code/ 子文件夹
#[tauri::command]
fn export_code_to_project(project: Project, project_path: String) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let code_dir = proj_dir.join("code");
    std::fs::create_dir_all(&code_dir).map_err(|e| format!("创建 code 目录失败: {}", e))?;

    // 生成代码
    let fonts = collect_fonts(&project);
    let code = generate_code(project);

    // 写入 code/ui.c
    let ui_c = code_dir.join("ui.c");
    std::fs::write(&ui_c, &code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

    // 生成字模文件到 code/fonts/ 目录
    if !fonts.is_empty() {
        let fonts_dir = code_dir.join("fonts");
        let _ = std::fs::create_dir_all(&fonts_dir);

        let conv_path = find_sgl_font_conv();
        if let Some(conv) = conv_path {
            for (name, path, sz, bpp) in &fonts {
                let out_file = fonts_dir.join(font_filename(name, *sz, *bpp));
                let out_str = out_file.to_string_lossy().to_string();

                use std::process::Command;
                let _ = Command::new(&conv)
                    .arg("--font").arg(path)
                    .arg("--size").arg(sz.to_string())
                    .arg("--bpp").arg(bpp.to_string())
                    .arg("--output").arg(&out_str)
                    .status();
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

    // 检查 code 目录是否已导出
    let code_dir = proj_dir.join("code");
    result.insert("code_exported".into(), serde_json::Value::Bool(code_dir.join("ui.c").exists()));

    Ok(serde_json::Value::Object(result))
}

/// 克隆 sgl-port-windows-vscode 到项目目录
#[tauri::command]
fn clone_sgl_port(project_path: String) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");

    // 检查 git
    if which_command_path("git").is_none() {
        return Err("未找到 git，请先安装 Git 并添加到环境变量".to_string());
    }

    use std::process::Command;

    // 如果不存在则克隆
    if !sgl_port_dir.exists() || !sgl_port_dir.join("CMakelists.txt").exists() {
        let output = Command::new("git")
            .arg("clone")
            .arg("https://github.com/sgl-org/sgl-port-windows-vscode.git")
            .arg(&sgl_port_dir)
            .output()
            .map_err(|e| format!("执行 git clone 失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("克隆失败: {}", stderr));
        }
    }

    // 确保子模块已初始化（检查 sgl/source 目录是否有内容）
    let sgl_source_dir = sgl_port_dir.join("sgl").join("source");
    let need_init_submodule = !sgl_source_dir.exists()
        || std::fs::read_dir(&sgl_source_dir).map(|d| d.count() == 0).unwrap_or(true);

    if need_init_submodule {
        let submodule_output = Command::new("git")
            .current_dir(&sgl_port_dir)
            .args(&["submodule", "update", "--init", "--recursive"])
            .output()
            .map_err(|e| format!("初始化子模块失败: {}", e))?;

        if !submodule_output.status.success() {
            let stderr = String::from_utf8_lossy(&submodule_output.stderr);
            return Err(format!("子模块初始化失败: {}", stderr));
        }
    }

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

/// 复制导出的代码到 sgl-port 项目并编译
#[tauri::command]
fn build_project(project: Project, project_path: String) -> Result<String, String> {
    let proj_dir = std::path::Path::new(&project_path)
        .parent()
        .ok_or_else(|| "无法获取项目目录".to_string())?;
    let sgl_port_dir = proj_dir.join("sgl-port-windows-vscode");
    let code_dir = proj_dir.join("code");

    // 检查 sgl-port 项目，不存在则自动克隆
    if !sgl_port_dir.exists() || !sgl_port_dir.join("CMakelists.txt").exists() {
        clone_sgl_port(project_path.clone())?;
    }

    // 确保子模块已初始化
    let sgl_source_dir = sgl_port_dir.join("sgl").join("source");
    let need_init = !sgl_source_dir.exists()
        || std::fs::read_dir(&sgl_source_dir).map(|d| d.count() == 0).unwrap_or(true);
    if need_init {
        clone_sgl_port(project_path.clone())?;
    }

    // 清理旧的 demo/bg.c 和 demo/test.c，只使用设计器生成的 ui.c
    let demo_dir = sgl_port_dir.join("demo");
    let _ = std::fs::remove_file(demo_dir.join("bg.c"));
    let _ = std::fs::remove_file(demo_dir.join("test.c"));

    // 确保 CMakelists.txt 使用 ui.c 而非 test.c 和 bg.c
    let cmake_path = sgl_port_dir.join("CMakelists.txt");
    if let Ok(cmake_content) = std::fs::read_to_string(&cmake_path) {
        if cmake_content.contains("test.c") || cmake_content.contains("bg.c") {
            let updated = cmake_content
                .replace("${DEMO_DIR}/test.c", "${DEMO_DIR}/ui.c")
                .replace("${DEMO_DIR}/bg.c\n", "\n")
                .replace("${DEMO_DIR}/bg.c", "");
            let _ = std::fs::write(&cmake_path, &updated);
        }
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
    let code = generate_code(project.clone());
    std::fs::create_dir_all(&code_dir).map_err(|e| format!("创建 code 目录失败: {}", e))?;
    let ui_c = code_dir.join("ui.c");
    std::fs::write(&ui_c, &code).map_err(|e| format!("写入 ui.c 失败: {}", e))?;

    // 生成字模文件
    if !fonts.is_empty() {
        let fonts_dir = code_dir.join("fonts");
        let _ = std::fs::create_dir_all(&fonts_dir);
        let conv_path = find_sgl_font_conv();
        if let Some(conv) = conv_path {
            for (name, path, sz, bpp) in &fonts {
                let out_file = fonts_dir.join(font_filename(name, *sz, *bpp));
                let out_str = out_file.to_string_lossy().to_string();
                use std::process::Command;
                let _ = Command::new(&conv)
                    .arg("--font").arg(path)
                    .arg("--size").arg(sz.to_string())
                    .arg("--bpp").arg(bpp.to_string())
                    .arg("--output").arg(&out_str)
                    .status();
            }
        }
    }

    // 复制 UI 代码到 sgl-port 的 demo/ui.c
    let demo_dir = sgl_port_dir.join("demo");
    let ui_c_dest = demo_dir.join("ui.c");
    std::fs::copy(&ui_c, &ui_c_dest).map_err(|e| format!("复制代码到 sgl-port 失败: {}", e))?;

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

    // 根据用户项目设置修改 sgl_config.h（颜色深度）
    let pixel_depth = match project.color_depth.as_str() {
        "8bit" => 8,
        "16bit" => 16,
        "24bit" => 24,
        _ => 32,
    };
    let sgl_config_path = demo_dir.join("sgl_config.h");
    if let Ok(config_content) = std::fs::read_to_string(&sgl_config_path) {
        let mut updated = config_content;
        if let Some(start) = updated.find("CONFIG_SGL_FBDEV_PIXEL_DEPTH") {
            if let Some(line_end) = updated[start..].find('\n') {
                let line_start = updated[..start].rfind('#').unwrap_or(0);
                updated = format!(
                    "{}#define  CONFIG_SGL_FBDEV_PIXEL_DEPTH                      {}{}",
                    &updated[..line_start],
                    pixel_depth,
                    &updated[start + line_end..]
                );
            }
        }
        let _ = std::fs::write(&sgl_config_path, &updated);
    }

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

    use std::process::Command;

    // 先尝试直接编译，如果失败则重新 cmake 配置后再编译
    let make_output = Command::new("cmake")
        .arg("--build").arg(".")
        .current_dir(&build_dir)
        .output()
        .map_err(|e| format!("执行编译失败: {}", e))?;

    if !make_output.status.success() {
        // 编译失败，重新 cmake 配置
        let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
        let _ = std::fs::remove_file(build_dir.join("Makefile"));
        let cmake_output = Command::new("cmake")
            .arg("..")
            .arg("-G").arg("MinGW Makefiles")
            .current_dir(&build_dir)
            .output()
            .map_err(|e| format!("执行 cmake 失败: {}（请确认已安装 CMake）", e))?;

        if !cmake_output.status.success() {
            let stderr = String::from_utf8_lossy(&cmake_output.stderr);
            let stdout = String::from_utf8_lossy(&cmake_output.stdout);
            return Err(format!("cmake 配置失败:\n{}{}", stdout, stderr));
        }

        // 重新编译
        let make_output2 = Command::new("cmake")
            .arg("--build").arg(".")
            .current_dir(&build_dir)
            .output()
            .map_err(|e| format!("执行编译失败: {}", e))?;

        if !make_output2.status.success() {
            let stderr = String::from_utf8_lossy(&make_output2.stderr);
            let stdout = String::from_utf8_lossy(&make_output2.stdout);
            return Err(format!("编译失败:\n{}{}", stdout, stderr));
        }
    }

    Ok("编译成功！".to_string())
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
            clone_sgl_port,
            build_project,
            run_simulator,
            append_log
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
