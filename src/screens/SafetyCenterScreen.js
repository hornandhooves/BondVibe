import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Colors from '../constants/Colors';
import Sizes from '../constants/Sizes';

export default function SafetyCenterScreen({ navigation }) {
  return (
    <ScrollView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.content}>
        <Text style={styles.emoji}>🛡️</Text>
        <Text style={styles.title}>Safety Center</Text>
        <Text style={styles.subtitle}>
          Your safety is our priority
        </Text>

        {/* Safety Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Tips</Text>
          
          <View style={styles.tip}>
            <Text style={styles.tipIcon}>👥</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Meet in Public Places</Text>
              <Text style={styles.tipText}>
                Always choose well-lit, public venues for first meetings.
              </Text>
            </View>
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipIcon}>📱</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Tell a Friend</Text>
              <Text style={styles.tipText}>
                Let someone know where you're going and when you'll be back.
              </Text>
            </View>
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipIcon}>🚨</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Trust Your Instincts</Text>
              <Text style={styles.tipText}>
                If something feels wrong, leave immediately. Your safety comes first.
              </Text>
            </View>
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipIcon}>💳</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Keep Personal Info Private</Text>
              <Text style={styles.tipText}>
                Don't share your address, financial info, or last name until you feel comfortable.
              </Text>
            </View>
          </View>

          <View style={styles.tip}>
            <Text style={styles.tipIcon}>🚗</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Arrange Your Own Transport</Text>
              <Text style={styles.tipText}>
                Use your own transportation to and from events.
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In Case of Emergency</Text>
          <View style={styles.emergencyBox}>
            <Text style={styles.emergencyText}>
              If you feel unsafe or witness concerning behavior:
            </Text>
            <Text style={styles.emergencyNumber}>🚨 Call 911 (or local emergency)</Text>
            <Text style={styles.emergencySubtext}>
              Your safety is more important than any social situation.
            </Text>
          </View>
        </View>

        {/* Report */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Inappropriate Behavior</Text>
          <Text style={styles.reportText}>
            If you experience harassment, threats, or inappropriate behavior, please report it immediately.
          </Text>
          <TouchableOpacity style={styles.reportButton}>
            <Text style={styles.reportButtonText}>Report a User</Text>
          </TouchableOpacity>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.contactText}>
            For non-emergency safety concerns:
          </Text>
          <Text style={styles.contactEmail}>safety@bondvibe.com</Text>
          <Text style={styles.contactNote}>
            We respond to safety reports within 24 hours.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Sizes.padding * 2,
  },
  emoji: {
    fontSize: 60,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: Sizes.fontSize.xlarge,
    fontWeight: 'bold',
    color: Colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  tip: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: colors.sunken,
    padding: 16,
    borderRadius: Sizes.borderRadius,
  },
  tipIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: Sizes.fontSize.medium,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  tipText: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
    lineHeight: 20,
  },
  emergencyBox: {
    backgroundColor: '#FFF3F3',
    padding: 20,
    borderRadius: Sizes.borderRadius,
    borderWidth: 2,
    borderColor: Colors.error,
  },
  emergencyText: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.text,
    marginBottom: 12,
  },
  emergencyNumber: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.error,
    marginBottom: 8,
  },
  emergencySubtext: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
  },
  reportText: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 22,
  },
  reportButton: {
    backgroundColor: Colors.error,
    padding: Sizes.padding,
    borderRadius: Sizes.borderRadius,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#FFFFFF',
    fontSize: Sizes.fontSize.medium,
    fontWeight: '600',
  },
  contactText: {
    fontSize: Sizes.fontSize.medium,
    color: Colors.text,
    marginBottom: 8,
  },
  contactEmail: {
    fontSize: Sizes.fontSize.medium,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 8,
  },
  contactNote: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
  },
});
