'use strict';

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { queues } = require('../queues');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
    queues: Object.values(queues).map(q => new BullMQAdapter(q)),
    serverAdapter: serverAdapter,
});

module.exports = serverAdapter;
