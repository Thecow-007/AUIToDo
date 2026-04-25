// Runtime entry point: connects to Mongo, then binds the Express app to a port.
// Tests bypass this file and import `./app` directly with their own DB lifecycle.

const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');

connectDB();

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
