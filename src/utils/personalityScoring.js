// Personality Scoring Algorithm for Big Five (OCEAN)

import { PERSONALITY_DIMENSIONS, PERSONALITY_QUESTIONS } from './personalityQuiz';

/**
 * Calculate Big Five scores from quiz answers
 * @param {Object} answers - Object with question IDs as keys and 1-5 ratings as values
 * @returns {Object} Scores for each dimension (0-100 scale)
 */
export const calculatePersonalityScores = (answers) => {
  const scores = {
    OPENNESS: 0,
    CONSCIENTIOUSNESS: 0,
    EXTRAVERSION: 0,
    AGREEABLENESS: 0,
    NEUROTICISM: 0,
  };

  const counts = {
    OPENNESS: 0,
    CONSCIENTIOUSNESS: 0,
    EXTRAVERSION: 0,
    AGREEABLENESS: 0,
    NEUROTICISM: 0,
  };

  // Calculate sum for each dimension
  PERSONALITY_QUESTIONS.forEach((question) => {
    const answer = answers[question.id];
    if (answer) {
      const dimension = question.dimension;
      
      // Reverse scoring for reverse-coded questions
      const score = question.reverse ? (6 - answer) : answer;
      
      scores[dimension] += score;
      counts[dimension]++;
    }
  });

  // Convert to 0-100 scale
  const normalizedScores = {};
  Object.keys(scores).forEach((dimension) => {
    const count = counts[dimension];
    if (count > 0) {
      // Average score (1-5), then convert to 0-100
      const avgScore = scores[dimension] / count;
      normalizedScores[dimension] = Math.round(((avgScore - 1) / 4) * 100);
    } else {
      normalizedScores[dimension] = 0;
    }
  });

  return normalizedScores;
};

/**
 * Calculate compatibility between two personality profiles
 * @param {Object} profile1 - First user's personality scores
 * @param {Object} profile2 - Second user's personality scores
 * @returns {number} Compatibility score (0-100)
 */
export const calculateCompatibility = (profile1, profile2) => {
  if (!profile1 || !profile2) return 0;

  // Weights for each dimension in compatibility calculation
  const weights = {
    EXTRAVERSION: 0.30,      // Similar extraversion = better social interaction
    AGREEABLENESS: 0.25,     // Similar agreeableness = less conflict
    OPENNESS: 0.20,          // Some diversity is good for interesting conversations
    CONSCIENTIOUSNESS: 0.15, // Moderate importance
    NEUROTICISM: 0.10,       // Lower weight, some diversity is okay
  };

  let totalCompatibility = 0;

  Object.keys(weights).forEach((dimension) => {
    const score1 = profile1[dimension] || 0;
    const score2 = profile2[dimension] || 0;
    const difference = Math.abs(score1 - score2);

    // For OPENNESS, we want some diversity (sweet spot at 20-30 difference)
    let dimensionCompatibility;
    if (dimension === 'OPENNESS') {
      if (difference <= 30) {
        dimensionCompatibility = 100 - (difference * 1.5);
      } else {
        dimensionCompatibility = 100 - difference;
      }
    } else {
      // For other dimensions, similarity is better
      dimensionCompatibility = 100 - difference;
    }

    totalCompatibility += dimensionCompatibility * weights[dimension];
  });

  return Math.round(Math.max(0, Math.min(100, totalCompatibility)));
};

// A profile is usable only if it has Big Five numeric scores (some users stored
// raw answers instead; those can't be scored).
export const isBigFive = (p) =>
  !!p &&
  typeof p === "object" &&
  ["OPENNESS", "CONSCIENTIOUSNESS", "EXTRAVERSION", "AGREEABLENESS", "NEUROTICISM"].some(
    (d) => typeof p[d] === "number"
  );

const DIMENSION_PHRASES = {
  OPENNESS: "love trying new things",
  CONSCIENTIOUSNESS: "value planning and reliability",
  EXTRAVERSION: "enjoy being social",
  AGREEABLENESS: "are warm and easygoing",
  NEUROTICISM: "are emotionally in tune",
};

/**
 * Explainable, humble fit between two profiles. Returns null unless both are
 * real Big Five profiles AND the fit is meaningful (>=60) — never a fake number.
 * @returns {{label:string, strong:boolean, score:number, why:string}|null}
 */
export const getMatchInsight = (a, b) => {
  if (!isBigFive(a) || !isBigFive(b)) return null;
  const score = calculateCompatibility(a, b);
  if (score < 60) return null;
  let best = null;
  let bestVal = -1;
  Object.keys(DIMENSION_PHRASES).forEach((d) => {
    const shared = Math.min(a[d] || 0, b[d] || 0);
    if (shared > bestVal) {
      bestVal = shared;
      best = d;
    }
  });
  return {
    label: score >= 80 ? "Great fit" : "Good fit",
    strong: score >= 80,
    score,
    why: best ? `You both ${DIMENSION_PHRASES[best]}` : "",
  };
};

