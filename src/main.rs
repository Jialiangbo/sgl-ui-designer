#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
    #[serde(rename = "onColor")]
    on_color: Option<String>,
    #[serde(rename = "knobRadius")]
    knob_radius: Option<i32>,
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
fn generate_code(project: Project) -> Result<String, String> {
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
    Ok(code)
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
            cstr!("sgl_button_set_text", w.text);
            cclr!("sgl_button_set_color", w.color);
            cclr!("sgl_button_set_text_color", w.text_color);
            cclr!("sgl_button_set_border_color", w.border_color);
            c!( "sgl_button_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_button_set_radius", w.radius.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_button_set_font({}, &{});\n", obj, fid));
            }
            c!( "sgl_button_set_alpha", w.alpha.map(|v| v as u8));
            if let Some(a) = &w.align {
                code.push_str(&format!("    sgl_button_set_text_align({}, SGL_ALIGN_{});\n", obj, a));
            }
            if let Some(pix) = &w.pixmap {
                if !pix.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_button_set_pixmap({}, &{});\n", obj, pixmap_var_name(pix, fmt)));
                }
            }
        }
        "label" => {
            cstr!("sgl_label_set_text", w.text);
            cclr!("sgl_label_set_text_color", w.text_color);
            cclr!("sgl_label_set_bg_color", w.bg_color);
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
            c!( "sgl_switch_set_knob_radius", w.knob_radius.map(|v| v as u8));
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
            if let Some(s) = w.status {
                code.push_str(&format!("    sgl_checkbox_set_status({}, {});\n", obj, if s { "true" } else { "false" }));
            }
            cstr!("sgl_checkbox_set_text", w.text);
            cclr!("sgl_checkbox_set_color", w.color);
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
            if let Some(ref text) = w.text {
                if !text.is_empty() {
                    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
                    code.push_str(&format!("    sgl_polygon_set_text({}, \"{}\");\n", obj, escaped));
                }
            }
            cclr!("sgl_polygon_set_text_color", w.text_color);
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
                code.push_str(&format!("    sgl_polygon_set_font({}, &{});\n", obj, fid));
            }
            if let Some(ref pixmap) = w.pixmap {
                if !pixmap.is_empty() {
                    let fmt = w.pixmap_format.as_deref().unwrap_or("RGB565");
                    code.push_str(&format!("    sgl_polygon_set_pixmap({}, &{});\n", obj, pixmap_var_name(pixmap, fmt)));
                }
            }
        }
        "numberkbd" => {
            cclr!("sgl_numberkbd_set_color", w.color);
            cclr!("sgl_numberkbd_set_border_color", w.border_color);
            cclr!("sgl_numberkbd_set_text_color", w.text_color);
            c!( "sgl_numberkbd_set_border_width", w.border_width.map(|v| v as u8));
            c!( "sgl_numberkbd_set_alpha", w.alpha.map(|v| v as u8));
            if let (Some(fam), Some(sz)) = (w.font_family.as_ref(), w.font_size) {
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
                let fid = font_id_from_family(fam, sz, w.font_bpp.unwrap_or(4), 0);
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
        Ok(true) => Ok(serde_json::json!({ "exists": true, "up_to_date": true, "msg": "sgl 子模块已是最新版本" })),
        Ok(false) => Ok(serde_json::json!({ "exists": true, "up_to_date": false, "msg": "sgl 子模块有新版本可用" })),
        Err(e) => Ok(serde_json::json!({ "exists": true, "up_to_date": false, "msg": format!("检查失败: {}", e) })),
    }
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

    let fetch_status = run_command_stream("git", &["fetch", "origin"], &submodule_path, window)
        .map_err(|e| format!("获取 sgl 子模块远程信息失败: {}", e))?;
    if !fetch_status.success() {
        return Err("获取 sgl 子模块远程信息失败".to_string());
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

    // 先对比本地与远程版本，已最新则跳过网络更新
    match is_sgl_submodule_up_to_date(sgl_port_dir, window) {
        Ok(true) => return Ok("sgl 子模块已是最新版本，跳过更新".to_string()),
        Ok(false) => {}
        Err(e) => eprintln!("检查 sgl 子模块版本失败，继续尝试更新: {}", e),
    }

    // 拉取子模块远程最新代码，并实时输出到控制台
    let status = run_command_stream(
        "git",
        &["submodule", "update", "--init", "--recursive", "--remote"],
        sgl_port_dir,
        window,
    )
    .map_err(|e| format!("初始化/更新子模块失败: {}", e))?;

    if !status.success() {
        let _ = window.emit(
            "build-log",
            serde_json::json!({"message": "GitHub 子模块更新失败，尝试使用 Gitee 镜像", "level": "warn"}),
        );

        // 将 .gitmodules 中的 github.com 替换为 gitee.com 并同步配置
        let gitmodules_path = sgl_port_dir.join(".gitmodules");
        if let Ok(content) = std::fs::read_to_string(&gitmodules_path) {
            let updated = content.replace("github.com", "gitee.com");
            let _ = std::fs::write(&gitmodules_path, updated);
        }
        let _ = Command::new("git")
            .current_dir(sgl_port_dir)
            .args(&["submodule", "sync", "--recursive"])
            .output();

        let status = run_command_stream(
            "git",
            &["submodule", "update", "--init", "--recursive", "--remote"],
            sgl_port_dir,
            window,
        )
        .map_err(|e| format!("初始化/更新子模块失败: {}", e))?;

        if !status.success() {
            return Err("子模块更新失败: GitHub 和 Gitee 均无法访问".to_string());
        }
    }

    Ok("sgl 子模块已更新到最新版本".to_string())
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

    // 如果不存在则克隆，GitHub 失败时自动尝试 Gitee 镜像，并实时输出到控制台
    if !sgl_port_dir.exists() || !sgl_port_dir.join("CMakelists.txt").exists() {
        let github_url = "https://github.com/sgl-org/sgl-port-windows-vscode.git";
        let gitee_url = "https://gitee.com/sgl-org/sgl-port-windows-vscode.git";

        let status = run_command_stream(
            "git",
            &["clone", github_url, sgl_port_dir.to_string_lossy().as_ref()],
            proj_dir,
            &window,
        )
        .map_err(|e| format!("执行 git clone 失败: {}", e))?;

        if !status.success() {
            let _ = window.emit(
                "build-log",
                serde_json::json!({"message": "GitHub 克隆失败，尝试 Gitee 镜像", "level": "warn"}),
            );

            let status = run_command_stream(
                "git",
                &["clone", gitee_url, sgl_port_dir.to_string_lossy().as_ref()],
                proj_dir,
                &window,
            )
            .map_err(|e| format!("执行 git clone 失败: {}", e))?;

            if !status.success() {
                return Err("克隆失败: GitHub 和 Gitee 均无法访问".to_string());
            }
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
#define  CONFIG_SGL_USE_FBDEV_VRAM                         {}
#define  CONFIG_SGL_SYSTICK_MS                             {}
#define  CONFIG_SGL_EVENT_QUEUE_SIZE                       {}
#define  CONFIG_SGL_DIRTY_AREA_NUM_MAX                     {}
#define  CONFIG_SGL_COLOR16_SWAP                           {}
#define  CONFIG_SGL_ANIMATION                              {}
#define  CONFIG_SGL_DEBUG                                  {}
#define  CONFIG_SGL_LOG_COLOR                              {}
#define  CONFIG_SGL_LOG_LEVEL                              {}
#define  CONFIG_SGL_OBJ_USE_NAME                           {}
#define  CONFIG_SGL_FONT_COMPRESSED                        {}
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
        config.use_fbdev_vram,
        config.systick_ms,
        config.event_queue_size,
        config.dirty_area_num_max,
        config.color16_swap,
        config.animation,
        config.debug,
        config.log_color,
        config.log_level,
        config.obj_use_name,
        config.font_compressed,
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

    // 根据用户选择决定是否更新 sgl 子模块
    let submodule_msg = if update_sgl.unwrap_or(false) {
        update_sgl_submodules_to_latest(&sgl_port_dir, &window)?
    } else {
        "已跳过 sgl 子模块更新".to_string()
    };

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
    // 确保 CMakeLists.txt 自动收集 demo/fonts 下的字模源文件
    let _ = ensure_cmake_fonts_glob(&cmake_path);

    // 字模文件可能新增或删除，强制重新 cmake configure 以确保 GLOB 收集最新源文件
    let build_dir = sgl_port_dir.join("build");
    let _ = std::fs::remove_file(build_dir.join("CMakeCache.txt"));
    let _ = std::fs::remove_file(build_dir.join("Makefile"));

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
    // value 可能是整数或标识符（如 lwmem）
    fn parse_define(line: &str) -> Option<(String, String)> {
        let trimmed = line.trim();
        if !trimmed.starts_with("#define") {
            return None;
        }
        let rest = trimmed.trim_start_matches("#define").trim();
        let mut iter = rest.split_whitespace();
        let key = iter.next()?.to_string();
        let val = iter.next()?.to_string();
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

    let config = SglConfig {
        fbdev_pixel_depth: get_i32(&content, "CONFIG_SGL_FBDEV_PIXEL_DEPTH", 16),
        fbdev_rotation: get_i32(&content, "CONFIG_SGL_FBDEV_ROTATION", 0),
        fbdev_runtime_rotation: get_i32(&content, "CONFIG_SGL_FBDEV_RUNTIME_ROTATION", 0),
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
            clone_sgl_port,
            build_project,
            run_simulator,
            read_sgl_config_from_file,
            write_sgl_config_to_file,
            append_log,
            get_opaque_image_data_url,
            generate_font_c_content,
            exec_command
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
            knob_radius: None,
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
