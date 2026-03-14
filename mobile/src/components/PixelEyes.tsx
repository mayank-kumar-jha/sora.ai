import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
    withRepeat,
    interpolateColor,
    useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Mail, MessageCircle } from 'lucide-react-native';

export type EyeState = 'idle' | 'typing' | 'whatsapp' | 'email' | 'speaking' | 'thinking' | 'error';

interface PixelEyesProps {
    state: EyeState;
    amplitude?: number;
    isListening?: boolean;
    eyeColor?: string;
}

const EYE_SIZE = 80;

export default function PixelEyes({ state, amplitude = 0, isListening = false, eyeColor = '#4a9eff' }: PixelEyesProps) {
    const eyeX = useSharedValue(0);
    const eyeY = useSharedValue(0);
    const eyeScaleY = useSharedValue(1);
    const eyeScaleX = useSharedValue(1);
    const glowOpacity = useSharedValue(0.4);
    const errorColorVal = useSharedValue(0); // 0 = normal, 1 = Red

    // Handle state changes
    useEffect(() => {
        // Reset defaults
        eyeScaleY.value = withSpring(1);
        eyeScaleX.value = withSpring(1);
        errorColorVal.value = withTiming(state === 'error' ? 1 : 0, { duration: 300 });

        switch (state) {
            case 'typing':
                eyeX.value = withSpring(0);
                eyeY.value = withSpring(15);
                eyeScaleY.value = withSpring(0.9);
                break;
            case 'whatsapp':
                eyeX.value = withSpring(25);
                eyeY.value = withSpring(0);
                break;
            case 'email':
                eyeX.value = withSpring(-25);
                eyeY.value = withSpring(0);
                break;
            case 'thinking':
                eyeY.value = withSpring(-10);
                eyeScaleX.value = withSpring(1.1);
                break;
            case 'speaking':
                eyeX.value = withSpring(0);
                eyeY.value = withSpring(0);
                break;
            case 'error':
                eyeX.value = withSpring(0);
                eyeY.value = withSpring(0);
                break;
            default: // idle
                eyeX.value = withSpring(0);
                eyeY.value = withSpring(0);
        }
    }, [state]);

    // Glow pulsing logic
    useEffect(() => {
        if (isListening || state === 'speaking') {
            glowOpacity.value = withRepeat(
                withTiming(1, { duration: 400 }),
                -1,
                true
            );
        } else {
            glowOpacity.value = withTiming(0.4, { duration: 500 });
        }
    }, [isListening, state]);

    // Blink logic
    useEffect(() => {
        const blink = () => {
            if (state === 'idle' || state === 'typing') {
                eyeScaleY.value = withSequence(
                    withTiming(0.1, { duration: 100 }),
                    withTiming(1, { duration: 100 })
                );
            }
            const nextBlink = 4000 + Math.random() * 4000;
            return setTimeout(blink, nextBlink);
        };
        const timer = setTimeout(blink, 3000);
        return () => clearTimeout(timer);
    }, [state]);

    const animatedEyeStyle = useAnimatedStyle(() => {
        const scaleY = eyeScaleY.value + (state === 'speaking' ? amplitude * 0.5 : 0);
        const scaleX = eyeScaleX.value + (isListening ? amplitude * 0.2 : 0);

        return {
            transform: [
                { translateX: eyeX.value },
                { translateY: eyeY.value },
                { scaleY },
                { scaleX }
            ],
            shadowColor: state === 'error' ? '#ff4a4a' : eyeColor,
            shadowOpacity: glowOpacity.value,
            shadowRadius: 15,
            elevation: 10,
        };
    });

    const staticShadowStyle = {
        shadowOffset: { width: 0, height: 0 },
    };

    // Determine the active color (error overrides theme color)
    const activeColor = state === 'error' ? '#ff4a4a' : eyeColor;

    return (
        <View style={styles.container}>
            {/* Left Eye — inlined to prevent remount */}
            <Animated.View style={[styles.eyeWrapper, animatedEyeStyle, staticShadowStyle]}>
                <Svg width={EYE_SIZE} height={EYE_SIZE + 40} viewBox={`0 0 ${EYE_SIZE} ${EYE_SIZE + 40}`}>
                    <Defs>
                        <RadialGradient id="eyeGlowLeft" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor={activeColor} stopOpacity="0.2" />
                            <Stop offset="100%" stopColor="black" stopOpacity="1" />
                        </RadialGradient>
                    </Defs>
                    <Rect
                        x={0}
                        y={20}
                        width={EYE_SIZE}
                        height={EYE_SIZE}
                        fill="black"
                        rx={8}
                        stroke={activeColor}
                        strokeWidth={2}
                    />
                </Svg>

                <View style={styles.internalIconWrapper}>
                    {state === 'whatsapp' && <MessageCircle color="#25D366" size={24} />}
                    {state === 'email' && <Mail color="#4a9eff" size={24} />}
                </View>
            </Animated.View>

            <View style={{ width: 40 }} />

            {/* Right Eye — inlined to prevent remount */}
            <Animated.View style={[styles.eyeWrapper, animatedEyeStyle, staticShadowStyle]}>
                <Svg width={EYE_SIZE} height={EYE_SIZE + 40} viewBox={`0 0 ${EYE_SIZE} ${EYE_SIZE + 40}`}>
                    <Defs>
                        <RadialGradient id="eyeGlowRight" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%" stopColor={activeColor} stopOpacity="0.2" />
                            <Stop offset="100%" stopColor="black" stopOpacity="1" />
                        </RadialGradient>
                    </Defs>
                    <Rect
                        x={0}
                        y={20}
                        width={EYE_SIZE}
                        height={EYE_SIZE}
                        fill="black"
                        rx={8}
                        stroke={activeColor}
                        strokeWidth={2}
                    />
                </Svg>

                <View style={styles.internalIconWrapper}>
                    {state === 'whatsapp' && <MessageCircle color="#25D366" size={24} />}
                    {state === 'email' && <Mail color="#4a9eff" size={24} />}
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 180,
    },
    eyeWrapper: {
        width: EYE_SIZE,
        height: EYE_SIZE + 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
        borderRadius: 12,
    },
    internalIconWrapper: {
        position: 'absolute',
        top: '50%',
        marginTop: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
