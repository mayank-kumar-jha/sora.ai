import React from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import AssistantFace, { AssistantFaceState } from '../animations/AssistantFace';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  state: AssistantFaceState;
  isExpanded: boolean;
  isHalfScreen?: boolean;
  isEmpty?: boolean;
  activeTimer?: string;
  eyeColor?: string;
  isLiveMode?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  children?: React.ReactNode;
}

export default function DynamicIsland({
  state,
  isExpanded,
  isHalfScreen,
  isEmpty,
  activeTimer,
  eyeColor,
  isLiveMode,
  onPress,
  onLongPress,
  children,
}: Props) {
  const lastTapRef = React.useRef<number>(0);
  const tapCountRef = React.useRef<number>(0);

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      tapCountRef.current += 1;
    } else {
      tapCountRef.current = 1;
    }
    lastTapRef.current = now;

    setTimeout(() => {
      if (tapCountRef.current >= 1) {
        onPress();
        tapCountRef.current = 0;
      }
    }, 350);
  };

  const animatedStyle = useAnimatedStyle(() => {
    let targetHeight = 40;
    let targetWidth = 100;
    if (isExpanded) {
      targetWidth = 340;
      // Increased heights to accommodate header + text input bar
      targetHeight = isHalfScreen ? SCREEN_HEIGHT * 0.50 : 240;
    }

    return {
      width: withSpring(targetWidth, { damping: 22, stiffness: 180, mass: 0.8 }),
      height: withSpring(targetHeight, { damping: 22, stiffness: 180, mass: 0.8 }),
      borderRadius: withSpring(isExpanded ? 24 : 20),
    };
  });

  const childrenVisibilityStyle = useAnimatedStyle(() => ({
    opacity: withDelay(
      isExpanded ? 250 : 0,
      withTiming(isExpanded ? 1 : 0, { duration: 180 })
    ),
    transform: [
      {
        translateY: withDelay(
          isExpanded ? 250 : 0,
          withSpring(isExpanded ? 0 : 15, { damping: 20 })
        ),
      },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    flex: 1,
    alignItems: isExpanded ? 'stretch' : 'center',
    justifyContent: isExpanded ? 'flex-start' : 'center',
  }));

  // Border color changes during live mode
  const borderColor = isLiveMode
    ? 'rgba(255,60,50,0.35)'
    : 'rgba(255,255,255,0.12)';

  return (
    <Animated.View style={[styles.container, animatedStyle, { borderColor }]}>
      {!isExpanded ? (
        /* ─── Compact Capsule ───────────────────────────────── */
        <TouchableOpacity
          style={styles.touchable}
          activeOpacity={0.9}
          onPress={handlePress}
          onLongPress={onLongPress}
        >
          <Animated.View style={contentStyle}>
            <View style={styles.faceContainer}>
              {activeTimer ? (
                <Animated.Text style={styles.timerTextSmall}>
                  {activeTimer}
                </Animated.Text>
              ) : (
                <AssistantFace state={state} eyeColor={eyeColor} />
              )}
            </View>
          </Animated.View>
        </TouchableOpacity>
      ) : (
        /* ─── Expanded Panel ────────────────────────────────── */
        <Animated.View
          style={[styles.expandedContent, childrenVisibilityStyle]}
          pointerEvents="box-none"
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10, 10, 12, 0.92)',
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
    alignSelf: 'center',
    marginTop: 5,
  },
  touchable: {
    flex: 1,
  },
  backgroundFaceContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  faceContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  expandedContent: {
    flex: 1,
  },
  timerTextSmall: {
    color: '#0df',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timerTextLarge: {
    color: '#0df',
    fontSize: 32,
    fontWeight: 'bold',
  },
});
