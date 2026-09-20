// Local, on-device reminders only — no backend, no push tokens, no
// location tracking. Right now: a single nudge if a tour is left
// unfinished for a while.

import * as Notifications from "expo-notifications";
import i18next from "../i18n";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const UNFINISHED_TOUR_DELAY_SEC = 90 * 60; // 90 minutes

export async function requestPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

// This is the app's only scheduled notification, so "at most one pending
// reminder" is enforced by clearing everything scheduled and everything
// already delivered before scheduling a new one. Tracking ids in memory
// doesn't survive an app restart, which let reminders pile up.
async function clearAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}

export async function scheduleUnfinishedTourReminder(_tourId: string) {
  try {
    const granted = await requestPermission();
    if (!granted) return;
    await clearAllReminders();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18next.t("notifications.unfinishedTourTitle"),
        body: i18next.t("notifications.unfinishedTourBody"),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: UNFINISHED_TOUR_DELAY_SEC,
      },
    });
  } catch (e) {
    console.warn("Failed to schedule tour reminder:", e);
  }
}

export async function cancelReminder(_tourId: string) {
  try {
    await clearAllReminders();
  } catch (e) {
    console.warn("Failed to cancel tour reminder:", e);
  }
}
