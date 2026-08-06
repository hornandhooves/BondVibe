import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      text: "#2b2b2b",
      textSecondary: "#666",
      textTertiary: "#999",
      sunken: "#e3ddd2",
      borderLight: "#f2ede3",
      primary: "#1e4d45",
      success: "#1F8A6E",
      error: "#c25b5b",
    },
  }),
}));

import TextField from "../TextField";

describe("TextField", () => {
  it("renders label, placeholder, and fires onChangeText", () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <TextField
        label="Email"
        placeholder="you@example.com"
        icon="mail"
        value=""
        onChangeText={onChangeText}
      />
    );
    expect(getByText("Email")).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText("you@example.com"), "a@b.com");
    expect(onChangeText).toHaveBeenCalledWith("a@b.com");
  });

  it("shows helper text for the error status", () => {
    const { getByText } = render(
      <TextField status="error" helperText="This is your helper text" onChangeText={() => {}} />
    );
    expect(getByText("This is your helper text")).toBeTruthy();
  });

  it("is not editable when disabled", () => {
    const { getByPlaceholderText } = render(
      <TextField placeholder="Placeholder text" disabled onChangeText={() => {}} />
    );
    expect(getByPlaceholderText("Placeholder text").props.editable).toBe(false);
  });
});
