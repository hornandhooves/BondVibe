/**
 * Recurrence Utilities
 * Functions to generate recurring event dates based on configuration
 */

import { generateMoonPhaseDates } from './lunarUtils';

/**
 * Generate dates for recurring events
 * @param {Date} startDate - First event date
 * @param {Object} config - Recurrence configuration
 * @param {string} config.type - "daily" | "weekly" | "biweekly" | "monthly" | "lunar"
 * @param {number[]} config.selectedDays - Days of week (0=Sun, 1=Mon, etc.)
 * @param {string} config.weekOfMonth - For monthly: "first" | "second" | "third" | "fourth" | "last"
 * @param {string} config.monthlyMode - "dayOfWeek" | "dayOfMonth"
 * @param {number} config.dayOfMonth - For monthly dayOfMonth mode: 1-28
 * @param {string} config.lunarPhase - For lunar: "full" | "new"
 * @param {string} config.endDate - ISO date string for end date
 * @returns {Date[]} Array of event dates
 */
export function generateRecurringDates(startDate, config) {
  if (!config || config.type === "none") {
    return [new Date(startDate)];
  }

  const { type, selectedDays, weekOfMonth, monthlyMode, dayOfMonth, lunarPhase, endDate } = config;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];

  // Preserve time from start date
  const hours = start.getHours();
  const minutes = start.getMinutes();

  // Safety limit
  const maxEvents = 52;

  switch (type) {
    case "daily":
      return generateDailyDates(start, end, selectedDays, hours, minutes, maxEvents);
    case "weekly":
      return generateWeeklyDates(start, end, selectedDays, hours, minutes, maxEvents);
    case "biweekly":
      return generateBiweeklyDates(start, end, selectedDays, hours, minutes, maxEvents);
    case "monthly":
      if (monthlyMode === "dayOfMonth") {
        return generateMonthlyByDateDates(start, end, dayOfMonth, hours, minutes, maxEvents);
      }
      return generateMonthlyDates(start, end, selectedDays[0], weekOfMonth, hours, minutes, maxEvents);
    case "lunar":
      return generateLunarDates(start, end, lunarPhase, hours, minutes, maxEvents);
    default:
      return [new Date(startDate)];
  }
}

/**
 * Generate daily dates (on specific days of week)
 */
