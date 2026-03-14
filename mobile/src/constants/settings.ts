export const STORAGE_KEYS = {
    THEME: 'sora_theme',
    PERSONA: 'sora_persona',
    TONE: 'sora_tone',
    VOICE: 'sora_voice',
    SERVER_URL: 'sora_server_url',
};

export const DEFAULT_IP = '192.168.1.4';
export const DEFAULT_BASE_URL = 'https://sora-ai-md9h.onrender.com';

export const THEMES = [
    { id: 'dark_blue', label: 'Deep Space', eyeColor: '#4a9eff', bg: '#020617', eyeBg: '#0f172a' },
    { id: 'dark_white', label: 'Ghost Mode', eyeColor: '#ffffff', bg: '#020617', eyeBg: '#111827' },
    { id: 'light', label: 'Daylight', eyeColor: '#1e293b', bg: '#f8fafc', eyeBg: '#e2e8f0' },
    { id: 'blood_red', label: 'Blood Moon', eyeColor: '#ef4444', bg: '#0c0000', eyeBg: '#1a0000' },
    { id: 'matrix', label: 'Matrix', eyeColor: '#22c55e', bg: '#001200', eyeBg: '#002800' },
    { id: 'gold', label: 'Royal Gold', eyeColor: '#f59e0b', bg: '#0a0800', eyeBg: '#1a1500' },
];

export const VOICES = [
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah', desc: 'Warm, reassuring female voice', gender: 'F' },
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', desc: 'Calm, professional female voice', gender: 'F' },
    { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', desc: 'Deep, authoritative male voice', gender: 'M' },
    { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni', desc: 'Friendly, conversational male voice', gender: 'M' },
    { id: 'VR6AewLTigWG4xSOukaG', label: 'Arnold', desc: 'Bold, confident male voice', gender: 'M' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', label: 'Emily', desc: 'Soft, soothing female voice', gender: 'F' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh', desc: 'Young, energetic male voice', gender: 'M' },
    { id: 'jBpfAIEqQ4SFnGBmCvjp', label: 'Gigi', desc: 'Youthful, expressive female voice', gender: 'F' },
];

export const PERSONAS = [
    { id: 'assistant', label: 'Professional', desc: 'Formal, concise, business-like' },
    { id: 'friend', label: 'Best Friend', desc: 'Casual, warm, uses emojis' },
    { id: 'mentor', label: 'Mentor', desc: 'Wise, thoughtful, motivating' },
    { id: 'sarcastic', label: 'Witty', desc: 'Sarcastic but helpful, gen-z' },
];

export const TONES = [
    { id: 'concise', label: 'Short & Snappy', desc: '1-2 sentences, to the point' },
    { id: 'balanced', label: 'Balanced', desc: 'Natural conversational length' },
    { id: 'detailed', label: 'Detailed', desc: 'Full explanations and context' },
];

