// Thin wrapper around the OpenAI SDK pointed at Cerebras Cloud's OpenAI-compatible
// chat-completions endpoint. Cerebras hosts GPT OSS 120B (the model the team is
// using) on the same wire format as OpenAI, so the SDK works as-is with a swapped
// base URL. The SDK is also reused by the embeddings service against api.openai.com.

const OpenAI = require('openai');

const env = require('../config/env');

let client = null;
function getClient() {
  if (!env.CEREBRAS_API_KEY) {
    throw new Error('CEREBRAS_API_KEY not set');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: env.CEREBRAS_API_KEY,
      baseURL: env.CEREBRAS_BASE_URL,
    });
  }
  return client;
}

async function chat({ messages, tools, toolChoice = 'auto', temperature = 0.2 }) {
  const c = getClient();
  const resp = await c.chat.completions.create({
    model: env.CEREBRAS_MODEL,
    messages,
    tools,
    tool_choice: toolChoice,
    temperature,
  });
  return resp.choices?.[0]?.message;
}

module.exports = { chat };
