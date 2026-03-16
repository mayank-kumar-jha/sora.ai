import { NativeModules, Platform } from 'react-native';

const { SoraOverlay } = NativeModules;

const isAndroid = Platform.OS === 'android';

if (isAndroid) {
  if (!SoraOverlay) {
    console.error('[OverlayBridge] NativeModule.SoraOverlay is UNDEFINED');
  } else {
    const methods = Object.keys(SoraOverlay);
    console.log('[OverlayBridge] SoraOverlay initialized. Available methods:', methods);
  }
}

/**
 * TypeScript bridge for the native Sora overlay service.
 * Android-only — all methods are no-ops on other platforms.
 */
export const OverlayBridge = {
  /**
   * Check if the app has permission to draw over other apps.
   */
  async hasPermission(): Promise<boolean> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.hasPermission) return false;
    return SoraOverlay.hasPermission();
  },

  requestPermission(): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.requestPermission) return;
    SoraOverlay.requestPermission();
  },

  startOverlay(eyeColor?: string): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.startOverlay) return;
    SoraOverlay.startOverlay(eyeColor || null);
  },

  stopOverlay(): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.stopOverlay) return;
    SoraOverlay.stopOverlay();
  },
  
  hideOverlay(): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.hideOverlay) return;
    SoraOverlay.hideOverlay();
  },

  updateEyeColor(color: string): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.updateEyeColor) return;
    SoraOverlay.updateEyeColor(color);
  },

  updateState(state: string): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.updateState) return;
    SoraOverlay.updateState(state);
  },

  updateLastMessage(message: string): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.updateLastMessage) return;
    SoraOverlay.updateLastMessage(message);
  },

  addMessage(message: string, sender: 'user' | 'ai' = 'ai'): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.addMessage) return;
    SoraOverlay.addMessage(message, sender);
  },

  /**
   * Update the screen capture status in the native overlay.
   */
  updateIsCapturing(isCapturing: boolean): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.updateIsCapturing) return;
    SoraOverlay.updateIsCapturing(isCapturing);
  },

  async isRunning(): Promise<boolean> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.isRunning) return false;
    return SoraOverlay.isRunning();
  },

  async getInitialAction(): Promise<string | null> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.getInitialAction) return null;
    return SoraOverlay.getInitialAction();
  },

  async requestScreenCapturePermission(): Promise<void> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.requestScreenCapturePermission) return;
    return SoraOverlay.requestScreenCapturePermission();
  },

  takeScreenshot(): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.takeScreenshot) return;
    SoraOverlay.takeScreenshot();
  },

  async getVisionTranscript(): Promise<string | null> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.getVisionTranscript) return null;
    return SoraOverlay.getVisionTranscript();
  },

  async hasAccessibilityPermission(): Promise<boolean> {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.hasAccessibilityPermission) return false;
    return SoraOverlay.hasAccessibilityPermission();
  },

  setVisionTranscript(transcript: string | null): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.setVisionTranscript) return;
    SoraOverlay.setVisionTranscript(transcript);
  },

  resetVisionCapture(): void {
    if (!isAndroid || !SoraOverlay || !SoraOverlay.resetVisionCapture) return;
    SoraOverlay.resetVisionCapture();
  },

  // ─── JS-only session storage for background services ──────────────
  _conversationId: null as string | null,
  setConversationId(id: string): void {
    this._conversationId = id;
  },
  getConversationId(): string | null {
    return this._conversationId;
  },
};
