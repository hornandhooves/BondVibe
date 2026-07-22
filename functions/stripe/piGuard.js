/**
 * PaymentIntent status helpers for the reservation sweeps + idempotency
 * (fix/rentals-services-money). Pure — unit-testable without Stripe/emulator.
 */

// "Settling": the charge went through (or is finalizing). The webhook will
// confirm the rental/booking, so a TTL sweep must NOT cancel it or free the
// slot/range — that would drop a paid reservation.
const SETTLING = new Set(["succeeded", "processing"]);

// True if the PI is paid or in-flight → the sweep must skip it.
const isSettlingPi = (status) => SETTLING.has(status);

// Open states the sweep may safely cancel (still awaiting payment).
const CANCELABLE = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

// True if the PI is still open and safe to cancel from the sweep.
const isCancelablePi = (status) => CANCELABLE.has(status);

module.exports = {isSettlingPi, isCancelablePi};
