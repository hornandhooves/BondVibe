// Location constants used throughout the app
// IMPORTANT: This file maintains the list of supported locations

// Main locations export - array of objects with full information
export const LOCATIONS = [
  { id: "all", label: "All Locations", emoji: "🌎" },
  { id: "tulum", label: "Tulum", emoji: "🏝️" },
  { id: "playa-del-carmen", label: "Playa del Carmen", emoji: "🏖️" },
  { id: "cancun", label: "Cancún", emoji: "🌴" },
];

// Simple string array for backwards compatibility
export const LOCATION_NAMES = LOCATIONS.map((loc) => loc.label);

// Helper function to normalize location strings
export const normalizeLocation = (location) => {
  if (!location) return null;

  const normalized = location.toLowerCase().trim();
  if (LOCATIONS.some((loc) => loc.id === normalized)) return normalized;

  // Map common variations to standard locations
  const locationMap = {
    // All
    all: "all",
    "all locations": "all",
    todas: "all",
    // Tulum
    tulum: "tulum",
    "tulum, mexico": "tulum",
    "tulum mexico": "tulum",
    "tulum, quintana roo": "tulum",
    // Playa del Carmen
    "playa del carmen": "playa-del-carmen",
    playa: "playa-del-carmen",
    "playa carmen": "playa-del-carmen",
    "playa del carmen, mexico": "playa-del-carmen",
    "playa del carmen mexico": "playa-del-carmen",
    "playa del carmen, quintana roo": "playa-del-carmen",
    pdc: "playa-del-carmen",
    // Cancún
    cancun: "cancun",
    cancún: "cancun",
    "cancun, mexico": "cancun",
    "cancun mexico": "cancun",
    "cancún, mexico": "cancun",
    "cancún mexico": "cancun",
    "cancun, quintana roo": "cancun",
    "cancún, quintana roo": "cancun",
  };

  return locationMap[normalized] || null;
};

// Helper to validate if a location is valid
export const isValidLocation = (location) => {
  const locationIds = LOCATIONS.map((loc) => loc.id);
  const normalized = normalizeLocation(location);
  return locationIds.includes(normalized);
};

// Get location object by id or label
export const getLocationById = (id) => {
  if (!id) return null;
  const lowerId = id.toLowerCase();
  return LOCATIONS.find(
    (loc) => loc.id === lowerId || loc.label.toLowerCase() === lowerId,
  );
};

// Get location emoji by id or label
export const getLocationEmoji = (id) => {
  const location = getLocationById(id);
  return location?.emoji || "📍";
};

// Get location label by id
export const getLocationLabel = (id) => {
  const location = getLocationById(id);
  return location?.label || id;
};

// Check if event location matches filter
export const locationMatchesFilter = (eventLocation, filterLocationId) => {
  // "all" matches everything
  if (filterLocationId === "all" || !filterLocationId) return true;

  // Normalize the event location and compare
  const normalizedEventLocation = normalizeLocation(eventLocation);
  return normalizedEventLocation === filterLocationId;
};
