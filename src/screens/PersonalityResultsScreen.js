import React from 'react';
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import GradientBackground from "../components/GradientBackground";
import { DIMENSION_INFO } from '../utils/personalityQuiz';
import { getPersonalityInsights } from '../utils/personalityScoring';

const { width } = Dimensions.get('window');
const RADAR_SIZE = width - 80;
const CENTER = RADAR_SIZE / 2;

export default function PersonalityResultsScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { scores } = route.params;

  const insights = getPersonalityInsights(scores);

  const dimensions = [
    { key: 'OPENNESS', angle: 0 },
    { key: 'CONSCIENTIOUSNESS', angle: 72 },
    { key: 'EXTRAVERSION', angle: 144 },
    { key: 'AGREEABLENESS', angle: 216 },
    { key: 'NEUROTICISM', angle: 288 },
  ];

  // Calculate points for radar chart
  const getPoint = (angle, distance) => {
    const radian = ((angle - 90) * Math.PI) / 180;
    return {
      x: CENTER + distance * Math.cos(radian),
      y: CENTER + distance * Math.sin(radian),
    };
  };

  const maxRadius = CENTER - 40;
  const dataPoints = dimensions.map((dim) => {
    const score = scores[dim.key] || 0;
    const distance = (score / 100) * maxRadius;
    return getPoint(dim.angle, distance);
  });

  // Create SVG path for the filled area
  const pathData = dataPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ') + ' Z';

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Your Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Text style={[styles.doneButton, { color: colors.primary }]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Message */}
        <View
          style={[
            styles.successCard,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.successIconTile}>
            <Icon name="successCircle" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>
            Profile Complete!
          </Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            We'll use this to match you with compatible groups and events.
          </Text>
        </View>

        {/* Radar Chart (Simplified Visualization) */}
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Your Big Five Profile
          </Text>

          <View style={styles.chartContainer}>
            {dimensions.map((dim) => {
              const info = DIMENSION_INFO[dim.key];
              const score = scores[dim.key] || 0;
              return (
                <View key={dim.key} style={styles.dimensionRow}>
                  <View style={styles.dimensionInfo}>
                    <Icon
                      name={info.icon}
                      size={24}
                      color={colors.primary}
                      style={styles.dimensionIcon}
                    />
                    <View style={styles.dimensionLabels}>
                      <Text style={[styles.dimensionName, { color: colors.text }]}>
                        {info.title.split(' ')[0]}
                      </Text>
                      <Text
                        style={[styles.dimensionTrait, { color: colors.textSecondary }]}
                      >
                        {score < 50 ? info.lowTrait : info.highTrait}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.barContainer}>
                    <View
                      style={[styles.barBackground, { backgroundColor: colors.border }]}
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: colors.primary,
                            width: `${score}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.scoreText, { color: colors.text }]}>
                      {score}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Insights */}
        <View style={styles.insightsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Your Insights
          </Text>
          {Object.keys(insights).map((dimension) => {
            const info = DIMENSION_INFO[dimension];
            const insight = insights[dimension];
            return (
              <View
                key={dimension}
                style={[
                  styles.insightCard,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.insightHeader}>
                  <Icon
                    name={info.icon}
                    size={24}
                    color={colors.primary}
                    style={styles.insightIcon}
                  />
                  <Text style={[styles.insightTitle, { color: colors.text }]}>
                    {info.title}
                  </Text>
                </View>
                <Text style={[styles.insightDescription, { color: colors.textSecondary }]}>
                  {info.description}
                </Text>
                <View style={styles.insightDivider} />
                <Text style={[styles.insightText, { color: colors.text }]}>
                  {insight.insight}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('SearchEvents')}
        >
          <Text style={styles.actionButtonText}>Find Compatible Events</Text>
        </TouchableOpacity>

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <Text style={[styles.infoText, { color: colors.textTertiary }]}>
            Your personality profile is private and only used for matching. You
            can retake the quiz anytime from your profile settings.
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: {
      fontSize: 16,
      fontWeight: '600',
    },
    doneButton: {
      fontSize: 16,
      fontWeight: '600',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    successCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 24,
    },
    successIconTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    successTitle: {
      fontSize: 24,
      fontWeight: '700',
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    successText: {
      fontSize: 15,
      textAlign: 'center',
      lineHeight: 22,
    },
    chartCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 20,
      letterSpacing: -0.3,
    },
    chartContainer: {
      gap: 16,
    },
    dimensionRow: {
      gap: 12,
    },
    dimensionInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    dimensionIcon: {
      marginRight: 12,
    },
    dimensionLabels: {
      flex: 1,
    },
    dimensionName: {
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    dimensionTrait: {
      fontSize: 12,
      marginTop: 2,
    },
    barContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    barBackground: {
      flex: 1,
      height: 12,
      borderRadius: 6,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 6,
    },
    scoreText: {
      fontSize: 16,
      fontWeight: '700',
      width: 32,
      textAlign: 'right',
    },
    insightsSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    insightCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
    },
    insightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    insightIcon: {
      marginRight: 12,
    },
    insightTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    insightDescription: {
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 12,
    },
    insightDivider: {
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      marginBottom: 12,
    },
    insightText: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
    },
    actionButton: {
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
      marginBottom: 20,
    },
    actionButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    infoFooter: {
      padding: 16,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    infoText: {
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
}
