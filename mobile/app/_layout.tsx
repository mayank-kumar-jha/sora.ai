import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Buffer } from 'buffer';

// Polyfill Buffer globally for audio processing
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

import Constants from 'expo-constants';
import { useColorScheme } from '@/components/useColorScheme';
import FloatingAssistant from '../src/ui/FloatingAssistant';
import { OverlayBridge } from '../src/native/OverlayBridge';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { startBackgroundSilence, connectWs } from '../src/services/BackgroundService';

const isExpoGo = Constants.appOwnership === 'expo';

// Debug check for Native Modules
import { NativeModules } from 'react-native';
const hasSoraOverlay = !!NativeModules.SoraOverlay;
if (!hasSoraOverlay && !isExpoGo) {
  console.warn('[RootLayout] SoraOverlay native module is missing! Native features will not work.');
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('alarm-channel', {
    name: 'Alarms',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    sound: 'default'
  });

  Notifications.setNotificationChannelAsync('sora-background', {
    name: 'Sora Background',
    importance: Notifications.AndroidImportance.LOW,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Define background actions
Notifications.setNotificationCategoryAsync('sora-actions', [
  {
    identifier: 'ASK_SORA',
    buttonTitle: '🎙️ Ask Sora',
    options: {
      opensAppToForeground: false,
    },
  },
  {
    identifier: 'SEE_SCREEN',
    buttonTitle: '👁️ See Screen',
    options: {
      opensAppToForeground: false,
    },
  },
]);

const queryClient = new QueryClient();

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

import { SoraSettingsProvider } from '../src/context/SoraSettingsContext';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    console.log(`[RootLayout] Font loaded: ${loaded}, error: ${error}`);
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded) {
    return null;
  }

  return (
    <SoraSettingsProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </QueryClientProvider>
    </SoraSettingsProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // 1. Notification Permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // 2. Android Overlay Permission ("Draw over other apps")
      if (Platform.OS === 'android' && !isExpoGo) {
        try {
          const hasOverlay = await OverlayBridge.hasPermission();
          console.log(`[RootLayoutNav] Overlay permission status: ${hasOverlay}`);
          if (!hasOverlay) {
            console.log('[RootLayoutNav] Requesting overlay permission...');
            OverlayBridge.requestPermission();
          }
        } catch (err) {
          console.warn('[RootLayoutNav] Overlay permission check failed:', err);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    console.log('[RootLayoutNav] Initializing background services...');
    // Initialize background services
    // WebSocket is safe for Expo Go
    try {
      connectWs();
      // Keep-alive loop requires native module consistency, keep gated for now
      if (!isExpoGo) {
        startBackgroundSilence();
      }
    } catch (err) {
      console.error('[RootLayoutNav] Service initialization failed:', err);
    }
  }, []);

  useEffect(() => {
    // 1. Persistent Notification Trigger
    const showSoraNotification = async () => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Sora is Active",
          body: "Tap buttons below to interact from anywhere",
          categoryIdentifier: 'sora-actions',
          sticky: true,
          autoDismiss: false,
          color: '#a78bfa',
        },
        trigger: null, // show immediately
      });
    };

    showSoraNotification();

    // 2. Handle Notification Actions
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const actionId = response.actionIdentifier;
      console.log(`[Notification] Action received: ${actionId}`);

      if (actionId === 'ASK_SORA') {
        DeviceEventEmitter.emit('BACKGROUND_ASK_SORA');
      } else if (actionId === 'SEE_SCREEN') {
        DeviceEventEmitter.emit('BACKGROUND_SEE_SCREEN');
      }
    });

    return () => sub.remove();
  }, []);

  const viewShotRef = useRef(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('REQUEST_SCREENSHOT', async () => {
      try {
        console.log('[Layout] Screenshot requested...');
        const uri = await captureRef(viewShotRef, {
          format: 'jpg',
          quality: 0.8,
          result: 'base64'
        });
        DeviceEventEmitter.emit('SCREENSHOT_CAPTURED', { base64: uri });
      } catch (err) {
        console.error('Screenshot capture failed:', err);
        // IMPORTANT: Emit error so FloatingAssistant can reset its state
        DeviceEventEmitter.emit('SCREENSHOT_ERROR', { error: 'PROCESSING_FAILED' });
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <ViewShot ref={viewShotRef} style={{ flex: 1 }} options={{ format: 'jpg', quality: 0.8 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true }} />
        </Stack>
      </ViewShot>
      <FloatingAssistant />
    </ThemeProvider>
  );
}
