/**
 * 图像生成 API 直接测试脚本
 * 用法: node test-image-api.mjs <endpoint> <apiKey> <model> [prompt]
 * 示例: node test-image-api.mjs https://api.mortis.edu.kg/v1 sk-xxx gemini-3-pro-image
 */

const [, , endpoint, apiKey, model, prompt = '一只可爱的猫咪'] = process.argv;

if (!endpoint || !apiKey || !model) {
  console.error('用法: node test-image-api.mjs <endpoint> <apiKey> <model> [prompt]');
  process.exit(1);
}

function buildUrl(base, path) {
  const b = base.replace(/\/+$/, '');
  // 如果 base 已经以 /v1 结尾，不重复
  if (b.endsWith('/v1')) return b + path;
  // 如果 path 已经包含在 base 里
  if (b.includes(path.replace(/^\//, ''))) return b;
  return b + path;
}

async function req(url, body, key) {
  console.log(`\n→ POST ${url}`);
  console.log('  body:', JSON.stringify({ ...body, prompt: body.prompt?.slice(0, 40) || body.input?.slice(0, 40) }));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log(`  status: ${res.status}`);
    console.log('  response:', text.slice(0, 800));
    let payload = {};
    try { payload = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, text, payload };
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    return { ok: false, status: 0, text: e.message, payload: {} };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('图像生成 API 测试');
  console.log(`  endpoint: ${endpoint}`);
  console.log(`  model:    ${model}`);
  console.log(`  prompt:   ${prompt}`);
  console.log('='.repeat(60));

  const isGemini = /gemini/i.test(model);

  // 策略 1: /images/generations (minimal)
  const imagesUrl = buildUrl(endpoint, '/images/generations');
  await req(imagesUrl, { model, prompt, n: 1, response_format: 'b64_json' }, apiKey);

  // 策略 1b: /images/generations (with size/quality)
  await req(imagesUrl, { model, prompt, n: 1, response_format: 'b64_json', size: '1024x1024', quality: 'standard' }, apiKey);

  // 策略 2: /responses
  const responsesUrl = buildUrl(endpoint, '/responses');
  await req(responsesUrl, {
    model,
    input: prompt,
    modalities: ['image'],
    tools: [{ type: 'image_generation' }]
  }, apiKey);

  // 策略 3: /chat/completions
  const chatUrl = buildUrl(endpoint, '/chat/completions');
  await req(chatUrl, {
    model,
    messages: [{ role: 'user', content: `请根据以下描述生成一张图片:\n\n${prompt}` }],
    max_tokens: 4096,
    stream: false,
    modalities: ['text', 'image'],
    response_modalities: ['text', 'image']
  }, apiKey);

  // 策略 4: 直接用 Gemini 原生格式（如果是 gemini）
  if (isGemini) {
    console.log('\n--- Gemini 原生格式测试 ---');
    const geminiUrl = buildUrl(endpoint, '/chat/completions');
    await req(geminiUrl, {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048
    }, apiKey);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成，请根据上方各策略的 status/response 判断哪个可用');
}

main().catch(e => { console.error(e); process.exit(1); });
