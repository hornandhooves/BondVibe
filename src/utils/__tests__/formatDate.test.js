// KQA-002 regression: formatDate follows the app language.
// NOTE: the mock path is ../../i18n, not ../i18n as the ticket's snippet had it.
// jest.doMock resolves relative to THIS test file (src/utils/__tests__/), so
// ../i18n would point at src/utils/i18n (nonexistent) and never intercept the
// real src/i18n that formatDate imports.
describe("formatDate sigue el idioma de la app (KQA-002)", () => {
  afterEach(() => jest.resetModules());

  it("en 'en' → formato en-US (contiene 'Jul')", () => {
    jest.doMock("../../i18n", () => ({ language: "en" }));
    const { formatDate } = require("../formatDate");
    expect(formatDate("2026-07-17")).toMatch(/Jul/);
  });

  it("en 'es' → formato es-MX (contiene 'jul' minúscula)", () => {
    jest.resetModules();
    jest.doMock("../../i18n", () => ({ language: "es" }));
    const { formatDate } = require("../formatDate");
    expect(formatDate("2026-07-17")).toMatch(/jul/);
  });
});

// formatDateTime is the KQA-004 addition for the bare toLocaleString() spots
// (AdminDashboard, CheckInScanner). It must follow the same locale rule and
// include a time component.
describe("formatDateTime follows the app language and shows date + time (KQA-004)", () => {
  afterEach(() => jest.resetModules());

  it("en 'en' → English month and a time", () => {
    jest.doMock("../../i18n", () => ({ language: "en" }));
    const { formatDateTime } = require("../formatDate");
    const out = formatDateTime("2026-07-17T14:30:00");
    expect(out).toMatch(/Jul/);
    expect(out).toMatch(/\d:\d{2}/); // h:mm present
  });

  it("en 'es' → Spanish month", () => {
    jest.resetModules();
    jest.doMock("../../i18n", () => ({ language: "es" }));
    const { formatDateTime } = require("../formatDate");
    expect(formatDateTime("2026-07-17T14:30:00")).toMatch(/jul/);
  });
});
