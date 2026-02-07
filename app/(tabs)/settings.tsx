import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
    cancelAllReminders,
    loadReminderSettings,
    requestReminderPermissions,
    saveReminderSettings,
    scheduleDailyReminder,
    type ReminderSettings,
} from '@/utils/reminderStorage';

import { clearAllCheckins } from '@/utils/checkinStorage';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = useMemo(() => {
    const background = isDark ? '#000000' : '#FFFFFF';
    const foreground = isDark ? '#FFFFFF' : '#000000';
    const muted = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.70)';
    const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
    const track = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
    const pressed = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    return { background, foreground, muted, border, track, pressed };
  }, [isDark]);

  const [settings, setSettings] = useState<ReminderSettings>({ enabled: false, hour: 20, minute: 0 });

  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const resetDeleteLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteButtonLabel, setDeleteButtonLabel] = useState('Delete all track');
  const deleteButtonLabelOpacity = useRef(new Animated.Value(1)).current;

  const [statusLabel, setStatusLabel] = useState('');
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const loaded = await loadReminderSettings();
        if (cancelled) return;
        setSettings(loaded);
      }
      load();
      return () => {
        cancelled = true;
        if (resetDeleteLabelTimeoutRef.current) {
          clearTimeout(resetDeleteLabelTimeoutRef.current);
          resetDeleteLabelTimeoutRef.current = null;
        }
      };
    }, [])
  );

  useEffect(() => {
    const nextLabel =
      deleteState === 'deleting' ? 'Deleting...' : deleteState === 'error' ? 'Error' : 'Delete all track';

    if (nextLabel === deleteButtonLabel) return;

    deleteButtonLabelOpacity.stopAnimation();
    Animated.timing(deleteButtonLabelOpacity, {
      toValue: 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setDeleteButtonLabel(nextLabel);
      Animated.timing(deleteButtonLabelOpacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [deleteButtonLabel, deleteButtonLabelOpacity, deleteState]);

  const timeText = useMemo(() => {
    const d = new Date();
    d.setHours(settings.hour, settings.minute, 0, 0);
    try {
      return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
    } catch {
      return `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`;
    }
  }, [settings.hour, settings.minute]);

  const showTransientStatus = useCallback(
    (text: string) => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusOpacity.stopAnimation();
      setStatusLabel(text);
      Animated.timing(statusOpacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      statusTimeoutRef.current = setTimeout(() => {
        Animated.timing(statusOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, 1200);
    },
    [statusOpacity]
  );

  const persist = useCallback(
    async (next: ReminderSettings) => {
      try {
        // Cancel any existing schedules (including legacy/duplicate ones)
        await cancelAllReminders();

        let notificationId = next.notificationId;
        if (next.enabled) {
          const ok = await requestReminderPermissions();
          if (!ok) {
            notificationId = undefined;
            const disabled: ReminderSettings = { ...next, enabled: false, notificationId: undefined };
            setSettings(disabled);
            await saveReminderSettings(disabled);
            showTransientStatus('Notifications not allowed');
            return;
          }

          notificationId = await scheduleDailyReminder({ hour: next.hour, minute: next.minute });
        } else {
          notificationId = undefined;
        }

        const saved: ReminderSettings = { ...next, notificationId };
        setSettings(saved);
        await saveReminderSettings(saved);
        showTransientStatus('Saved');
      } catch {
        showTransientStatus('Error');
      }
    },
    [showTransientStatus]
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 30 }]}>
      <ThemedView style={[styles.header, { backgroundColor: colors.background }]}>
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={styles.row}>
          <ThemedText type="subtitle">Reminder</ThemedText>
          <Switch
            value={settings.enabled}
            onValueChange={(enabled) => {
              void persist({ ...settings, enabled });
            }}
            trackColor={{ false: colors.track, true: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }}
            thumbColor={isDark ? '#FFFFFF' : '#000000'}
          />
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <View style={styles.timeRow}>
          <ThemedText style={[styles.timeLabel, { color: colors.muted }]}>Time</ThemedText>
          <ThemedText type="defaultSemiBold">{timeText}</ThemedText>
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <View style={styles.sliderBlock}>
          <ThemedText style={[styles.sliderLabel, { color: colors.muted }]}>Hour</ThemedText>
          <Slider
            value={settings.hour}
            onValueChange={(v) => setSettings((prev) => ({ ...prev, hour: Math.round(v) }))}
            onSlidingComplete={() => {
              void persist(settings);
            }}
            minimumValue={0}
            maximumValue={23}
            step={1}
            minimumTrackTintColor={colors.foreground}
            maximumTrackTintColor={colors.track}
            thumbTintColor={Platform.OS === 'android' ? colors.foreground : undefined}
            disabled={!settings.enabled}
          />
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <View style={styles.sliderBlock}>
          <ThemedText style={[styles.sliderLabel, { color: colors.muted }]}>Minute</ThemedText>
          <Slider
            value={settings.minute}
            onValueChange={(v) => setSettings((prev) => ({ ...prev, minute: Math.round(v) }))}
            onSlidingComplete={() => {
              void persist(settings);
            }}
            minimumValue={0}
            maximumValue={59}
            step={1}
            minimumTrackTintColor={colors.foreground}
            maximumTrackTintColor={colors.track}
            thumbTintColor={Platform.OS === 'android' ? colors.foreground : undefined}
            disabled={!settings.enabled}
          />
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <Animated.View style={[styles.statusLine, { opacity: statusOpacity }]}>
          <ThemedText style={[styles.statusText, { color: colors.muted }]}>
            {statusLabel}
          </ThemedText>
        </Animated.View>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={styles.row}>
          <ThemedText type="subtitle">Data</ThemedText>
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <Pressable
          accessibilityRole="button"
          disabled={deleteState === 'deleting'}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: '#000000',
              borderColor: isDark ? '#FFFFFF' : '#000000',
            },
            (pressed && deleteState !== 'deleting') && [styles.saveButtonPressed, { backgroundColor: '#111111' }],
            deleteState === 'deleting' && styles.saveButtonDisabled,
          ]}
          onPress={() => {
            Alert.alert(
              'Delete all track?',
              'This will delete all saved tracks on this device. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeleteState('deleting');
                      await clearAllCheckins();
                      showTransientStatus('Deleted');

                      if (resetDeleteLabelTimeoutRef.current) {
                        clearTimeout(resetDeleteLabelTimeoutRef.current);
                      }
                      resetDeleteLabelTimeoutRef.current = setTimeout(() => {
                        setDeleteState('idle');
                      }, 700);
                    } catch {
                      setDeleteState('error');
                      showTransientStatus('Error');

                      if (resetDeleteLabelTimeoutRef.current) {
                        clearTimeout(resetDeleteLabelTimeoutRef.current);
                      }
                      resetDeleteLabelTimeoutRef.current = setTimeout(() => {
                        setDeleteState('idle');
                      }, 1200);
                    }
                  },
                },
              ]
            );
          }}>
          <Animated.View style={{ opacity: deleteButtonLabelOpacity }}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.saveButtonText, { color: '#FFFFFF' }]}
              numberOfLines={1}
              suppressHighlighting>
              {deleteButtonLabel}
            </ThemedText>
          </Animated.View>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 6,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
    // No outer border; only internal dividers.
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  timeLabel: {
    opacity: 0.7,
  },
  sliderBlock: {
    gap: 6,
  },
  sliderLabel: {
    opacity: 0.7,
  },
  saveButton: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  saveButtonPressed: {
    transform: [{ scale: 0.985 }],
  },
  saveButtonDisabled: {
    opacity: 0.85,
  },
  saveButtonText: {
    lineHeight: 20,
  },
  statusLine: {
    minHeight: 22,
    alignItems: 'center',
  },
  statusText: {
    opacity: 0.7,
  },
});
