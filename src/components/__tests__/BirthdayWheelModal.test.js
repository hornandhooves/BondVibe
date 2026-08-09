/**
 * KIN-207 — the birthday picker can only produce real calendar dates.
 *
 * The two free-text fields this replaces accepted 30 February and persisted it.
 * The claim now is stronger — an impossible pair is unreachable, "not even
 * transiently" — so the month→day clamp is exercised through the actual wheels
 * rather than trusted.
 *
 * The 29 February case is the one that looks like a bug and isn't: this feature
 * never stores a year, so leap-ness has nothing to attach to and the 29th must
 * always be offered. A month-length helper anchored on the real year would hide
 * that date from its owner in three years out of four.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import BirthdayWheelModal, { daysInMonth } from "../BirthdayWheelModal";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999",
      surface: "#fff", border: "#ddd", primary: "#7C3AED",
    },
  }),
}));
jest.mock("../Icon", () => "Icon");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k) => {
      const months = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      const m = /^gifting\.months\.m(\d+)$/.exec(k);
      return m ? months[Number(m[1])] : k;
    },
  }),
}));

const setup = (props = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <BirthdayWheelModal visible day={null} month={null} onSelect={onSelect} onClose={onClose} {...props} />
  );
  return { ...utils, onSelect, onClose };
};

describe("daysInMonth — anchored to a leap year on purpose", () => {
  it("gives February 29 days, always", () => {
    expect(daysInMonth(2)).toBe(29);
  });

  it("gives the right length for every month", () => {
    expect([1, 3, 5, 7, 8, 10, 12].map(daysInMonth)).toEqual([31, 31, 31, 31, 31, 31, 31]);
    expect([4, 6, 9, 11].map(daysInMonth)).toEqual([30, 30, 30, 30]);
  });

  it("does not depend on the current year", () => {
    // A helper written against `new Date().getFullYear()` would return 28 in a
    // non-leap year and silently break for anyone born on the 29th.
    expect(daysInMonth(2)).toBe(29);
  });
});

describe("BirthdayWheelModal", () => {
  it("offers 29 February and no 30th", () => {
    const { queryByTestId } = setup({ day: 1, month: 2 });
    expect(queryByTestId("birthday-day-29")).toBeTruthy();
    expect(queryByTestId("birthday-day-30")).toBeNull();
  });

  it("offers all 31 days in January", () => {
    const { queryByTestId } = setup({ day: 1, month: 1 });
    expect(queryByTestId("birthday-day-31")).toBeTruthy();
  });

  it("drops the 31st the moment the month becomes a 30-day one", () => {
    // 31 January, then switch to April. The invalid pair must not exist even
    // for one render.
    const { getByTestId, queryByTestId } = setup({ day: 31, month: 1 });
    expect(queryByTestId("birthday-day-31")).toBeTruthy();
    fireEvent.press(getByTestId("birthday-month-4"));
    expect(queryByTestId("birthday-day-31")).toBeNull();
    expect(queryByTestId("birthday-day-30")).toBeTruthy();
  });

  it("never confirms an impossible pair after a month change", () => {
    const { getByTestId, onSelect } = setup({ day: 31, month: 1 });
    fireEvent.press(getByTestId("birthday-month-2")); // 31 Jan → February
    fireEvent.press(getByTestId("birthday-done"));
    const [day, month] = onSelect.mock.calls[0];
    expect(month).toBe(2);
    expect(day).toBeLessThanOrEqual(daysInMonth(2));
    expect(day).toBe(29); // clamped to the last valid day, not reset to 1
  });

  it("confirms the untouched value and closes", () => {
    const { getByTestId, onSelect, onClose } = setup({ day: 15, month: 3 });
    fireEvent.press(getByTestId("birthday-done"));
    expect(onSelect).toHaveBeenCalledWith(15, 3);
    expect(onClose).toHaveBeenCalled();
  });

  it("starts on 1 January when there is no birthday yet", () => {
    const { getByTestId, onSelect } = setup({ day: null, month: null });
    fireEvent.press(getByTestId("birthday-done"));
    expect(onSelect).toHaveBeenCalledWith(1, 1);
  });

  it("repairs a legacy impossible pair on open instead of seeding it", () => {
    // The old text inputs could persist 31/02. Opening on that must not offer
    // or confirm it.
    const { getByTestId, queryByTestId, onSelect } = setup({ day: 31, month: 2 });
    expect(queryByTestId("birthday-day-31")).toBeNull();
    fireEvent.press(getByTestId("birthday-done"));
    expect(onSelect).toHaveBeenCalledWith(29, 2);
  });

  it("closes without confirming when the X is tapped", () => {
    const { getByTestId, onSelect, onClose } = setup({ day: 15, month: 3 });
    fireEvent.press(getByTestId("birthday-close"));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
