const express = require('express');

const aiChatController = require('../controllers/aiChatController');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.post('/chat', asyncRoute(aiChatController.chat));

module.exports = router;
