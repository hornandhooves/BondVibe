/**
 * Business roles & permissions (kinlo_business/07 FIX 4). Each business owns a
 * set of roles; each role toggles access to Business AREAS. The owner can rename
 * non-owner roles and add roles. Route guards read a staff member's role perms.
 *
 * Stored at businesses/{bizId}/roles/{roleId}: { name, editableName, removable, perms }.
 */

// Every gate-able Business area (matches the hub rows + route guards).
export const BUSINESS_AREAS = [
  "dashboard",
  "members",
  "packages",
  "finance",
  "classes",
  "agenda",
  "checkin",
  "automations",
  "momentum",
  "branches",
  "staff",
];

const allAreas = (value) =>
  BUSINESS_AREAS.reduce((acc, a) => { acc[a] = value; return acc; }, {});

// Seeded on business setup. Owner = everything (locked); the rest are editable.
export const DEFAULT_ROLES = [
  { id: "owner", name: "Owner", editableName: false, removable: false, perms: allAreas(true) },
  { id: "manager", name: "Manager", editableName: true, removable: true, perms: { ...allAreas(true), finance: false, staff: false } },
  { id: "instructor", name: "Instructor", editableName: true, removable: true, perms: { ...allAreas(false), agenda: true, classes: true, checkin: true, members: true } },
  { id: "reception", name: "Reception", editableName: true, removable: true, perms: { ...allAreas(false), checkin: true, members: true } },
];

// Areas that are DEFAULT-DENY: access requires perms[area] === true explicitly.
// finance mirrors the server rule (fix/security-rules-4b #59): the capability
// gate is perms.finance == true, so a missing/undefined key must read as DENIED
// on the client too (else the UI shows a switch/KPI the server then denies).
const DEFAULT_DENY_AREAS = new Set(["finance"]);

/** Whether a role (by its perms map) may access an area. Owner/unknown → true. */
export const roleAllows = (perms, area) => {
  if (!perms) return true;
  if (DEFAULT_DENY_AREAS.has(area)) return perms[area] === true;
  return perms[area] !== false;
};
