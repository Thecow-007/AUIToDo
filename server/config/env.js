require('dotenv').config();

const required = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

const optional = (name, fallback) => process.env[name] || fallback;

module.exports = {
  PORT: Number(optional('PORT', 3000)),
  NODE_ENV: optional('NODE_ENV', 'development'),
  MONGODB_URI: process.env.MONGODB_URI || '',
  DB_NAME: optional('DB_NAME', 'AUIToDo'),

  SESSION_SECRET: optional('SESSION_SECRET', 'dev-only-insecure-secret'),

  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY || '',
  CEREBRAS_BASE_URL: optional('CEREBRAS_BASE_URL', 'https://api.cerebras.ai/v1'),
  CEREBRAS_MODEL: optional('CEREBRAS_MODEL', 'gpt-oss-120b'),

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_EMBEDDING_MODEL: optional('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),

  VECTOR_INDEX_NAME: optional('VECTOR_INDEX_NAME', 'todo_embedding_idx'),

  required,
};
