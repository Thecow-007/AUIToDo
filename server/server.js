const express = require('express');
const path = require('path');
require('dotenv').config();

const helloRoutes = require('./routes/helloRoutes');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', helloRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