function generateDailyDates(start, end, selectedDays, hours, minutes, maxEvents) {
  const dates = [];
  const current = new Date(start);
  current.setHours(hours, minutes, 0, 0);

  while (current <= end && dates.length < maxEvents) {
    if (selectedDays.includes(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Generate weekly dates (same as daily but conceptually different)
 */
function generateWeeklyDates(start, end, selectedDays, hours, minutes, maxEvents) {
  return generateDailyDates(start, end, selectedDays, hours, minutes, maxEvents);
}

/**
 * Generate biweekly dates (every 2 weeks on selected day)
 */
function generateBiweeklyDates(start, end, selectedDays, hours, minutes, maxEvents) {
  const dates = [];
  const targetDay = selectedDays[0];
  
  const current = new Date(start);
  current.setHours(hours, minutes, 0, 0);
  
  // Move to first target day
  while (current.getDay() !== targetDay && current <= end) {
    current.setDate(current.getDate() + 1);
  }

  // Generate every 2 weeks
  while (current <= end && dates.length < maxEvents) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 14);
  }

  return dates;
}

/**
 * Generate monthly dates (nth day of month by day of week)
 */
function generateMonthlyDates(start, end, targetDay, weekOfMonth, hours, minutes, maxEvents) {
  const dates = [];
  const current = new Date(start);
  current.setDate(1);

  while (current <= end && dates.length < maxEvents) {
    const eventDate = getNthDayOfMonth(
      current.getFullYear(),
      current.getMonth(),
      targetDay,
      weekOfMonth
    );

    if (eventDate && eventDate >= start && eventDate <= end) {
      eventDate.setHours(hours, minutes, 0, 0);
      dates.push(new Date(eventDate));
    }

    current.setMonth(current.getMonth() + 1);
  }

  return dates;
}

/**
 * Generate monthly dates by specific day of month (e.g., the 15th)
 */
function generateMonthlyByDateDates(start, end, dayOfMonth, hours, minutes, maxEvents) {
  const dates = [];
  const current = new Date(start);
  current.setDate(1);

  while (current <= end && dates.length < maxEvents) {
    const year = current.getFullYear();
    const month = current.getMonth();
    
    // Get days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Use the target day, or last day of month if target doesn't exist
    const actualDay = Math.min(dayOfMonth, daysInMonth);
    const eventDate = new Date(year, month, actualDay, hours, minutes, 0, 0);
    
    if (eventDate >= start && eventDate <= end) {
      dates.push(eventDate);
    }

    current.setMonth(current.getMonth() + 1);
  }

  return dates;
}

/**
 * Generate lunar phase dates
 */
function generateLunarDates(start, end, lunarPhase, hours, minutes, maxEvents) {
  const moonDates = generateMoonPhaseDates(start, end, lunarPhase);
  
  // Apply time to each date
  return moonDates.slice(0, maxEvents).map(date => {
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    return d;
  });
}

/**
 * Get the nth occurrence of a day in a month
 */
function getNthDayOfMonth(year, month, dayOfWeek, week) {
  if (week === "last") {
    return getLastDayOfMonth(year, month, dayOfWeek);
  }

  const weekMap = { first: 1, second: 2, third: 3, fourth: 4 };
  const targetWeek = weekMap[week];

  const firstDay = new Date(year, month, 1);
  let firstOccurrence = 1 + ((dayOfWeek - firstDay.getDay() + 7) % 7);

  const nthDay = firstOccurrence + (targetWeek - 1) * 7;

  const result = new Date(year, month, nthDay);
  if (result.getMonth() !== month) {
    return null;
  }

  return result;
}

/**
 * Get the last occurrence of a day in a month
 */
function getLastDayOfMonth(year, month, dayOfWeek) {
  const lastDay = new Date(year, month + 1, 0);
  
  while (lastDay.getDay() !== dayOfWeek) {
    lastDay.setDate(lastDay.getDate() - 1);
  }

  return lastDay;
}

/**
 * Get human-readable summary of recurrence
 */
export function getRecurrenceSummary(config) {
  if (!config || config.type === "none") return "One-time event";

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const { type, selectedDays, weekOfMonth, monthlyMode, dayOfMonth, lunarPhase } = config;

  switch (type) {
    case "daily": {
      if (!selectedDays || selectedDays.length === 0) return "Select days";
      const dayNames = selectedDays.map((d) => DAYS_SHORT[d]).join(", ");
      if (selectedDays.length === 7) return "Every day";
      if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([1,2,3,4,5])) return "Weekdays";
      if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([0,6])) return "Weekends";
      return `Every ${dayNames}`;
    }
    case "weekly": {
      if (!selectedDays || selectedDays.length === 0) return "Select days";
      const dayNames = selectedDays.map((d) => DAYS_SHORT[d]).join(", ");
      return `Weekly on ${dayNames}`;
    }
    case "biweekly": {
      if (!selectedDays || selectedDays.length === 0) return "Select a day";
      return `Every 2 weeks on ${DAYS[selectedDays[0]]}`;
    }
    case "monthly": {
      if (monthlyMode === "dayOfMonth") {
        if (!dayOfMonth) return "Select a day";
        const suffix = getOrdinalSuffix(dayOfMonth);
        return `${dayOfMonth}${suffix} of each month`;
      }
      if (!selectedDays || selectedDays.length === 0) return "Select a day";
      const weekLabels = { first: "First", second: "Second", third: "Third", fourth: "Fourth", last: "Last" };
      return `${weekLabels[weekOfMonth]} ${DAYS[selectedDays[0]]} of each month`;
    }
    case "lunar": {
      if (lunarPhase === "full") return "Every Full Moon";
      if (lunarPhase === "new") return "Every New Moon";
      return "Select moon phase";
    }
    default:
      return "";
  }
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
