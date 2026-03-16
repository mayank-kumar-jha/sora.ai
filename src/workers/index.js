'use strict';

const logger = require('../config/logger');

// Import the consolidated worker to initialize it
require('./mainWorker');

logger.info('Consolidated BullMQ worker started');
