// Integration tests for the REST API. Boots an in-memory Mongo + the Express
// app, then drives each endpoint via supertest. The AI chat endpoint is not
// covered here — it requires a Cerebras key and uses SSE, so it gets its own
// pass once the team has live keys.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

const { bootstrap, teardown, clearDb, getApp } = require('./setup');

let agent;

before(async () => {
  await bootstrap();
});

after(async () => {
  await teardown();
});

beforeEach(async () => {
  await clearDb();
  // Fresh agent per test so cookies don't leak between cases.
  agent = supertest.agent(getApp());
});

// --- Helpers ---------------------------------------------------------------

async function registerAndLogin(overrides = {}) {
  const body = {
    email: 'tester@example.com',
    password: 'hunter22hunter22',
    displayName: 'Tester',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').send(body).expect(201);
  return res.body;
}

async function createTodo(fields) {
  const res = await agent.post('/api/todos').send(fields).expect(201);
  return res.body;
}

// --- Auth ------------------------------------------------------------------

test('register creates a user and starts a session', async () => {
  const user = await registerAndLogin();
  assert.equal(user.email, 'tester@example.com');
  assert.equal(user.displayName, 'Tester');

  // The new session should let us hit a protected endpoint without a separate login.
  await agent.get('/api/todos').expect(200);
});

test('register rejects short passwords', async () => {
  const res = await agent.post('/api/auth/register').send({
    email: 'a@b.co', password: 'short', displayName: 'X',
  }).expect(400);
  assert.equal(res.body.error, 'password_too_short');
});

test('login -> me -> logout round-trip', async () => {
  await registerAndLogin();
  await agent.post('/api/auth/logout').expect(204);

  await agent.get('/api/auth/me').expect(401);

  await agent.post('/api/auth/login').send({
    email: 'tester@example.com',
    password: 'hunter22hunter22',
  }).expect(200);

  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.email, 'tester@example.com');
});

test('protected routes 401 without a session', async () => {
  await agent.get('/api/todos').expect(401);
  await agent.get('/api/tags').expect(401);
});

// --- Todo CRUD -------------------------------------------------------------

test('create + list + get a top-level todo', async () => {
  await registerAndLogin();
  const created = await createTodo({ title: 'Write essay' });
  assert.equal(created.title, 'Write essay');
  assert.equal(created.parentId, null);
  assert.equal(created.isCompleted, false);

  const list = await agent.get('/api/todos').expect(200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, created.id);

  const one = await agent.get(`/api/todos/${created.id}`).expect(200);
  assert.equal(one.body.title, 'Write essay');
});

test('create child links parent.childIds correctly', async () => {
  await registerAndLogin();
  const parent = await createTodo({ title: 'Project' });
  const child = await createTodo({ title: 'Subtask', parentId: parent.id });

  const reloadParent = (await agent.get(`/api/todos/${parent.id}`).expect(200)).body;
  assert.deepEqual(reloadParent.childIds, [child.id]);
  assert.equal(child.parentId, parent.id);
});

test('PATCH returns before/after over only changed fields', async () => {
  await registerAndLogin();
  const todo = await createTodo({ title: 'Old', priority: 'medium' });

  const res = await agent
    .patch(`/api/todos/${todo.id}`)
    .send({ title: 'New', priority: 'medium' /* unchanged */ })
    .expect(200);

  assert.deepEqual(Object.keys(res.body.before), ['title']);
  assert.deepEqual(Object.keys(res.body.after), ['title']);
  assert.equal(res.body.before.title, 'Old');
  assert.equal(res.body.after.title, 'New');
});

test('PATCH with no actual changes returns empty diff', async () => {
  await registerAndLogin();
  const todo = await createTodo({ title: 'Same' });
  const res = await agent.patch(`/api/todos/${todo.id}`).send({ title: 'Same' }).expect(200);
  assert.deepEqual(res.body.before, {});
  assert.deepEqual(res.body.after, {});
});

// --- Completion cascade ----------------------------------------------------

test('completing a parent cascades to ALL descendants', async () => {
  await registerAndLogin();
  const root = await createTodo({ title: 'Root' });
  const childA = await createTodo({ title: 'A', parentId: root.id });
  const childB = await createTodo({ title: 'B', parentId: root.id });
  const grandchild = await createTodo({ title: 'A1', parentId: childA.id });

  const res = await agent
    .post(`/api/todos/${root.id}/complete`)
    .send({ isCompleted: true })
    .expect(200);

  // Every row in the subtree should be in the affected list.
  const affectedIds = res.body.affected.map((a) => a.todoId).sort();
  assert.deepEqual(
    affectedIds,
    [root.id, childA.id, childB.id, grandchild.id].sort()
  );
  // Each pre-image should record the previous state (all were active).
  for (const a of res.body.affected) {
    assert.equal(a.prevIsCompleted, false);
    assert.equal(a.prevCompletedAt, null);
  }

  for (const id of [root.id, childA.id, childB.id, grandchild.id]) {
    const t = (await agent.get(`/api/todos/${id}`).expect(200)).body;
    assert.equal(t.isCompleted, true);
  }
});

