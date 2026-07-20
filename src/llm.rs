// ============ LLM 代理模块 ============
// 负责：API Key 配置持久化、转发前端请求到 LLM API（解决 CORS）、流式响应推送
// 配置文件存储路径：{app_data_dir}/llm_config.json

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

// ============ 数据结构 ============

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LlmConfig {
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
}

fn default_provider() -> String { "openai".to_string() }
fn default_model() -> String { "gpt-4o-mini".to_string() }
fn default_max_tokens() -> u32 { 8192 }
fn default_temperature() -> f64 { 0.7 }

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: default_provider(),
            base_url: String::new(),
            api_key: String::new(),
            model: default_model(),
            max_tokens: default_max_tokens(),
            temperature: default_temperature(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: ChatContent,
}

/// 消息内容：支持纯文本或多模态（文本+图片）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum ChatContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImageUrl {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

// ============ OpenAI 兼容 API 请求/响应结构 ============

#[derive(Serialize, Debug)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    max_tokens: u32,
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAiMessage {
    role: String,
    #[serde(default)]
    content: serde_json::Value,
}

#[derive(Deserialize, Debug)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    #[serde(default)]
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize, Debug)]
struct OpenAiChoice {
    message: OpenAiMessage,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct OpenAiUsage {
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
    #[serde(default)]
    pub total_tokens: u32,
}

#[derive(Serialize, Debug)]
pub struct LlmChatResult {
    pub content: String,
    pub usage: Option<OpenAiUsage>,
}

// ============ 配置文件读写 ============

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    Ok(app_dir.join("llm_config.json"))
}

#[tauri::command]
pub fn load_llm_config(app: AppHandle) -> Result<LlmConfig, String> {
    let path = get_config_path(&app)?;
    if !path.exists() {
        return Ok(LlmConfig::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {}", e))?;
    let config: LlmConfig =
        serde_json::from_str(&content).map_err(|e| format!("解析配置失败: {}", e))?;
    Ok(config)
}

#[tauri::command]
pub fn save_llm_config(app: AppHandle, config: LlmConfig) -> Result<(), String> {
    let path = get_config_path(&app)?;
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

// ============ 非流式 LLM 调用 ============

fn build_request_body(config: &LlmConfig, messages: &[ChatMessage], stream: bool) -> OpenAiRequest {
    let openai_messages: Vec<OpenAiMessage> = messages
        .iter()
        .map(|m| {
            let content = match &m.content {
                ChatContent::Text(text) => serde_json::Value::String(text.clone()),
                ChatContent::Parts(parts) => {
                    serde_json::to_value(parts).unwrap_or(serde_json::Value::Null)
                }
            };
            OpenAiMessage {
                role: m.role.clone(),
                content,
            }
        })
        .collect();

    OpenAiRequest {
        model: config.model.clone(),
        messages: openai_messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        stream: if stream { Some(true) } else { None },
    }
}

fn get_api_url(config: &LlmConfig) -> String {
    let base = config.base_url.trim_end_matches('/');
    format!("{}/chat/completions", base)
}

#[tauri::command]
pub async fn llm_chat(config: LlmConfig, messages: Vec<ChatMessage>) -> Result<LlmChatResult, String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置，请在 AI 配置中填写 API Key".to_string());
    }
    if config.base_url.is_empty() {
        return Err("API 地址未配置".to_string());
    }

    let url = get_api_url(&config);
    let body = build_request_body(&config, &messages, false);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 LLM API 失败: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("LLM API 返回错误 ({}): {}", status, response_text));
    }

    let parsed: OpenAiResponse =
        serde_json::from_str(&response_text).map_err(|e| {
            format!(
                "解析 LLM 响应失败: {} (响应内容前200字: {})",
                e,
                &response_text[..response_text.len().min(200)]
            )
        })?;

    let content = parsed
        .choices
        .first()
        .map(|c| {
            match &c.message.content {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            }
        })
        .unwrap_or_default();

    Ok(LlmChatResult {
        content,
        usage: parsed.usage,
    })
}

// ============ 流式 LLM 调用 ============
// 通过 Tauri Event 推送每个 chunk 给前端：
//   event: "llm-chunk"  → payload: String (增量文本)
//   event: "llm-done"   → payload: LlmStreamDone { usage }
//   event: "llm-error"  → payload: String (错误信息)

