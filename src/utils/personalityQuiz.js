// Big Five Personality Quiz (OCEAN Model)
// 44 questions across 5 dimensions

export const PERSONALITY_DIMENSIONS = {
  OPENNESS: "Openness",
  CONSCIENTIOUSNESS: "Conscientiousness",
  EXTRAVERSION: "Extraversion",
  AGREEABLENESS: "Agreeableness",
  NEUROTICISM: "Neuroticism",
};

export const PERSONALITY_QUESTIONS = [
  // OPENNESS (9 questions)
  {
    id: 1,
    dimension: "OPENNESS",
    text: "I have a vivid imagination",
    reverse: false,
  },
  {
    id: 2,
    dimension: "OPENNESS",
    text: "I am interested in abstract ideas",
    reverse: false,
  },
  {
    id: 3,
    dimension: "OPENNESS",
    text: "I enjoy trying new and foreign foods",
    reverse: false,
  },
  {
    id: 4,
    dimension: "OPENNESS",
    text: "I prefer routine over spontaneity",
    reverse: true,
  },
  {
    id: 5,
    dimension: "OPENNESS",
    text: "I enjoy thinking about philosophical questions",
    reverse: false,
  },
  {
    id: 6,
    dimension: "OPENNESS",
    text: "I appreciate art and beauty",
    reverse: false,
  },
  {
    id: 7,
    dimension: "OPENNESS",
    text: "I prefer practical over theoretical discussions",
    reverse: true,
  },
  {
    id: 8,
    dimension: "OPENNESS",
    text: "I am curious about many different things",
    reverse: false,
  },
  {
    id: 9,
    dimension: "OPENNESS",
    text: "I enjoy exploring new places and cultures",
    reverse: false,
  },

  // CONSCIENTIOUSNESS (9 questions)
  {
    id: 10,
    dimension: "CONSCIENTIOUSNESS",
    text: "I am always prepared",
    reverse: false,
  },
  {
    id: 11,
    dimension: "CONSCIENTIOUSNESS",
    text: "I pay attention to details",
    reverse: false,
  },
  {
    id: 12,
    dimension: "CONSCIENTIOUSNESS",
    text: "I make plans and stick to them",
    reverse: false,
  },
  {
    id: 13,
    dimension: "CONSCIENTIOUSNESS",
    text: "I often forget to put things back in their proper place",
    reverse: true,
  },
  {
    id: 14,
    dimension: "CONSCIENTIOUSNESS",
    text: "I complete tasks successfully",
    reverse: false,
  },
  {
    id: 15,
    dimension: "CONSCIENTIOUSNESS",
    text: "I am easily distracted",
    reverse: true,
  },
  {
    id: 16,
    dimension: "CONSCIENTIOUSNESS",
    text: "I like to keep things organized",
    reverse: false,
  },
  {
    id: 17,
    dimension: "CONSCIENTIOUSNESS",
    text: "I procrastinate often",
    reverse: true,
  },
  {
    id: 18,
    dimension: "CONSCIENTIOUSNESS",
    text: "I follow a schedule",
    reverse: false,
  },

  // EXTRAVERSION (9 questions)
  {
    id: 19,
    dimension: "EXTRAVERSION",
    text: "I am the life of the party",
    reverse: false,
  },
  {
    id: 20,
    dimension: "EXTRAVERSION",
    text: "I feel comfortable around people",
    reverse: false,
  },
  {
    id: 21,
    dimension: "EXTRAVERSION",
    text: "I start conversations easily",
    reverse: false,
  },
  {
    id: 22,
    dimension: "EXTRAVERSION",
    text: "I prefer to stay in the background in social situations",
    reverse: true,
  },
  {
    id: 23,
    dimension: "EXTRAVERSION",
    text: "I talk to a lot of different people at parties",
    reverse: false,
  },
  {
    id: 24,
    dimension: "EXTRAVERSION",
    text: "I need time alone to recharge",
    reverse: true,
  },
  {
    id: 25,
    dimension: "EXTRAVERSION",
    text: "I make friends easily",
    reverse: false,
  },
  {
    id: 26,
    dimension: "EXTRAVERSION",
    text: "I am quiet around strangers",
    reverse: true,
  },
  {
    id: 27,
    dimension: "EXTRAVERSION",
    text: "I enjoy being the center of attention",
    reverse: false,
  },

  // AGREEABLENESS (9 questions)
  {
    id: 28,
    dimension: "AGREEABLENESS",
    text: "I am interested in other people's problems",
    reverse: false,
  },
  {
    id: 29,
    dimension: "AGREEABLENESS",
    text: "I sympathize with others' feelings",
    reverse: false,
  },
  {
    id: 30,
    dimension: "AGREEABLENESS",
    text: "I have a soft heart",
    reverse: false,
  },
  {
    id: 31,
    dimension: "AGREEABLENESS",
    text: "I am not really interested in others",
    reverse: true,
  },
  {
    id: 32,
    dimension: "AGREEABLENESS",
    text: "I make people feel at ease",
    reverse: false,
  },
  {
    id: 33,
    dimension: "AGREEABLENESS",
    text: "I insult people",
    reverse: true,
  },
  {
    id: 34,
    dimension: "AGREEABLENESS",
    text: "I trust others easily",
    reverse: false,
  },
  {
    id: 35,
    dimension: "AGREEABLENESS",
    text: "I am often skeptical of others' intentions",
    reverse: true,
  },
  {
    id: 36,
    dimension: "AGREEABLENESS",
    text: "I cooperate well with others",
    reverse: false,
  },

  // NEUROTICISM (8 questions)
  {
    id: 37,
    dimension: "NEUROTICISM",
    text: "I worry about things",
    reverse: false,
  },
  {
    id: 38,
    dimension: "NEUROTICISM",
    text: "I get stressed out easily",
    reverse: false,
  },
  {
    id: 39,
    dimension: "NEUROTICISM",
    text: "My mood changes frequently",
    reverse: false,
  },
  {
    id: 40,
    dimension: "NEUROTICISM",
    text: "I am relaxed most of the time",
    reverse: true,
  },
  {
    id: 41,
    dimension: "NEUROTICISM",
    text: "I get upset easily",
    reverse: false,
  },
  {
    id: 42,
    dimension: "NEUROTICISM",
    text: "I seldom feel blue",
    reverse: true,
  },
  {
    id: 43,
    dimension: "NEUROTICISM",
    text: "I panic easily",
    reverse: false,
  },
  {
    id: 44,
    dimension: "NEUROTICISM",
    text: "I am emotionally stable",
    reverse: true,
  },
];

