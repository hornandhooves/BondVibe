import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import * as ImagePicker from "expo-image-picker";
import { Camera, Image as ImageIcon, X, Check } from "lucide-react-native";
import Svg, {
  Circle,
  Rect,
  Path,
  Defs,
  LinearGradient,
  Stop,
  G,
} from "react-native-svg";

// ============================================
// ABSTRACT AVATARS - Modern geometric designs
// ============================================
const AbstractAvatar = ({ type, size = 56, colors }) => {
  const s = size;

  const avatars = {
    // Gradient circles
    sunrise: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF3EA5" />
            <Stop offset="100%" stopColor="#FF9F43" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad1)" />
        <Circle cx="50" cy="50" r="25" fill="rgba(255,255,255,0.3)" />
      </Svg>
    ),
    ocean: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#00F2FE" />
            <Stop offset="100%" stopColor="#4FACFE" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad2)" />
        <Path
          d="M20 50 Q35 35 50 50 T80 50"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="4"
          fill="none"
        />
      </Svg>
    ),
    aurora: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#A6FF96" />
            <Stop offset="100%" stopColor="#00F2FE" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad3)" />
        <Circle cx="35" cy="40" r="12" fill="rgba(255,255,255,0.4)" />
        <Circle cx="60" cy="55" r="8" fill="rgba(255,255,255,0.3)" />
      </Svg>
    ),
    sunset: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF6B6B" />
            <Stop offset="100%" stopColor="#FF3EA5" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad4)" />
        <Rect
          x="30"
          y="45"
          width="40"
          height="10"
          rx="5"
          fill="rgba(255,255,255,0.4)"
        />
      </Svg>
    ),
    cosmic: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad5" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#667EEA" />
            <Stop offset="100%" stopColor="#764BA2" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad5)" />
        <Circle cx="30" cy="35" r="5" fill="rgba(255,255,255,0.8)" />
        <Circle cx="65" cy="45" r="3" fill="rgba(255,255,255,0.6)" />
        <Circle cx="45" cy="65" r="4" fill="rgba(255,255,255,0.7)" />
      </Svg>
    ),
    neon: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad6" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF3EA5" />
            <Stop offset="100%" stopColor="#00F2FE" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad6)" />
        <Path
          d="M30 50 L45 35 L45 45 L70 45 L70 55 L45 55 L45 65 Z"
          fill="rgba(255,255,255,0.4)"
        />
      </Svg>
    ),
    // Geometric patterns
    prism: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad7" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#F093FB" />
            <Stop offset="100%" stopColor="#F5576C" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad7)" />
        <Path d="M50 25 L75 65 L25 65 Z" fill="rgba(255,255,255,0.35)" />
      </Svg>
    ),
    crystal: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad8" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#4FACFE" />
            <Stop offset="100%" stopColor="#00F2FE" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad8)" />
        <Rect
          x="35"
          y="35"
          width="30"
          height="30"
          rx="4"
          fill="rgba(255,255,255,0.35)"
          transform="rotate(45 50 50)"
        />
      </Svg>
    ),
    ripple: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad9" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#43E97B" />
            <Stop offset="100%" stopColor="#38F9D7" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad9)" />
        <Circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="3"
        />
        <Circle
          cx="50"
          cy="50"
          r="18"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="3"
        />
      </Svg>
    ),
    nova: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad10" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FA709A" />
            <Stop offset="100%" stopColor="#FEE140" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad10)" />
        <Path
          d="M50 20 L55 45 L80 50 L55 55 L50 80 L45 55 L20 50 L45 45 Z"
          fill="rgba(255,255,255,0.4)"
        />
      </Svg>
    ),
    pulse: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad11" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF3EA5" />
            <Stop offset="50%" stopColor="#A855F7" />
            <Stop offset="100%" stopColor="#6366F1" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad11)" />
        <Circle cx="50" cy="50" r="15" fill="rgba(255,255,255,0.5)" />
      </Svg>
    ),
    zen: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad12" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#E0C3FC" />
            <Stop offset="100%" stopColor="#8EC5FC" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad12)" />
        <Circle cx="35" cy="50" r="10" fill="rgba(255,255,255,0.5)" />
        <Circle cx="65" cy="50" r="10" fill="rgba(255,255,255,0.35)" />
      </Svg>
    ),
    flame: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad13" x1="0%" y1="100%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#F83600" />
            <Stop offset="100%" stopColor="#FE8C00" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad13)" />
        <Path
          d="M50 25 Q65 40 55 55 Q65 50 60 70 Q50 60 40 70 Q35 50 45 55 Q35 40 50 25"
          fill="rgba(255,255,255,0.4)"
        />
      </Svg>
    ),
    mint: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad14" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#11998E" />
            <Stop offset="100%" stopColor="#38EF7D" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad14)" />
        <Path
          d="M35 50 Q50 30 65 50 Q50 70 35 50"
          fill="rgba(255,255,255,0.4)"
        />
      </Svg>
    ),
    berry: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad15" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#8E2DE2" />
            <Stop offset="100%" stopColor="#7C3AED" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad15)" />
        <Circle cx="40" cy="40" r="8" fill="rgba(255,255,255,0.4)" />
        <Circle cx="60" cy="40" r="8" fill="rgba(255,255,255,0.3)" />
        <Circle cx="50" cy="60" r="8" fill="rgba(255,255,255,0.35)" />
      </Svg>
    ),
    coral: (
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="grad16" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF9A9E" />
            <Stop offset="100%" stopColor="#FECFEF" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r="45" fill="url(#grad16)" />
        <Circle cx="50" cy="50" r="20" fill="rgba(255,255,255,0.4)" />
        <Circle cx="50" cy="50" r="8" fill="rgba(255,255,255,0.5)" />
      </Svg>
    ),
  };

  return avatars[type] || avatars.sunrise;
};

