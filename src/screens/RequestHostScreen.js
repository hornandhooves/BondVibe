import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useTheme } from '../contexts/ThemeContext';
import SuccessModal from '../components/SuccessModal';
import { Sparkles } from 'lucide-react-native';

export default function RequestHostScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [formData, setFormData] = useState({
    whyHost: '',
    experience: '',
    eventIdeas: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
    emoji: '🎉'
  });

  const handleSubmit = async () => {
    console.log('📝 Starting submission...');
    
    // Validación
    if (!formData.whyHost.trim() || !formData.experience.trim() || !formData.eventIdeas.trim()) {
      console.log('❌ Form incomplete');
      Alert.alert('Incomplete Form', 'Please fill in all fields before submitting.');
      return;
    }

    setSubmitting(true);
    console.log('⏳ Submitting...');

    try {
      // Verificar si ya tiene una solicitud pendiente
      const existingQuery = query(
        collection(db, 'hostRequests'),
        where('userId', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        console.log('⚠️ Already has pending request - showing modal');
        setSubmitting(false);
        setModalConfig({
          visible: true,
          title: 'Request Already Submitted',
          message: 'You already have a pending host request. Please wait for admin review. We\'ll notify you once a decision has been made.',
          emoji: '⏳'
        });
        return;
      }

      // Crear nueva solicitud
      console.log('📤 Creating request...');
      await addDoc(collection(db, 'hostRequests'), {
        userId: auth.currentUser.uid,
        whyHost: formData.whyHost.trim(),
        experience: formData.experience.trim(),
        eventIdeas: formData.eventIdeas.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      console.log('✅ Host request submitted successfully');
      setSubmitting(false);
      
      // Mostrar modal de éxito
      console.log('🎉 Showing success modal');
      setModalConfig({
        visible: true,
        title: 'Application Submitted!',
        message: 'Your host request has been submitted successfully. Our team will review it soon and notify you of the decision.',
        emoji: '🎉'
      });
      
    } catch (error) {
      console.error('❌ Error submitting host request:', error);
      setSubmitting(false);
      Alert.alert(
        'Submission Error',
        'Could not submit your request. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleModalClose = () => {
    console.log('👋 Closing modal and navigating to Home');
    setModalConfig({ ...modalConfig, visible: false });
    navigation.navigate('Home');
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Become a Host</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introSection}>
          <View style={[styles.introIconCircle, {
            backgroundColor: `${colors.primary}1A`,
            borderColor: `${colors.primary}40`,
          }]}>
            <Sparkles size={40} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.introTitle, { color: colors.text }]}>
            Share Your Passion
          </Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            As a host, you'll be able to create unlimited events and build your community. Tell us why you'd be a great host!
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Why do you want to be a host? *
            </Text>
            <View style={[styles.inputWrapper, {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border
            }]}>
              <TextInput
                style={[styles.textArea, { color: colors.text }]}
                placeholder="Share your motivation..."
                placeholderTextColor={colors.textTertiary}
                value={formData.whyHost}
                onChangeText={(text) => setFormData({ ...formData, whyHost: text })}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {formData.whyHost.length}/500
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              What's your experience with organizing events? *
            </Text>
            <View style={[styles.inputWrapper, {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border
            }]}>
              <TextInput
                style={[styles.textArea, { color: colors.text }]}
                placeholder="Describe your background..."
                placeholderTextColor={colors.textTertiary}
                value={formData.experience}
                onChangeText={(text) => setFormData({ ...formData, experience: text })}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {formData.experience.length}/500
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              What kind of events would you like to host? *
            </Text>
            <View style={[styles.inputWrapper, {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border
            }]}>
              <TextInput
                style={[styles.textArea, { color: colors.text }]}
                placeholder="Share your ideas..."
                placeholderTextColor={colors.textTertiary}
                value={formData.eventIdeas}
                onChangeText={(text) => setFormData({ ...formData, eventIdeas: text })}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {formData.eventIdeas.length}/500
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <View style={[styles.submitGlass, {
            backgroundColor: `${colors.primary}33`,
            borderColor: `${colors.primary}66`,
            opacity: submitting ? 0.6 : 1
          }]}>
            {submitting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.submitText, { color: colors.primary, marginLeft: 12 }]}>
                  Submitting...
                </Text>
              </View>
            ) : (
              <Text style={[styles.submitText, { color: colors.primary }]}>
                Submit Application
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.noteSection}>
          <Text style={[styles.noteText, { color: colors.textTertiary }]}>
            📋 Your application will be reviewed by our team. We'll notify you once a decision has been made.
          </Text>
        </View>
      </ScrollView>

      <SuccessModal
        visible={modalConfig.visible}
        onClose={handleModalClose}
        title={modalConfig.title}
        message={modalConfig.message}
        emoji={modalConfig.emoji}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 },
    backButton: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    introSection: { alignItems: 'center', marginBottom: 32 },
    introIconCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    introTitle: { fontSize: 24, fontWeight: '700', marginBottom: 12, letterSpacing: -0.4 },
    introText: { fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
    formSection: { marginBottom: 24 },
    inputGroup: { marginBottom: 24 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 12, letterSpacing: -0.2 },
    inputWrapper: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 8 },
    textArea: { fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
    charCount: { fontSize: 12, textAlign: 'right' },
    submitButton: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
    submitGlass: { borderWidth: 1, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },
    submitText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
    noteSection: { padding: 16, alignItems: 'center' },
    noteText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  });
}
