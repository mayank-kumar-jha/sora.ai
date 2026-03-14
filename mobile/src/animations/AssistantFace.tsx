import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

export type AssistantFaceState = 'Idle' | 'Listening' | 'Thinking' | 'Speaking' | 'Alert' | 'Happy' | 'Question';

interface Props {
  state: AssistantFaceState;
  scale?: number;
  eyeColor?: string;
}

const EYE_BASE_WIDTH = 12;
const EYE_BASE_HEIGHT = 20;
const EYE_GAP = 16;
const CONTAINER_SIZE = 48;

export default function AssistantFace({ state, scale = 1, eyeColor = '#0df' }: Props) {
  // Shared values for independent eye control
  const leftEyeHeight = useSharedValue(EYE_BASE_HEIGHT);
  const leftEyeWidth = useSharedValue(EYE_BASE_WIDTH);
  const leftEyeTranslateY = useSharedValue(0);
  const leftEyeTranslateX = useSharedValue(0);
  const leftEyeRotate = useSharedValue(0);

  const rightEyeHeight = useSharedValue(EYE_BASE_HEIGHT);
  const rightEyeWidth = useSharedValue(EYE_BASE_WIDTH);
  const rightEyeTranslateY = useSharedValue(0);
  const rightEyeTranslateX = useSharedValue(0);
  const rightEyeRotate = useSharedValue(0);

  const glowOpacity = useSharedValue(0.2);
  const glowScale = useSharedValue(1);

  // Helper for quick blinks
  const blink = () => {
    const blinkDur = 120;
    leftEyeHeight.value = withSequence(
      withTiming(2, { duration: blinkDur / 2 }),
      withTiming(EYE_BASE_HEIGHT, { duration: blinkDur / 2 })
    );
    rightEyeHeight.value = withSequence(
      withTiming(2, { duration: blinkDur / 2 }),
      withTiming(EYE_BASE_HEIGHT, { duration: blinkDur / 2 })
    );
  };

  useEffect(() => {
    // Reset all animations on state change
    cancelAnimation(leftEyeHeight);
    cancelAnimation(leftEyeWidth);
    cancelAnimation(leftEyeTranslateX);
    cancelAnimation(leftEyeTranslateY);
    cancelAnimation(leftEyeRotate);
    
    cancelAnimation(rightEyeHeight);
    cancelAnimation(rightEyeWidth);
    cancelAnimation(rightEyeTranslateX);
    cancelAnimation(rightEyeTranslateY);
    cancelAnimation(rightEyeRotate);

    cancelAnimation(glowOpacity);
    cancelAnimation(glowScale);

    // Default returns
    leftEyeWidth.value = withSpring(EYE_BASE_WIDTH);
    rightEyeWidth.value = withSpring(EYE_BASE_WIDTH);
    leftEyeRotate.value = withSpring(0);
    rightEyeRotate.value = withSpring(0);
    glowOpacity.value = withTiming(0.2, { duration: 500 });
    glowScale.value = withTiming(1, { duration: 500 });

    const springConfig = { damping: 12, stiffness: 100 };

    if (state === 'Idle') {
      leftEyeHeight.value = withSpring(EYE_BASE_HEIGHT, springConfig);
      rightEyeHeight.value = withSpring(EYE_BASE_HEIGHT, springConfig);
      leftEyeTranslateX.value = withSpring(0);
      rightEyeTranslateX.value = withSpring(0);
      leftEyeTranslateY.value = withSpring(0);
      rightEyeTranslateY.value = withSpring(0);

      // Random micro-movements for Idle (Subtle breathing/looking)
      leftEyeTranslateX.value = withRepeat(
        withSequence(
          withDelay(2000, withTiming(-1, { duration: 1000 })),
          withDelay(1000, withTiming(1, { duration: 1000 })),
          withDelay(3000, withTiming(0, { duration: 1000 }))
        ),
        -1,
        true
      );
      rightEyeTranslateX.value = withRepeat(
        withSequence(
          withDelay(2000, withTiming(-1, { duration: 1000 })),
          withDelay(1000, withTiming(1, { duration: 1000 })),
          withDelay(3000, withTiming(0, { duration: 1000 }))
        ),
        -1,
        true
      );

      // Standard blinking
      leftEyeHeight.value = withRepeat(
        withSequence(
          withDelay(3500, withTiming(2, { duration: 100 })),
          withTiming(EYE_BASE_HEIGHT, { duration: 100 })
        ),
        -1,
        false
      );
      rightEyeHeight.value = withRepeat(
        withSequence(
          withDelay(3500, withTiming(2, { duration: 100 })),
          withTiming(EYE_BASE_HEIGHT, { duration: 100 })
        ),
        -1,
        false
      );
      
    } else if (state === 'Listening') {
      // Eyes widen and bounce slightly
      leftEyeHeight.value = withSpring(EYE_BASE_HEIGHT + 4, springConfig);
      rightEyeHeight.value = withSpring(EYE_BASE_HEIGHT + 4, springConfig);
      leftEyeWidth.value = withSpring(EYE_BASE_WIDTH + 2, springConfig);
      rightEyeWidth.value = withSpring(EYE_BASE_WIDTH + 2, springConfig);
      
      leftEyeTranslateY.value = withSpring(-2);
      rightEyeTranslateY.value = withSpring(-2);
      leftEyeTranslateX.value = withSpring(0);
      rightEyeTranslateX.value = withSpring(0);

      // Double blink on entry
      blink();

      // Increased glow
      glowOpacity.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 800 }), withTiming(0.2, { duration: 800 })),
        -1,
        true
      );
      glowScale.value = withRepeat(
        withSequence(withTiming(1.2, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        true
      );

    } else if (state === 'Thinking') {
      // Look up and right, squinting slightly
      leftEyeTranslateX.value = withSpring(4);
      rightEyeTranslateX.value = withSpring(4);
      leftEyeTranslateY.value = withSpring(-4);
      rightEyeTranslateY.value = withSpring(-4);
      
      leftEyeHeight.value = withSpring(Math.floor(EYE_BASE_HEIGHT * 0.7));
      rightEyeHeight.value = withSpring(Math.floor(EYE_BASE_HEIGHT * 0.7));

      // Processing micro-jitters
      leftEyeTranslateX.value = withRepeat(
        withSequence(
          withTiming(4, { duration: 100 }),
          withTiming(5, { duration: 50 }),
          withTiming(4, { duration: 100 })
        ),
        -1,
        true
      );
      rightEyeTranslateX.value = withRepeat(
        withSequence(
          withTiming(4, { duration: 100 }),
          withTiming(5, { duration: 50 }),
          withTiming(4, { duration: 100 })
        ),
        -1,
        true
      );

    } else if (state === 'Speaking') {
      // Rhythmic eye movements to simulate speaking
      leftEyeTranslateX.value = withSpring(0);
      rightEyeTranslateX.value = withSpring(0);
      leftEyeTranslateY.value = withSpring(0);
      rightEyeTranslateY.value = withSpring(0);

      leftEyeHeight.value = withRepeat(
        withSequence(
          withTiming(EYE_BASE_HEIGHT - 4, { duration: 150 }),
          withTiming(EYE_BASE_HEIGHT + 2, { duration: 250 }),
          withTiming(EYE_BASE_HEIGHT, { duration: 100 })
        ),
        -1,
        true
      );
      rightEyeHeight.value = withRepeat(
        withSequence(
          withTiming(EYE_BASE_HEIGHT - 4, { duration: 150 }),
          withTiming(EYE_BASE_HEIGHT + 2, { duration: 250 }),
          withTiming(EYE_BASE_HEIGHT, { duration: 100 })
        ),
        -1,
        true
      );
      
      // Joyful curvature tilt
      leftEyeRotate.value = withSpring(10);
      rightEyeRotate.value = withSpring(-10);

    } else if (state === 'Happy') {
      // Curve eyes upward, slight bounce
      leftEyeRotate.value = withSpring(45);
      rightEyeRotate.value = withSpring(-45);
      leftEyeHeight.value = withSpring(EYE_BASE_HEIGHT - 6);
      rightEyeHeight.value = withSpring(EYE_BASE_HEIGHT - 6);
      leftEyeTranslateY.value = withRepeat(
        withSequence(withTiming(-2, { duration: 500 }), withTiming(0, { duration: 500 })),
        -1,
        true
      );
      rightEyeTranslateY.value = withRepeat(
        withSequence(withTiming(-2, { duration: 500 }), withTiming(0, { duration: 500 })),
        -1,
        true
      );
    } else if (state === 'Question') {
      // One eye higher than other
      leftEyeTranslateY.value = withSpring(-6);
      rightEyeTranslateY.value = withSpring(2);
      leftEyeHeight.value = withSpring(EYE_BASE_HEIGHT + 2);
      rightEyeHeight.value = withSpring(EYE_BASE_HEIGHT - 4);
    } else if (state === 'Alert') {
      // Widen eyes sharply, glow red/intense
      leftEyeTranslateX.value = withSpring(0);
      rightEyeTranslateX.value = withSpring(0);
      leftEyeTranslateY.value = withSpring(0);
      rightEyeTranslateY.value = withSpring(0);
      leftEyeRotate.value = withSpring(0);
      rightEyeRotate.value = withSpring(0);

      leftEyeHeight.value = withSpring(EYE_BASE_HEIGHT + 6, { damping: 8, stiffness: 200 });
      rightEyeHeight.value = withSpring(EYE_BASE_HEIGHT + 6, { damping: 8, stiffness: 200 });
      leftEyeWidth.value = withSpring(EYE_BASE_WIDTH + 4, { damping: 8 });
      rightEyeWidth.value = withSpring(EYE_BASE_WIDTH + 4, { damping: 8 });

      blink();
      setTimeout(blink, 200); // Double blink

      glowOpacity.value = withTiming(0.8);
      glowScale.value = withSpring(1.5);
    }
  }, [state]);

  // Randomized High-Level "Expressions" while Idle
  useEffect(() => {
    if (state !== 'Idle') return;

    let timeoutId: NodeJS.Timeout;

    const triggerBurst = () => {
      const burstType = Math.floor(Math.random() * 3); // 0: Squint, 1: Tilt, 2: Look Aside
      
      if (burstType === 0) {
        // Happy squint
        leftEyeRotate.value = withSequence(withTiming(45, { duration: 400 }), withDelay(1000, withSpring(0)));
        rightEyeRotate.value = withSequence(withTiming(-45, { duration: 400 }), withDelay(1000, withSpring(0)));
        leftEyeHeight.value = withSequence(withTiming(EYE_BASE_HEIGHT / 2, { duration: 400 }), withDelay(1000, withSpring(EYE_BASE_HEIGHT)));
        rightEyeHeight.value = withSequence(withTiming(EYE_BASE_HEIGHT / 2, { duration: 400 }), withDelay(1000, withSpring(EYE_BASE_HEIGHT)));
      } else if (burstType === 1) {
        // Thinking tilt
        leftEyeTranslateY.value = withSequence(withTiming(-4, { duration: 500 }), withDelay(1500, withSpring(0)));
        rightEyeTranslateY.value = withSequence(withTiming(2, { duration: 500 }), withDelay(1500, withSpring(0)));
      } else {
        // Look aside
        const dir = Math.random() > 0.5 ? 5 : -5;
        leftEyeTranslateX.value = withSequence(withTiming(dir, { duration: 600 }), withDelay(1000, withSpring(0)));
        rightEyeTranslateX.value = withSequence(withTiming(dir, { duration: 600 }), withDelay(1000, withSpring(0)));
      }

      // Schedule next burst
      const nextDelay = 10000 + Math.random() * 15000;
      timeoutId = setTimeout(triggerBurst, nextDelay);
    };

    // Initial delay
    timeoutId = setTimeout(triggerBurst, 5000);

    return () => clearTimeout(timeoutId);
  }, [state]);

  const leftEyeStyle = useAnimatedStyle(() => ({
    height: leftEyeHeight.value,
    width: leftEyeWidth.value,
    transform: [
      { translateX: leftEyeTranslateX.value },
      { translateY: leftEyeTranslateY.value },
      { rotate: `${leftEyeRotate.value}deg` }
    ],
  }));

  const rightEyeStyle = useAnimatedStyle(() => ({
    height: rightEyeHeight.value,
    width: rightEyeWidth.value,
    transform: [
      { translateX: rightEyeTranslateX.value },
      { translateY: rightEyeTranslateY.value },
      { rotate: `${rightEyeRotate.value}deg` }
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
    backgroundColor: state === 'Alert' ? '#ff3b30' : eyeColor,
  }));

  const dynamicEyeStyle = {
    backgroundColor: eyeColor,
    shadowColor: eyeColor,
  };

  return (
    <View style={[styles.container, { transform: [{ scale }] }]}>
      <View style={styles.eyesContainer}>
        <Animated.View style={[styles.eye, dynamicEyeStyle, leftEyeStyle]} />
        <Animated.View style={[styles.eye, dynamicEyeStyle, rightEyeStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000', // High contrast black background per requirements
    borderRadius: CONTAINER_SIZE / 2, // Ensure it clips perfectly into the island
  },
  glow: {
    position: 'absolute',
    width: CONTAINER_SIZE * 1.2,
    height: CONTAINER_SIZE * 1.2,
    borderRadius: (CONTAINER_SIZE * 1.2) / 2,
    backgroundColor: '#0df', // Cyan/blue glow
  },
  eyesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: EYE_GAP,
  },
  eye: {
    borderRadius: 6, // Slight rounded edges for pixel-style block
    // backgroundColor and shadowColor are set dynamically via dynamicEyeStyle
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 5,
  },
});