// Avatar type IDs
const ABSTRACT_AVATARS = [
  "sunrise",
  "ocean",
  "aurora",
  "sunset",
  "cosmic",
  "neon",
  "prism",
  "crystal",
  "ripple",
  "nova",
  "pulse",
  "zen",
  "flame",
  "mint",
  "berry",
  "coral",
];

// Emojis
const EMOJI_AVATARS = [
  "😊",
  "🎉",
  "🌟",
  "🎨",
  "🎭",
  "🎪",
  "🎬",
  "🎮",
  "🎯",
  "🎲",
  "🎸",
  "🎹",
  "🎺",
  "🎻",
  "🎤",
  "🎧",
  "🌈",
  "🌸",
  "🌺",
  "🌻",
  "🌼",
  "🌷",
  "🍕",
  "🍔",
  "🍰",
  "🎂",
  "🍦",
  "🍩",
  "☕",
  "🍵",
  "🌮",
  "🌯",
  "🦄",
  "🐶",
  "🐱",
  "🐼",
  "🦊",
  "🦁",
  "🐯",
  "🐨",
  "🚀",
  "✨",
  "🔥",
  "💫",
  "⭐",
  "🌙",
  "☀️",
  "🌊",
];

const TAB_OPTIONS = [
  { id: "photo", label: "Photo", icon: Camera },
  { id: "avatars", label: "Avatars", icon: null },
  { id: "emojis", label: "Emojis", icon: null },
];

