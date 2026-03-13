'use strict';

const express = require('express');
const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const validateRequest = require('../middleware/validateRequest');
const { taskSchemas } = require('../validations/schemas');

const router = express.Router();

router.use(requireAuth);

router.post('/create', validateRequest(taskSchemas.create), taskController.createTask);
router.get('/list', cacheMiddleware(60), taskController.listTasks);
router.post('/cancel', validateRequest(taskSchemas.cancel), taskController.cancelTask);

module.exports = router;
