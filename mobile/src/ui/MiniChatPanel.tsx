import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  TextInput,
  Keyboard,
  Animated as RNAnimated,
  Image,
} from 'react-native';
import { Mic, Eye, Send, X, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  isComplete?: boolean;
  generatedImage?: string;
  imageBase64?: string;
}

export interface UtilityEvent {
  id: string;
  type: 'ALARM' | 'TIMER';
  label: string;
  time: string;
}

interface Props {
  messages: ChatMessage[];
  utilityEvents?: UtilityEvent[];
  isListening: boolean;
  isHalfScreen: boolean;
  isLiveMode?: boolean;
  isThinking?: boolean;
  onMicPress: () => void;
  onMicLongPress?: () => void;
  onVisionPress: () => void;
  onSendText?: (text: string) => void;
  onToggleSize: () => void;
  onRetract: () => void;
  isCapturing?: boolean;
}

// ─── Typing Indicator (animated dots) ────────────────────────────────────────
function TypingIndicator() {
  const dot1 = useRef(new RNAnimated.Value(0.3)).current;
  const dot2 = useRef(new RNAnimated.Value(0.3)).current;
  const dot3 = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: RNAnimated.Value, delay: number) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          RNAnimated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={[styles.bubble, styles.bubbleAi, { flexDirection: 'row', gap: 4, paddingVertical: 12, paddingHorizontal: 16 }]}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <RNAnimated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: '#0df',
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