test('un-completing a parent does NOT cascade (spec asymmetry)', async () => {
  await registerAndLogin();
  const root = await createTodo({ title: 'Root' });
  const child = await createTodo({ title: 'C', parentId: root.id });

  // Complete the whole subtree.
  await agent.post(`/api/todos/${root.id}/complete`).send({ isCompleted: true }).expect(200);

  // Now uncheck the root only.
  const res = await agent
    .post(`/api/todos/${root.id}/complete`)
    .send({ isCompleted: false })
    .expect(200);

  // Only the root flips back; child stays completed.
  assert.equal(res.body.affected.length, 1);
  assert.equal(res.body.affected[0].todoId, root.id);

  const reloadChild = (await agent.get(`/api/todos/${child.id}`).expect(200)).body;
  assert.equal(reloadChild.isCompleted, true, 'child must remain completed');
});

test('completing an already-completed parent yields an empty affected list', async () => {
  await registerAndLogin();
  const todo = await createTodo({ title: 'Done' });
  await agent.post(`/api/todos/${todo.id}/complete`).send({ isCompleted: true }).expect(200);

  const res = await agent
    .post(`/api/todos/${todo.id}/complete`)
    .send({ isCompleted: true })
    .expect(200);
  assert.equal(res.body.affected.length, 0);
});

// --- Delete + restore (undo) ----------------------------------------------

test('DELETE returns a snapshot that POST /restore re-hydrates with original ids', async () => {
  await registerAndLogin();
  const root = await createTodo({ title: 'Root', description: 'desc' });
  const child = await createTodo({ title: 'Child', parentId: root.id });

  const del = await agent.delete(`/api/todos/${root.id}`).expect(200);
  assert.deepEqual(del.body.deletedIds.sort(), [root.id, child.id].sort());
  assert.ok(del.body.snapshot, 'snapshot present');

  // Confirm rows are gone.
  await agent.get(`/api/todos/${root.id}`).expect(404);

  // Restore — original ids must come back.
  const restored = await agent
    .post('/api/todos/restore')
    .send({ snapshot: del.body.snapshot })
    .expect(201);

  const restoredIds = restored.body.map((t) => t.id).sort();
  assert.deepEqual(restoredIds, [root.id, child.id].sort());

  const reloadChild = (await agent.get(`/api/todos/${child.id}`).expect(200)).body;
  assert.equal(reloadChild.parentId, root.id);
});

test('DELETE pulls the deleted todo out of its parent.childIds', async () => {
  await registerAndLogin();
  const parent = await createTodo({ title: 'Parent' });
  const child = await createTodo({ title: 'Child', parentId: parent.id });

  await agent.delete(`/api/todos/${child.id}`).expect(200);

  const reload = (await agent.get(`/api/todos/${parent.id}`).expect(200)).body;
  assert.deepEqual(reload.childIds, []);
});

// --- Cross-user isolation --------------------------------------------------

test('a user cannot read another user\'s todo', async () => {
  // First user creates a todo.
  await registerAndLogin({ email: 'a@example.com' });
  const t = await createTodo({ title: 'Secret' });

  // Switch to a fresh agent + second user.
  agent = supertest.agent(getApp());
  await registerAndLogin({ email: 'b@example.com' });

  await agent.get(`/api/todos/${t.id}`).expect(404);
  const list = await agent.get('/api/todos').expect(200);
  assert.equal(list.body.length, 0);
});

// --- Tags ------------------------------------------------------------------

test('tag CRUD: create, list, delete cleans up references', async () => {
  await registerAndLogin();
  const tag = (await agent.post('/api/tags').send({ label: 'urgent', color: '#f00' }).expect(201)).body;

  const todo = await createTodo({ title: 'X', tagIds: [tag.id] });
  assert.deepEqual(todo.tagIds, [tag.id]);

  const tags = (await agent.get('/api/tags').expect(200)).body;
  assert.equal(tags.length, 1);
  assert.equal(tags[0].label, 'urgent');

  await agent.delete(`/api/tags/${tag.id}`).expect(204);

  // Deleting the tag should pull it from any referencing todo.
  const reload = (await agent.get(`/api/todos/${todo.id}`).expect(200)).body;
  assert.deepEqual(reload.tagIds, []);
});

test('tag create rejects duplicates per-user', async () => {
  await registerAndLogin();
  await agent.post('/api/tags').send({ label: 'work', color: '#abc' }).expect(201);
  await agent.post('/api/tags').send({ label: 'work', color: '#def' }).expect(409);
});

test('PATCH rejects unknown tagIds', async () => {
  await registerAndLogin();
  const todo = await createTodo({ title: 'X' });
  // 24-hex but not a real tag in DB.
  await agent.patch(`/api/todos/${todo.id}`)
    .send({ tagIds: ['ffffffffffffffffffffffff'] })
    .expect(400);
});
