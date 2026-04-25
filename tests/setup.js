// Shared test bootstrap: spins up an in-memory Mongo, connects mongoose, and
// exposes the Express app via supertest. Each test file calls `bootstrap()` in
// a `before` hook and `teardown()` in `after`. Between tests, `clearDb()` wipes
// the collections so cases stay isolated without paying the cost of restarting
// the Mongo server.

const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;
let app;

async function bootstrap() {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.DB_NAME = 'auitodo_test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  // AI keys intentionally absent — tests never hit the AI endpoint.

  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'auitodo_test' });

  // Import after env is set so the session store + config pick up the URI.
  // Bust any prior require cache so re-runs in watch mode get a fresh app.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.join('server', ''))) delete require.cache[key];
  }
  app = require('../server/app');
  return app;
}

async function teardown() {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}

async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  );
}

function getApp() {
  if (!app) throw new Error('bootstrap() not called');
  return app;
}

module.exports = { bootstrap, teardown, clearDb, getApp };
