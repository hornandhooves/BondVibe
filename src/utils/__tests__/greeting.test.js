import { getGreetingKey } from "../greeting";

describe("getGreetingKey — franjas horarias (KQA-001)", () => {
  it.each([[0], [3], [4], [18], [22], [23]])("hora %i → night", (h) =>
    expect(getGreetingKey(h)).toBe("home.greetingNight"));
  it.each([[5], [9], [11]])("hora %i → morning", (h) =>
    expect(getGreetingKey(h)).toBe("home.greetingMorning"));
  it.each([[12], [15], [17]])("hora %i → afternoon", (h) =>
    expect(getGreetingKey(h)).toBe("home.greetingAfternoon"));
});
