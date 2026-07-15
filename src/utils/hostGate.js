/**
 * The unified host gate (Marketplace P0).
 *
 * ONE approval governs every host capability: creating events, publishing a
 * rental vehicle, AND exposing a public marketplace listing (publicListing).
 * This mirrors `firestore.rules` `isApprovedHost()` exactly so the UI never
 * offers an action the server will reject:
 *
 *   isApprovedHost = hostApproved === true || role === 'host'
 *
 * `hostApproved` is the admin-granted right (set in AdminDashboardScreen); once
 * the user picks a host type in HostTypeSelection their `role` becomes 'host'.
 * Either is sufficient — an event-approved host lists vehicles/services with no
 * extra request. Admins are intentionally NOT auto-hosts here (the rule doesn't
 * grant them vehicle-create either), keeping UI and server identical.
 *
 * @param {{ role?: string, hostApproved?: boolean }} [user]
 * @returns {boolean}
 */
export function isApprovedHost(user) {
  if (!user) return false;
  return user.hostApproved === true || user.role === "host";
}
