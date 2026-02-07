import AsyncStorage from '@react-native-async-storage/async-storage';

export type DailyCheckin = {
  dateKey: string; // YYYY-MM-DD (device local date)
  energy: number;
  mood: number;
  focus: number;
  updatedAt: number; // epoch ms
};

const STORAGE_KEY = 'checkin:daily-v1';

function localDateFromDateKey(dateKey: string): Date {
  // dateKey is YYYY-MM-DD in device local date.
  const [y, m, d] = dateKey.split('-').map((p) => Number(p));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export async function clearAllCheckins(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Retention helper: keeps only the last N days (inclusive of today).
 * Returns the number of removed records.
 */
export async function purgeCheckinsOlderThan(days = 90): Promise<number> {
  const all = await loadAllCheckins();
  if (all.length === 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setDate(cutoff.getDate() - (Math.max(1, days) - 1));

  const kept = all.filter((c) => localDateFromDateKey(c.dateKey) >= cutoff);
  if (kept.length === all.length) return 0;

  await saveAllCheckins(kept);
  return all.length - kept.length;
}

async function saveAllCheckins(checkins: DailyCheckin[]): Promise<void> {
  const normalized = [...checkins].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadAllCheckins(): Promise<DailyCheckin[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is DailyCheckin => {
        if (!item || typeof item !== 'object') return false;
        const maybe = item as Record<string, unknown>;
        return (
          typeof maybe.dateKey === 'string' &&
          typeof maybe.energy === 'number' &&
          typeof maybe.mood === 'number' &&
          typeof maybe.focus === 'number' &&
          typeof maybe.updatedAt === 'number'
        );
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  } catch {
    return [];
  }
}

export async function loadCheckinForDate(dateKey: string): Promise<DailyCheckin | null> {
  const all = await loadAllCheckins();
  return all.find((c) => c.dateKey === dateKey) ?? null;
}

export async function upsertTodayCheckin(values: {
  energy: number;
  mood: number;
  focus: number;
  date?: Date;
}): Promise<DailyCheckin> {
  const dateKey = getLocalDateKey(values.date);
  const updatedAt = Date.now();

  const all = await loadAllCheckins();
  const next: DailyCheckin = {
    dateKey,
    energy: values.energy,
    mood: values.mood,
    focus: values.focus,
    updatedAt,
  };

  const existingIndex = all.findIndex((c) => c.dateKey === dateKey);
  if (existingIndex >= 0) {
    all[existingIndex] = next;
  } else {
    all.push(next);
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return next;
}
