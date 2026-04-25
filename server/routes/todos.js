const express = require('express');

const todoController = require('../controllers/todoController');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.get('/', asyncRoute(todoController.list));
router.post('/restore', asyncRoute(todoController.restore));
router.get('/:id', asyncRoute(todoController.getOne));
router.get('/:id/children', asyncRoute(todoController.children));
router.post('/', asyncRoute(todoController.create));
router.patch('/:id', asyncRoute(todoController.patch));
router.delete('/:id', asyncRoute(todoController.remove));
router.post('/:id/complete', asyncRoute(todoController.complete));

module.exports = router;
