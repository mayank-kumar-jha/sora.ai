import React from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import AssistantFace, { AssistantFaceState } from '../animations/AssistantFace';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  state: AssistantFaceState;
  isExpanded: boolean;
  isHalfScreen?: boolean;
  isEmpty?: boolean;
  activeTimer?: string;
  eyeColor?: string;
  onPress: () => void;
  onLongPress: () => void;
  onTripleTap?: () => void;
  children?: React.ReactNode;
}

export default function DynamicIsland({
  state,
  isExpanded,
  isHalfScreen,
  isEmpty,
  activeTimer,
  eyeColor,
  onPress,
  onLongPress,
  onTripleTap,
  children
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

    if (tapCountRef.current === 3) {
      onTripleTap?.();
      tapCountRef.current = 0;
    } else {
      setTimeout(() => {
        if (tapCountRef.current === 1) {
          onPress();
          tapCountRef.current = 0;
        } else if (tapCountRef.current === 2) {
          onPress();
          tapCountRef.current = 0;
        }
      }, 400);
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    let targetHeight = 40;
    let targetWidth = 100;
    if (isExpanded) {
      targetWidth = 340;
      targetHeight = isHalfScreen ? SCREEN_HEIGHT * 0.45 : 180;
    }

    return {
      width: withSpring(targetWidth, { damping: 22, stiffness: 180, mass: 0.8 }),
      height: withSpring(targetHeight, { damping: 22, stiffness: 180, mass: 0.8 }),
      borderRadius: withSpring(isExpanded ? 28 : 20),
    };
  });

  const childrenVisibilityStyle = useAnimatedStyle(() => {
    return {
      opacity: withDelay(
        isExpanded ? 300 : 0,
        withTiming(isExpanded ? 1 : 0, { duration: 200 })
      ),
      transform: [
        { translateY: withDelay(isExpanded ? 300 : 0, withSpring(isExpanded ? 0 : 20)) }
      ]
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    flex: 1,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: isExpanded ? 'flex-start' : 'center', // Center when in capsule
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Background Face Rendering (Only centered when empty) */}
      {isExpanded && isEmpty && (
        <View style={styles.backgroundFaceContainer} pointerEvents="none">
          {activeTimer ? (
            <Animated.Text style={styles.timerTextLarge}>{activeTimer}</Animated.Text>
          ) : (
            <AssistantFace state={state} scale={1.8} eyeColor={eyeColor} />
          )}
        </View>
      )}

      {!isExpanded ? (
        <TouchableOpacity
          style={styles.touchable}
          activeOpacity={0.9}
          onPress={handlePress}
          onLongPress={onLongPress}
        >
          <Animated.View style={contentStyle}>
            <View style={styles.faceContainer}>
              {activeTimer ? (
                <Animated.Text style={styles.timerTextSmall}>{activeTimer}</Animated.Text>
              ) : (
                <AssistantFace state={state} eyeColor={eyeColor} />
              )}
            </View>
          </Animated.View>
        </TouchableOpacity>
      ) : (
        <View style={styles.expandedWrapper}>
          <Animated.View style={contentStyle} pointerEvents="box-none">
            {!isEmpty && (
              <TouchableOpacity
                onPress={onPress}
                style={styles.faceExpanded}
              >
                {activeTimer ? (
                  <Animated.Text style={styles.timerTextBase}>{activeTimer}</Animated.Text>
                ) : (
                  <AssistantFace state={state} eyeColor={eyeColor} />
                )}
              </TouchableOpacity>
            )}

            <Animated.View style={[styles.expandedContent, childrenVisibilityStyle]} pointerEvents="box-none">
              {children}
            </Animated.View>
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
  expandedWrapper: {
    flex: 1,
  },
  backgroundFaceContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
    // Perfectly centered background face
  },
  faceContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  faceExpanded: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: 40,
    paddingTop: 20, // Align with chat content better
    zIndex: 10,
    marginLeft: 10, // Offset from the edge
  },
  expandedContent: {
    flex: 1,
    zIndex: 5,
  },
  timerTextSmall: {
    color: '#0df',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timerTextBase: {
    color: '#0df',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timerTextLarge: {
    color: '#0df',
    fontSize: 32,
    fontWeight: 'bold',
  }
});
