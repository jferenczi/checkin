import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
    getLocalDateKey,
    loadAllCheckins,
    loadCheckinForDate,
    purgeCheckinsOlderThan,
    upsertTodayCheckin,
} from '@/utils/checkinStorage';

export default function HomeScreen() {
  const [energy, setEnergy] = useState(5);
  const [mood, setMood] = useState(5);
  const [focus, setFocus] = useState(5);

  const [savedCount, setSavedCount] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const resetSaveLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [buttonLabel, setButtonLabel] = useState('Save');
  const buttonLabelOpacity = useRef(new Animated.Value(1)).current;

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = useMemo(() => {
    const background = isDark ? '#000000' : '#FFFFFF';
    const foreground = isDark ? '#FFFFFF' : '#000000';
    const muted = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.70)';
    const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
    const track = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
    return { background, foreground, muted, border, track };
  }, [isDark]);

  const sliderColor = colors.foreground;

  const todayText = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date());
    } catch {
      return new Date().toLocaleDateString();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      await purgeCheckinsOlderThan(90);

      const todayKey = getLocalDateKey();
      const existing = await loadCheckinForDate(todayKey);

      const all = await loadAllCheckins();
      if (cancelled) return;
      setSavedCount(all.length);

      if (existing) {
        setEnergy(existing.energy);
        setMood(existing.mood);
        setFocus(existing.focus);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
      if (resetSaveLabelTimeoutRef.current) {
        clearTimeout(resetSaveLabelTimeoutRef.current);
        resetSaveLabelTimeoutRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function refreshCount() {
        await purgeCheckinsOlderThan(90);
        const all = await loadAllCheckins();
        if (cancelled) return;
        setSavedCount(all.length);
      }

      void refreshCount();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    const nextLabel = saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Error' : 'Save';
    if (nextLabel === buttonLabel) return;

    buttonLabelOpacity.stopAnimation();
    Animated.timing(buttonLabelOpacity, {
      toValue: 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setButtonLabel(nextLabel);
      Animated.timing(buttonLabelOpacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [buttonLabel, buttonLabelOpacity, saveState]);

  return (
    <ThemedView
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 30,
        },
      ]}>
      <ThemedView style={[styles.header, { backgroundColor: colors.background }]}>
        <ThemedText type="title" style={styles.title}>
          Daily check-in
        </ThemedText>
        <ThemedText style={[styles.dateText, { color: colors.muted }]}>{todayText}</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { backgroundColor: colors.background }]}>
        <MetricSlider
          label="Energy"
          value={energy}
          onValueChange={setEnergy}
          accentColor={sliderColor}
          trackColor={colors.track}
        />
        <View style={[styles.divider, { borderColor: colors.border }]} />
        <MetricSlider
          label="Mood"
          value={mood}
          onValueChange={setMood}
          accentColor={sliderColor}
          trackColor={colors.track}
        />
        <View style={[styles.divider, { borderColor: colors.border }]} />
        <MetricSlider
          label="Focus"
          value={focus}
          onValueChange={setFocus}
          accentColor={sliderColor}
          trackColor={colors.track}
        />
      </ThemedView>

      <ThemedView style={[styles.footer, { backgroundColor: colors.background }]}>
        <Pressable
          accessibilityRole="button"
          disabled={saveState === 'saving'}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: '#000000',
              borderColor: isDark ? '#FFFFFF' : '#000000',
            },
            pressed && saveState !== 'saving' && styles.saveButtonPressed,
            saveState === 'saving' && styles.saveButtonDisabled,
          ]}
          onPress={async () => {
            try {
              setSaveState('saving');
              await upsertTodayCheckin({ energy, mood, focus });
              const all = await loadAllCheckins();
              setSavedCount(all.length);

              if (resetSaveLabelTimeoutRef.current) {
                clearTimeout(resetSaveLabelTimeoutRef.current);
              }
              resetSaveLabelTimeoutRef.current = setTimeout(() => {
                setSaveState('idle');
              }, 700);
            } catch {
              setSaveState('error');
              if (resetSaveLabelTimeoutRef.current) {
                clearTimeout(resetSaveLabelTimeoutRef.current);
              }
              resetSaveLabelTimeoutRef.current = setTimeout(() => {
                setSaveState('idle');
              }, 1200);
            }
          }}>
          <Animated.View style={{ opacity: buttonLabelOpacity }}>
            <ThemedText
              type="defaultSemiBold"
              style={styles.saveButtonText}
              numberOfLines={1}
              suppressHighlighting>
              {buttonLabel}
            </ThemedText>
          </Animated.View>
        </Pressable>

        <ThemedText style={[styles.savedCountText, { color: colors.muted }]}>Track count: {savedCount}</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

function MetricSlider({
  label,
  value,
  onValueChange,
  accentColor,
  trackColor,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  accentColor: string;
  trackColor: string;
}) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <ThemedText type="subtitle">{label}</ThemedText>
        <ThemedText type="defaultSemiBold">{value}</ThemedText>
      </View>
      <Slider
        value={value}
        onValueChange={(next) => onValueChange(Math.round(next))}
        minimumValue={1}
        maximumValue={10}
        step={1}
        minimumTrackTintColor={accentColor}
        maximumTrackTintColor={trackColor}
        thumbTintColor={Platform.OS === 'android' ? accentColor : undefined}
      />
      <View style={styles.metricScale}>
        <ThemedText style={styles.scaleText}>1</ThemedText>
        <ThemedText style={styles.scaleText}>10</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 6,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  dateText: {
    opacity: 0.7,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricRow: {
    gap: 10,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    opacity: 0.6,
  },
  footer: {
    gap: 8,
    alignItems: 'center',
    paddingTop: 8,
  },
  saveButton: {
    minWidth: 160,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  saveButtonPressed: {
    opacity: 0.92,
  },
  saveButtonDisabled: {
    opacity: 0.85,
  },
  saveButtonText: {
    color: '#FFFFFF',
    lineHeight: 20,
  },
  savedCountText: {
    opacity: 0.7,
  },
});
