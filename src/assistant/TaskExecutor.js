const whatsappService = require('../services/whatsappService');
const emailService = require('../services/emailService');
const logger = require('../config/logger');

class TaskExecutor {
  async replyWhatsApp(jid, message) {
    try {
        await whatsappService.sendWhatsAppMessage(jid, message);
        return { success: true, message: `Replied to WhatsApp: ${message}` };
    } catch (e) {
        logger.error(`TaskExecutor failed to reply WhatsApp: ${e.message}`);
        return { success: false, error: e.message };
    }
  }

  async summarizeEmails() {
    try {
        const emails = await emailService.getRecentEmails(5);
        if (!emails.length) return { success: true, message: 'No new emails to summarize.' };
        
        const summary = emails.map(e => `- ${e.subject} from ${e.from}`).join('\n');
        return { success: true, message: `Email Summary:\n${summary}` };
    } catch (e) {
        logger.error(`TaskExecutor failed summarize emails: ${e.message}`);
        return { success: false, error: e.message };
    }
  }
  
  async draftEmail(to, subject, body) {
    try {
        const sent = await emailService.sendEmail(to, subject, body);
        return { success: sent, message: sent ? 'Email sent successfully' : 'Failed to send email' };
    } catch (e) {
        logger.error(`TaskExecutor failed draft email: ${e.message}`);
        return { success: false, error: e.message };
    }
  }
}

module.exports = new TaskExecutor();