/**
 * Calculate group compatibility for an event
 * @param {Object} userProfile - Current user's personality profile
 * @param {Array} attendeeProfiles - Array of attendee personality profiles
 * @returns {Object} Group compatibility metrics
 */
export const calculateGroupCompatibility = (userProfile, attendeeProfiles) => {
  if (!userProfile || !attendeeProfiles || attendeeProfiles.length === 0) {
    return {
      averageCompatibility: 0,
      bestMatch: null,
      groupDiversity: 0,
      recommendation: 'Not enough data',
    };
  }

  // Calculate compatibility with each attendee
  const compatibilityScores = attendeeProfiles.map((attendeeProfile) => ({
    profile: attendeeProfile,
    score: calculateCompatibility(userProfile, attendeeProfile),
  }));

  const averageCompatibility = Math.round(
    compatibilityScores.reduce((sum, item) => sum + item.score, 0) / compatibilityScores.length
  );

  const bestMatch = compatibilityScores.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  // Calculate group diversity (variance in personality dimensions)
  const allProfiles = [userProfile, ...attendeeProfiles];
  const dimensionVariances = {};
  
  Object.keys(PERSONALITY_DIMENSIONS).forEach((dimension) => {
    const scores = allProfiles.map((profile) => profile[dimension] || 0);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    dimensionVariances[dimension] = variance;
  });

  const groupDiversity = Math.round(
    Object.values(dimensionVariances).reduce((sum, v) => sum + v, 0) / 5
  );

  // Generate recommendation
  let recommendation;
  if (averageCompatibility >= 80) {
    recommendation = 'Excellent match! 🌟';
  } else if (averageCompatibility >= 65) {
    recommendation = 'Great fit! ✨';
  } else if (averageCompatibility >= 50) {
    recommendation = 'Good potential 👍';
  } else if (averageCompatibility >= 35) {
    recommendation = 'Moderate match 🤔';
  } else {
    recommendation = 'Diverse group 🌈';
  }

  return {
    averageCompatibility,
    bestMatch: bestMatch.score,
    groupDiversity,
    recommendation,
    compatibilityScores,
  };
};

/**
 * Get personality insights based on scores
 * @param {Object} scores - Personality scores
 * @returns {Object} Insights for each dimension
 */
export const getPersonalityInsights = (scores) => {
  const insights = {};

  Object.keys(scores).forEach((dimension) => {
    const score = scores[dimension];
    let insight = '';

    switch (dimension) {
      case 'OPENNESS':
        if (score >= 70) {
          insight = 'You love exploring new ideas and experiences. Perfect for adventure events!';
        } else if (score >= 40) {
          insight = 'You appreciate both new experiences and familiar comforts.';
        } else {
          insight = 'You prefer tried-and-true experiences. Great for traditional gatherings!';
        }
        break;

      case 'CONSCIENTIOUSNESS':
        if (score >= 70) {
          insight = 'You\'re highly organized and reliable. Great for planning events!';
        } else if (score >= 40) {
          insight = 'You balance structure with flexibility.';
        } else {
          insight = 'You\'re spontaneous and go with the flow!';
        }
        break;

      case 'EXTRAVERSION':
        if (score >= 70) {
          insight = 'You thrive in social settings and bring energy to groups!';
        } else if (score >= 40) {
          insight = 'You enjoy socializing but also value alone time.';
        } else {
          insight = 'You prefer intimate gatherings and meaningful one-on-one connections.';
        }
        break;

      case 'AGREEABLENESS':
        if (score >= 70) {
          insight = 'You\'re empathetic and cooperative. Great for building group harmony!';
        } else if (score >= 40) {
          insight = 'You balance being agreeable with standing your ground.';
        } else {
          insight = 'You\'re direct and competitive. Great for debate events!';
        }
        break;

      case 'NEUROTICISM':
        if (score >= 70) {
          insight = 'You\'re emotionally sensitive and deeply feel experiences.';
        } else if (score >= 40) {
          insight = 'You experience a balanced range of emotions.';
        } else {
          insight = 'You\'re emotionally stable and stay calm under pressure!';
        }
        break;

      default:
        insight = '';
    }

    insights[dimension] = {
      score,
      insight,
    };
  });

  return insights;
};

/**
 * Validate quiz answers completeness
 * @param {Object} answers - Quiz answers object
 * @returns {boolean} True if all questions answered
 */
export const isQuizComplete = (answers) => {
  if (!answers) return false;
  
  return PERSONALITY_QUESTIONS.every((question) => {
    const answer = answers[question.id];
    return answer && answer >= 1 && answer <= 5;
  });
};

/**
 * Get percentage of quiz completion
 * @param {Object} answers - Quiz answers object
 * @returns {number} Completion percentage (0-100)
 */
export const getQuizProgress = (answers) => {
  if (!answers) return 0;
  
  const answeredCount = PERSONALITY_QUESTIONS.filter((question) => {
    const answer = answers[question.id];
    return answer && answer >= 1 && answer <= 5;
  }).length;

  return Math.round((answeredCount / PERSONALITY_QUESTIONS.length) * 100);
};
