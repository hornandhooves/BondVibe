import React, { useState } from 'react';
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
import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import Colors from '../constants/Colors';
import Sizes from '../constants/Sizes';

const REPORT_REASONS = [
  'Inappropriate content',
  'Harassment or bullying',
  'Spam or scam',
  'Safety concern',
  'Fake profile',
  'Offensive behavior',
  'Other',
];

export default function ReportScreen({ route, navigation }) {
  const { type, targetId, targetName } = route.params;
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        type,
        targetId,
        targetName,
        reportedBy: auth.currentUser.uid,
        reason: selectedReason,
        details: details.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      Alert.alert(
        'Report Submitted',
        'Thank you for helping keep Kinlo safe. We will review your report.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report {type === 'user' ? 'User' : 'Event'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Reporting: <Text style={styles.infoHighlight}>{targetName}</Text>
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Why are you reporting this?</Text>
        
        {REPORT_REASONS.map((reason) => (
          <TouchableOpacity
            key={reason}
            style={[
              styles.reasonOption,
              selectedReason === reason && styles.reasonSelected
            ]}
            onPress={() => setSelectedReason(reason)}
          >
            <View style={[
              styles.radioCircle,
              selectedReason === reason && styles.radioSelected
            ]}>
              {selectedReason === reason && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.reasonText}>{reason}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Additional Details (Optional)</Text>
          <TextInput
            style={styles.textArea}
            value={details}
            onChangeText={setDetails}
            placeholder="Provide any additional information..."
            multiline
            maxLength={500}
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.charCount}>{details.length}/500</Text>
        </View>

        <View style={styles.safetyNote}>
          <Text style={styles.safetyIcon}>🛡️</Text>
          <Text style={styles.safetyText}>
            Your report is anonymous. We take all reports seriously and will investigate promptly.
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
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
    borderWidth: 2,
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
    backgroundColor: '#E8F5E9',
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
