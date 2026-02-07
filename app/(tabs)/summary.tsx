import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DailyCheckin } from '@/utils/checkinStorage';
import { loadAllCheckins, purgeCheckinsOlderThan } from '@/utils/checkinStorage';

function localDateFromDateKey(dateKey: string): Date {
  // dateKey is YYYY-MM-DD in device local date.
  const [y, m, d] = dateKey.split('-').map((p) => Number(p));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = useMemo(() => {
    const background = isDark ? '#000000' : '#FFFFFF';
    const foreground = isDark ? '#FFFFFF' : '#000000';
    const muted = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.70)';
    const border = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
    return { background, foreground, muted, border };
  }, [isDark]);

  const [all, setAll] = useState<DailyCheckin[]>([]);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 60 | 90>(30);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        await purgeCheckinsOlderThan(90);
        const items = await loadAllCheckins();
        if (cancelled) return;
        // Newest first
        setAll([...items].sort((a, b) => b.dateKey.localeCompare(a.dateKey)));
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const rangeData = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    cutoff.setDate(cutoff.getDate() - (rangeDays - 1));

    const inRange = all.filter((c) => localDateFromDateKey(c.dateKey) >= cutoff);

    return {
      inRange,
      count: inRange.length,
      energyAvg: average(inRange.map((c) => c.energy)),
      moodAvg: average(inRange.map((c) => c.mood)),
      focusAvg: average(inRange.map((c) => c.focus)),
    };
  }, [all, rangeDays]);

  const dateFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit' });
    } catch {
      return null;
    }
  }, []);

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 30 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.header, { backgroundColor: colors.background }]}>
          <ThemedText type="title" style={styles.title}>
            Summary
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select summary range"
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            style={({ pressed }) => [styles.rangeButton, pressed && { opacity: 0.75 }]}>
            <ThemedText
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.subtitle, { color: colors.muted }]}>
              Last {rangeDays} days avg. ({rangeData.count} track) ▾
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={[styles.card, { backgroundColor: colors.background }]}>
          <StatRow label="Energy" value={rangeData.energyAvg} />
          <Divider borderColor={colors.border} />
          <StatRow label="Mood" value={rangeData.moodAvg} />
          <Divider borderColor={colors.border} />
          <StatRow label="Focus" value={rangeData.focusAvg} />
        </ThemedView>

        <ThemedView style={[styles.listCard, { backgroundColor: colors.background }]}>
          <View style={[styles.tableHeader, { borderColor: colors.border }]}>
            <ThemedText type="defaultSemiBold" style={[styles.colDate, { color: colors.muted }]}>Date</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.colNum, { color: colors.muted }]}>E</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.colNum, { color: colors.muted }]}>M</ThemedText>
            <ThemedText type="defaultSemiBold" style={[styles.colNum, { color: colors.muted }]}>F</ThemedText>
          </View>

          {rangeData.inRange.length === 0 ? (
            <ThemedText style={[styles.emptyText, { color: colors.muted }]}>No tracks yet.</ThemedText>
          ) : (
            rangeData.inRange.map((c) => {
              const date = localDateFromDateKey(c.dateKey);
              const dateText = dateFormatter ? dateFormatter.format(date) : date.toLocaleDateString();

              return (
                <View key={c.dateKey} style={[styles.row, { borderColor: colors.border }]}> 
                  <ThemedText style={[styles.colDate, { color: colors.foreground }]}>{dateText}</ThemedText>
                  <ThemedText style={[styles.colNum, { color: colors.foreground }]}>{c.energy}</ThemedText>
                  <ThemedText style={[styles.colNum, { color: colors.foreground }]}>{c.mood}</ThemedText>
                  <ThemedText style={[styles.colNum, { color: colors.foreground }]}>{c.focus}</ThemedText>
                </View>
              );
            })
          )}
        </ThemedView>

        <Modal
          transparent
          visible={menuOpen}
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
            <View style={[styles.menuSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
              accessibilityRole="menu">
              <MenuItem
                label="Last 7 days"
                selected={rangeDays === 7}
                onPress={() => {
                  setRangeDays(7);
                  setMenuOpen(false);
                }}
                borderColor={colors.border}
              />
              <MenuItem
                label="Last 30 days"
                selected={rangeDays === 30}
                onPress={() => {
                  setRangeDays(30);
                  setMenuOpen(false);
                }}
                borderColor={colors.border}
              />
              <MenuItem
                label="Last 60 days"
                selected={rangeDays === 60}
                onPress={() => {
                  setRangeDays(60);
                  setMenuOpen(false);
                }}
                borderColor={colors.border}
              />
              <MenuItem
                label="Last 90 days"
                selected={rangeDays === 90}
                onPress={() => {
                  setRangeDays(90);
                  setMenuOpen(false);
                }}
                borderColor={colors.border}
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </ThemedView>
  );
}

function MenuItem({
  label,
  selected,
  onPress,
  borderColor,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  borderColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { borderColor },
        pressed && styles.menuItemPressed,
      ]}>
      <ThemedText type={selected ? 'defaultSemiBold' : 'default'}>{label}</ThemedText>
    </Pressable>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  const display = Number.isFinite(value) ? value.toFixed(1) : '0.0';
  return (
    <View style={styles.statRow}>
      <ThemedText type="subtitle">{label}</ThemedText>
      <ThemedText type="defaultSemiBold" style={styles.statValue}>
        {display}
      </ThemedText>
    </View>
  );
}

function Divider({ borderColor }: { borderColor: string }) {
  return <View style={[styles.divider, { borderColor }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    gap: 6,
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    opacity: 0.7,
    textAlign: 'center',
    flexShrink: 1,
  },
  rangeButton: {
    alignItems: 'center',
    maxWidth: '100%',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    // No outer border; only internal dividers.
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  statValue: {
    fontSize: 18,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  listCard: {
    // Not a "panel"; just a list area.
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colDate: {
    flex: 2,
  },
  colNum: {
    flex: 1,
    textAlign: 'right',
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    opacity: 0.7,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  menuSheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(127,127,127,0.10)',
  },
});
