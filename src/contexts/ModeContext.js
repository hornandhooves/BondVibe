/**
 * ModeContext — Host Mode (§1.3): 'attending' | 'hosting'.
 * The header [Attending|Hosting] toggle writes it; the Events tab (and the
 * Rentals fleet section) read it to pick their root. Persisted in AsyncStorage
 * so the choice survives relaunch. Non-hosts are always 'attending'.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kinlo.mode";

const ModeContext = createContext({
  mode: "attending",
  setMode: () => {},
  isHosting: false,
});

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState("attending");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "hosting" || saved === "attending") setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next) => {
    const value = next === "hosting" ? "hosting" : "attending";
    setModeState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  }, []);

  return (
    <ModeContext.Provider value={{ mode, setMode, isHosting: mode === "hosting" }}>
      {children}
    </ModeContext.Provider>
  );
}

export const useMode = () => useContext(ModeContext);
