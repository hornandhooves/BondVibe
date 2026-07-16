/**
 * The provider rule is security-relevant: picking Play Integrity for a build
 * Play didn't distribute yields tokens that never verify (and would break those
 * builds the day enforcement goes on), while picking debug where real
 * attestation was possible silently weakens the guarantee. So it's pinned here.
 *
 * Only the pure rule is imported — appCheck.js's native/web wiring is lazy, so
 * this never loads RNFirebase.
 */
import { pickProviders, PLAY_DISTRIBUTED_CHANNELS } from "../appCheck";

describe("pickProviders — Android: Play Integrity only where Play distributes", () => {
  it("production (store distribution) → playIntegrity", () => {
    expect(pickProviders({ isDev: false, channel: "production" }).android.provider).toBe(
      "playIntegrity"
    );
  });

  it("preview (sideloaded APK) → debug, NOT playIntegrity", () => {
    // The bug this guards: a sideloaded APK attests as UNRECOGNIZED_VERSION,
    // so Play Integrity would never verify it.
    expect(pickProviders({ isDev: false, channel: "preview" }).android.provider).toBe("debug");
  });

  it("development channel → debug", () => {
    expect(pickProviders({ isDev: false, channel: "development" }).android.provider).toBe("debug");
  });

  it("local dev run (no channel) → debug", () => {
    expect(pickProviders({ isDev: true, channel: null }).android.provider).toBe("debug");
    expect(pickProviders({ isDev: false, channel: null }).android.provider).toBe("debug");
    expect(pickProviders({ isDev: false, channel: "" }).android.provider).toBe("debug");
  });

  it("__DEV__ always wins, even on a production channel", () => {
    expect(pickProviders({ isDev: true, channel: "production" }).android.provider).toBe("debug");
  });

  it("an unknown channel never gets Play Integrity", () => {
    expect(pickProviders({ isDev: false, channel: "staging" }).android.provider).toBe("debug");
  });
});

describe("pickProviders — iOS: App Attest on any real device", () => {
  it("dev (Simulator can't attest) → debug", () => {
    expect(pickProviders({ isDev: true, channel: null }).apple.provider).toBe("debug");
  });

  it.each(["preview", "production", null])(
    "non-dev channel %s → appAttestWithDeviceCheckFallback (ad-hoc + TestFlight attest fine)",
    (channel) => {
      expect(pickProviders({ isDev: false, channel }).apple.provider).toBe(
        "appAttestWithDeviceCheckFallback"
      );
    }
  );
});

describe("PLAY_DISTRIBUTED_CHANNELS", () => {
  it("lists only production — add 'preview' here if it ever ships via Play internal testing", () => {
    expect(PLAY_DISTRIBUTED_CHANNELS).toEqual(["production"]);
  });
});
