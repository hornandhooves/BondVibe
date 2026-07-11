/**
 * birthdayService — the Birthdays host view (dashboard handoff §Birthdays). A
 * retention lever: who's celebrating today / this week, with gift suggestions
 * matched from what we actually know about the member (host tags + attended
 * classes). No new backend — reads listMembers + per-member attendance.
 *
 * PRIVACY (hard rule): all birthday matching is MM-DD only, via birthdayMMDD.
 * We never read, compute, or expose the year or an age here. UTC-pinned so
 * "today's birthdays" don't drift across the host's timezone.
 */
import { listMembers, birthdayMMDD } from "./businessMembersService";
import { listMemberAttendance } from "./businessAttendanceService";
import { audienceAllows } from "../utils/membershipUtils";

const mmddOf = (d) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export const todayMMDD = () => mmddOf(new Date());

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Members with birthdays in a rolling window starting today (UTC), grouped into
 * today + the rest of the week. Year is ignored (MM-DD compare); a Feb-29
 * birthday celebrates on Feb-28 in non-leap years.
 * @returns {Promise<{ today: object[], week: Array<{member:object, daysUntil:number}> }>}
 */
export async function listUpcomingBirthdays(bizId, days = 7) {
  const members = await listMembers({}, bizId);
  const window = new Map(); // MM-DD -> daysUntil (0..days-1)
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const key = mmddOf(d);
    if (!window.has(key)) window.set(key, i);
    // Leap-day birthdays fall on Feb 28 when the current year has no Feb 29.
    if (key === "02-28" && !isLeapYear(d.getUTCFullYear()) && !window.has("02-29")) {
      window.set("02-29", i);
    }
  }
  const hits = members
    .map((m) => ({ member: m, mmdd: birthdayMMDD(m) }))
    .filter((x) => x.mmdd && window.has(x.mmdd))
    .map((x) => ({ member: x.member, daysUntil: window.get(x.mmdd) }))
    .sort((a, b) => a.daysUntil - b.daysUntil || (a.member.name || "").localeCompare(b.member.name || ""));
  return {
    today: hits.filter((x) => x.daysUntil === 0).map((x) => x.member),
    week: hits.filter((x) => x.daysUntil > 0),
  };
}

/**
 * Rank the host's active packages as gift ideas for a member, grounded in real
 * signal only — host tags first, then the member's most-attended class titles.
 * Packages carry NO category/personality field, so we match on the package name;
 * when there's no signal we return generic active packages flagged low-confidence
 * (honest — never a fabricated "top interest").
 *
 * Audience-gated up front (audienceAllows) so a later assignPackage can't throw
 * audience_mismatch on a suggested pack.
 * @returns {Promise<{tier:'green'|'yellow'|'red', topCategory:string|null, attendedCount:number, suggestions:object[]}>}
 */
export async function giftSuggestions(member, packages, bizId) {
  const allowed = (packages || []).filter((p) => audienceAllows(p.audienceTier, member?.pricingTier));
  const attendance = member?.id ? await listMemberAttendance(member.id, bizId) : [];

  const titleFreq = {};
  for (const a of attendance) {
    const tt = (a.classTitle || "").trim().toLowerCase();
    if (tt) titleFreq[tt] = (titleFreq[tt] || 0) + 1;
  }
  const topTitle = Object.keys(titleFreq).sort((a, b) => titleFreq[b] - titleFreq[a])[0] || null;
  const tags = Array.isArray(member?.tags) ? member.tags.map((x) => String(x).toLowerCase()) : [];
  const terms = [...tags, ...(topTitle ? [topTitle] : [])];

  const score = (p) => {
    const name = (p.name || "").toLowerCase();
    return terms.reduce((s, term) => s + (term && name.includes(term) ? 1 : 0), 0);
  };
  const ranked = allowed
    .map((p) => ({ pkg: p, s: score(p) }))
    .sort((a, b) => b.s - a.s || (b.pkg.priceCents || 0) - (a.pkg.priceCents || 0));

  const matched = ranked.some((r) => r.s > 0);
  const tier = matched ? "green" : terms.length ? "yellow" : "red";
  const topCategory = (Array.isArray(member?.tags) && member.tags[0]) || topTitle || null;

  return {
    tier,
    topCategory,
    attendedCount: attendance.length,
    suggestions: ranked.slice(0, 3).map((r) => ({
      id: r.pkg.id,
      name: r.pkg.name,
      kind: r.pkg.kind,
      priceCents: r.pkg.priceCents,
      credits: r.pkg.credits,
      matched: r.s > 0,
    })),
  };
}
