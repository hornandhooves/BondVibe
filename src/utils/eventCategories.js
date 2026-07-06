// Event categories used throughout the app
// IMPORTANT: This file maintains backwards compatibility

// Main category export - array of objects with full information
export const EVENT_CATEGORIES = [
  { id: "social", label: "Social" },
  { id: "sports", label: "Sports" },
  { id: "food", label: "Food" },
  { id: "arts", label: "Arts" },
  { id: "learning", label: "Learning" },
  { id: "adventure", label: "Adventure" },
  { id: "wellness", label: "Wellness" },
  { id: "music", label: "Music" },
  { id: "games", label: "Games" },
  { id: "outdoors", label: "Outdoors" },
  { id: "nightlife", label: "Nightlife" },
  { id: "networking", label: "Networking" },
  { id: "pets", label: "Pets" },
  { id: "travel", label: "Travel" },
  { id: "kids", label: "Kids events" },
];

// Simple string array for backwards compatibility
// Use this in components that expect simple strings
export const CATEGORY_NAMES = EVENT_CATEGORIES.map((cat) => cat.label);

// Legacy export - maintains old behavior
// This ensures old code doesn't break
export const CATEGORIES = CATEGORY_NAMES;

// Helper function to normalize category strings
export const normalizeCategory = (category) => {
  if (!category) return null;

  const normalized = category.toLowerCase().trim();

  // Map common variations to standard categories
  const categoryMap = {
    // Social
    social: "social",
    party: "social",
    parties: "social",
    hangout: "social",
    meetup: "social",
    // Sports
    sports: "sports",
    sport: "sports",
    fitness: "sports",
    // Food
    food: "food",
    "food & drink": "food",
    "food and drink": "food",
    dining: "food",
    restaurant: "food",
    // Arts
    arts: "arts",
    art: "arts",
    creative: "arts",
    // Learning
    learning: "learning",
    education: "learning",
    workshop: "learning",
    class: "learning",
    // Adventure
    adventure: "adventure",
    adventures: "adventure",
    extreme: "adventure",
    // Wellness
    wellness: "wellness",
    yoga: "wellness",
    meditation: "wellness",
    mindfulness: "wellness",
    health: "wellness",
    // Music
    music: "music",
    concert: "music",
    concerts: "music",
    "live music": "music",
    // Games
    games: "games",
    game: "games",
    gaming: "games",
    "board games": "games",
    trivia: "games",
    // Outdoors
    outdoors: "outdoors",
    outdoor: "outdoors",
    nature: "outdoors",
    hiking: "outdoors",
    picnic: "outdoors",
    // Nightlife
    nightlife: "nightlife",
    bar: "nightlife",
    bars: "nightlife",
    club: "nightlife",
    clubs: "nightlife",
    // Networking
    networking: "networking",
    professional: "networking",
    business: "networking",
    coworking: "networking",
    // Pets
    pets: "pets",
    pet: "pets",
    dogs: "pets",
    dog: "pets",
    // Travel
    travel: "travel",
    trip: "travel",
    trips: "travel",
    tour: "travel",
    tours: "travel",
    // Kids events (for parents; the app stays 18+ for users)
    kids: "kids",
    kid: "kids",
    children: "kids",
    child: "kids",
    family: "kids",
    parenting: "kids",
    "kids events": "kids",
  };

  return categoryMap[normalized] || normalized;
};

// Helper to validate if a category is valid
export const isValidCategory = (category) => {
  const categoryIds = EVENT_CATEGORIES.map((cat) => cat.id);
  const lowerCategory = category?.toLowerCase();
  return (
    categoryIds.includes(lowerCategory) || CATEGORY_NAMES.includes(category)
  );
};

// Get category object by id or label
export const getCategoryById = (id) => {
  const lowerId = id?.toLowerCase();
  return EVENT_CATEGORIES.find((cat) => cat.id === lowerId || cat.label === id);
};

// Get category label by id
export const getCategoryLabel = (id) => {
  const category = getCategoryById(id);
  return category?.label || id;
};

// Get category ID from label
export const getCategoryId = (label) => {
  const category = EVENT_CATEGORIES.find((cat) => cat.label === label);
  return category?.id || label?.toLowerCase();
};

// Event length options (minutes, as string ids for SelectDropdown). Sets the
// event end time, which drives the "after event" Community Matching window.
export const EVENT_DURATIONS = [
  { id: "60", label: "1 hour" },
  { id: "90", label: "1.5 hours" },
  { id: "120", label: "2 hours" },
  { id: "180", label: "3 hours" },
  { id: "240", label: "4 hours" },
  { id: "360", label: "6 hours" },
  { id: "480", label: "8 hours" },
  { id: "720", label: "All day" },
];

// Event language options
export const EVENT_LANGUAGES = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "pl", label: "Polski" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
  { id: "ru", label: "Русский" },
];
