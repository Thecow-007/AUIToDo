const express = require('express');

const tagController = require('../controllers/tagController');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.get('/', asyncRoute(tagController.list));
router.post('/', asyncRoute(tagController.create));
router.delete('/:id', asyncRoute(tagController.remove));

module.exports = router;
