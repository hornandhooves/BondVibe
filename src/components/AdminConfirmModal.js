import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

/**
 * AdminConfirmModal - Confirmation dialog for dangerous admin actions
 *
 * Action types:
 * - 'remove_host' - Remove host role and cancel events
 * - 'remove_admin' - Remove admin role
 * - 'suspend' - Suspend user account
 * - 'unsuspend' - Unsuspend user account
 */
export default function AdminConfirmModal({
  visible,
  onClose,
  onConfirm,
  actionType,
  userName,
  userRole,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = () => {
    if (!confirmed) {
      alert(t("adminConfirmModal.checkConfirmation"));
      return;
    }

    if (actionType === "suspend" && !reason.trim()) {
      alert(t("adminConfirmModal.provideSuspendReason"));
      return;
    }

    onConfirm(reason.trim());
    setReason("");
    setConfirmed(false);
  };

  const handleClose = () => {
    setReason("");
    setConfirmed(false);
    onClose();
  };

  const getActionConfig = () => {
    switch (actionType) {
      case "remove_host":
        return {
          title: t("adminConfirmModal.removeHost.title"),
          description: t("adminConfirmModal.removeHost.description", { userName }),
          warning: t("adminConfirmModal.removeHost.warning"),
          confirmText: t("adminConfirmModal.removeHost.confirmText"),
          buttonText: t("adminConfirmModal.removeHost.buttonText"),
          buttonColor: "#FF453A",
          requiresReason: true,
          reasonPlaceholder: t("adminConfirmModal.removeHost.reasonPlaceholder"),
        };
      case "remove_admin":
        return {
          title: t("adminConfirmModal.removeAdmin.title"),
          description: t("adminConfirmModal.removeAdmin.description", { userName }),
          warning: t("adminConfirmModal.removeAdmin.warning"),
          confirmText: t("adminConfirmModal.removeAdmin.confirmText"),
          buttonText: t("adminConfirmModal.removeAdmin.buttonText"),
          buttonColor: "#FF9F0A",
          requiresReason: false,
        };
      case "suspend":
        return {
          title: t("adminConfirmModal.suspend.title"),
          description: t("adminConfirmModal.suspend.description", { userName }),
          warning: t("adminConfirmModal.suspend.warning"),
          confirmText: t("adminConfirmModal.suspend.confirmText"),
          buttonText: t("adminConfirmModal.suspend.buttonText"),
          buttonColor: "#FF453A",
          requiresReason: true,
          reasonPlaceholder: t("adminConfirmModal.suspend.reasonPlaceholder"),
        };
      case "unsuspend":
        return {
          title: t("adminConfirmModal.unsuspend.title"),
          description: t("adminConfirmModal.unsuspend.description", { userName }),
          warning: t("adminConfirmModal.unsuspend.warning"),
          confirmText: t("adminConfirmModal.unsuspend.confirmText"),
          buttonText: t("adminConfirmModal.unsuspend.buttonText"),
          buttonColor: "#34C759",
          requiresReason: false,
        };
      default:
        return {
          title: t("adminConfirmModal.default.title"),
          description: t("adminConfirmModal.default.description"),
          warning: t("adminConfirmModal.default.warning"),
          confirmText: t("adminConfirmModal.default.confirmText"),
          buttonText: t("adminConfirmModal.default.buttonText"),
          buttonColor: "#FF453A",
          requiresReason: false,
        };
    }
  };

  const config = getActionConfig();
  const styles = createStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.modal}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Header */}
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {config.title}
            </Text>

            {/* User info */}
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.text }]}>
                {userName}
              </Text>
              {userRole && (
                <View
                  style={[
                    styles.roleBadge,
                    {
                      backgroundColor: `${colors.primary}26`,
                      borderColor: `${colors.primary}4D`,
                    },
                  ]}
                >
                  <Text style={[styles.roleText, { color: colors.primary }]}>
                    {userRole}
                  </Text>
                </View>
              )}
            </View>

            {/* Description */}
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {config.description}
            </Text>

            {/* Warning box */}
            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: "rgba(255, 69, 58, 0.1)",
                  borderColor: "rgba(255, 69, 58, 0.3)",
                },
              ]}
            >
              <Text style={styles.warningText}>
                <Icon name="alert" size={14} color={colors.warning} />{" "}
                {config.warning}
              </Text>
            </View>

            {/* Reason input (if required) */}
            {config.requiresReason && (
              <TextInput
                style={[
                  styles.reasonInput,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder={config.reasonPlaceholder}
                placeholderTextColor={colors.textTertiary}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
              />
            )}

            {/* Confirmation checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setConfirmed(!confirmed)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: colors.border,
                    backgroundColor: confirmed ? colors.primary : "transparent",
                  },
                ]}
              >
                {confirmed && (
                  <Icon name="check" size={14} color={colors.onPrimary} />
                )}
              </View>
              <Text style={[styles.checkboxText, { color: colors.text }]}>
                {config.confirmText}
              </Text>
            </TouchableOpacity>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
              >
                <View
                  style={[
                    styles.cancelGlass,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.cancelText, { color: colors.textSecondary }]}
                  >
                    {t("adminConfirmModal.cancel")}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { opacity: confirmed ? 1 : 0.5 }]}
                onPress={handleSubmit}
                disabled={!confirmed}
              >
                <View
                  style={[
                    styles.confirmGlass,
                    {
                      backgroundColor: `${config.buttonColor}26`,
                      borderColor: `${config.buttonColor}4D`,
                    },
                  ]}
                >
                  <Text
                    style={[styles.confirmText, { color: config.buttonColor }]}
                  >
                    {config.buttonText}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    modal: {
      width: "90%",
      maxWidth: 500,
    },
    modalContent: {
      borderWidth: 1,
      borderRadius: 24,
      padding: 24,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    userInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    userName: {
      fontSize: 18,
      fontWeight: "600",
    },
    roleBadge: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    roleText: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 16,
    },
    warningBox: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    warningText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.error,
      lineHeight: 20,
    },
    reasonInput: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      marginBottom: 16,
      minHeight: 80,
      textAlignVertical: "top",
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 20,
      gap: 12,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 1,
      borderRadius: 6,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 2,
    },
    checkboxText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    actionsRow: {
      flexDirection: "row",
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      borderRadius: 12,
      overflow: "hidden",
    },
    cancelGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
    },
    cancelText: {
      fontSize: 15,
      fontWeight: "600",
    },
    confirmButton: {
      flex: 1,
      borderRadius: 12,
      overflow: "hidden",
    },
    confirmGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
    },
    confirmText: {
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
