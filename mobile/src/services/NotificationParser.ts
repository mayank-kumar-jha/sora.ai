export interface ParsedNotification {
  app: 'whatsapp' | 'email' | 'system' | 'other';
  sender: string;
  content: string;
  timestamp: string;
}

export const parseNotification = (payload: any): ParsedNotification | null => {
  if (!payload || !payload.title) return null;
  
  const title = payload.title.toLowerCase();
  
  if (title.includes('whatsapp')) {
    return {
      app: 'whatsapp',
      sender: payload.title.replace('WhatsApp: ', '') || 'Unknown',
      content: payload.body || '',
      timestamp: new Date().toISOString(),
    };
  }
  
  if (title.includes('gmail') || title.includes('email')) {
    return {
      app: 'email',
      sender: payload.title || 'Unknown',
      content: payload.body || '',
      timestamp: new Date().toISOString(),
    };
  }
  
  return {
    app: 'other',
    sender: payload.title,
    content: payload.body,
    timestamp: new Date().toISOString()
  };
};
