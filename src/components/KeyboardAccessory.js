import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import {
  Keyboard,
  Platform,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";

/**
 * A floating "Done" bar that appears just above the keyboard on ANY screen,
 * for every keyboard type (numeric or alphabetic) where there's no built-in
 * dismiss key (e.g. multiline / numeric fields). Tapping it dismisses the
 * keyboard. Mounted once at the app root.
 *
 * Note: React Native <Modal> renders above the root, so inputs INSIDE a modal
 * need their own <KeyboardAccessory /> placed within the modal.
 */
export default function KeyboardAccessory() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) =>
      setKbHeight(e.endCoordinates?.height || 0)
    );
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  if (kbHeight <= 0) return null;

  // iOS overlays the keyboard (position above it). Android adjustResize shrinks
  // the window, so bottom:0 already sits just above the keyboard.
  const bottom = Platform.OS === "ios" ? kbHeight : 0;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          style={styles.btn}
          accessibilityLabel={t("keyboardAccessory.dismiss")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.txt, { color: colors.primary }]}>{t("keyboardAccessory.done")}</Text>
          <Icon name="down" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  bar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  txt: { fontSize: 15, fontWeight: "700" },
});
