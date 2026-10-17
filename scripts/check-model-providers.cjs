const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const code = buildSync({ stdin: { contents: "export * from './llm'; export * from './modelPresets';", resolveDir: path.resolve('src/main'), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = { exports: {} }; new Function('module', 'exports', code)(mod, mod.exports);
const { MODEL_PRESETS, MODEL_PROVIDERS, normalizeCompatibleUrl, streamChat, resolveProviderSelection } = mod.exports;
const originalFetch = global.fetch;
const old = { baseUrl: 'https://existing.example/v1', model: 'previous-model', apiKey: 'test-old-key' };
function stream(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } }));
}
async function turn(config, response) {
  let request, text = '', done, error;
  global.fetch = async (url, options) => { request = { url, ...options }; return response; };
  await streamChat(config, [{ role: 'user', content: '你好' }], delta => text += delta, full => done = full, e => error = e.message);
  return { request, text, done, error };
}
(async () => {
  assert.equal(resolveProviderSelection(old, 'invalid', 'test-key', 'any-model'), null);
  assert.equal(resolveProviderSelection(old, 'kimi', ' ', 'model'), null);
  assert.deepEqual(resolveProviderSelection(old, 'saved', 'new-test-key', old.model), { ...old, apiKey: 'new-test-key' });
  for (const preset of MODEL_PRESETS) {
    const config = resolveProviderSelection(old, 'custom', ' test-provider-key ', preset.model, preset.baseUrl);
    const result = await turn(config, stream('data:{"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"呀"}}]}\n\ndata: [DONE]'));
    assert.equal(config.baseUrl, preset.baseUrl);
    assert.equal(result.request.url, preset.baseUrl + '/chat/completions');
    assert.equal(result.request.headers.Authorization, 'Bearer test-provider-key');
    const body = JSON.parse(result.request.body);
    assert.equal(body.model, preset.model);
    assert.equal(body.stream, true);
    for (const [key, value] of Object.entries(preset.body)) assert.deepEqual(body[key], value);
    assert.equal(result.text, '你好呀'); assert.equal(result.done, '你好呀'); assert.equal(result.error, undefined);
  }
  assert.equal(resolveProviderSelection(old, 'kimi', 'test-key', ''), null);
  assert.equal(resolveProviderSelection(old, 'kimi', 'test-key', 'bad\nmodel'), null);
  assert.equal(resolveProviderSelection(old, 'kimi', 'test-key', 'my-custom-model').model, 'my-custom-model');
  assert.deepEqual(MODEL_PROVIDERS.map(p => p.id), ['deepseek', 'aliyun', 'kimi', 'zhipu', 'doubao']);
  for (const provider of MODEL_PROVIDERS) {
    const cfg = resolveProviderSelection(old, provider.id, 'test-key', 'user-model');
    const response = await turn(cfg, stream('data:{"choices":[{"delta":{"content":"你好"}}]}\n\ndata:[DONE]'));
    assert.equal(response.request.url, provider.baseUrl + '/chat/completions');
    const body = JSON.parse(response.request.body);
    assert.equal(body.model, 'user-model');
    assert.equal(body.temperature, undefined);
    assert.equal(response.done, '你好');
  }
  assert.equal(normalizeCompatibleUrl('https://example.com/v1/chat/completions/'), 'https://example.com/v1');
  for (const url of ['file:///tmp/key', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=abc', 'http://example.com/v1']) assert.equal(normalizeCompatibleUrl(url), null);
  assert.equal(normalizeCompatibleUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
  const config = resolveProviderSelection(old, 'custom', 'test-key', 'deepseek-flash', 'https://api.deepseek.com');
  const last = await turn(config, stream('data:{"choices":[{"delta":{"content":"最后一行"}}]}'));
  assert.equal(last.done, '最后一行');
  for (const status of [401, 403, 404, 429, 503]) {
    const result = await turn(config, new Response('', { status }));
    assert.ok(result.error.startsWith(String(status))); assert.equal(result.done, undefined);
    assert.ok(!result.error.includes('DeepSeek'));
  }
  const empty = await turn(config, stream('data: [DONE]'));
  assert.ok(empty.error.includes('未返回文字'));
  console.log('Model provider checks passed: preset routing, legacy config, request options, split UTF-8 SSE, final line and service errors.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
