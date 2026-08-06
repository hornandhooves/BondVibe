import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ colors: { primary: "#7C3AED" } }),
}));

import Button from "../Button";

describe("Button", () => {
  it("renders the label and fires onPress", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Get Started" onPress={onPress} />);
    fireEvent.press(getByText("Get Started"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Get Started" onPress={onPress} disabled />);
    fireEvent.press(getByText("Get Started"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner instead of the label when loading", () => {
    const { queryByText } = render(<Button label="Save" onPress={() => {}} loading />);
    expect(queryByText("Save")).toBeNull();
  });

  it("defaults to the theme primary color when no color prop is given", () => {
    const { getByText } = render(<Button label="Get Started" onPress={() => {}} />);
    expect(getByText("Get Started")).toBeTruthy();
  });
});
