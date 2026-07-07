import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from './Icon';
import { useTheme } from "../contexts/ThemeContext";

export default function LegalDocumentModal({
  visible,
  onClose,
  title,
  content,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Split content into paragraphs for better rendering
  const renderContent = () => {
    if (!content) {
      return (
        <Text style={[styles.paragraph, { color: colors.error }]}>
          {t("legalDocumentModal.errorNoContent")}
        </Text>
      );
    }

    // Split by double newlines to get paragraphs
    const paragraphs = content.split("\n\n").filter((p) => p.trim());

    if (paragraphs.length === 0) {
      return (
        <Text style={[styles.paragraph, { color: colors.warning }]}>
          {t("legalDocumentModal.noParagraphsFound")}
        </Text>
      );
    }

    return paragraphs.map((paragraph, index) => (
      <Text key={index} style={[styles.paragraph, { color: colors.text }]}>
        {paragraph.trim()}
      </Text>
    ));
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContainer, { backgroundColor: colors.surface }]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content - FIX: nestedScrollEnabled for Android */}
          <View style={styles.contentWrapper}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={Platform.OS === "ios"}
            >
              {renderContent()}
            </ScrollView>
          </View>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.button}>
              <View
                style={[
                  styles.buttonGlass,
                  {
                    backgroundColor: `${colors.primary}33`,
                    borderColor: `${colors.primary}66`,
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: colors.primary }]}>
                  {t("legalDocumentModal.close")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 600,
    height: "80%",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 24,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 28,
    fontWeight: "300",
  },
  contentWrapper: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
  },
  button: {
    borderRadius: 16,
    overflow: "hidden",
  },
  buttonGlass: {
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
