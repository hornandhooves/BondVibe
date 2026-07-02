/**
 * Seed a demo rental partner + a few vehicles into the configured Firebase
 * project, so the Muévete (RentalHub) screen has something to show.
 *
 * Usage:  node scripts/seed-rentals.js
 *
 * Creates a persistent "partner" auth user (printed at the end) and vehicles
 * owned by it. Renters browse/reserve regardless of who the owner is. Re-running
 * adds another partner + set (safe; just more demo data). Dev project only.
 */
const fs = require("fs");
const path = require("path");

const app = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8"));
const API_KEY = app.expo.extra.EXPO_PUBLIC_FIREBASE_API_KEY;
const PROJECT = app.expo.extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const IDT = "https://identitytoolkit.googleapis.com/v1/accounts";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });
const iv = (v) => ({ integerValue: v });
const ts = (d) => ({ timestampValue: d });

const CITY = process.argv[2] || "Mexico City";

const create = (p, fields, h) =>
  fetch(`${FS}/${p}`, { method: "POST", headers: h, body: JSON.stringify({ fields }) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  console.log(`Seeding rentals into ${PROJECT} (city: ${CITY})`);

  // 1) Partner user
  const email = `partner_${Date.now()}@bv-demo.com`;
  const password = "Demo123456!";
  const signup = await fetch(`${IDT}:signUp?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((r) => r.json());
  const uid = signup.localId;
  const h = { Authorization: `Bearer ${signup.idToken}`, "Content-Type": "application/json" };
  console.log("  partner user:", email, "/", password);

  // 2) Provider
  const provRes = await create(`vehicleProviders`, {
    ownerId: s(uid),
    name: s("Free Wheels MX"),
    city: s(CITY),
    verified: b(true),
    createdAt: ts(new Date().toISOString()),
  }, h);
  const providerId = provRes.body.name?.split("/").pop();
  console.log("  provider:", providerId, provRes.status);

  // 3) Vehicles — mostly scooters (the primary use case)
  const vehicles = [
    { type: "scooter", title: "City scooter", pickupLabel: "Insurgentes metro", rangeKm: 35, day: 25000, deposit: 50000, license: false },
    { type: "scooter", title: "Long-range scooter", pickupLabel: "Condesa", rangeKm: 55, day: 32000, deposit: 60000, license: false },
    { type: "scooter", title: "Compact scooter", pickupLabel: "Roma Norte", rangeKm: 30, day: 22000, deposit: 40000, license: false },
    { type: "scooter", title: "Free demo scooter", pickupLabel: "Roma Norte", rangeKm: 20, day: 0, deposit: 0, license: false },
  ];
  for (const v of vehicles) {
    const res = await create(`vehicles`, {
      ownerId: s(uid),
      providerId: s(providerId),
      type: s(v.type),
      title: s(v.title),
      city: s(CITY),
      pickupLabel: s(v.pickupLabel),
      status: s("available"),
      requiresLicense: b(v.license),
      rangeKm: iv(v.rangeKm),
      pricePerDayCentavos: iv(v.day),
      pricePerHourCentavos: iv(Math.round(v.day / 8)),
      depositCentavos: iv(v.deposit),
      createdAt: ts(new Date().toISOString()),
    }, h);
    console.log(`  vehicle ${v.type} "${v.title}":`, res.body.name?.split("/").pop(), res.status);
  }

  console.log("\n✅ Seed complete. Open the app → Get around to see them.");
})();
