import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import Icon from './Icon';
import { FONTS, RADII, SPACING } from '../constants/theme-tokens';

/**
 * Shared text field per the "08/Text Fields" design-system spec:
 * Default / Focused / Filled / Success / Error / Disabled states, an
 * optional leading icon, and helper text (with a check/x mark for
 * success/error). `status` overrides the auto focus/filled border logic
 * when you need to show a validation result.
 */
export default function TextField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  status, // 'success' | 'error' | undefined
  helperText,
  disabled = false,
  rightElement,
  style,
  inputStyle,
  onFocus,
  onBlur,
  ...inputProps
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const showBorder = status === 'success' || status === 'error' || focused || !!value;
  const borderColor =
    status === 'success' ? colors.success : status === 'error' ? colors.error : colors.primary;

  return (
    <View style={style}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <View
        style={[
          styles.wrapper,
          {
            backgroundColor: disabled ? colors.borderLight : colors.sunken,
            borderColor: showBorder && !disabled ? borderColor : 'transparent',
            borderWidth: showBorder && !disabled ? 1.5 : 0,
          },
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={18}
            color={colors.textTertiary}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          editable={!disabled}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: disabled ? colors.textTertiary : colors.text },
            inputStyle,
          ]}
          {...inputProps}
        />
        {rightElement}
      </View>
      {helperText ? (
        <View style={styles.helperRow}>
          {status === 'success' && <Icon name="check" size={13} color={colors.success} />}
          {status === 'error' && <Icon name="close" size={13} color={colors.error} />}
          <Text
            style={[
              styles.helperText,
              { color: status === 'error' ? colors.error : status === 'success' ? colors.success : colors.textSecondary },
            ]}
          >
            {helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: FONTS.bodySemibold,
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  wrapper: {
    borderRadius: RADII.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  icon: { marginRight: SPACING.sm + 2 },
  input: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 14,
    paddingVertical: SPACING.lg,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  helperText: {
    fontFamily: FONTS.body,
    fontSize: 12,
  },
});
