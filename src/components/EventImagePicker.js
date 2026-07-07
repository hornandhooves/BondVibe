import React from "react";
import Icon from "./Icon";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";

const MAX_IMAGES = 3;

export default function EventImagePicker({ images, onImagesChange }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("eventImagePicker.permissionRequired"),
        t("eventImagePicker.libraryPermissionMessage")
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert(
        t("eventImagePicker.limitReached"),
        t("eventImagePicker.limitReachedMessage", { max: MAX_IMAGES })
      );
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const newImages = [...images, result.assets[0].uri];
        onImagesChange(newImages);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert(t("eventImagePicker.errorTitle"), t("eventImagePicker.selectImageFailed"));
    }
  };

  const takePhoto = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert(
        t("eventImagePicker.limitReached"),
        t("eventImagePicker.limitReachedMessage", { max: MAX_IMAGES })
      );
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("eventImagePicker.permissionRequired"),
        t("eventImagePicker.cameraPermissionMessage")
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const newImages = [...images, result.assets[0].uri];
        onImagesChange(newImages);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert(t("eventImagePicker.errorTitle"), t("eventImagePicker.takePhotoFailed"));
    }
  };

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const showImageOptions = () => {
    Alert.alert(t("eventImagePicker.addPhoto"), t("eventImagePicker.chooseAnOption"), [
      { text: t("eventImagePicker.takePhotoOption"), onPress: takePhoto },
      { text: t("eventImagePicker.chooseFromLibrary"), onPress: pickImage },
      { text: t("eventImagePicker.cancel"), style: "cancel" },
    ]);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>{t("eventImagePicker.eventPhotos")}</Text>
        <Text style={[styles.optional, { color: colors.textTertiary }]}>
          {t("eventImagePicker.optionalCount", { count: images.length, max: MAX_IMAGES })}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Existing Images */}
        {images.map((uri, index) => (
          <View key={index} style={styles.imageWrapper}>
            <Image source={{ uri }} style={styles.image} />
            <TouchableOpacity
              style={[styles.removeButton, { backgroundColor: colors.error }]}
              onPress={() => removeImage(index)}
            >
              <Icon name="close" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            {index === 0 && (
              <View
                style={[styles.mainBadge, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.mainBadgeText}>{t("eventImagePicker.main")}</Text>
              </View>
            )}
          </View>
        ))}

        {/* Add Button */}
        {images.length < MAX_IMAGES && (
          <TouchableOpacity
            style={[
              styles.addButton,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
            onPress={showImageOptions}
          >
            <View
              style={[
                styles.addIconCircle,
                { backgroundColor: `${colors.primary}20` },
              ]}
            >
              <Icon name="plus" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.addText, { color: colors.textSecondary }]}>
              {t("eventImagePicker.addPhotoLabel")}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {images.length === 0 && (
        <View
          style={[
            styles.emptyState,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <Icon name="image" size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            {t("eventImagePicker.emptyStateHint")}
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[
                styles.emptyButton,
                { backgroundColor: `${colors.primary}20` },
              ]}
              onPress={takePhoto}
            >
              <Icon name="camera" size={18} color={colors.primary} />
              <Text style={[styles.emptyButtonText, { color: colors.primary }]}>
                {t("eventImagePicker.camera")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.emptyButton,
                { backgroundColor: `${colors.primary}20` },
              ]}
              onPress={pickImage}
            >
              <Icon name="image" size={18} color={colors.primary} />
              <Text style={[styles.emptyButtonText, { color: colors.primary }]}>
                {t("eventImagePicker.gallery")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      marginBottom: 20,
    },
    labelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    label: {
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    optional: {
      fontSize: 13,
    },
    scrollContent: {
      gap: 12,
    },
    imageWrapper: {
      position: "relative",
      borderRadius: 12,
      overflow: "hidden",
    },
    image: {
      width: 140,
      height: 90,
      borderRadius: 12,
    },
    removeButton: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    mainBadge: {
      position: "absolute",
      bottom: 6,
      left: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    mainBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    addButton: {
      width: 140,
      height: 90,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    addIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    addText: {
      fontSize: 12,
      fontWeight: "600",
    },
    emptyState: {
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: "dashed",
      padding: 24,
      alignItems: "center",
      gap: 12,
    },
    emptyText: {
      fontSize: 13,
      textAlign: "center",
    },
    emptyButtons: {
      flexDirection: "row",
      gap: 12,
      marginTop: 4,
    },
    emptyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    emptyButtonText: {
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
