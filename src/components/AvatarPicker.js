/**
 * AvatarPicker — profile photo picker (Fix 1: photo ONLY — no emoji, no
 * abstract-icon avatars; imagery is a real photo or the branded-initial
 * fallback rendered by <AvatarDisplay>).
 *
 * Contract unchanged: onAvatarChange receives { type:"photo", uri } which
 * resolveAvatarForSave (storageService) uploads on save. Legacy emoji /
 * abstract avatar values stored in Firestore are DISPLAYED as the
 * branded-initial fallback — never as an emoji glyph.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../contexts/ThemeContext";
import * as ImagePicker from "expo-image-picker";
import Icon from "./Icon";
import { BRAND } from "../constants/theme-tokens";

export default function AvatarPicker({
  visible,
  onClose,
  currentAvatar,
  onAvatarChange,
  name,
}) {
  const { colors, isDark } = useTheme();
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [uploading, setUploading] = useState(false);

  const handlePickImage = async (useCamera = false) => {
    try {
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

      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

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

  const handleConfirm = () => {
    onAvatarChange(selectedAvatar);
    onClose();
  };

  const styles = createStyles(colors, isDark);

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
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.text }]}>
                Profile photo
              </Text>
              <TouchableOpacity
                onPress={handleConfirm}
                style={styles.headerButton}
              >
                <Icon name="check" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Preview — photo or branded-initial fallback */}
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
                <AvatarDisplay avatar={selectedAvatar} size={96} name={name} />
              </View>
            </View>

            {/* Photo actions */}
            <View style={styles.photoSection}>
              <TouchableOpacity
                style={[
                  styles.photoButton,
                  {
                    backgroundColor: colors.brandSoft,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => handlePickImage(false)}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Icon name="image" size={32} color={colors.primary} />
                    <Text
                      style={[styles.photoButtonText, { color: colors.primary }]}
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
                <Icon name="camera" size={32} color={colors.text} />
                <Text style={[styles.photoButtonText, { color: colors.text }]}>
                  Take a Photo
                </Text>
              </TouchableOpacity>

              <Text style={[styles.photoHint, { color: colors.textTertiary }]}>
                Your photo will be cropped to a circle. Until you add one,
                we'll show your initial.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// AVATAR DISPLAY — photo, or branded-initial fallback. Never an emoji.
// ============================================
const initialFrom = (name) => {
  const ch = (name || "").trim().charAt(0);
  return ch ? ch.toUpperCase() : null;
};

export const AvatarDisplay = ({ avatar, size = 50, style, name }) => {
  // Real photo (local uri while picking, or uploaded url).
  const uri =
    avatar && avatar.type === "photo" && (avatar.uri || avatar.url)
      ? avatar.uri || avatar.url
      : null;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  // Everything else (missing, legacy emoji value, legacy abstract id):
  // branded gradient circle with the person's initial — or a line glyph.
  const initial = initialFrom(name);
  return (
    <LinearGradient
      colors={BRAND.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {initial ? (
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: size * 0.42,
            fontWeight: "700",
          }}
        >
          {initial}
        </Text>
      ) : (
        <Icon name="user" size={size * 0.5} color="#FFFFFF" />
      )}
    </LinearGradient>
  );
};

function createStyles(colors) {
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
    headerButton: {
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
      width: 104,
      height: 104,
      borderRadius: 52,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    photoSection: {
      gap: 16,
      padding: 20,
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
    },
  });
}
