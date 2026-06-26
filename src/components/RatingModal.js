import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { Star } from "lucide-react-native";
import { submitRating } from "../services/ratingService";
import { getEventCreatorId } from "../utils/eventHelpers";

export default function RatingModal({ visible, onClose, onSuccess, event }) {
  const { colors } = useTheme();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const handleSubmit = async () => {
    if (rating === 0) {
      return; // Rating is required
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const result = await submitRating({
        eventId: event.id,
        eventTitle: event.title,
        hostId: getEventCreatorId(event),
        rating,
        comment,
      });

      if (result.success) {
        onSuccess?.(rating, comment);
        handleClose();
      } else {
        console.error("Rating error:", result.error);
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setComment("");
    setHoverRating(0);
    onClose();
  };

  const getRatingText = (value) => {
    switch (value) {
      case 1:
        return "Poor";
      case 2:
        return "Fair";
      case 3:
        return "Good";
      case 4:
        return "Very Good";
      case 5:
        return "Excellent!";
      default:
        return "Tap to rate";
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[styles.container, { backgroundColor: colors.surface }]}
            >
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerEmoji}>⭐</Text>
                <Text style={[styles.title, { color: colors.text }]}>
                  Rate this Event
                </Text>
                <Text
                  style={[styles.eventTitle, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {event?.title || "Event"}
                </Text>
              </View>

              {/* Star Rating */}
              <View style={styles.starsSection}>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRating(star)}
                      onPressIn={() => setHoverRating(star)}
                      onPressOut={() => setHoverRating(0)}
                      activeOpacity={0.7}
                      style={styles.starButton}
                    >
                      <Star
                        size={40}
                        color={
                          star <= displayRating ? "#FFD700" : `${colors.text}30`
                        }
                        fill={star <= displayRating ? "#FFD700" : "transparent"}
                        strokeWidth={1.5}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text
                  style={[
                    styles.ratingText,
                    {
                      color:
                        displayRating > 0
                          ? colors.primary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {getRatingText(displayRating)}
                </Text>
              </View>

              {/* Comment Input */}
              <View style={styles.commentSection}>
                <Text style={[styles.commentLabel, { color: colors.text }]}>
                  Share your experience (optional)
                </Text>
                <View
                  style={[
                    styles.commentInput,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.textInput, { color: colors.text }]}
                    placeholder="What did you enjoy about this event?"
                    placeholderTextColor={colors.textTertiary}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    maxLength={500}
                  />
                </View>
                <Text
                  style={[styles.charCount, { color: colors.textTertiary }]}
                >
                  {comment.length}/500
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                  disabled={loading}
                >
                  <View
                    style={[
                      styles.buttonGlass,
                      {
                        backgroundColor: colors.surfaceGlass,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.buttonText, { color: colors.text }]}>
                      Later
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.submitButton,
                    rating === 0 && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={loading || rating === 0}
                >
                  <View
                    style={[
                      styles.buttonGlass,
                      {
                        backgroundColor:
                          rating > 0 ? colors.primary : `${colors.primary}40`,
                        borderColor:
                          rating > 0 ? colors.primary : `${colors.primary}60`,
                      },
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.buttonText,
                          {
                            color: rating > 0 ? "#FFFFFF" : colors.textTertiary,
                          },
                        ]}
                      >
                        Submit Rating
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  eventTitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  starsSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  starsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  commentSection: {
    width: "100%",
    marginBottom: 24,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  textInput: {
    fontSize: 15,
    minHeight: 80,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 6,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  button: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGlass: {
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
