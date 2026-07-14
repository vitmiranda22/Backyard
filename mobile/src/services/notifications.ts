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
const reminderIds = new Map<string, string>();

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

export async function scheduleUnfinishedTourReminder(tourId: string) {
  try {
    const granted = await requestPermission();
    if (!granted) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: i18next.t("notifications.unfinishedTourTitle"),
        body: i18next.t("notifications.unfinishedTourBody"),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: UNFINISHED_TOUR_DELAY_SEC,
      },
    });
    reminderIds.set(tourId, id);
  } catch (e) {
    console.warn("Failed to schedule tour reminder:", e);
  }
}

export async function cancelReminder(tourId: string) {
  const id = reminderIds.get(tourId);
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    console.warn("Failed to cancel tour reminder:", e);
  }
  reminderIds.delete(tourId);
}
