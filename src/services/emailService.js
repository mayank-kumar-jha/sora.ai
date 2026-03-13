const { google } = require('googleapis');
const logger = require('../config/logger');

class EmailService {
  constructor() {
    this.oAuth2Client = null;
  }

  setCredentials(tokens) {
    this.oAuth2Client = new google.auth.OAuth2();
    this.oAuth2Client.setCredentials(tokens);
    this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
  }

  async testConnection() {
    if (!this.gmail) throw new Error('Gmail client not initialized with tokens.');
    const res = await this.gmail.users.getProfile({ userId: 'me' });
    return res.data;
  }

  async getRecentEmails(maxResults = 5) {
    if (!this.gmail) return [];
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'is:unread',
      });
      const messages = response.data.messages || [];
      const results = [];

      for (const msg of messages) {
        const mail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
        });

        const subjectHeader = mail.data.payload.headers.find(h => h.name === 'Subject');
        const fromHeader = mail.data.payload.headers.find(h => h.name === 'From');

        results.push({
          id: msg.id,
          snippet: mail.data.snippet,
          subject: subjectHeader ? subjectHeader.value : 'No Subject',
          from: fromHeader ? fromHeader.value : 'Unknown',
        });
      }
      return results;
    } catch (err) {
      logger.error(`Error fetching emails: ${err.message}`);
      return [];
    }
  }

  async sendEmail(to, subject, body) {
    if (!this.gmail) return false;
    try {
      const str = [
        `To: ${to}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        body,
      ].join('\n');

      const encodedMessage = Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });
      return true;
    } catch (err) {
      logger.error(`Error sending email: ${err.message}`);
      return false;
    }
  }
}

module.exports = new EmailService();
