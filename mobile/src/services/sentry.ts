// Sentry crash reporting — scaffolded, inactive until SENTRY_DSN in
// config.ts is set. A blank DSN makes Sentry.init() a harmless no-op, so
// this is safe to call unconditionally at startup.

import * as Sentry from "@sentry/react-native";
import { SENTRY_DSN } from "../config";

export function initSentry() {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    // 1.0 traced every single transaction from every user -- real ongoing
    // per-session overhead for no benefit once the app has real traffic.
    // 0.2 still gives a representative performance sample without it.
    tracesSampleRate: 0.2,
  });
}
