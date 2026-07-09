// Haptics — thin wrapper so call sites stay terse and the feel can be
// tuned in one place. tap() for selections, success() for completion
// moments (tour finished, rating submitted, route published).

import * as Haptics from "expo-haptics";

export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
