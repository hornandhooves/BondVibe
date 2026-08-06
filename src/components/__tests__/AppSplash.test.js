import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

import AppSplash from "../AppSplash";

describe("AppSplash", () => {
  it("renders the wordmark without crashing", () => {
    const { getByText } = render(<AppSplash />);
    expect(getByText("KINLO")).toBeTruthy();
  });
});
