/**
 * i18n bootstrap (kinlo_build/04_I18N_SPEC.md, Layer 1).
 * i18next + react-i18next, device-locale detection via expo-localization,
 * choice persisted to AsyncStorage + users/{uid}.language, fallback `en`.
 *
 * Only `en` and `es` ship translated for now; the other 12 supported codes
 * resolve through fallback until their locale files land (incremental).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { APP_LANGUAGE_CODES } from "./languages";

import en from "./locales/en.json";
import es from "./locales/es.json";

const STORAGE_KEY = "kinlo.language";

// Bundled translations. Add a code here as its locale file is created.
const resources = {
  en: { translation: en },
  es: { translation: es },
};

/**
 * Best supported UI language for the device (exact tag → base code → `en`).
 * Only resolves to a language the APP UI actually ships (APP_LANGUAGE_CODES)
 * — a device set to, say, French should still land on English UI, not a
 * language the app doesn't have strings for.
 */
export function resolveDeviceLanguage() {
  const locales = (Localization.getLocales && Localization.getLocales()) || [];
  for (const loc of locales) {
    if (loc.languageTag && APP_LANGUAGE_CODES.includes(loc.languageTag)) {
      return loc.languageTag;
    }
    if (loc.languageCode && APP_LANGUAGE_CODES.includes(loc.languageCode)) {
      return loc.languageCode;
    }
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLanguage(),
  fallbackLng: {
    "nl-BE": ["nl", "en"],
    default: ["en"],
  },
  interpolation: { escapeValue: false },
  returnNull: false,
  compatibilityJSON: "v4",
});

// Apply the user's persisted choice (async) once, overriding device default.
AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored && stored !== i18n.language && APP_LANGUAGE_CODES.includes(stored)) {
      i18n.changeLanguage(stored);
    }
  })
  .catch(() => {});

/**
 * Switch the whole app's UI language and persist it (device + profile).
 * @param {string} code one of APP_LANGUAGE_CODES (en/es today)
 */
export async function setAppLanguage(code) {
  if (!APP_LANGUAGE_CODES.includes(code)) return;
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    // non-fatal
  }
  try {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (uid) {
      await setDoc(doc(db, "users", uid), { language: code }, { merge: true });
    }
  } catch (e) {
    // non-fatal — device persistence already holds the choice
  }
}

/** Current active language code. */
export const getAppLanguage = () => i18n.language;

export default i18n;
