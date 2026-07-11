import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage , auth} from "./firebase";
import * as ImageManipulator from "expo-image-manipulator";

/**
 * Compress and resize image before upload
 * @param {string} uri - Local image URI
 * @returns {Promise<string>} - Compressed image URI
 */
export const compressImage = async (uri) => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }], // Max width 1200px
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.error("Error compressing image:", error);
    return uri; // Return original if compression fails
  }
};

/**
 * Whether a URI is already a remote (uploaded) URL rather than a local file.
 * @param {string} uri
 * @returns {boolean}
 */
export const isRemoteUrl = (uri) =>
  typeof uri === "string" && /^https?:\/\//.test(uri);

/**
 * Upload a user's avatar photo to Firebase Storage and return its download URL.
 * Uses a fixed path per user so re-uploads overwrite the previous photo
 * (no orphaned files accumulate). The returned tokenized URL is viewable on
 * any device.
 * @param {string} userId
 * @param {string} imageUri - Local image URI from the picker
 * @returns {Promise<string>} - Download URL
 */
export const uploadAvatar = async (userId, imageUri) => {
  try {
    console.log(`📤 Uploading avatar for user ${userId}...`);
    const compressedUri = await compressImage(imageUri);
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    const avatarRef = ref(storage, `avatars/${userId}/avatar.jpg`);
    await uploadBytes(avatarRef, blob);
    const downloadURL = await getDownloadURL(avatarRef);
    console.log("✅ Avatar uploaded successfully");
    return downloadURL;
  } catch (error) {
    console.error("❌ Error uploading avatar:", error);
    throw error;
  }
};

/**
 * Resolve an avatar object for saving: if it's a photo with a local URI,
 * upload it and return a photo avatar pointing at the remote URL. Emoji,
 * abstract, and already-uploaded photo avatars are returned unchanged.
 * @param {object} avatar - { type, value?, id?, uri? }
 * @param {string} userId
 * @returns {Promise<object>} avatar safe to persist in Firestore
 */
export const resolveAvatarForSave = async (avatar, userId) => {
  if (!avatar || avatar.type !== "photo" || !avatar.uri) return avatar;
  if (isRemoteUrl(avatar.uri)) return avatar; // already uploaded
  const url = await uploadAvatar(userId, avatar.uri);
  return { type: "photo", uri: url };
};

