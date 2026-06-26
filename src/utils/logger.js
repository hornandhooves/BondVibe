/**
 * Lightweight logger that silences debug output in production builds.
 *
 * In __DEV__ (Expo dev / local), logs pass through to console.
 * In production (TestFlight / App Store), log() and debug() are no-ops to
 * avoid leaking user data (emails, locations, Stripe info) into device logs.
 *
 * Errors and warnings are always emitted so crash reporting still works.
 */

const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;

export const logger = {
  log: (...args) => {
    if (isDev) console.log(...args);
  },
  debug: (...args) => {
    if (isDev) console.log(...args);
  },
  info: (...args) => {
    if (isDev) console.info(...args);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
  },
};

export default logger;
