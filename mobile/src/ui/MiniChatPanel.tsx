import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable, Platform } from 'react-native';
import { Mic, Eye, Monitor, Maximize2, Minimize2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
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
  onMicPress: () => void;
  onVisionPress: () => void;
  onToggleSize: () => void;
  onRetract: () => void; 
  isCapturing?: boolean;
}

export default function MiniChatPanel({ 
  messages, 
  utilityEvents = [],
  isListening, 
  isHalfScreen, 
  onMicPress, 
  onVisionPress, 
  onToggleSize,
  onRetract,
  isCapturing 
}: Props) {
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTapRef = useRef<number>(0);
  const backgroundTapCount = useRef<number>(0);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMessagePress = async (text: string) => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      await Clipboard.setStringAsync(text);
    }
    lastTapRef.current = now;
  };

  const handleBackgroundPress = () => {
    const now = Date.now();
    backgroundTapCount.current += 1;

    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
    }

    if (backgroundTapCount.current === 2) {
      onToggleSize();
      backgroundTapCount.current = 0;
    } else {
      tapTimeout.current = setTimeout(() => {
        if (backgroundTapCount.current === 1) {
          onRetract();
        }
        backgroundTapCount.current = 0;
      }, 300);
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.mainContent} pointerEvents="box-none">
        <Pressable 
          style={StyleSheet.absoluteFill} 
          onPress={handleBackgroundPress}
          pointerEvents="box-none"
        />

        <View style={styles.scrollArea} pointerEvents="box-none">
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            pointerEvents={messages.length === 0 ? "none" : "auto"}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>How can I help you today?</Text>
            ) : (
              messages.map((msg) => (
                <TouchableOpacity 
                  key={msg.id} 
                  activeOpacity={0.8}
                  onPress={() => handleMessagePress(msg.text)}
                  style={[
                    styles.bubble,
                    msg.sender === 'user' ? styles.bubbleUser : styles.bubbleAi
                  ]}
                >
                  <Text style={[
                    styles.bubbleText,
                    msg.sender === 'user' ? styles.textUser : styles.textAi
                  ]}>
                    {msg.text}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      <View style={styles.controls} pointerEvents="box-none">
        {utilityEvents.length > 0 && (
          <View style={styles.utilityIndicator}>
            <View style={styles.utilityIndicatorPulse} />
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.smallBtn} 
          onPress={onToggleSize}
        >
          {isHalfScreen ? (
            <Minimize2 color="#0df" size={18} />
          ) : (
            <Maximize2 color="#0df" size={18} />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.smallBtn, isCapturing && styles.btnActive]} 
          onPress={onVisionPress}
          disabled={isCapturing}
        >
          <Eye color="#0df" size={18} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.micBtn, isListening && styles.micBtnActive]} onPress={onMicPress}>
          <Mic color={isListening ? '#fff' : '#0df'} size={22} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingRight: 8,
  },
  mainContent: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
    paddingRight: 10,
  },
  chatContent: {
    paddingVertical: 10,
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
    letterSpacing: 0.5,
    fontStyle: 'italic',
    alignSelf: 'center',
    marginTop: '40%',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderColor: 'rgba(0, 122, 255, 0.4)',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: 'rgba(40, 40, 40, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  textUser: {
    color: '#fff',
    fontWeight: '500',
  },
  textAi: {
    color: '#0df',
    fontWeight: '400',
  },
  controls: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: 54,
    gap: 10,
    paddingBottom: 4,
  },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 255, 255, 0.15)',
    shadowColor: '#0df',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  micBtnActive: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
    shadowColor: '#ff3b30',
    shadowOpacity: 0.5,
  },
  smallBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(40, 40, 40, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  btnActive: {
    backgroundColor: '#0df',
    borderColor: '#0df',
  },
  utilityIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(13, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 255, 255, 0.2)',
  },
  utilityIndicatorPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0df',
  }
});
