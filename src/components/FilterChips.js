import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import Icon, { getCategoryIcon, getLocationIcon } from "./Icon";

/**
 * FilterChips Component
 *
 * Horizontal scrolling chips for filtering (used in Search screen)
 * Now with Lucide icons instead of emojis
 *
 * @param {string} label - Section label
 * @param {string} value - Currently selected value (id)
 * @param {function} onValueChange - Callback when value changes
 * @param {array} options - Array of options: [{ id, label }]
 * @param {string} type - "category" | "city" (affects icon rendering)
 */
export default function FilterChips({
  label,
  value,
  onValueChange,
  options = [],
  type = "category",
}) {
  const { colors } = useTheme();

  const renderIcon = (option, isSelected) => {
    const iconColor = isSelected ? colors.primary : colors.text;
    const iconSize = 18;

    if (type === "category") {
      if (option.id === "all") {
        return null; // No icon for "All" option
      }
      const IconComponent = getCategoryIcon(option.id);
      return (
        <IconComponent size={iconSize} color={iconColor} strokeWidth={2} />
      );
    } else if (type === "city") {
      const IconComponent = getLocationIcon(option.id);
      return (
        <IconComponent size={iconSize} color={iconColor} strokeWidth={2} />
      );
    }
    return null;
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {label}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {options.map((option) => {
          const isSelected = option.id === value;
          return (
            <TouchableOpacity
              key={option.id}
              style={styles.chip}
              onPress={() => onValueChange(option.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.chipGlass,
                  {
                    backgroundColor: isSelected
                      ? `${colors.primary}33`
                      : colors.surfaceGlass,
                    borderColor: isSelected
                      ? `${colors.primary}66`
                      : colors.border,
                  },
                ]}
              >
                {renderIcon(option, isSelected)}
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isSelected ? colors.primary : colors.text,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      marginBottom: 20,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    scrollContent: {
      gap: 10,
      paddingRight: 24,
    },
    chip: {
      borderRadius: 12,
      overflow: "hidden",
    },
    chipGlass: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
