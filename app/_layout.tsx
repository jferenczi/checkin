import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadReminderSettings, reconcileReminderSchedule, saveReminderSettings } from '@/utils/reminderStorage';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep the native splash visible until the first layout pass.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [bootVisible, setBootVisible] = useState(true);
  const bootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [appIsLaidOut, setAppIsLaidOut] = useState(false);

  const themeBackground = useMemo(() => (colorScheme === 'dark' ? '#000000' : '#FFFFFF'), [colorScheme]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function reconcile() {
      try {
        const settings = await loadReminderSettings();
        if (cancelled || !settings.enabled) return;

        const next = await reconcileReminderSchedule(settings);
        if (cancelled) return;

        if (next.notificationId !== settings.notificationId) {
          await saveReminderSettings(next);
        }
      } catch {
        // ignore
      }
    }

    void reconcile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appIsLaidOut) return;

    // Now that React Native has rendered at least once, hide the native splash.
    void SplashScreen.hideAsync();

    // Keep the boot overlay briefly so the user sees a stable loading state.
    if (bootTimerRef.current) clearTimeout(bootTimerRef.current);
    bootTimerRef.current = setTimeout(() => {
      setBootVisible(false);
    }, 650);

    return () => {
      if (bootTimerRef.current) {
        clearTimeout(bootTimerRef.current);
        bootTimerRef.current = null;
      }
    };
  }, [appIsLaidOut]);

  const onRootLayout = useCallback(() => {
    setAppIsLaidOut(true);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={[styles.root, { backgroundColor: themeBackground }]} onLayout={onRootLayout}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        {bootVisible ? <BootOverlay /> : null}
      </View>
    </ThemeProvider>
  );
}

function BootOverlay() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.45,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    anim.start();
    return () => {
      anim.stop();
    };
  }, [opacity, scale]);

  return (
    <View pointerEvents="auto" style={styles.bootOverlay}>
      <Animated.View style={[styles.bootDot, { opacity, transform: [{ scale }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bootOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
});
