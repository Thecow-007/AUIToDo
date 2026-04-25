// Smoke tests for the AI chat endpoint. Hits the real Cerebras + OpenAI APIs
// using the keys from .env, so this file is kept out of `npm test` and runs only
// via `npm run test:ai`. If keys are absent, the suite skips loudly instead of
// silently passing.

// Load .env BEFORE the skip check so process.env.CEREBRAS_API_KEY etc. are populated.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

const { bootstrap, teardown, clearDb, getApp } = require('./setup');

const SKIP = !process.env.CEREBRAS_API_KEY || !process.env.OPENAI_API_KEY;
if (SKIP) {
  console.warn('[test:ai] CEREBRAS_API_KEY or OPENAI_API_KEY missing — tests will skip.');
}

let agent;

before(async () => {
  await bootstrap();
});

after(async () => {
  await teardown();
});

beforeEach(async () => {
  await clearDb();
  agent = supertest.agent(getApp());
});

// SSE frames look like `event: NAME\ndata: JSON\n\n`. We collect the full body
// from supertest (the server closes the stream when the pipeline finishes) and
// split it apart here.
function parseSSE(text) {
  return text
    .split(/\n\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!eventLine || !dataLine) return null;
      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      };
    })
    .filter(Boolean);
}

async function registerAndLogin() {
  await agent.post('/api/auth/register').send({
    email: 'ai-tester@example.com',
    password: 'hunter22hunter22',
    displayName: 'AI Tester',
  }).expect(201);
}

test('AI chat: "add a todo" path emits trail_step + applied(create) + final',
  { skip: SKIP, timeout: 45000 },
  async () => {
    await registerAndLogin();

    const res = await agent
      .post('/api/ai/chat')
      .send({
        message: 'add a todo titled "Call mom" with priority high',
        history: [],
        currentView: { route: '/list' },
      })
      .buffer(true)
      .parse((response, done) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => done(null, body));
      })
      .expect(200);

    const events = parseSSE(res.body);
    const names = events.map((e) => e.event);

    assert.ok(names.includes('trail_step'), `expected trail_step, got: ${names.join(', ')}`);
    assert.ok(names.includes('final'), `expected final, got: ${names.join(', ')}`);

    const applied = events.find((e) => e.event === 'applied');
    assert.ok(applied, `expected applied event, got: ${names.join(', ')}`);
    assert.equal(applied.data.mutation, 'create');
    assert.ok(applied.data.todo?.title, 'applied.todo.title missing');
  }
);

test('AI chat: "complete that" path locates an existing todo and emits applied(complete)',
  { skip: SKIP, timeout: 45000 },
  async () => {
    await registerAndLogin();

    // Seed a todo we'll ask the AI to complete.
    const created = await agent
      .post('/api/todos')
      .send({ title: 'Take out the trash', priority: 'medium' })
      .expect(201);

    const res = await agent
      .post('/api/ai/chat')
      .send({
        message: 'mark the trash todo as done',
        history: [],
        currentView: { route: '/list' },
      })
      .buffer(true)
      .parse((response, done) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => done(null, body));
      })
      .expect(200);

    const events = parseSSE(res.body);
    const names = events.map((e) => e.event);
    assert.ok(names.includes('final'), `expected final, got: ${names.join(', ')}`);

    const applied = events.find((e) => e.event === 'applied');
    assert.ok(applied, `expected applied event, got: ${names.join(', ')}`);
    assert.equal(applied.data.mutation, 'complete');
    assert.equal(applied.data.todoId, created.body.id);
    assert.ok(Array.isArray(applied.data.affected), 'applied.affected missing');
    assert.ok(applied.data.affected.length >= 1, 'applied.affected should have at least one entry');
  }
);
