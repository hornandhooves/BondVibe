/**
 * BondVibe Pro subscription — opens the hosted Stripe Checkout / Billing Portal.
 * The uid is taken server-side from the auth context; the Stripe webhook flips
 * users/{uid}.isPremium once payment completes.
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import * as WebBrowser from "expo-web-browser";

export const startProCheckout = async () => {
  const fn = httpsCallable(getFunctions(), "createProCheckoutSession");
  const res = await fn({});
  const url = res.data?.url;
  if (!url) throw new Error("Could not start checkout. Please try again.");
  await WebBrowser.openBrowserAsync(url);
};

export const openProPortal = async () => {
  const fn = httpsCallable(getFunctions(), "createProPortalSession");
  const res = await fn({});
  const url = res.data?.url;
  if (!url) throw new Error("Could not open the billing portal.");
  await WebBrowser.openBrowserAsync(url);
};
