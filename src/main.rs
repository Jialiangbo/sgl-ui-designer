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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Page {
    id: String,
    name: String,
    width: i32,
    height: i32,
    bg_color: String,
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
    let rgb565 = ((r as u16 >> 3) << 11) | ((g as u16 >> 2) << 5) | (b as u16 >> 3);
    format!("SGL_MAKE_COLOR({})", rgb565)
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

    for page in &project.pages {
        let page_id = sanitize_id(&page.id);
        code.push_str(&format!("void ui_page_{}_create(void)\n{{\n", page_id));
        code.push_str(&format!(
            "    sgl_obj_t *page_{} = sgl_page_create(\"{}\", 0, 0, {}, {});\n",
            page_id, page.name, page.width, page.height
        ));
        if !page.bg_color.is_empty() {
            code.push_str(&format!("    sgl_page_set_bg_color(page_{}, {});\n", page_id, sgl_color(&page.bg_color)));
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
            code.push_str(&format!("    sgl_obj_add_child(page_{}, {});\n", page_id, obj_id));
            code.push('\n');
        }
        code.push_str(&format!("    sgl_page_set_active(page_{});\n", page_id));
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
        "chart" => "sgl_chart_create",
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
            cclr!("sgl_rect_set_bg_color", w.bg_color);
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
            cclr!("sgl_button_set_bg_color", w.bg_color);
            cclr!("sgl_button_set_text_color", w.text_color);
            cclr!("sgl_button_set_border_color", w.border_color);
            c!( "sgl_button_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_button_set_radius", w.radius.map(|v| v as u8));
            c!( "sgl_button_set_font_size", w.font_size.map(|v| v as u8));
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
            c!( "sgl_label_set_font_size", w.font_size.map(|v| v as u8));
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
            c!( "sgl_textbox_set_font_size", w.font_size.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_textbox_set_font({}, &{});\n", obj, fid));
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
        "checkbox" => {
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_checkbox_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cstr!("sgl_checkbox_set_text", w.text);
            cclr!("sgl_checkbox_set_color", w.color);
            c!( "sgl_checkbox_set_font_size", w.font_size.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                code.push_str(&format!("    sgl_checkbox_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_checkbox_set_alpha", w.alpha.map(|v| v as u8));
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
        "gauge" | "bar" | "battery" | "led" | "win" | "msgbox" | "dropdown" | "textline" | "textlist" | "viewlist" | "scroll" | "box" | "canvas" | "scope" | "chart" | "analogclock" | "ring" | "arc" | "polygon" | "numberkbd" | "keyboard" | "qrcode" | "icon" | "sprite" | "2dball" | "ext_img" | "spectrum" => {
            let fn_prefix = match t.as_str() {
                "2dball" => "sgl_2d_ball",
                "ext_img" => "sgl_ext_img",
                other => other,
            };
            let set_fn = |prop: &str| format!("sgl_{}_set_{}", fn_prefix, prop);
            if let Some(c) = &w.color { if !c.is_empty() { code.push_str(&format!("    {}({}, {});\n", set_fn("color"), obj, sgl_color(c))); } }
            if let Some(c) = &w.bg_color { if !c.is_empty() { code.push_str(&format!("    {}({}, {});\n", set_fn("bg_color"), obj, sgl_color(c))); } }
            if let Some(c) = &w.border_color { if !c.is_empty() { code.push_str(&format!("    {}({}, {});\n", set_fn("border_color"), obj, sgl_color(c))); } }
            if let Some(v) = w.border_width { code.push_str(&format!("    {}({}, {});\n", set_fn("border_width"), obj, v)); }
            if let Some(v) = w.radius { code.push_str(&format!("    {}({}, {});\n", set_fn("radius"), obj, v)); }
            if let Some(v) = w.alpha { code.push_str(&format!("    {}({}, {});\n", set_fn("alpha"), obj, v)); }
            if t == "gauge" || t == "bar" || t == "battery" {
                c!( "sgl_gauge_set_value", w.value.map(|v| v as u8));
                c!( "sgl_bar_set_value", w.value.map(|v| v as u8));
                c!( "sgl_battery_set_value", w.value.map(|v| v as u8));
            }
            if t == "led" && w.status.is_some() {
                code.push_str(&format!("    sgl_led_set_status({}, {});\n", obj, if w.status.unwrap() { "true" } else { "false" }));
            }
            if (t == "win" || t == "msgbox" || t == "dropdown") && w.text.is_some() {
                cstr!("sgl_dropdown_set_text".replace("dropdown", fn_prefix), w.text);
            }
            if t == "win" || t == "msgbox" || t == "dropdown" || t == "textline" || t == "textlist" || t == "viewlist" || t == "numberkbd" || t == "keyboard" {
                if let Some(sz) = w.font_size {
                    code.push_str(&format!("    {}({}, {});\n", set_fn("font_size"), obj, sz));
                }
                if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                    let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4));
                    code.push_str(&format!("    {}({}, &{});\n", set_fn("font"), obj, fid));
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
        .invoke_handler(tauri::generate_handler![
            generate_code,
            save_project,
            load_project,
            export_code
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
