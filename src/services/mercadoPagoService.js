/**
 * Mercado Pago — client side (Checkout Pro hosted checkout).
 * Calls the createMercadoPagoPreference function and opens the hosted checkout
 * in the browser. Enrollment is finalized server-side by the mercadoPagoWebhook
 * (adds the buyer to attendees), so the client just waits for attendance.
 */
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { auth } from "./firebase";

const PROJECT =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "bondvibe-dev";
const FN_URL = `https://us-central1-${PROJECT}.cloudfunctions.net/createMercadoPagoPreference`;

/** Create a Checkout Pro preference; returns { preferenceId, initPoint, sandboxInitPoint }. */
export const createMercadoPagoPreference = async (eventId, eventPriceCentavos) => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ eventId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Could not start Mercado Pago checkout");
  }
  return res.json();
};

/** Open the Mercado Pago hosted checkout in the browser (sandbox in dev). */
export const startMercadoPagoCheckout = async (eventId, eventPriceCentavos) => {
  const { initPoint, sandboxInitPoint } = await createMercadoPagoPreference(
    eventId,
    eventPriceCentavos
  );
  const url = __DEV__ ? sandboxInitPoint || initPoint : initPoint;
  await WebBrowser.openBrowserAsync(url);
};
