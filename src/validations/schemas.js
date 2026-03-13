'use strict';

const { z } = require('zod');

const authSchemas = {
    register: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(2)
    }),
    login: z.object({
        email: z.string().email(),
        password: z.string()
    })
};

const taskSchemas = {
    create: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['ONE_TIME', 'RECURRING']).default('ONE_TIME'),
        scheduledTime: z.string().datetime().optional().nullable(),
        recurrenceRule: z.string().optional().nullable()
    }),
    cancel: z.object({
        taskId: z.string().uuid()
    })
};

const aiSchemas = {
    message: z.object({
        message: z.string().min(1),
        conversationId: z.string().uuid().optional()
    })
};

module.exports = {
    authSchemas,
    taskSchemas,
    aiSchemas
};
