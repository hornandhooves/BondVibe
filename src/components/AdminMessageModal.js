import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function AdminMessageModal({ visible, onClose, onSubmit, title, userName, type }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      alert(t('adminMessageModal.provideMessage'));
      return;
    }

    setSubmitting(true);
    await onSubmit(message.trim());
    setSubmitting(false);
    setMessage('');
    onClose();
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  const styles = createStyles(colors, type);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={handleClose}
        />
        
        <View style={[styles.modal, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('adminMessageModal.forUser', { userName })}
            </Text>
          </View>

          <View style={styles.content}>
            <Text style={[styles.label, { color: colors.text }]}>
              {type === 'approve'
                ? t('adminMessageModal.whyApproving')
                : t('adminMessageModal.whyRejecting')}
            </Text>
            <View style={[styles.inputWrapper, {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border
            }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder={t('adminMessageModal.writeMessagePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                maxLength={300}
                autoFocus
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {message.length}/300
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={submitting}
            >
              <View style={[styles.cancelGlass, {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border
              }]}>
                <Text style={[styles.cancelText, { color: colors.text }]}>{t('adminMessageModal.cancel')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={submitting || !message.trim()}
            >
              <View style={[
                styles.submitGlass,
                {
                  backgroundColor: type === 'approve' 
                    ? 'rgba(52, 199, 89, 0.1)' 
                    : 'rgba(255, 69, 58, 0.1)',
                  borderColor: type === 'approve' 
                    ? 'rgba(52, 199, 89, 0.3)' 
                    : 'rgba(255, 69, 58, 0.3)',
                  opacity: submitting || !message.trim() ? 0.5 : 1
                }
              ]}>
                <Text style={[
                  styles.submitText,
                  { color: type === 'approve' ? '#34C759' : '#FF453A' }
                ]}>
                  {submitting ? t('adminMessageModal.processing') : type === 'approve' ? t('adminMessageModal.approve') : t('adminMessageModal.reject')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors, type) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modal: {
      width: '90%',
      maxWidth: 500,
      borderRadius: 24,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.3,
      shadowRadius: 30,
      elevation: 20,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 6,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 14,
    },
    content: {
      marginBottom: 24,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 12,
    },
    inputWrapper: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 8,
    },
    input: {
      fontSize: 15,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    charCount: {
      fontSize: 12,
      textAlign: 'right',
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      borderRadius: 12,
      overflow: 'hidden',
    },
    cancelGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
    },
    submitButton: {
      flex: 1,
      borderRadius: 12,
      overflow: 'hidden',
    },
    submitGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitText: {
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
