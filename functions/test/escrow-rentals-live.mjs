/**
 * B3 escrow — LIVE Stripe TEST-mode verification (docs/DISENO_escrow_rentas.md §8).
 * Exercises the money-flow SHAPES the emulator can't: real PaymentIntents +
 * transfers/refunds against a real Connect test account.
 *
 * Run (from repo root):
 *   set -a && . functions/.secret.local && set +a
 *   node functions/test/escrow-rentals-live.mjs [acct_connectTestId]
 *
 * Needs STRIPE_SECRET_KEY=sk_test_... in the env (functions/.secret.local). The
 * optional arg is a Connect test account with transfers capability; without it
 * the transfer/reversal steps are skipped (PI-shape checks still run).
 *
 * Checks:
 *   L1 rental PI     — escrow shape: NO transfer_data / on_behalf_of, transfer_group=rentalId.
 *   L2 service PI    — same escrow shape, transfer_group=bookingId.
 *   L3 held refund   — charge → refund from platform balance (no transfer, no clawback).
 *   L4 transfer+rev  — charge → transfer to host → reversal (the released-refund path).
 *   L5 tip PI        — §6: on_behalf_of=host (host is MoR; a disputed tip is the host's).
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith("sk_test")) {
  console.error("✖ STRIPE_SECRET_KEY (sk_test_...) required. Source functions/.secret.local.");
  process.exit(2);
}
const stripe = new Stripe(key);
const hostAcct = process.argv[2] || process.env.CONNECT_TEST_ACCOUNT || null;

let pass = 0;
let fail = 0;
const ok = (n, cond, detail = "") => {
  if (cond) {
    pass++; console.log(`✅ ${n} ${detail}`);
  } else {
    fail++; console.log(`❌ ${n} ${detail}`);
  }
};

// L1 — rental PI is the escrow shape.
{
  const pi = await stripe.paymentIntents.create({
    amount: 120000, currency: "mxn", transfer_group: "rent_live_1",
    metadata: {type: "rental", rentalId: "rent_live_1", vehicleId: "veh_1"},
  });
  ok("L1 rental PI: no transfer_data", pi.transfer_data == null);
  ok("L1 rental PI: no on_behalf_of", pi.on_behalf_of == null);
  ok("L1 rental PI: transfer_group=rentalId", pi.transfer_group === "rent_live_1");
  ok("L1 rental PI: no application_fee", pi.application_fee_amount == null);
}

// L2 — service PI is the escrow shape.
{
  const pi = await stripe.paymentIntents.create({
    amount: 60000, currency: "mxn", transfer_group: "bk_live_1",
    metadata: {type: "service_booking", bizId: "biz_1", bookingId: "bk_live_1"},
  });
  ok("L2 service PI: no transfer_data", pi.transfer_data == null);
  ok("L2 service PI: no on_behalf_of", pi.on_behalf_of == null);
  ok("L2 service PI: transfer_group=bookingId", pi.transfer_group === "bk_live_1");
}

// L3 — held refund: charge to platform balance, refund it, NO transfer happened.
{
  const pi = await stripe.paymentIntents.create({
    amount: 50000, currency: "mxn", transfer_group: "rent_live_refund",
    payment_method: "pm_card_visa", confirm: true,
    automatic_payment_methods: {enabled: true, allow_redirects: "never"},
    metadata: {type: "rental", rentalId: "rent_live_refund"},
  });
  ok("L3 held: charge succeeded", pi.status === "succeeded");
  const refund = await stripe.refunds.create({payment_intent: pi.id, amount: 50000});
  ok("L3 held: refunded from balance (no reversal needed)", refund.status === "succeeded");
}

// L4 — transfer then reversal (the released-refund clawback path).
if (hostAcct) {
  const pi = await stripe.paymentIntents.create({
    amount: 80000, currency: "mxn", transfer_group: "rent_live_release",
    payment_method: "pm_card_visa", confirm: true,
    automatic_payment_methods: {enabled: true, allow_redirects: "never"},
    metadata: {type: "rental", rentalId: "rent_live_release"},
  });
  const transfer = await stripe.transfers.create({
    amount: 68000, currency: "mxn", destination: hostAcct,
    transfer_group: "rent_live_release",
  });
  ok("L4 released: transfer to host", !!transfer.id);
  const rev = await stripe.transfers.createReversal(transfer.id, {amount: 68000});
  ok("L4 released: reversal claws it back", rev.amount === 68000);
} else {
  console.log("⏭️  L4 transfer/reversal skipped (no Connect test account arg)");
}

// L5 — tip PI: on_behalf_of makes the HOST the MoR (§6). Needs a Connect account.
if (hostAcct) {
  const pi = await stripe.paymentIntents.create({
    amount: 5000, currency: "mxn",
    application_fee_amount: 0,
    on_behalf_of: hostAcct,
    transfer_data: {destination: hostAcct},
    metadata: {type: "tip", hostId: "host_live", userId: "tipper_live"},
  });
  ok("L5 tip PI: on_behalf_of=host (host is MoR)", pi.on_behalf_of === hostAcct);
  ok("L5 tip PI: transfer_data=host (100% to host)",
    pi.transfer_data && pi.transfer_data.destination === hostAcct);
} else {
  console.log("⏭️  L5 tip on_behalf_of skipped (no Connect test account arg)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