export default function MiniChatPanel({
  messages,
  isListening,
  isHalfScreen,
  isLiveMode = false,
  isThinking = false,
  onMicPress,
  onMicLongPress,
  onVisionPress,
  onSendText,
  onToggleSize,
  onRetract,
  isCapturing,
}: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState('');
  const lastTapRef = useRef<number>(0);

  const handleMessagePress = async (text: string) => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      await Clipboard.setStringAsync(text);
    }
    lastTapRef.current = now;
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendText?.(trimmed);
    setInputText('');
    Keyboard.dismiss();
  };

  if (isLiveMode) {
    return <LiveModePanel onHold={() => {}} onEnd={onMicPress} isListening={isListening} />;
  }

  return (
    <View style={styles.container}>
      {/* ─── Header Bar ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, styles.dotCyan]} />
          <View style={[styles.statusDot, styles.dotTeal]} />
          <Text style={styles.headerTitle}>KAAYA AI</Text>
          {isLiveMode && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onToggleSize} style={styles.headerBtn} hitSlop={8}>
            {isHalfScreen ? (
              <ChevronDown color="#888" size={16} />
            ) : (
              <ChevronUp color="#888" size={16} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onRetract} style={styles.headerBtn} hitSlop={8}>
            <X color="#888" size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Chat Messages ──────────────────────────────────────── */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <Text style={styles.emptyText}>How can I help you today?</Text>
        ) : (
          messages.map((msg) => (
            <Pressable
              key={msg.id}
              onPress={() => handleMessagePress(msg.text)}
            >
              <View
                style={[
                  styles.bubble,
                  msg.sender === 'user' ? styles.bubbleUser : styles.bubbleAi,
                ]}
              >
                {msg.generatedImage || msg.imageBase64 ? (
                  <Image source={{ uri: msg.generatedImage || msg.imageBase64 }} style={{ width: 200, height: 200, borderRadius: 12, marginBottom: msg.text ? 8 : 0 }} resizeMode="cover" />
                ) : null}
                {msg.text ? (
                <Text
                  style={[
                    styles.bubbleText,
                    msg.sender === 'user' ? styles.textUser : styles.textAi,
                  ]}
                >
                  {msg.text}
                </Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
        {isThinking && <TypingIndicator />}
      </ScrollView>

      {/* ─── Bottom Input Bar ───────────────────────────────────── */}
      <View style={styles.inputBar}>
        {/* Vision Button */}
        <TouchableOpacity
          style={[styles.actionBtn, isCapturing && styles.actionBtnActive]}
          onPress={onVisionPress}
          disabled={isCapturing}
        >
          <Eye color={isCapturing ? '#fff' : '#0df'} size={18} />
        </TouchableOpacity>

        {/* Text Input */}
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a command..."
            placeholderTextColor="#555"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            multiline={false}
          />
        </View>

        {/* Send or Mic Button */}
        {inputText.trim().length > 0 ? (
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Send color="#000" size={18} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.micBtn, isListening && styles.micBtnActive, isLiveMode && styles.micBtnLive]}
            onPress={onMicPress}
            onLongPress={onMicLongPress}
            delayLongPress={500}
          >
            <Mic color={isListening || isLiveMode ? '#fff' : '#0df'} size={18} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCyan: {
    backgroundColor: '#0df',
  },
  dotTeal: {
    backgroundColor: '#0a8',
  },
  headerTitle: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,50,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff3b30',
  },
  liveText: {
    color: '#ff3b30',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Chat
  chatScroll: {
    flex: 1,
    paddingHorizontal: 12,
  },
  chatContent: {
    paddingVertical: 10,
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    letterSpacing: 0.4,
    fontStyle: 'italic',
    alignSelf: 'center',
    marginTop: '30%',
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 8,
  },
  bubbleUser: {
    backgroundColor: 'rgba(0,221,255,0.15)',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,221,255,0.25)',
  },
  bubbleAi: {
    backgroundColor: 'rgba(40,40,45,0.6)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bubbleText: {
    fontSize: 13.5,
    lineHeight: 19,
    letterSpacing: 0.15,
  },
  textUser: {
    color: '#e0f7fa',
    fontWeight: '500',
  },
  textAi: {
    color: '#d4d4d8',
    fontWeight: '400',
  },

  // Input Bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(40,40,45,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionBtnActive: {
    backgroundColor: '#0df',
    borderColor: '#0df',
  },
  inputWrap: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,30,35,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  textInput: {
    color: '#e4e4e7',
    fontSize: 13.5,
    padding: 0,
    letterSpacing: 0.2,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0df',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(30,30,35,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13,255,255,0.15)',
  },
  micBtnActive: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
  },
  micBtnLive: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
});

// ─── Live Mode Panel (Gemini Live Style) ─────────────────────────────────────

function LiveModePanel({ onHold, onEnd, isListening }: { onHold: () => void; onEnd: () => void; isListening: boolean }) {
  const pulseAnim = useRef(new RNAnimated.Value(0.4)).current;
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 0.9, duration: 1800, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 0.3, duration: 1800, useNativeDriver: true }),
      ])
    );
    const scale = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(scaleAnim, { toValue: 1.15, duration: 2200, useNativeDriver: true }),
        RNAnimated.timing(scaleAnim, { toValue: 0.95, duration: 2200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    scale.start();
    return () => { pulse.stop(); scale.stop(); };
  }, []);

  return (
    <View style={liveStyles.container}>
      {/* Header */}
      <View style={liveStyles.header}>
        <Text style={liveStyles.headerText}>✦ Live</Text>
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Aurora Glow at Bottom */}
      <View style={liveStyles.glowArea}>
        <RNAnimated.View
          style={[
            liveStyles.glowBlob,
            liveStyles.glowBlobBlue,
            { opacity: pulseAnim, transform: [{ scale: scaleAnim }] },
          ]}
        />
        <RNAnimated.View
          style={[
            liveStyles.glowBlob,
            liveStyles.glowBlobPurple,
            { opacity: pulseAnim, transform: [{ scale: scaleAnim }] },
          ]}
        />
        <RNAnimated.View
          style={[
            liveStyles.glowBlob,
            liveStyles.glowBlobTeal,
            { opacity: RNAnimated.multiply(pulseAnim, 0.6), transform: [{ scale: scaleAnim }] },
          ]}
        />
      </View>

      {/* Bottom Controls */}
      <View style={liveStyles.controls}>
        <View style={liveStyles.btnWrapper}>
          <TouchableOpacity style={liveStyles.holdBtn} onPress={onHold} activeOpacity={0.7}>
            <View style={liveStyles.pauseBar} />
            <View style={liveStyles.pauseBar} />
          </TouchableOpacity>
          <Text style={liveStyles.btnLabel}>Hold</Text>
        </View>

        <View style={liveStyles.btnWrapper}>
          <TouchableOpacity style={liveStyles.endBtn} onPress={onEnd} activeOpacity={0.7}>
            <X color="#fff" size={22} />
          </TouchableOpacity>
          <Text style={liveStyles.btnLabel}>End</Text>
        </View>
      </View>
    </View>
  );
}

const liveStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060608',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  header: {
    paddingTop: 14,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  headerText: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  glowArea: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowBlob: {
    position: 'absolute',
    borderRadius: 100,
  },
  glowBlobBlue: {
    width: 200,
    height: 80,
    backgroundColor: '#00b4d8',
    left: '15%',
    bottom: 10,
    shadowColor: '#00b4d8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 25,
  },
  glowBlobPurple: {
    width: 180,
    height: 70,
    backgroundColor: '#7b2ff7',
    right: '15%',
    bottom: 20,
    shadowColor: '#7b2ff7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 25,
  },
  glowBlobTeal: {
    width: 120,
    height: 50,
    backgroundColor: '#0df',
    bottom: 0,
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    gap: 50,
    paddingBottom: 20,
    zIndex: 10,
  },
  btnWrapper: {
    alignItems: 'center',
    gap: 10,
  },
  btnLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  holdBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  pauseBar: {
    width: 4,
    height: 16,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  endBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ea4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
});
