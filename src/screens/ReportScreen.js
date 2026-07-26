import React, { useState } from 'react';
import Icon from '../components/Icon';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { reportUserOrEvent } from '../services/reportService';
import { useTheme } from '../contexts/ThemeContext';
import Colors from '../constants/Colors';
import Sizes from '../constants/Sizes';
import { REPORT_REASON_KEYS } from '../constants/reportReasons';

export default function ReportScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // route.params can be {} (SafetyCenterScreen's entry point) or even
  // undefined depending on how React Navigation delivers it — never assume
  // it's populated.
  const { targetUserId = null, targetEventId = null, targetName = null } =
    route.params || {};
  const type = targetUserId ? 'user' : targetEventId ? 'event' : 'general';
  // KIN-119: selectedReason stores the i18n KEY, never the translated label —
  // the label is only for display. Storing the label used to write e.g.
  // "Acoso o intimidación" / "Harassment or Bullying" to reports.reason
  // depending on the reporter's language, instead of a stable key every
  // reader (admin console, any language) can render consistently.
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert(t('report.errorTitle'), t('report.selectReasonError'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await reportUserOrEvent({
        targetUserId,
        targetEventId,
        targetName,
        reason: selectedReason,
        details: details.trim(),
      });

      // reportUserOrEvent never throws — it returns {success:false} on
      // failure (network, rules rejection, etc). Branching on it is what
      // stops a rejected write from showing the "thank you" success alert.
      if (!result.success) {
        Alert.alert(t('report.errorTitle'), t('report.submitFailedError'));
        return;
      }

      Alert.alert(
        t('report.submittedTitle'),
        t('report.submittedMessage'),
        [
          {
            text: t('report.ok'),
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert(t('report.errorTitle'), t('report.submitFailedError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {type === 'event' ? t('report.reportEventTitle') : t('report.reportUserTitle')}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {targetName != null && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              {t('report.reportingLabel')} <Text style={styles.infoHighlight}>{targetName}</Text>
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('report.sectionTitle')}</Text>

        {REPORT_REASON_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.reasonOption,
              selectedReason === key && styles.reasonSelected
            ]}
            onPress={() => setSelectedReason(key)}
          >
            <View style={[
              styles.radioCircle,
              selectedReason === key && styles.radioSelected
            ]}>
              {selectedReason === key && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.reasonText}>{t(`report.reasons.${key}`)}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('report.additionalDetailsLabel')}</Text>
          <TextInput
            style={styles.textArea}
            value={details}
            onChangeText={setDetails}
            placeholder={t('report.detailsPlaceholder')}
            multiline
            maxLength={500}
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.charCount}>{details.length}/500</Text>
        </View>

        <View style={styles.safetyNote}>
          <Icon name="privacy" size={22} color={colors.primary} />
          <Text style={styles.safetyText}>
            {t('report.safetyNote')}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>{t('report.submitButton')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Sizes.padding * 2,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
  content: {
    padding: Sizes.padding * 2,
  },
  infoCard: {
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: Sizes.borderRadius,
    marginBottom: 24,
  },
  infoText: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.text,
  },
  infoHighlight: {
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: Sizes.borderRadius,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  reasonText: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.text,
    flex: 1,
  },
  formGroup: {
    marginTop: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: Sizes.fontSize.medium,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Sizes.borderRadius,
    padding: 12,
    fontSize: Sizes.fontSize.medium,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
    textAlign: 'right',
    marginTop: 4,
  },
  safetyNote: {
    flexDirection: 'row',
    backgroundColor: '#EAF7F1',
    padding: 16,
    borderRadius: Sizes.borderRadius,
    marginBottom: 24,
  },
  safetyIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  safetyText: {
    flex: 1,
    fontSize: Sizes.fontSize.small,
    color: Colors.text,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: Colors.error,
    padding: Sizes.padding + 4,
    borderRadius: Sizes.borderRadius,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: Sizes.fontSize.large,
    fontWeight: '700',
  },
});
