const express = require('express');

const authController = require('../controllers/authController');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.post('/register', asyncRoute(authController.register));
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.me);

module.exports = router;
