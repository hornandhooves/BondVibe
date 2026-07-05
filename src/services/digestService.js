/**
 * digestService — Weekly Digest (ai_features/14) client cache.
 * One AI call per user per ISO week (cost rule from the spec), persisted in
 * AsyncStorage so relaunches reuse the same digest. Server additionally
 * enforces the non-Plus monthly taste.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "./firebase";
import { callClaude } from "./claudeService";

const weekKey = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

const storageKey = (uid) => `kinlo.digest.${uid}`;

/**
 * @returns {Promise<{ok:true,data:object}|{ok:false,fallback:true,needsPlus?:boolean}>}
 */
export async function getWeeklyDigest() {
  const uid = auth.currentUser?.uid;
  if (!uid) return { ok: false, fallback: true };
  const wk = weekKey();
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.week === wk && cached.data) return { ok: true, data: cached.data };
    }
  } catch {
    // cache miss
  }
  const res = await callClaude("weekly_digest", {});
  if (res.ok) {
    AsyncStorage.setItem(storageKey(uid), JSON.stringify({ week: wk, data: res.data })).catch(
      () => {}
    );
  }
  return res;
}
