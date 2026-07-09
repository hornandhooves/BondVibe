import {
  validateHandleClient,
  suggestHandleFromName,
  normalizeHandle,
} from "../handleService";

describe("normalizeHandle", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeHandle("@Camila")).toBe("camila");
    expect(normalizeHandle("  ABC ")).toBe("abc");
  });
});

describe("validateHandleClient", () => {
  it("accepts valid handles (letters + underscore, 3–30, has a letter)", () => {
    expect(validateHandleClient("camila_restrepo").ok).toBe(true);
    expect(validateHandleClient("abc").ok).toBe(true);
    expect(validateHandleClient("@Camila").ok).toBe(true); // normalized first
  });

  it("rejects bad format (short, digits, dots, edge underscores, no letter)", () => {
    expect(validateHandleClient("ab").error).toBe("format"); // too short
    expect(validateHandleClient("has1digit").error).toBe("format"); // digit
    expect(validateHandleClient("dot.dot").error).toBe("format"); // dot
    expect(validateHandleClient("_lead").error).toBe("format");
    expect(validateHandleClient("trail_").error).toBe("format");
    expect(validateHandleClient("dou__ble").error).toBe("format");
    expect(validateHandleClient("___").error).toBe("format"); // no letter
    expect(validateHandleClient("a".repeat(31)).error).toBe("format"); // too long
  });

  it("rejects reserved handles", () => {
    expect(validateHandleClient("admin").error).toBe("reserved");
    expect(validateHandleClient("kinlo").error).toBe("reserved");
    expect(validateHandleClient("support").error).toBe("reserved");
  });
});

describe("suggestHandleFromName", () => {
  it("builds a lowercase underscore handle from a name", () => {
    expect(suggestHandleFromName("Camila Restrepo")).toBe("camila_restrepo");
  });
  it("strips accents and non-letters", () => {
    expect(suggestHandleFromName("José Ñandú")).toBe("jose_nandu");
    expect(suggestHandleFromName("Ana-María 23")).toBe("ana_maria");
  });
  it("always returns a value matching the handle charset", () => {
    for (const n of ["A", "", "李四", "Bob"]) {
      expect(suggestHandleFromName(n)).toMatch(/^[a-z_]{3,30}$/);
    }
  });
});
