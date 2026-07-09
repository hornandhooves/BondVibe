import {
  extractMentionHandles,
  splitByMentions,
  activeMentionPrefix,
  replaceActiveMention,
} from "../mentions";

describe("extractMentionHandles", () => {
  it("finds unique lowercase handles", () => {
    expect(extractMentionHandles("hey @camila and @Bob_smith and @camila")).toEqual([
      "camila",
      "bob_smith",
    ]);
  });
  it("ignores too-short tokens and empty input", () => {
    expect(extractMentionHandles("@ab is too short")).toEqual([]);
    expect(extractMentionHandles("")).toEqual([]);
  });
});

describe("splitByMentions", () => {
  it("splits text and mentions", () => {
    expect(splitByMentions("hi @camila!")).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", value: "@camila", handle: "camila" },
      { type: "text", value: "!" },
    ]);
  });
  it("returns a single text part when there are no mentions", () => {
    expect(splitByMentions("just text")).toEqual([{ type: "text", value: "just text" }]);
  });
});

describe("activeMentionPrefix", () => {
  it("returns the trailing prefix being typed", () => {
    expect(activeMentionPrefix("hey @cam")).toBe("cam");
    expect(activeMentionPrefix("@")).toBe("");
  });
  it("returns null when there's no active mention", () => {
    expect(activeMentionPrefix("hey @cam ")).toBe(null); // completed (trailing space)
    expect(activeMentionPrefix("no mention here")).toBe(null);
    expect(activeMentionPrefix("email@domain")).toBe(null); // @ not after space/start
  });
});

describe("replaceActiveMention", () => {
  it("swaps the trailing token for the chosen handle + space", () => {
    expect(replaceActiveMention("hey @cam", "camila")).toBe("hey @camila ");
    expect(replaceActiveMention("@", "bob_smith")).toBe("@bob_smith ");
  });
});
