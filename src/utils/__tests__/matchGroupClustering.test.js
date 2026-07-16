/**
 * Match-group clustering (P3) is server logic (functions/matching/grouping.js);
 * it's pure (no firebase deps) so we test it directly here.
 */
// eslint-disable-next-line import/no-unresolved
const { clusterMembers, GROUP_MIN, GROUP_MAX } = require("../../../functions/matching/grouping");

const member = (id, interests) => ({
  uid: id,
  profile: { interests, funnyTags: [], lookingFor: ["friend"], groupPref: "small_group", energy: { adventure: 50, social: 50 } },
});

describe("clusterMembers", () => {
  it("drops a would-be group below the minimum (no lonely groups)", () => {
    const members = [member("a", ["x"]), member("b", ["x"]), member("c", ["x"])]; // 3 < 4
    expect(clusterMembers(members)).toEqual([]);
  });

  it("forms one group of 4-6 from a small community", () => {
    const members = ["a", "b", "c", "d", "e"].map((id) => member(id, ["music", "travel"]));
    const groups = clusterMembers(members);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBeGreaterThanOrEqual(GROUP_MIN);
    expect(groups[0].length).toBeLessThanOrEqual(GROUP_MAX);
  });

  it("caps a group at GROUP_MAX and forms a second from the remainder", () => {
    // 10 members → one full group of 6, remainder 4 → a second group of 4.
    const members = Array.from({ length: 10 }, (_, i) => member(`u${i}`, ["a", "b"]));
    const groups = clusterMembers(members);
    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(GROUP_MAX);
    expect(groups[1].length).toBe(GROUP_MIN);
    // every member appears in exactly one group
    const flat = groups.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("is deterministic for a stable input order", () => {
    const members = Array.from({ length: 8 }, (_, i) => member(`u${i}`, ["a"]));
    expect(clusterMembers(members)).toEqual(clusterMembers(members));
  });
});
