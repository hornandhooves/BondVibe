/**
 * @handle client helpers. Validation here is for instant UX only — the server
 * (claimHandle) is the authority and re-validates + enforces uniqueness. Charset
 * is letters a–z + underscore, 3–30, must include a letter, no leading/trailing
 * or doubled underscore.
 */
import { httpsCallable, getFunctions } from "firebase/functions";

export const HANDLE_RE = /^[a-z_]{3,30}$/;

// Mirror of the server reserved list (subset — server is authoritative).
const RESERVED = new Set([
  "admin", "kinlo", "support", "help", "official", "root", "moderator",
  "staff", "team", "security", "about", "settings", "me", "you", "null",
  "undefined", "bondvibe", "system", "mod", "contact", "billing", "payments",
]);

export const normalizeHandle = (raw) =>
  String(raw || "").trim().toLowerCase().replace(/^@+/, "");

/**
 * Validate a handle for the client. Returns { ok, handleLower, error } where
 * error is one of "format" | "reserved".
 */
export const validateHandleClient = (raw) => {
  const h = normalizeHandle(raw);
  if (!HANDLE_RE.test(h)) return { ok: false, error: "format" };
  if (!/[a-z]/.test(h)) return { ok: false, error: "format" };
  if (h.startsWith("_") || h.endsWith("_") || h.includes("__")) {
    return { ok: false, error: "format" };
  }
  if (RESERVED.has(h)) return { ok: false, error: "reserved" };
  return { ok: true, handleLower: h };
};

/** Suggest a handle from a display name: "Camila Restrepo" → "camila_restrepo". */
export const suggestHandleFromName = (name) => {
  const base = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ") // keep letters only (no digits/dots per spec)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  let h = base.slice(0, 30).replace(/_$/, "");
  if (h.length < 3) h = `${h}user`.slice(0, 30);
  return h;
};

/** Claim a handle (permanent). Returns { success, handle } | { success:false, code, error }. */
export const claimHandle = async (handle) => {
  try {
    const fn = httpsCallable(getFunctions(), "claimHandle");
    const res = await fn({ handle });
    return { success: true, ...res.data };
  } catch (e) {
    return { success: false, code: e.code, error: e.message };
  }
};

/** Live availability check. Returns { available, error }. */
export const checkHandle = async (handle) => {
  try {
    const fn = httpsCallable(getFunctions(), "checkHandle");
    const res = await fn({ handle });
    return res.data;
  } catch (e) {
    return { available: false, error: "network" };
  }
};
