// Embedding pipeline. Generates a vector for each todo's `title + description` using
// OpenAI's text-embedding model and stores it on the document. Fire-and-forget after
// the DB write so the request path stays snappy. If OPENAI_API_KEY is missing, every
// hook is a no-op and `vector_search` falls back to Mongo $text.
//
// Atlas Vector Search index spec lives in documentation/ProjectBreakdown.md §5.
// Index name is read from VECTOR_INDEX_NAME. Standalone Mongo (the docker-compose
// default) does not support $vectorSearch — the deployment must point at Atlas.

const OpenAI = require('openai');

const env = require('../config/env');
const Todo = require('../models/Todo');

let client = null;
function getClient() {
  if (!env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

function isEnabled() {
  return Boolean(env.OPENAI_API_KEY);
}

async function embedText(text) {
  const c = getClient();
  if (!c) return null;
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const resp = await c.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: trimmed,
  });
  return resp.data?.[0]?.embedding || null;
}

// Fire-and-forget: don't block callers, log failures, never throw.
function queueEmbedding(todoId, title, description) {
  if (!isEnabled()) return;
  const text = [title, description].filter(Boolean).join('\n\n');
  embedText(text)
    .then((vec) => {
      if (!vec) return;
      return Todo.updateOne({ _id: todoId }, { $set: { embedding: vec } });
    })
    .catch((err) => {
      console.warn('[embeddings] failed for todo', todoId.toString(), err.message);
    });
}

async function vectorSearch(userId, query, k = 10) {
  const c = getClient();
  if (!c) return null;
  const queryVec = await embedText(query);
  if (!queryVec) return null;

  const results = await Todo.aggregate([
    {
      $vectorSearch: {
        index: env.VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryVec,
        numCandidates: Math.max(k * 10, 100),
        limit: k,
        filter: { userId },
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        parentId: 1,
        tagIds: 1,
        isCompleted: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);
  return results;
}

module.exports = { isEnabled, embedText, queueEmbedding, vectorSearch };
