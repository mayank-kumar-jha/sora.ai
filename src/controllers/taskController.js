'use strict';

const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const prisma = require('../config/database');

/**
 * POST /api/tasks/create
 */
const createTask = asyncHandler(async (req, res) => {
    const { title, description, type, scheduledTime, recurrenceRule } = req.body;

    const task = await prisma.task.create({
        data: {
            userId: req.user.id,
            title,
            description,
            type,
            status: 'PENDING',
            scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
            recurrenceRule
        }
    });

    sendSuccess(res, { data: task, message: 'Task created successfully' }, 201);
});

/**
 * GET /api/tasks/list
 */
const listTasks = asyncHandler(async (req, res) => {
    const tasks = await prisma.task.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' }
    });

    sendSuccess(res, { data: tasks });
});

/**
 * POST /api/tasks/cancel
 */
const cancelTask = asyncHandler(async (req, res) => {
    const { taskId } = req.body;

    const task = await prisma.task.update({
        where: {
            id: taskId,
            userId: req.user.id // ensure user owns the task
        },
        data: {
            status: 'CANCELLED'
        }
    });

    sendSuccess(res, { data: task, message: 'Task cancelled successfully' });
});

module.exports = {
    createTask,
    listTasks,
    cancelTask
};
