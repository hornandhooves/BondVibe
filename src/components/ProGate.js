/**
 * ProGate — renders children if the feature is allowed; otherwise shows a
 * LockedFeature that routes to the correct paywall (§1.8):
 *   tier 'pro'  → ProUpsell (E1→E2)
 *   tier 'plus' → PlusPaywall (C4→E3→E4)
 * `on:false` (kill-switch) renders nothing at all.
 *
 *   <ProGate feature="host_copilot" title="Draft with AI" valueLine="...">
 *     <DraftWithAI />
 *   </ProGate>
 */
import React from "react";
import { useNavigation } from "@react-navigation/native";
import useEntitlement from "../hooks/useEntitlement";
import LockedFeature from "./LockedFeature";

export function paywallRouteForTier(tier) {
  return tier === "plus" ? "PlusPaywall" : "ProUpsell";
}

export default function ProGate({
  feature,
  title,
  valueLine,
  children,
  fallback, // optional custom locked-state render
  paywallParams,
}) {
  const navigation = useNavigation();
  const { allowed, tier, reason, freeTaste } = useEntitlement(feature);

  if (allowed) return children;
  if (reason === "off") return null; // kill-switched — hide entirely

  const goToPaywall = () =>
    navigation.navigate(paywallRouteForTier(tier), { from: feature, ...paywallParams });

  if (fallback) return fallback({ tier, freeTaste, goToPaywall });

  return (
    <LockedFeature
      tier={tier}
      title={title}
      valueLine={valueLine || freeTaste}
      onUnlock={goToPaywall}
    />
  );
}
