/**
 * Pure marketplace taxonomy + listing shaping — NO Firebase imports, so it is
 * unit-testable without the app runtime. `marketplaceService` re-exports these
 * (the service adds the Firestore queries on top).
 */

// Verticals that ARE public SessionTypes (browse + book via the engine).
export const SERVICE_VERTICALS = ["beauty", "wellness", "home", "auto"];
// What the explore grid shows (Rentals included, but routes to its own flow).
export const MARKETPLACE_VERTICALS = ["beauty", "wellness", "rentals", "home", "auto"];

/**
 * Normalize a sessionType doc (or {id,bizId,...} shape) into a listing. Derives
 * bizId from the collectionGroup parent path when available. Safe defaults only
 * (never undefined).
 */
export function shapeListing(d) {
  const data = typeof d.data === "function" ? d.data() : d;
  const bizId = d.ref ? d.ref.parent.parent?.id || null : d.bizId || null;
  return {
    id: d.id,
    bizId,
    name: data.name || "",
    vertical: data.vertical || null,
    locationMode: data.locationMode || "at_business",
    bookingMode: data.bookingMode === "quote" ? "quote" : "slot",
    priceCents: data.priceCents || 0,
    durationMin: data.durationMin || 60,
    capacityMax: data.capacityMax || 1,
    photos: Array.isArray(data.photos) ? data.photos : [],
    city: data.city || null,
    description: data.description || null,
    planPackageId: data.planPackageId || null,
    // Denormalized at write time (businessSessionsService) so the detail screen
    // never needs a direct businesses/{bizId} read — see KIN-92.
    businessName: data.businessName || "",
    businessVerified: data.businessVerified === true,
  };
}
