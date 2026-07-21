/**
 * fix/privacy-guestcode-joinevent — the guest code suffix must be high-entropy
 * (CSPRNG via expo-crypto) and long enough that redeem brute-forcing is infeasible
 * even with the server rate limit. Regression guard against the old
 * Math.random()-based 4-char suffix.
 */
// businessMembersService imports ./firebase (needs Expo config we don't have in
// jest) but generateGuestCode uses only the alphabet + expo-crypto — stub firebase.
jest.mock("../services/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { generateGuestCode } from "../services/businessMembersService";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

describe("generateGuestCode — secure entropy", () => {
  test("suffix is 8 chars, all from the unambiguous alphabet", () => {
    const code = generateGuestCode("Ritmo Studio");
    const [prefix, suffix] = code.split("-");
    expect(prefix).toBe("RITMOS");
    expect(suffix).toHaveLength(8);
    for (const ch of suffix) expect(ALPHABET.includes(ch)).toBe(true);
  });

  test("falls back to KINLO prefix when the name has no alphanumerics", () => {
    expect(generateGuestCode("!!!").startsWith("KINLO-")).toBe(true);
    expect(generateGuestCode("").startsWith("KINLO-")).toBe(true);
  });

  test("consecutive codes differ — fresh CSPRNG bytes each call, not a constant", () => {
    const a = generateGuestCode("X");
    const b = generateGuestCode("X");
    expect(a).not.toBe(b);
  });
});
