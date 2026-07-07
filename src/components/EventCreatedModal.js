import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

export default function EventCreatedModal({
  visible,
  onClose,
  eventTitle,
  eventsCount = 1,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const isRecurring = eventsCount > 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDark ? "#1a1a2e" : "#ffffff",
              borderColor: colors.border,
            },
          ]}
        >
          {/* Success Icon */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.brandSoft },
            ]}
          >
            <Icon
              name={isRecurring ? "repeat" : "successCircle"}
              size={36}
              color={colors.primary}
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {isRecurring ? t("eventCreatedModal.eventsCreatedTitle") : t("eventCreatedModal.eventCreatedTitle")}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {isRecurring
              ? t("eventCreatedModal.recurringMessage", { eventTitle })
              : t("eventCreatedModal.singleMessage", { eventTitle })}
          </Text>

          {/* Events Count Badge (for recurring) */}
          {isRecurring && (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: `${colors.primary}15` },
              ]}
            >
              <Text style={[styles.countNumber, { color: colors.primary }]}>
                {eventsCount}
              </Text>
              <Text
                style={[styles.countLabel, { color: colors.textSecondary }]}
              >
                {t("eventCreatedModal.eventsScheduled")}
              </Text>
            </View>
          )}

          {/* Info Text */}
          <Text style={[styles.infoText, { color: colors.textTertiary }]}>
            {isRecurring
              ? t("eventCreatedModal.recurringInfo")
              : t("eventCreatedModal.singleInfo")}
          </Text>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>
              {isRecurring ? t("eventCreatedModal.viewMyEvents") : t("eventCreatedModal.gotIt")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 16,
    gap: 8,
  },
  countNumber: {
    fontSize: 32,
    fontWeight: "800",
  },
  countLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  infoText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    fontStyle: "italic",
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
