/**
 * The curated-set generator scores pairs on the SERVER (functions/matching/
 * affinity.js) so the number is server-truth. That port must stay in lock-step
 * with the client engine (src/utils/computeAffinity.js) — this test fails loudly
 * if they ever diverge.
 */
import { computeAffinity as client } from "../computeAffinity";
// eslint-disable-next-line import/no-unresolved
const { computeAffinity: server } = require("../../../functions/matching/affinity");

const BF = (o) => ({ OPENNESS: 50, CONSCIENTIOUSNESS: 50, EXTRAVERSION: 50, AGREEABLENESS: 50, NEUROTICISM: 50, ...o });
const rich = (o = {}) => ({
  interests: ["music", "travel", "coffee"],
  funnyTags: ["coffee_addict", "night_owl"],
  lookingFor: ["friend"],
  personality: BF(),
  energy: { adventure: 60, social: 70 },
  groupPref: "small_group",
  ...o,
});

describe("affinity server↔client parity", () => {
  const cases = [
    ["identical rich", rich(), rich(), "social", {}],
    ["disjoint interests", rich(), rich({ interests: ["x", "y", "z"], funnyTags: ["dog_person"] }), "social", {}],
    ["thin → under_construction", { interests: [], funnyTags: [], lookingFor: [] }, { interests: [] }, "social", {}],
    ["with shared context", rich(), rich(), "social", { sharedCommunities: 2 }],
    ["professional complement",
      rich({ pro: { industry: "tech", offer: "code", seek: "design" } }),
      rich({ pro: { industry: "design", offer: "design", seek: "code" } }), "professional", {}],
  ];

  it.each(cases)("%s → same status + score", (_label, a, b, mode, ctx) => {
    const c = client(a, b, mode, ctx);
    const srv = server(a, b, mode, ctx);
    expect(srv.status).toBe(c.status);
    expect(srv.score).toBe(c.score);
  });
});
