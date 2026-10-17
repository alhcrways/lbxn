import type { LlmConfig } from '../shared/types';

// 官方接口文档：api-docs.deepseek.com / help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
export const MODEL_PRESETS = [
  { id: 'deepseek-flash', label: 'DeepSeek Flash · DeepSeek 官方', provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', hint: '请填写 DeepSeek 开放平台的 API Key。', body: { thinking: { type: 'disabled' } } },
  { id: 'deepseek-pro', label: 'DeepSeek V4 Pro · DeepSeek 官方', provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', hint: '请填写 DeepSeek 开放平台的 API Key。', body: { thinking: { type: 'disabled' } } },
  { id: 'qwen-plus-cn', label: '千问 Plus · 阿里云百炼（北京）', provider: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hint: '请填写阿里云百炼北京地域的 API Key，其他地域的 Key 不通用。', body: { enable_thinking: false } },
  { id: 'qwen-flash-cn', label: '千问 Flash · 阿里云百炼（北京）', provider: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-flash', hint: '请填写阿里云百炼北京地域的 API Key，其他地域的 Key 不通用。', body: { enable_thinking: false } },
] as const;

export function findModelPreset(config: LlmConfig) {
  return MODEL_PRESETS.find(p => p.model === config.model && p.baseUrl === config.baseUrl.replace(/\/+$/, ''));
}

export const MODEL_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', hint: '填写 DeepSeek 开放平台的 API Key。', example: '例如 deepseek-flash' },
  { id: 'aliyun', label: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', hint: '使用阿里云百炼北京地域的 API Key。', example: '例如 qwen-plus' },
  { id: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', hint: '填写 Kimi 开放平台的 API Key。', example: '填写平台中的模型 ID' },
  { id: 'zhipu', label: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', hint: '使用智谱开放平台的按量 API Key。', example: '填写平台中的 GLM 模型 ID' },
  { id: 'doubao', label: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', hint: '使用火山方舟 API Key，模型填写已开通的模型 ID 或接入点 ID。', example: '模型 ID 或 ep- 开头的接入点 ID' },
] as const;

export function findModelProvider(config: LlmConfig) {
  const url = config.baseUrl.replace(/\/+$/, '');
  return MODEL_PROVIDERS.find(p => p.baseUrl === url || (p.id === 'deepseek' && url === p.baseUrl + '/v1'));
}

export function resolveProviderSelection(current: LlmConfig, selection: unknown, apiKey: unknown, model: unknown, baseUrl?: unknown): LlmConfig | null {
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 8192) return null;
  if (typeof model !== 'string' || !model.trim() || model.length > 200 || /[\r\n]/.test(model)) return null;
  if (selection === 'custom') {
    const url = normalizeCompatibleUrl(baseUrl);
    return url ? { baseUrl: url, model: model.trim(), apiKey: apiKey.trim() } : null;
  }
  if (selection === 'saved') return { ...current, model: model.trim(), apiKey: apiKey.trim() };
  const provider = MODEL_PROVIDERS.find(p => p.id === selection);
  return provider ? { baseUrl: provider.baseUrl, model: model.trim(), apiKey: apiKey.trim() } : null;
}

export function normalizeCompatibleUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch { return null; }
}
