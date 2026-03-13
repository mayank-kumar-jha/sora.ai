const logger = require('../config/logger');
const TaskExecutor = require('./TaskExecutor');

class ActionRouter {
  constructor() {
    this.executor = TaskExecutor;
  }

  async routeIntent(intent, payload) {
    logger.info(`Routing intent: ${intent}`);
    switch (intent) {
      case 'REPLY_WHATSAPP':
        return await this.executor.replyWhatsApp(payload.jid, payload.message);
      case 'SUMMARIZE_EMAILS':
        return await this.executor.summarizeEmails();
      case 'DRAFT_EMAIL':
        return await this.executor.draftEmail(payload.to, payload.subject, payload.body);
      case 'UNKNOWN':
      default:
        logger.warn(`Unknown intent: ${intent}`);
        return null;
    }
  }

  extractIntent(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes('reply') || lower.includes('tell them')) {
      return 'REPLY_WHATSAPP';
    }
    if (lower.includes('summarize') && lower.includes('email')) {
      return 'SUMMARIZE_EMAILS';
    }
    if (lower.includes('email') && (lower.includes('send') || lower.includes('write') || lower.includes('draft'))) {
      return 'DRAFT_EMAIL';
    }
    
    return 'UNKNOWN';
  }
}

module.exports = new ActionRouter();
