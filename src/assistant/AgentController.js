const logger = require('../config/logger');

class AgentController {
  constructor() {
    this.memory = [];
  }

  async handleIncomingMessage(source, senderId, text) {
    logger.info(`AgentController received msg from [${source}] ${senderId}: ${text}`);
    try {
      // Lazy require to avoid circular dependency with whatsappService
      const agentService = require('../services/agentService');
      const result = await agentService.processMessage('system', text, []);
      return result;
    } catch (err) {
      logger.error(`AgentController failed to process message: ${err.message}`);
      return null;
    }
  }
}

module.exports = new AgentController();