/** Upload a group photo (separate path from user avatars) and return its URL. */
export const uploadGroupPhoto = async (groupId, imageUri) => {
  const compressedUri = await compressImage(imageUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();
  const photoRef = ref(storage, `groups/${groupId}/${auth.currentUser.uid}/photo.jpg`);
  await uploadBytes(photoRef, blob);
  return getDownloadURL(photoRef);
};

/** Upload a social post image; returns its URL. */
export const uploadPostImage = async (userId, imageUri) => {
  const compressedUri = await compressImage(imageUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();
  const postRef = ref(storage, `posts/${userId}/${Date.now()}.jpg`);
  await uploadBytes(postRef, blob);
  return getDownloadURL(postRef);
};

/** Upload an expense receipt photo (Finance/P&L); returns its URL. */
export const uploadExpenseReceipt = async (bizId, imageUri) => {
  const compressedUri = await compressImage(imageUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();
  const receiptRef = ref(storage, `businesses/${bizId}/expenses/${Date.now()}.jpg`);
  await uploadBytes(receiptRef, blob);
  return getDownloadURL(receiptRef);
};

/** Upload a moderation-report evidence image; returns its URL. */
export const uploadReportEvidence = async (groupId, imageUri) => {
  const compressedUri = await compressImage(imageUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();
  const evRef = ref(storage, `groups/${groupId}/${auth.currentUser.uid}/evidence_${Date.now()}.jpg`);
  await uploadBytes(evRef, blob);
  return getDownloadURL(evRef);
};

/** Resolve a group avatar object for saving (uploads a local photo). */
export const resolveGroupAvatar = async (avatar, groupId) => {
  if (!avatar || avatar.type !== "photo" || !avatar.uri) return avatar;
  if (isRemoteUrl(avatar.uri)) return avatar;
  const url = await uploadGroupPhoto(groupId, avatar.uri);
  return { type: "photo", uri: url };
};

/**
 * Upload a single image to Firebase Storage
 * @param {string} eventId - Event ID for folder structure
 * @param {string} imageUri - Local image URI
 * @param {number} index - Image index (0, 1, 2)
 * @returns {Promise<string>} - Download URL of uploaded image
 */
export const uploadEventImage = async (eventId, imageUri, index) => {
  try {
    console.log(`📤 Uploading image ${index} for event ${eventId}...`);

    // Compress image first
    const compressedUri = await compressImage(imageUri);

    // Convert URI to blob
    const response = await fetch(compressedUri);
    const blob = await response.blob();

    // Create storage reference
    const imageRef = ref(storage, `events/${eventId}/${auth.currentUser.uid}/image_${index}.jpg`);

    // Upload blob
    await uploadBytes(imageRef, blob);

    // Get download URL
    const downloadURL = await getDownloadURL(imageRef);
    console.log(`✅ Image ${index} uploaded successfully`);

    return downloadURL;
  } catch (error) {
    console.error(`❌ Error uploading image ${index}:`, error);
    throw error;
  }
};

/**
 * Upload multiple images for an event
 * @param {string} eventId - Event ID
 * @param {string[]} imageUris - Array of local image URIs
 * @returns {Promise<string[]>} - Array of download URLs
 */
export const uploadEventImages = async (eventId, imageUris) => {
  try {
    console.log(
      `📤 Uploading ${imageUris.length} images for event ${eventId}...`
    );

    const uploadPromises = imageUris.map((uri, index) =>
      uploadEventImage(eventId, uri, index)
    );

    const downloadURLs = await Promise.all(uploadPromises);
    console.log(`✅ All ${downloadURLs.length} images uploaded successfully`);

    return downloadURLs;
  } catch (error) {
    console.error("❌ Error uploading images:", error);
    throw error;
  }
};

/**
 * Upload a single vehicle photo to Firebase Storage; returns its download URL.
 * @param {string} vehicleId
 * @param {string} imageUri - local image URI from the picker
 * @param {number} index
 * @returns {Promise<string>}
 */
export const uploadVehicleImage = async (vehicleId, imageUri, index) => {
  const compressedUri = await compressImage(imageUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();
  const imageRef = ref(storage, `vehicles/${vehicleId}/${auth.currentUser.uid}/image_${index}.jpg`);
  await uploadBytes(imageRef, blob);
  return getDownloadURL(imageRef);
};

/**
 * Resolve a vehicle's photo list for saving: upload any local URIs, keep any
 * already-remote URLs. Preserves order.
 * @param {string} vehicleId
 * @param {string[]} photoUris - mix of local URIs and remote URLs
 * @returns {Promise<string[]>} array of remote URLs
 */
export const uploadVehiclePhotos = async (vehicleId, photoUris) => {
  const out = [];
  for (let i = 0; i < photoUris.length; i++) {
    const uri = photoUris[i];
    if (isRemoteUrl(uri)) {
      out.push(uri);
    } else {
      out.push(await uploadVehicleImage(vehicleId, uri, i));
    }
  }
  return out;
};

/**
 * Extract storage path from Firebase Storage URL
 * @param {string} url - Firebase Storage download URL
 * @returns {string|null} - Storage path or null if invalid
 */
const extractPathFromUrl = (url) => {
  try {
    // Firebase Storage URLs look like:
    // https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?alt=media&token=TOKEN
    // The path is URL-encoded after /o/

    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      // Decode the URL-encoded path
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch (error) {
    console.error("Error extracting path from URL:", error);
    return null;
  }
};

/**
 * Delete a single image from Firebase Storage
 * Can accept either (eventId, index) or just (url)
 * @param {string} eventIdOrUrl - Event ID or full Firebase Storage URL
 * @param {number} [index] - Image index (only if first param is eventId)
 */
export const deleteEventImage = async (eventIdOrUrl, index) => {
  try {
    let imageRef;

    // Check if first argument is a URL
    if (eventIdOrUrl.startsWith("http")) {
      // Extract path from URL
      const path = extractPathFromUrl(eventIdOrUrl);
      if (!path) {
        console.warn("⚠️ Could not extract path from URL:", eventIdOrUrl);
        return;
      }
      imageRef = ref(storage, path);
      console.log(`🗑️ Deleting image at path: ${path}`);
    } else {
      // Legacy mode: eventId + index
      imageRef = ref(storage, `events/${eventIdOrUrl}/image_${index}.jpg`);
      console.log(`🗑️ Deleting image ${index} for event ${eventIdOrUrl}`);
    }

    await deleteObject(imageRef);
    console.log(`✅ Image deleted successfully`);
  } catch (error) {
    // Ignore if file doesn't exist
    if (error.code === "storage/object-not-found") {
      console.log("📭 Image already deleted or doesn't exist");
    } else {
      console.error(`❌ Error deleting image:`, error.message);
    }
  }
};

/**
 * Delete all images for an event
 * @param {string} eventId - Event ID
 * @param {number} imageCount - Number of images to delete
 */
export const deleteAllEventImages = async (eventId, imageCount = 3) => {
  try {
    const deletePromises = [];
    for (let i = 0; i < imageCount; i++) {
      deletePromises.push(deleteEventImage(eventId, i));
    }
    await Promise.all(deletePromises);
    console.log(`🗑️ All images deleted for event ${eventId}`);
  } catch (error) {
    console.error("Error deleting all images:", error);
  }
};
