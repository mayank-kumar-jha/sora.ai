'use strict';

const logger = require('../config/logger');

const crypto = require('crypto');

/**
 * Routes AI function calls to the appropriate service.
 * Each handler returns a result object that gets sent back to the AI.
 */
const route = async (toolName, args, userId) => {
  logger.info(`[ActionRouter] ${toolName}`, args);

  const actionId = crypto.randomUUID();

  switch (toolName) {
    case 'perform_web_search': {
      const webSearch = require('./webSearchService');
      return await webSearch.search(args.query);
    }

    case 'query_knowledge_base': {
      const ragService = require('./ragService');
      return await ragService.query(args.query, userId);
    }

    case 'make_note': {
      const ragService = require('./ragService');
      const doc = await ragService.ingest(userId, args.note, 'note', args.topic || 'general');
      return { success: true, message: 'Note saved successfully to memory.', vectorId: doc.vectorId };
    }

    case 'save_contact': {
      const ragService = require('./ragService');
      const contactNote = `Contact: ${args.name} — Phone: ${args.phoneNumber}`;
      const doc = await ragService.ingest(userId, contactNote, 'note', 'contacts');
      
      try {
        const whatsappService = require('./whatsappService');
        if (whatsappService.registerContact) {
          whatsappService.registerContact(args.name, args.phoneNumber);
          logger.info(`[ActionRouter] Registered contact: ${args.name} → ${args.phoneNumber}`);
        }
      } catch (e) {
        logger.warn(`[ActionRouter] Could not register contact in WhatsApp: ${e.message}`);
      }
      
      return { success: true, message: `Contact saved! I'll remember that ${args.phoneNumber} is ${args.name}.` };
    }

    case 'send_whatsapp_message': {
      const result = { actionId, clientAction: 'SEND_WHATSAPP', ...args, messageContent: args.message, message: `Sending WhatsApp message to ${args.to}` };
      pushDeviceAction(userId, result);
      return result;
    }

    case 'generate_image': {
      const imageService = require('./imageService');
      const res = await imageService.generateImage(args.prompt);
      
      const actionPayload = { actionId, clientAction: 'RENDER_IMAGE', payload: { ...res, prompt: args.prompt } };
      pushDeviceAction(userId, actionPayload);
      return actionPayload;
    }

    case 'edit_current_image': {
      const imageService = require('./imageService');
      
      const lastImage = global.latestImageContext ? global.latestImageContext[userId] : null;
      if (!lastImage) {
          return { error: 'No recent image found in context. Please provide an image to edit.' };
      }
      
      const res = await imageService.editImage(lastImage, args.prompt);
      
      if (res.image) {
          const actionPayload = { actionId, clientAction: 'RENDER_IMAGE', payload: { ...res, prompt: args.prompt } };
          pushDeviceAction(userId, actionPayload);
          return actionPayload;
      } else {
          return res;
      }
    }

    // ─── Device Actions (pushed to mobile app via Socket.io) ─────────────
    case 'set_alarm': {
      const result = { actionId, clientAction: 'SET_ALARM', ...args, message: `Alarm set for ${args.time}` };
      pushDeviceAction(userId, result);
      return result;
    }

    case 'make_call': {
      const result = { actionId, clientAction: 'MAKE_CALL', ...args, message: `Calling ${args.contactName}` };
      pushDeviceAction(userId, result);
      return result;
    }

    case 'open_app': {
      const result = { actionId, clientAction: 'OPEN_APP', ...args, message: `Opening ${args.appName}` };
      pushDeviceAction(userId, result);
      return result;
    }

    case 'play_music': {
      const result = { actionId, clientAction: 'PLAY_MUSIC', ...args, message: `Playing ${args.songName}` };
      pushDeviceAction(userId, result);
      return result;
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
};

/**
 * Push a device action to the user's mobile app via Socket.io.
 * The mobile app listens for 'device:action' events and executes them natively.
 */
const pushDeviceAction = (userId, action) => {
  try {
    const { notifyUser } = require('./socketService');
    notifyUser(userId, 'device:action', action);
    logger.info(`[ActionRouter] Pushed device action to ${userId}: ${action.clientAction}`);
  } catch (err) {
    logger.warn(`[ActionRouter] Failed to push device action: ${err.message}`);
  }
};

module.exports = { route };
