import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import Icon, { getCategoryIcon, getLocationIcon } from "./Icon";

/**
 * SelectDropdown Component
 *
 * A reusable dropdown selector for categories, locations, or any list of options
 * Supports single-select and multi-select modes
 *
 * @param {string} label - Label text above the dropdown
 * @param {string|array} value - Currently selected value(s) (id or array of ids for multiSelect)
 * @param {function} onValueChange - Callback when value changes
 * @param {array} options - Array of options: [{ id, label, icon? }]
 * @param {string} placeholder - Placeholder text when no value selected
 * @param {string} type - "category" | "location" | "language" | "default" (affects icon rendering)
 * @param {boolean} multiSelect - Enable multi-select mode with checkboxes
 */
export default function SelectDropdown({
  label,
  value,
  onValueChange,
  options = [],
  placeholder,
  type = "default",
  multiSelect = false,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const placeholderText = placeholder || t("selectDropdown.selectAnOption");

  // For multi-select, value is an array; for single-select, it's a string
  const selectedValues = multiSelect 
    ? (Array.isArray(value) ? value : [value].filter(Boolean))
    : [value];

  // Find the selected option(s)
  const selectedOptions = options.filter((opt) => selectedValues.includes(opt.id));

  // Get display text
  const getDisplayText = () => {
    if (selectedOptions.length === 0) return placeholderText;
    if (multiSelect) {
      if (selectedOptions.length === 1) return selectedOptions[0].label;
      if (selectedOptions.length === options.length) return t("selectDropdown.allLanguages");
      return selectedOptions.map(o => o.label).join(", ");
    }
    return selectedOptions[0]?.label || placeholderText;
  };

  // Handle option selection
  const handleSelect = (optionId) => {
    if (multiSelect) {
      let newValues;
      if (selectedValues.includes(optionId)) {
        // Remove if already selected (but keep at least one)
        newValues = selectedValues.filter(id => id !== optionId);
        if (newValues.length === 0) return; // Don't allow empty selection
      } else {
        // Add to selection
        newValues = [...selectedValues, optionId];
      }
      onValueChange(newValues);
    } else {
      onValueChange(optionId);
      setModalVisible(false);
    }
  };

  // Render icon based on type
  const renderIcon = (option, isSelected = false) => {
    const iconColor = isSelected ? colors.primary : colors.text;
    const iconSize = 22;

    if (type === "category") {
      const IconComponent = getCategoryIcon(option.id);
      return (
        <IconComponent size={iconSize} color={iconColor} strokeWidth={2} />
      );
    } else if (type === "location") {
      const IconComponent = getLocationIcon(option.id);
      return (
        <IconComponent size={iconSize} color={iconColor} strokeWidth={2} />
      );
    } else if (option.icon) {
      return <Icon name={option.icon} size={iconSize} color={iconColor} />;
    }
    return null;
  };

  // Render checkbox for multi-select
  const renderCheckbox = (isChecked) => {
    return (
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: isChecked ? colors.primary : "transparent",
            borderColor: isChecked ? colors.primary : colors.textSecondary,
          },
        ]}
      >
        {isChecked && (
          <Icon name="check" size={14} color="#FFFFFF" type="ui" />
        )}
      </View>
    );
  };

  const styles = createStyles(colors, isDark);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}

      {/* Dropdown Button */}
      <TouchableOpacity
        style={[
          styles.dropdownButton,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
          },
        ]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={styles.dropdownContent}>
          {!multiSelect && selectedOptions[0] && renderIcon(selectedOptions[0], false)}
          <Text
            style={[
              styles.dropdownText,
              { color: selectedOptions.length > 0 ? colors.text : colors.textTertiary },
            ]}
            numberOfLines={1}
          >
            {getDisplayText()}
          </Text>
        </View>
        <Icon name="down" size={20} color={colors.textSecondary} type="ui" />
      </TouchableOpacity>

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? "#1a1a2e" : "#ffffff",
                borderColor: colors.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {label || t("selectDropdown.selectOption")}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Icon
                  name="close"
                  size={24}
                  color={colors.textSecondary}
                  type="ui"
                />
              </TouchableOpacity>
            </View>

            {/* Options List */}
            <ScrollView
              style={styles.optionsList}
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const isSelected = selectedValues.includes(option.id);
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionItem,
                      {
                        backgroundColor: isSelected
                          ? `${colors.primary}15`
                          : "transparent",
                        borderColor: isSelected
                          ? `${colors.primary}40`
                          : "transparent",
                      },
                    ]}
                    onPress={() => handleSelect(option.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      {multiSelect ? (
                        renderCheckbox(isSelected)
                      ) : (
                        renderIcon(option, isSelected)
                      )}
                      <Text
                        style={[
                          styles.optionLabel,
                          {
                            color: isSelected ? colors.primary : colors.text,
                            fontWeight: isSelected ? "600" : "500",
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </View>
                    {!multiSelect && isSelected && (
                      <Icon
                        name="check"
                        size={20}
                        color={colors.primary}
                        type="ui"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Done button for multi-select */}
            {multiSelect && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.doneButtonText}>{t("selectDropdown.done")}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    container: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
      letterSpacing: -0.2,
    },
    dropdownButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    dropdownContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    dropdownText: {
      fontSize: 16,
      flex: 1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalContent: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "70%",
      borderRadius: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255, 255, 255, 0.1)",
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    closeButton: {
      padding: 4,
    },
    optionsList: {
      paddingVertical: 8,
    },
    optionItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      marginHorizontal: 8,
      marginVertical: 2,
      borderRadius: 12,
      borderWidth: 1,
    },
    optionContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      flex: 1,
    },
    optionLabel: {
      fontSize: 16,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    modalFooter: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.1)",
    },
    doneButton: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    doneButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
