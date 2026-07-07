/**
 * entitlements.js — THE ONLY place to decide what is Pro / Plus / Free.
 * (kinlo_build/01_REDESIGN_SPEC.md §1.8)
 *
 * Never hardcode a tier check in a screen — always read this via
 * useEntitlement / <ProGate>. Changing a feature's tier = editing one line here.
 *
 * tier: 'free' | 'pro' | 'plus'
 * audience: 'host' | 'attendee'
 * on: false = kill-switch (feature hidden everywhere)
 * freeTaste: what a free user gets before the paywall (omit = hard gate).
 *   To harden into a full wall later, delete the freeTaste field (one line).
 */
export const FEATURES = {
  // key                      tier      audience      on
  community_matching_host: { tier: 'pro', audience: 'host', on: true }, // existing → stays Pro
  ratings_ai_coaching: { tier: 'pro', audience: 'host', on: true }, // existing → stays Pro
  matching_unlimited_likes: { tier: 'plus', audience: 'attendee', on: true }, // existing → Kinlo Plus
  // ── new AI features · FREEMIUM: full AI = Plus/Pro, but a free "taste" prevents churn ──
  smart_wall: {
    tier: 'plus',
    audience: 'attendee',
    on: true,
    freeTaste: 'ranked feed works; "why you\'re seeing this" on 3 posts/day',
  },
  ask_kinlo: {
    tier: 'plus',
    audience: 'attendee',
    on: true,
    freeTaste: '3 questions / week',
  },
  weekly_digest: {
    tier: 'plus',
    audience: 'attendee',
    on: true,
    freeTaste: 'monthly instead of weekly',
  },
  match_intel: {
    tier: 'plus',
    audience: 'attendee',
    on: true,
    freeTaste: 'see the rationale; icebreakers locked',
  },
  host_copilot: {
    tier: 'pro',
    audience: 'host',
    on: true,
    freeTaste: '1 AI draft, then Pro',
  },
  member_intel: { tier: 'pro', audience: 'host', on: true }, // Pro only
  content_translation: {
    tier: 'plus',
    audience: 'attendee',
    on: true,
    freeTaste: '1 translation / month', // Pro hosts included (server gate)
  },
  ai_analytics: {
    tier: 'pro',
    audience: 'host',
    on: true,
    freeTaste: 'headline number; full read = Pro',
  },
  // ── Kinlo for Business (host ERP/CRM) — the whole module is Pro (hard gate) ──
  business_erp: { tier: 'pro', audience: 'host', on: true },
};

/**
 * Pure resolver — given a feature key and the user's subscription state,
 * returns the entitlement. Kept pure (no React) so it's unit-testable and
 * reusable server-side if ever needed.
 *
 * @param {string} featureKey
 * @param {{ isPro: boolean, isPlus: boolean }} subs
 * @returns {{ allowed: boolean, tier: string, reason: 'ok'|'needs_pro'|'needs_plus'|'off'|'unknown', freeTaste?: string }}
 */
export function resolveEntitlement(featureKey, { isPro = false, isPlus = false } = {}) {
  const f = FEATURES[featureKey];
  if (!f) return { allowed: false, tier: 'free', reason: 'unknown' };
  if (!f.on) return { allowed: false, tier: f.tier, reason: 'off' };
  if (f.tier === 'free') return { allowed: true, tier: 'free', reason: 'ok' };
  if (f.tier === 'pro') {
    return isPro
      ? { allowed: true, tier: 'pro', reason: 'ok' }
      : { allowed: false, tier: 'pro', reason: 'needs_pro', freeTaste: f.freeTaste };
  }
  // plus
  return isPlus
    ? { allowed: true, tier: 'plus', reason: 'ok' }
    : { allowed: false, tier: 'plus', reason: 'needs_plus', freeTaste: f.freeTaste };
}
