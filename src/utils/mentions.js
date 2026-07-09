/**
 * @mention parsing (spec 10, block 4). A mention is "@" + a valid handle
 * (letters a–z + underscore, 3–30). Pure helpers — no Firebase — so they're
 * unit-testable and reusable by the renderer, the autocomplete and the notifier.
 */

// Global matcher for committed mentions in a body of text.
export const MENTION_RE = /@([a-z_]{3,30})/gi;

/** Unique lowercase handles mentioned in `text`. */
export const extractMentionHandles = (text) => {
  const out = new Set();
  const re = new RegExp(MENTION_RE);
  let m;
  while ((m = re.exec(text || "")) !== null) out.add(m[1].toLowerCase());
  return [...out];
};

/**
 * Split text into segments for rendering:
 * [{ type: "text", value } | { type: "mention", value: "@handle", handle }].
 */
export const splitByMentions = (text) => {
  const s = text || "";
  const parts = [];
  const re = new RegExp(MENTION_RE);
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: s.slice(last, m.index) });
    parts.push({ type: "mention", value: m[0], handle: m[1].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ type: "text", value: s.slice(last) });
  return parts;
};

/**
 * The handle prefix currently being typed at the end of `text`, for the
 * autocomplete. Returns "" when the text ends with a bare "@", a partial prefix
 * while typing, or null when there's no active mention.
 */
export const activeMentionPrefix = (text) => {
  const m = (text || "").match(/(?:^|\s)@([a-z_]{0,30})$/i);
  return m ? m[1].toLowerCase() : null;
};

/** Replace the active (trailing) mention token with the chosen @handle + space. */
export const replaceActiveMention = (text, handle) =>
  (text || "").replace(/((?:^|\s)@)[a-z_]{0,30}$/i, `$1${handle} `);
