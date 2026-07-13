// ============ LLM 配置共享模块 ============
// 共享：Provider 预设、默认配置值
// ai_panel.js 和 settings.js 都从这里导入，确保一致

export const PROVIDER_PRESETS = {
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  zhipu: { base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  siliconflow: { base_url: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
  custom: { base_url: '', model: '' }
};

export const DEFAULT_LLM_CONFIG = {
  provider: 'openai',
  base_url: '',
  api_key: '',
  model: 'gpt-4o-mini',
  max_tokens: 8192,
  temperature: 0.7
};