export const SCALE_OPTIONS = [
  { value: 1, label: "Strongly Disagree", icon: "frown" },
  { value: 2, label: "Disagree", icon: "frown" },
  { value: 3, label: "Neutral", icon: "meh" },
  { value: 4, label: "Agree", icon: "smile" },
  { value: 5, label: "Strongly Agree", icon: "smile" },
];

export const DIMENSION_INFO = {
  OPENNESS: {
    title: "Openness to Experience",
    description:
      "Appreciation for art, emotion, adventure, unusual ideas, curiosity, and variety of experience.",
    icon: "art",
    lowTrait: "Practical",
    highTrait: "Creative",
  },
  CONSCIENTIOUSNESS: {
    title: "Conscientiousness",
    description:
      "Tendency to be organized, dependable, and show self-discipline. Aim for achievement against measures or outside expectations.",
    icon: "clipboard",
    lowTrait: "Spontaneous",
    highTrait: "Organized",
  },
  EXTRAVERSION: {
    title: "Extraversion",
    description:
      "Energy, positive emotions, assertiveness, sociability and the tendency to seek stimulation in the company of others.",
    icon: "party",
    lowTrait: "Reserved",
    highTrait: "Outgoing",
  },
  AGREEABLENESS: {
    title: "Agreeableness",
    description:
      "Tendency to be compassionate and cooperative rather than suspicious and antagonistic towards others.",
    icon: "users",
    lowTrait: "Competitive",
    highTrait: "Cooperative",
  },
  NEUROTICISM: {
    title: "Emotional Stability",
    description:
      "Tendency to experience unpleasant emotions easily. Those who score high tend to be more emotionally reactive.",
    icon: "heart",
    lowTrait: "Calm",
    highTrait: "Sensitive",
  },
};