export default function AvatarPicker({
  visible,
  onClose,
  currentAvatar,
  onAvatarChange,
}) {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState("avatars");
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [uploading, setUploading] = useState(false);

  const handlePickImage = async (useCamera = false) => {
    try {
      // Request permissions
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Camera permission is required to take photos."
          );
          return;
        }
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Gallery permission is required to select photos."
          );
          return;
        }
      }

      setUploading(true);

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (!result.canceled && result.assets[0]) {
        setSelectedAvatar({ type: "photo", uri: result.assets[0].uri });
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSelectAbstract = (avatarId) => {
    setSelectedAvatar({ type: "abstract", id: avatarId });
  };

  const handleSelectEmoji = (emoji) => {
    setSelectedAvatar({ type: "emoji", value: emoji });
  };

  const handleConfirm = () => {
    onAvatarChange(selectedAvatar);
    onClose();
  };

  const styles = createStyles(colors, isDark);

  // Render avatar preview
  const renderAvatarPreview = () => {
    if (!selectedAvatar) {
      return <Text style={styles.previewEmoji}>😊</Text>;
    }

    if (selectedAvatar.type === "photo" && selectedAvatar.uri) {
      return (
        <Image
          source={{ uri: selectedAvatar.uri }}
          style={styles.previewImage}
        />
      );
    }

    if (selectedAvatar.type === "abstract" && selectedAvatar.id) {
      return (
        <AbstractAvatar type={selectedAvatar.id} size={80} colors={colors} />
      );
    }

    if (selectedAvatar.type === "emoji" && selectedAvatar.value) {
      return <Text style={styles.previewEmoji}>{selectedAvatar.value}</Text>;
    }

    // Legacy: plain emoji string
    if (typeof selectedAvatar === "string") {
      return <Text style={styles.previewEmoji}>{selectedAvatar}</Text>;
    }

    return <Text style={styles.previewEmoji}>😊</Text>;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark
                  ? "rgba(17, 24, 39, 0.98)"
                  : "rgba(255, 255, 255, 0.98)",
                borderColor: colors.border,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={24} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.text }]}>
                Choose Avatar
              </Text>
              <TouchableOpacity
                onPress={handleConfirm}
                style={styles.confirmButton}
              >
                <Check size={24} color={colors.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Preview */}
            <View style={styles.previewSection}>
              <View
                style={[
                  styles.previewContainer,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: `${colors.primary}66`,
                  },
                ]}
              >
                {renderAvatarPreview()}
              </View>
            </View>

            {/* Tabs */}
            <View
              style={[styles.tabsContainer, { borderColor: colors.border }]}
            >
              {TAB_OPTIONS.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    activeTab === tab.id && {
                      borderBottomColor: colors.primary,
                      borderBottomWidth: 2,
                    },
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color:
                          activeTab === tab.id
                            ? colors.primary
                            : colors.textSecondary,
                        fontWeight: activeTab === tab.id ? "700" : "500",
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === "photo" && (
                <View style={styles.photoSection}>
                  <TouchableOpacity
                    style={[
                      styles.photoButton,
                      {
                        backgroundColor: `${colors.primary}15`,
                        borderColor: `${colors.primary}40`,
                      },
                    ]}
                    onPress={() => handlePickImage(false)}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <ImageIcon
                          size={32}
                          color={colors.primary}
                          strokeWidth={1.5}
                        />
                        <Text
                          style={[
                            styles.photoButtonText,
                            { color: colors.primary },
                          ]}
                        >
                          Choose from Gallery
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.photoButton,
                      {
                        backgroundColor: colors.surfaceGlass,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => handlePickImage(true)}
                    disabled={uploading}
                  >
                    <Camera size={32} color={colors.text} strokeWidth={1.5} />
                    <Text
                      style={[styles.photoButtonText, { color: colors.text }]}
                    >
                      Take a Photo
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={[styles.photoHint, { color: colors.textTertiary }]}
                  >
                    Your photo will be cropped to a circle
                  </Text>
                </View>
              )}

              {activeTab === "avatars" && (
                <View style={styles.avatarGrid}>
                  {ABSTRACT_AVATARS.map((avatarId) => {
                    const isSelected =
                      selectedAvatar?.type === "abstract" &&
                      selectedAvatar?.id === avatarId;
                    return (
                      <TouchableOpacity
                        key={avatarId}
                        style={[
                          styles.avatarOption,
                          {
                            backgroundColor: colors.surfaceGlass,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                            borderWidth: isSelected ? 2 : 1,
                          },
                        ]}
                        onPress={() => handleSelectAbstract(avatarId)}
                      >
                        <AbstractAvatar
                          type={avatarId}
                          size={48}
                          colors={colors}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {activeTab === "emojis" && (
                <View style={styles.emojiGrid}>
                  {EMOJI_AVATARS.map((emoji) => {
                    const isSelected =
                      (selectedAvatar?.type === "emoji" &&
                        selectedAvatar?.value === emoji) ||
                      selectedAvatar === emoji;
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.emojiOption,
                          {
                            backgroundColor: isSelected
                              ? `${colors.primary}26`
                              : colors.surfaceGlass,
                            borderColor: isSelected
                              ? `${colors.primary}99`
                              : colors.border,
                          },
                        ]}
                        onPress={() => handleSelectEmoji(emoji)}
                      >
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// AVATAR DISPLAY COMPONENT (for use elsewhere)
// ============================================
export const AvatarDisplay = ({ avatar, size = 50, style }) => {
  const { colors } = useTheme();

  if (!avatar) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceGlass,
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>😊</Text>
      </View>
    );
  }

  // Photo
  if (avatar.type === "photo" && avatar.uri) {
    return (
      <Image
        source={{ uri: avatar.uri }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  // Abstract avatar
  if (avatar.type === "abstract" && avatar.id) {
    return (
      <View style={style}>
        <AbstractAvatar type={avatar.id} size={size} colors={colors} />
      </View>
    );
  }

  // Emoji (new format)
  if (avatar.type === "emoji" && avatar.value) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceGlass,
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>{avatar.value}</Text>
      </View>
    );
  }

  // Legacy: plain emoji string
  if (typeof avatar === "string") {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceGlass,
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        <Text style={{ fontSize: size * 0.5 }}>{avatar}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceGlass,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.5 }}>😊</Text>
    </View>
  );
};

function createStyles(colors, isDark) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "flex-end",
    },
    modalContainer: {
      maxHeight: "85%",
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderBottomWidth: 0,
      paddingBottom: 34,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    closeButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    confirmButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    previewSection: {
      alignItems: "center",
      paddingVertical: 16,
    },
    previewContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    previewImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    previewEmoji: {
      fontSize: 50,
    },
    tabsContainer: {
      flexDirection: "row",
      borderBottomWidth: 1,
      marginHorizontal: 20,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
    },
    tabText: {
      fontSize: 14,
      letterSpacing: -0.1,
    },
    scrollView: {
      maxHeight: 350,
    },
    scrollContent: {
      padding: 20,
    },
    // Photo tab
    photoSection: {
      gap: 16,
    },
    photoButton: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      gap: 12,
    },
    photoButtonText: {
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    photoHint: {
      fontSize: 13,
      textAlign: "center",
      marginTop: 8,
    },
    // Avatar grid
    avatarGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "center",
    },
    avatarOption: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    // Emoji grid
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
    },
    emojiOption: {
      width: 56,
      height: 56,
      borderRadius: 12,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
    },
    emojiText: {
      fontSize: 28,
    },
  });
}
