/**
 * SignupScreen — first test file for this screen.
 *
 * Covers: Confirm Password fully removed (not just "the new behavior
 * works"), the missing-info guard still fires with password alone in the
 * condition, validatePassword still runs, and the password-requirements
 * block's focus-driven visibility (KIN — signup UX cleanup, 5-ago-2026
 * spec): hidden by default, shown on focus, stays visible on blur if the
 * password doesn't meet all five requirements yet, hides on blur once it
 * does. Also confirms the password field — now the LAST field — triggers
 * signup via onSubmitEditing.
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc } from "firebase/firestore";
import SignupScreen from "../SignupScreen";

jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: "#000", textSecondary: "#666", textTertiary: "#999",
      surfaceGlass: "#F1F0F4", border: "#ECE8F2", primary: "#7C3AED",
      success: "#1F8A6E",
    },
  }),
}));
jest.mock("../../contexts/AuthContext", () => ({
  useAuthContext: () => ({ setSignupInProgress: jest.fn() }),
}));
jest.mock("../../services/firebase", () => ({ auth: {}, db: {} }));
jest.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  signOut: jest.fn(() => Promise.resolve()),
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({})),
  setDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => () => Promise.resolve({ data: {} })),
}));
jest.mock("../../components/GradientBackground", () => {
  const { View } = require("react-native");
  function MockGradientBackground({ children }) {
    return <View>{children}</View>;
  }
  return MockGradientBackground;
});
jest.mock("../../components/Icon", () => "Icon");
jest.mock("../../components/LanguagePill", () => "LanguagePill");
jest.mock("../../components/SocialAuthButtons", () => "SocialAuthButtons");
jest.mock("../../components/SuccessModal", () => "SuccessModal");
jest.mock("../../components/BondVibeLogo", () => "BondVibeLogo");

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

// Meets all five validatePassword requirements.
const STRONG_PASSWORD = "StrongP@ss1";
// Fails all but length/lower/upper — no digit, no special char.
const WEAK_PASSWORD = "abc";

const setup = () => render(<SignupScreen navigation={navigation} />);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: "u1", email: "test@example.com" } });
});

describe("SignupScreen — Confirm Password removed", () => {
  it("has no Confirm Password field, label, or placeholder anywhere", () => {
    const { queryByText, queryByPlaceholderText, getAllByPlaceholderText } = setup();
    expect(queryByText("Confirm Password")).toBeNull();
    expect(queryByText("Confirmar contraseña")).toBeNull();
    expect(queryByPlaceholderText("Confirm Password")).toBeNull();
    // Structural check, not just text absence: exactly one password-shaped
    // field (the password field itself) should exist, not two.
    expect(getAllByPlaceholderText("Create a password").length).toBe(1);
  });

  it("still alerts on missing info with email/password empty (line-63 condition survives confirmPassword's removal)", () => {
    const { getByText } = setup();
    fireEvent.press(getByText("Sign Up"));
    expect(Alert.alert).toHaveBeenCalledWith("Error", "Please fill in all fields");
  });

  it("still runs validatePassword — a weak password is rejected even with email filled", () => {
    const { getByText, getByPlaceholderText } = setup();
    fireEvent.changeText(getByPlaceholderText("Email"), "test@example.com");
    fireEvent.changeText(getByPlaceholderText("Create a password"), WEAK_PASSWORD);
    fireEvent.press(getByText("Sign Up"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Weak Password",
      expect.stringContaining("Password must have"),
    );
  });
});

describe("SignupScreen — password requirements visibility (focus-driven)", () => {
  it("is hidden by default (password field not focused, empty)", () => {
    const { queryByText } = setup();
    expect(queryByText("At least 8 characters")).toBeNull();
  });

  it("shows when the password field gains focus", () => {
    const { getByPlaceholderText, getByText } = setup();
    fireEvent(getByPlaceholderText("Create a password"), "focus");
    expect(getByText("At least 8 characters")).toBeTruthy();
  });

  it("stays visible on blur if the password does not meet all five requirements", () => {
    const { getByPlaceholderText, getByText } = setup();
    const field = getByPlaceholderText("Create a password");
    fireEvent(field, "focus");
    fireEvent.changeText(field, WEAK_PASSWORD);
    fireEvent(field, "blur");
    expect(getByText("At least 8 characters")).toBeTruthy();
  });

  it("hides on blur once the password meets all five requirements", () => {
    const { getByPlaceholderText, queryByText } = setup();
    const field = getByPlaceholderText("Create a password");
    fireEvent(field, "focus");
    fireEvent.changeText(field, STRONG_PASSWORD);
    fireEvent(field, "blur");
    expect(queryByText("At least 8 characters")).toBeNull();
  });
});

describe("SignupScreen — password field is the last field", () => {
  it("onSubmitEditing on the password field triggers handleSignup", async () => {
    const { getByPlaceholderText } = setup();
    fireEvent.changeText(getByPlaceholderText("Email"), "test@example.com");
    const field = getByPlaceholderText("Create a password");
    fireEvent.changeText(field, STRONG_PASSWORD);

    await act(async () => {
      fireEvent(field, "submitEditing");
    });

    await waitFor(() =>
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        "test@example.com",
        STRONG_PASSWORD,
      ),
    );
    await waitFor(() => expect(setDoc).toHaveBeenCalled());
  });
});
