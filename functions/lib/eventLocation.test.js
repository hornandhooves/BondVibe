/**
 * Unit tests for the F2 server-side location derivation (lib/eventLocation.js).
 * Pure — runs under `node --test`, no emulator / no FieldValue needed.
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  snapApproxGrid, deriveArea, deriveVenue, coordFromData, coordsEqual,
} = require("./eventLocation");

test("snapApproxGrid snaps to the 0.01° grid", () => {
  assert.deepStrictEqual(
    snapApproxGrid({latitude: 20.2114, longitude: -87.4654}),
    {latitude: 20.21, longitude: -87.47},
  );
});

test("snapApproxGrid collapses nearby points in a cell to one point", () => {
  const a = snapApproxGrid({latitude: 20.2111, longitude: -87.4719});
  const b = snapApproxGrid({latitude: 20.2148, longitude: -87.4682});
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, {latitude: 20.21, longitude: -87.47});
});

test("snapApproxGrid returns null for missing/invalid coords", () => {
  assert.strictEqual(snapApproxGrid(null), null);
  assert.strictEqual(snapApproxGrid({}), null);
  assert.strictEqual(snapApproxGrid({latitude: "x", longitude: 1}), null);
  assert.strictEqual(snapApproxGrid({latitude: NaN, longitude: 1}), null);
});

test("deriveArea uses the city tail of 'Venue, City', never the street", () => {
  assert.strictEqual(deriveArea("Casa Azul, Tulum Centro", "tulum"), "Tulum Centro");
  assert.strictEqual(deriveArea("No comma here", "tulum"), "tulum"); // fall back to city
  assert.strictEqual(deriveArea(undefined, "tulum"), "tulum");
  assert.strictEqual(deriveArea(undefined, undefined), null);
});

test("deriveVenue takes the head of 'Venue, City'", () => {
  assert.strictEqual(deriveVenue("Casa Azul, Tulum Centro"), "Casa Azul");
  assert.strictEqual(deriveVenue("Just a name"), "Just a name");
  assert.strictEqual(deriveVenue(""), null);
  assert.strictEqual(deriveVenue(undefined), null);
});

test("coordFromData validates and normalizes", () => {
  assert.deepStrictEqual(
    coordFromData({latitude: 20.2, longitude: -87.4, extra: 1}),
    {latitude: 20.2, longitude: -87.4},
  );
  assert.strictEqual(coordFromData({latitude: 20.2}), null);
  assert.strictEqual(coordFromData(null), null);
});

test("coordsEqual compares snapped cells (loop guard)", () => {
  assert.strictEqual(coordsEqual({latitude: 20.21, longitude: -87.47}, {latitude: 20.21, longitude: -87.47}), true);
  assert.strictEqual(coordsEqual({latitude: 20.21, longitude: -87.47}, {latitude: 20.22, longitude: -87.47}), false);
  assert.strictEqual(coordsEqual(null, {latitude: 1, longitude: 2}), false);
});
