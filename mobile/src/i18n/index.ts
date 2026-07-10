// i18n setup — manual language selection (stored via expo-secure-store,
// same as the onboarding-complete flag), not device-locale auto-detection.
// Auto-detection would need expo-localization, a native module that isn't
// installed yet and would need a fresh native build before it worked;
// starting with a manual switcher in Settings ships immediately via OTA,
// and device-locale detection can be layered on top later without
// touching any of the translation work below.

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import * as SecureStore from "expo-secure-store";

import en from "./locales/en.json";
import es from "./locales/es.json";

export const LANGUAGE_KEY = "app_language";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  // react-i18next suspense integration isn't set up here — every screen
  // uses useTranslation() synchronously, so keep this off.
  react: { useSuspense: false },
});

export async function loadSavedLanguage() {
  try {
    const saved = await SecureStore.getItemAsync(LANGUAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      await i18next.changeLanguage(saved);
    }
  } catch (e) {
    console.warn("Failed to load saved language:", e);
  }
}

export async function setLanguage(code: string) {
  await i18next.changeLanguage(code);
  try {
    await SecureStore.setItemAsync(LANGUAGE_KEY, code);
  } catch (e) {
    console.warn("Failed to save language preference:", e);
  }
}

export default i18next;
