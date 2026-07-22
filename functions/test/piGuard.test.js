/**
 * Unit tests for the PaymentIntent-status guard used by the reservation sweeps +
 * idempotency (fix/rentals-services-money). Pure — no emulator/Stripe.
 *
 *   node --test functions/test/piGuard.test.js   (also runs under test:payments)
 */
const test = require("node:test");
const assert = require("node:assert");
const {isSettlingPi, isCancelablePi} = require("../stripe/piGuard");

test("a paid / in-flight PI is 'settling' → the sweep must SKIP it", () => {
  assert.strictEqual(isSettlingPi("succeeded"), true);
  assert.strictEqual(isSettlingPi("processing"), true);
});

test("an open / awaiting-payment PI is NOT settling → the sweep may expire it", () => {
  for (const s of ["requires_payment_method", "requires_confirmation",
    "requires_action", "requires_capture", "canceled"]) {
    assert.strictEqual(isSettlingPi(s), false, s);
  }
});

test("isCancelablePi marks the open states the sweep can safely cancel", () => {
  assert.strictEqual(isCancelablePi("requires_payment_method"), true);
  assert.strictEqual(isCancelablePi("requires_action"), true);
  // Not cancelable: already terminal or settling.
  assert.strictEqual(isCancelablePi("succeeded"), false);
  assert.strictEqual(isCancelablePi("canceled"), false);
  assert.strictEqual(isCancelablePi("processing"), false);
});
