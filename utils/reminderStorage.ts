import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type ReminderSettings = {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
  notificationId?: string;
};

const STORAGE_KEY = 'checkin:reminder-v1';
const REMINDER_KIND = 'checkin:daily-reminder-v1';
const LEGACY_TITLE = 'Reminder';
const LEGACY_BODY = "Time to add today's track.";

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { enabled: false, hour: 20, minute: 0 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    const hour = typeof parsed.hour === 'number' ? clampInt(parsed.hour, 0, 23) : 20;
    const minute = typeof parsed.minute === 'number' ? clampInt(parsed.minute, 0, 59) : 0;
    const enabled = Boolean(parsed.enabled);
    const notificationId = typeof parsed.notificationId === 'string' ? parsed.notificationId : undefined;
    return { enabled, hour, minute, notificationId };
  } catch {
    return { enabled: false, hour: 20, minute: 0 };
  }
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function hasReminderPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return Boolean(current.granted);
}

export async function cancelReminder(notificationId?: string): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ignore
  }
}

function isReminderRequest(req: Notifications.NotificationRequest): boolean {
  const data = (req.content?.data ?? {}) as Record<string, unknown>;
  if (data.kind === REMINDER_KIND) return true;

  // Back-compat: older versions didn't tag data.
  return req.content?.title === LEGACY_TITLE && req.content?.body === LEGACY_BODY;
}

/**
 * Cancels all scheduled reminders created by this app (including legacy ones).
 * Returns how many schedules were cancelled.
 */
export async function cancelAllReminders(): Promise<number> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = scheduled.filter(isReminderRequest);
    await Promise.all(
      toCancel.map(async (req) => {
        try {
          await Notifications.cancelScheduledNotificationAsync(req.identifier);
        } catch {
          // ignore
        }
      })
    );
    return toCancel.length;
  } catch {
    // As a fallback (should be rare), cancel everything scheduled by the app.
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return -1;
    } catch {
      return 0;
    }
  }
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function scheduleDailyReminder(params: {
  hour: number;
  minute: number;
}): Promise<string> {
  await ensureAndroidChannel();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder',
      body: 'Time to add today\'s track.',
      sound: true,
      data: {
        kind: REMINDER_KIND,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: clampInt(params.hour, 0, 23),
      minute: clampInt(params.minute, 0, 59),
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
}

export async function requestReminderPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Ensures we have at most one scheduled daily reminder matching the stored settings.
 * Useful for cleaning up duplicates left from earlier installs/bugs.
 */
export async function reconcileReminderSchedule(settings: ReminderSettings): Promise<ReminderSettings> {
  if (!settings.enabled) return settings;

  const granted = await hasReminderPermissions();
  if (!granted) return settings;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = scheduled.filter(isReminderRequest);

  // Nothing scheduled: create it.
  if (reminders.length === 0) {
    const notificationId = await scheduleDailyReminder({ hour: settings.hour, minute: settings.minute });
    return { ...settings, notificationId };
  }

  // Exactly one scheduled: sync stored id if needed.
  if (reminders.length === 1) {
    const onlyId = reminders[0]?.identifier;
    if (onlyId && onlyId !== settings.notificationId) {
      return { ...settings, notificationId: onlyId };
    }
    return settings;
  }

  // More than one scheduled: cancel all and schedule a single new one.
  await cancelAllReminders();
  const notificationId = await scheduleDailyReminder({ hour: settings.hour, minute: settings.minute });
  return { ...settings, notificationId };
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.trunc(value);
  return Math.min(max, Math.max(min, n));
}
