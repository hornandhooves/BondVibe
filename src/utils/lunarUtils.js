/**
 * Lunar Phase Utilities
 * Calculate moon phases for recurring events
 */

// Moon cycle is approximately 29.53 days
const LUNAR_CYCLE = 29.53058867;

// Known new moon reference date (Jan 6, 2000 18:14 UTC)
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

/**
 * Calculate moon phase for a given date
 * Returns a value from 0 to 1:
 * 0.00 = New Moon
 * 0.25 = First Quarter
 * 0.50 = Full Moon
 * 0.75 = Last Quarter
 * @param {Date} date 
 * @returns {number} Phase (0-1)
 */
export function getMoonPhase(date) {
  const timestamp = date.getTime();
  const daysSinceKnown = (timestamp - KNOWN_NEW_MOON) / (1000 * 60 * 60 * 24);
  const cycles = daysSinceKnown / LUNAR_CYCLE;
  const phase = cycles - Math.floor(cycles);
  return phase;
}

/**
 * Get moon phase name
 * @param {Date} date 
 * @returns {string} Phase name
 */
export function getMoonPhaseName(date) {
  const phase = getMoonPhase(date);
  
  if (phase < 0.0625 || phase >= 0.9375) return 'new';
  if (phase < 0.1875) return 'waxing-crescent';
  if (phase < 0.3125) return 'first-quarter';
  if (phase < 0.4375) return 'waxing-gibbous';
  if (phase < 0.5625) return 'full';
  if (phase < 0.6875) return 'waning-gibbous';
  if (phase < 0.8125) return 'last-quarter';
  return 'waning-crescent';
}

/**
 * Check if date is a full moon (within tolerance)
 * @param {Date} date 
 * @param {number} tolerance - Days tolerance (default 0.5)
 * @returns {boolean}
 */
export function isFullMoon(date, tolerance = 0.5) {
  const phase = getMoonPhase(date);
  // Full moon is at phase 0.5
  const diff = Math.abs(phase - 0.5);
  const daysDiff = diff * LUNAR_CYCLE;
  return daysDiff <= tolerance;
}

/**
 * Check if date is a new moon (within tolerance)
 * @param {Date} date 
 * @param {number} tolerance - Days tolerance (default 0.5)
 * @returns {boolean}
 */
export function isNewMoon(date, tolerance = 0.5) {
  const phase = getMoonPhase(date);
  // New moon is at phase 0 (or 1)
  const diff = Math.min(phase, 1 - phase);
  const daysDiff = diff * LUNAR_CYCLE;
  return daysDiff <= tolerance;
}

/**
 * Find next occurrence of a moon phase
 * @param {Date} startDate 
 * @param {'full' | 'new'} phaseType 
 * @returns {Date}
 */
export function findNextMoonPhase(startDate, phaseType) {
  const targetPhase = phaseType === 'full' ? 0.5 : 0;
  const start = new Date(startDate);
  
  // Search day by day for up to 30 days
  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(start);
    checkDate.setDate(start.getDate() + i);
    
    if (phaseType === 'full' && isFullMoon(checkDate)) {
      return checkDate;
    }
    if (phaseType === 'new' && isNewMoon(checkDate)) {
      return checkDate;
    }
  }
  
  // Fallback: calculate approximate date
  const currentPhase = getMoonPhase(start);
  let daysUntilTarget;
  
  if (phaseType === 'full') {
    daysUntilTarget = ((0.5 - currentPhase + 1) % 1) * LUNAR_CYCLE;
  } else {
    daysUntilTarget = ((1 - currentPhase) % 1) * LUNAR_CYCLE;
  }
  
  const result = new Date(start);
  result.setDate(result.getDate() + Math.round(daysUntilTarget));
  return result;
}

/**
 * Generate all moon phase dates between start and end
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @param {'full' | 'new'} phaseType 
 * @returns {Date[]}
 */
export function generateMoonPhaseDates(startDate, endDate, phaseType) {
  const dates = [];
  let current = findNextMoonPhase(startDate, phaseType);
  
  while (current <= endDate && dates.length < 52) {
    if (current >= startDate) {
      dates.push(new Date(current));
    }
    // Move to next cycle
    current = new Date(current);
    current.setDate(current.getDate() + Math.round(LUNAR_CYCLE));
    current = findNextMoonPhase(current, phaseType);
  }
  
  return dates;
}
