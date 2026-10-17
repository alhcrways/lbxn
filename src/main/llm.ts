// 多服务商 OpenAI 兼容协议调用封装
// 使用 Node 22 全局 fetch + 手动解析 SSE 流，零额外依赖
import { findModelPreset } from './modelPresets';
import type { LlmConfig, ChatMessage } from '../shared/types';

/** SSE 流式聊天：逐 token 回调，结束时回调完整文本 */
export async function streamChat(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  onChunk: (delta: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void,
): Promise<void> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const preset = findModelPreset(config);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        max_tokens: preset ? 200 : 4096,
        ...(preset ? { temperature: 0.8, ...preset.body } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // 常见错误：401 密钥无效 / 429 额度不足 / 5xx 服务端
      const hint =
        res.status === 401 ? 'API Key 无效或未授权' :
        res.status === 404 ? '模型不存在或当前账号未开通' :
        res.status === 403 ? '没有模型访问权限，请检查服务商和地域' :
        res.status === 429 ? '请求过于频繁或额度不足' :
        res.status >= 500 ? '模型服务暂时不可用' : '';
      onError(new Error(`${res.status} ${hint || errText || '请求失败'}`));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError(new Error('无法读取响应流'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const finish = () => fullText.trim() ? onDone(fullText) : onError(new Error('模型未返回文字，请检查模型是否可用后重试'));
    const consume = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return false;
      const data = trimmed.slice(5).trimStart();
      if (data === '[DONE]') { finish(); return true; }
      let json;
      try { json = JSON.parse(data); } catch { return false; }
      if (json.error) { onError(new Error('模型服务返回错误，请检查账号权限或额度')); return true; }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) { fullText += delta; onChunk(delta); }
      return false;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim() && consume(buffer)) return;
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (consume(line)) return;
      }
    }

    finish();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      onError(new Error('网络连接失败，请检查网络后重试'));
    } else {
      onError(new Error(msg));
    }
  }
}

/** 构建发送给 LLM 的消息列表：system prompt + 最近 N 轮历史 */
export function buildChatMessages(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  maxRounds = 10,
): { role: string; content: string }[] {
  // 取最近 maxRounds 条历史（user + assistant 各算一条）
  const recent = history.slice(-maxRounds * 2);
  return [
    { role: 'system', content: systemPrompt },
    ...recent.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
}