#[derive(Serialize, Clone, Debug)]
pub struct LlmStreamDone {
    pub usage: Option<OpenAiUsage>,
}

#[tauri::command]
pub async fn llm_stream_chat(
    app: AppHandle,
    config: LlmConfig,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }
    if config.base_url.is_empty() {
        return Err("API 地址未配置".to_string());
    }

    let url = get_api_url(&config);
    let body = build_request_body(&config, &messages, true);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 LLM API 失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        app.emit("llm-error", format!("LLM API 返回错误 ({}): {}", status, err_text))
            .ok();
        return Ok(());
    }

    // 逐行读取 SSE 流
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut final_usage: Option<OpenAiUsage> = None;

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                app.emit("llm-error", format!("读取流失败: {}", e)).ok();
                return Ok(());
            }
        };

        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 处理完整的 SSE 事件行
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    app.emit("llm-done", LlmStreamDone { usage: final_usage }).ok();
                    return Ok(());
                }

                // 解析 SSE JSON
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = parsed
                        .get("choices")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|c| c.get("delta"))
                    {
                        // 提取 reasoning_content（DeepSeek 等模型的思考过程）
                        if let Some(reasoning) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                            if !reasoning.is_empty() {
                                app.emit("llm-reasoning", reasoning).ok();
                            }
                        }
                        if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                            if !content.is_empty() {
                                app.emit("llm-chunk", content).ok();
                            }
                        }
                    }
                    // 提取 usage（部分 API 在最后一个 chunk 中返回，缓存即可，不提前结束流）
                    if let Some(usage) = parsed.get("usage") {
                        if let Ok(u) = serde_json::from_value::<OpenAiUsage>(usage.clone()) {
                            final_usage = Some(u);
                        }
                    }
                }
            }
        }
    }

    // 流结束但没收到 [DONE]，也发送 done
    app.emit("llm-done", LlmStreamDone { usage: final_usage }).ok();
    Ok(())
}

// ============ 连通性测试 ============

#[tauri::command]
pub async fn llm_test_connection(config: LlmConfig) -> Result<String, String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }
    if config.base_url.is_empty() {
        return Err("API 地址未配置".to_string());
    }

    let url = get_api_url(&config);
    let test_messages = vec![ChatMessage {
        role: "user".to_string(),
        content: ChatContent::Text("Say 'OK' in one word.".to_string()),
    }];
    let body = build_request_body(&config, &test_messages, false);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("API 返回错误 ({}): {}", status, &text[..text.len().min(200)]));
    }

    // 尝试解析响应确认格式正确
    let _: OpenAiResponse = serde_json::from_str(&text)
        .map_err(|e| format!("响应格式异常: {} (前100字: {})", e, &text[..text.len().min(100)]))?;

    Ok(format!("连接成功！API 响应正常 (HTTP {})", status))
}

// ============ 获取模型列表 ============

#[derive(Deserialize, Debug)]
struct ModelsListResponse {
    #[serde(default)]
    data: Vec<ModelItem>,
}

#[derive(Deserialize, Debug)]
struct ModelItem {
    #[serde(default)]
    id: String,
}

/// 从 LLM Provider 获取可用模型列表
#[tauri::command]
pub async fn llm_list_models(config: LlmConfig) -> Result<Vec<String>, String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }
    if config.base_url.is_empty() {
        return Err("API 地址未配置".to_string());
    }

    let base = config.base_url.trim_end_matches('/');
    let url = format!("{}/models", base);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .send()
        .await
        .map_err(|e| format!("请求模型列表失败: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "API 返回错误 ({}): {}",
            status,
            &text[..text.len().min(200)]
        ));
    }

    // 尝试解析标准 OpenAI 格式 { "data": [{ "id": "..." }, ...] }
    if let Ok(parsed) = serde_json::from_str::<ModelsListResponse>(&text) {
        let models: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
        if !models.is_empty() {
            return Ok(models);
        }
    }

    // 部分 Provider 返回纯数组格式 ["model1", "model2", ...]
    if let Ok(arr) = serde_json::from_str::<Vec<String>>(&text) {
        return Ok(arr);
    }

    Err(format!(
        "无法解析模型列表 (前200字: {})",
        &text[..text.len().min(200)]
    ))
}
