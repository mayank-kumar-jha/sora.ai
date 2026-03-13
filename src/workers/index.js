'use strict';

const logger = require('../config/logger');

// Import all workers to initialize them
require('./aiWorker');
require('./taskWorker');
require('./reminderWorker');
require('./emailWorker');
require('./embeddingWorker');

logger.info('All BullMQ workers started');
