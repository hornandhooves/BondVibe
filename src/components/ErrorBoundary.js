import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { logCrash } from "../services/crashLogger";

/**
 * Catches React render crashes so the app shows a recoverable screen instead of
 * a white screen, and logs them to Firestore via crashLogger.
 */
export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const screen = (info?.componentStack || "").split("\n")[1]?.trim() || null;
    logCrash(error, { fatal: true, source: "boundary", screen });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Please try again.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = {
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0710", padding: 24 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 8 },
  body: { color: "#b9b1c6", textAlign: "center", marginBottom: 20 },
  btn: { backgroundColor: "#7C3AED", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "700" },
};
