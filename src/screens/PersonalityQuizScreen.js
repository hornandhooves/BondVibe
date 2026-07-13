import React, { useState } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import SuccessModal from "../components/SuccessModal";
import {
  PERSONALITY_QUESTIONS,
  SCALE_OPTIONS,
  DIMENSION_INFO,
} from "../utils/personalityQuiz";
import {
  calculatePersonalityScores,
  getQuizProgress,
  isQuizComplete,
} from "../utils/personalityScoring";

export default function PersonalityQuizScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);

  const currentQuestion = PERSONALITY_QUESTIONS[currentQuestionIndex];
  const progress = getQuizProgress(answers);
  const isComplete = isQuizComplete(answers);

  const handleAnswer = (value) => {
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: value,
    };
    setAnswers(newAnswers);

    // Auto-advance to next question
    if (currentQuestionIndex < PERSONALITY_QUESTIONS.length - 1) {
      setTimeout(() => {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }, 300);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < PERSONALITY_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleSubmit = async () => {
    if (!isComplete) {
      setShowIncompleteModal(true);
      return;
    }

    try {
      setIsSubmitting(true);

      // Calculate personality scores
      const scores = calculatePersonalityScores(answers);

      // Save to Firestore
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        personality: scores,
        personalityCompletedAt: new Date().toISOString(),
      });

      console.log("✅ Personality saved successfully:", scores);

      // Show success modal
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error saving personality:", error);
      alert(t("personalityQuiz.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    // Navigate back to Profile screen
    navigation.navigate("Profile");
  };

  const getCurrentAnswer = () => answers[currentQuestion.id];

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={handleSuccessClose}
        title={t("personalityQuiz.successTitle")}
        message={t("personalityQuiz.successMessage")}
        icon="brain"
        tone="brand"
      />

      {/* Incomplete Modal */}
      <SuccessModal
        visible={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        title={t("personalityQuiz.incompleteTitle")}
        message={t("personalityQuiz.incompleteMessage", { count: PERSONALITY_QUESTIONS.length })}
        icon="alert"
        tone="warning"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("personalityQuiz.headerTitle")}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${progress}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          {t("personalityQuiz.progressLabel", {
            current: currentQuestionIndex + 1,
            total: PERSONALITY_QUESTIONS.length,
            percent: progress,
          })}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Question Card */}
        <View
          style={[
            styles.questionCard,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.dimensionBadge}>
            <Icon
              name={DIMENSION_INFO[currentQuestion.dimension].icon}
              size={20}
              color={colors.primary}
              style={styles.dimensionIcon}
            />
            <Text
              style={[styles.dimensionText, { color: colors.textSecondary }]}
            >
              {t(`personalityQuiz.dimensions.${currentQuestion.dimension}.title`, {
                defaultValue: DIMENSION_INFO[currentQuestion.dimension].title,
              })}
            </Text>
          </View>

          <Text
            style={[styles.questionNumber, { color: colors.textSecondary }]}
          >
            {t("personalityQuiz.questionNumber", { number: currentQuestionIndex + 1 })}
          </Text>
          <Text style={[styles.questionText, { color: colors.text }]}>
            {t(`personalityQuiz.questions.q${currentQuestion.id}`, {
              defaultValue: currentQuestion.text,
            })}
          </Text>
        </View>

        {/* Answer Options */}
        <View style={styles.optionsContainer}>
          {SCALE_OPTIONS.map((option) => {
            const isSelected = getCurrentAnswer() === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.surfaceGlass,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleAnswer(option.value)}
                activeOpacity={0.7}
              >
                <Icon
                  name={option.icon}
                  size={24}
                  color={isSelected ? "#FFFFFF" : colors.text}
                  style={styles.optionIcon}
                />
                <Text
                  style={[
                    styles.optionLabel,
                    {
                      color: isSelected ? "#FFFFFF" : colors.text,
                    },
                  ]}
                >
                  {t(`personalityQuiz.scaleOptions.${option.value}`, {
                    defaultValue: option.label,
                  })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity
            style={[
              styles.navButton,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
                opacity: currentQuestionIndex === 0 ? 0.5 : 1,
              },
            ]}
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="back" size={14} color={colors.text} />
              <Text style={[styles.navButtonText, { color: colors.text }]}>{t("personalityQuiz.previous")}</Text>
            </View>
          </TouchableOpacity>

          {currentQuestionIndex === PERSONALITY_QUESTIONS.length - 1 ? (
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: isComplete
                    ? colors.primary
                    : colors.surfaceGlass,
                  borderColor: isComplete ? colors.primary : colors.border,
                  opacity: isSubmitting ? 0.6 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={!isComplete || isSubmitting}
            >
              <Text
                style={[
                  styles.submitButtonText,
                  { color: isComplete ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {isSubmitting ? t("personalityQuiz.submitting") : t("personalityQuiz.submit")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.navButton,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleNext}
            >
              <Text style={[styles.navButtonText, { color: colors.text }]}>
                {t("personalityQuiz.next")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Help Text */}
        <View style={styles.helpContainer}>
          <Text style={[styles.helpText, { color: colors.textTertiary }]}>
            {t("personalityQuiz.helpText")}
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: {
      fontSize: 16,
      fontWeight: "600",
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    progressContainer: {
      paddingHorizontal: 24,
      paddingBottom: 20,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: {
      height: "100%",
      borderRadius: 4,
    },
    progressText: {
      fontSize: 13,
      textAlign: "center",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    questionCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
    },
    dimensionBadge: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    dimensionIcon: {
      marginRight: 8,
    },
    dimensionText: {
      fontSize: 13,
      fontWeight: "600",
    },
    questionNumber: {
      fontSize: 13,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    questionText: {
      fontSize: 22,
      fontWeight: "600",
      lineHeight: 30,
      letterSpacing: -0.3,
    },
    optionsContainer: {
      gap: 12,
      marginBottom: 24,
    },
    optionButton: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
    },
    optionIcon: {
      marginRight: 12,
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    navigationContainer: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 20,
    },
    navButton: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      alignItems: "center",
    },
    navButtonText: {
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    submitButton: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      alignItems: "center",
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    helpContainer: {
      padding: 16,
      borderRadius: 12,
      backgroundColor: "rgba(255, 255, 255, 0.05)",
    },
    helpText: {
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
    },
  });
}
