import { auth } from "./firebase";
/**
 * Stripe Connect Service
 * Handles all Stripe Connect API calls
 */

const FUNCTIONS_BASE_URL =
  "https://us-central1-bondvibe-dev.cloudfunctions.net";

/**
 * Create a Stripe Connect account for a host
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} fullName - User full name
 * @returns {Promise<object>} Result with accountId
 */
export const createConnectAccount = async (userId, email, fullName) => {
  try {
    console.log("📤 Creating Stripe Connect account...");

    const response = await fetch(`${FUNCTIONS_BASE_URL}/createConnectAccount`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({
        userId,
        email,
        fullName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create Connect account");
    }

    console.log("✅ Connect account created:", data.accountId);
    return { success: true, accountId: data.accountId };
  } catch (error) {
    console.error("❌ Error creating Connect account:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get Stripe onboarding URL for a host
 * @param {string} userId - User ID
 * @returns {Promise<object>} Result with URL
 */
export const getAccountLink = async (userId) => {
  try {
    console.log("📤 Getting account link...");

    const response = await fetch(`${FUNCTIONS_BASE_URL}/createAccountLink`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to get account link");
    }

    console.log("✅ Account link created");
    return { success: true, url: data.url, expiresAt: data.expiresAt };
  } catch (error) {
    console.error("❌ Error getting account link:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Check Stripe account status
 * @param {string} userId - User ID
 * @returns {Promise<object>} Account status
 */
export const checkAccountStatus = async (userId) => {
  try {
    console.log("📤 Checking account status...");

    const response = await fetch(`${FUNCTIONS_BASE_URL}/getAccountStatus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to check account status");
    }

    console.log("✅ Account status:", data.status);
    return {
      success: true,
      status: data.status,
      chargesEnabled: data.chargesEnabled,
      payoutsEnabled: data.payoutsEnabled,
      canCreatePaidEvents: data.canCreatePaidEvents,
    };
  } catch (error) {
    console.error("❌ Error checking account status:", error);
    return { success: false, error: error.message };
  }
};
