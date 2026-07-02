/**
 * Admin Service - Centralized admin functions
 * Handles user management, role changes, and suspensions
 */

import {
  doc,
  updateDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { createNotification } from "./notificationService";

/**
 * ============================================
 * ROLE MANAGEMENT
 * ============================================
 */

/**
 * Upgrade user to admin
 */
export const makeUserAdmin = async (userId) => {
  try {
    await updateDoc(doc(db, "users", userId), {
      role: "admin",
      promotedToAdminAt: new Date().toISOString(),
      hostProfile: {
        verified: true,
        eventsHosted: 0,
        rating: 5,
        verifiedAt: new Date().toISOString(),
        bio: "Kinlo Team",
      },
    });

    await createNotification(userId, {
      type: "role_change",
      title: "You are now an Admin! 👑",
      message: "You have been promoted to administrator. Welcome to the team!",
      icon: "👑",
    });

    console.log("✅ User upgraded to admin:", userId);
    return { success: true };
  } catch (error) {
    console.error("❌ Error making admin:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Upgrade user to host
 */
export const makeUserHost = async (userId) => {
  try {
    await updateDoc(doc(db, "users", userId), {
      role: "host",
      promotedToHostAt: new Date().toISOString(),
      hostProfile: {
        verified: true,
        eventsHosted: 0,
        rating: 5,
        verifiedAt: new Date().toISOString(),
        bio: "",
      },
    });

    await createNotification(userId, {
      type: "role_change",
      title: "You are now a Host! 🎪",
      message:
        "You can now create and manage events. Start building your community!",
      icon: "🎪",
    });

    console.log("✅ User upgraded to host:", userId);
    return { success: true };
  } catch (error) {
    console.error("❌ Error making host:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Demote admin to regular user
 */
export const removeAdminRole = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();

    // Keep hostProfile if they were also a host
    const updates = {
      role: "user",
      demotedFromAdminAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, "users", userId), updates);

    await createNotification(userId, {
      type: "role_change",
      title: "Role Updated",
      message:
        "Your admin privileges have been removed. You are now a regular user.",
      icon: "👤",
    });

    console.log("✅ Admin role removed:", userId);
    return { success: true };
  } catch (error) {
    console.error("❌ Error removing admin role:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Demote host to regular user and cancel their events
 */
export const removeHostRole = async (userId, adminMessage = "") => {
  try {
    // 1. Get all events created by this host
    const eventsQuery = query(
      collection(db, "events"),
      where("creatorId", "==", userId),
      where("status", "==", "published")
    );
    const eventsSnapshot = await getDocs(eventsQuery);

    // 2. Cancel all their active events
    const batch = writeBatch(db);
    const eventTitles = [];

    eventsSnapshot.docs.forEach((eventDoc) => {
      batch.update(eventDoc.ref, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: `Host privileges were revoked. ${adminMessage}`,
      });
      eventTitles.push(eventDoc.data().title);
    });

    // 3. Remove host role
    batch.update(doc(db, "users", userId), {
      role: "user",
      demotedFromHostAt: new Date().toISOString(),
      hostProfile: {
        verified: false,
        eventsHosted: eventsSnapshot.size,
        removedAt: new Date().toISOString(),
      },
    });

    // 4. Commit all changes
    await batch.commit();

    // 5. Notify user
    await createNotification(userId, {
      type: "role_change",
      title: "Host Role Removed",
      message: `Your host privileges have been removed. ${eventsSnapshot.size} event(s) have been cancelled. ${adminMessage}`,
      icon: "⚠️",
    });

    console.log("✅ Host role removed and events cancelled:", userId);
    console.log("📋 Cancelled events:", eventTitles);
    return {
      success: true,
      eventsCancelled: eventsSnapshot.size,
      eventTitles,
    };
  } catch (error) {
    console.error("❌ Error removing host role:", error);
    return { success: false, error: error.message };
  }
};

/**
 * ============================================
 * USER SUSPENSION (BAN)
 * ============================================
 */

/**
 * Suspend/ban a user
 */
export const suspendUser = async (userId, reason = "", suspendedByAdminId) => {
  try {
    // 1. Cancel all their active events (if they're a host)
    const eventsQuery = query(
      collection(db, "events"),
      where("creatorId", "==", userId),
      where("status", "==", "published")
    );
    const eventsSnapshot = await getDocs(eventsQuery);

    const batch = writeBatch(db);

    eventsSnapshot.docs.forEach((eventDoc) => {
      batch.update(eventDoc.ref, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Event creator was suspended.",
      });
    });

    // 2. Suspend user
    batch.update(doc(db, "users", userId), {
      suspended: true,
      suspendedAt: new Date().toISOString(),
      suspendedBy: suspendedByAdminId,
      suspensionReason: reason,
    });

    await batch.commit();

    // 3. Notify user
    await createNotification(userId, {
      type: "suspension",
      title: "Account Suspended",
      message: `Your account has been suspended. Reason: ${reason}`,
      icon: "🚫",
    });

    console.log("✅ User suspended:", userId);
    console.log("📋 Events cancelled:", eventsSnapshot.size);
    return {
      success: true,
      eventsCancelled: eventsSnapshot.size,
    };
  } catch (error) {
    console.error("❌ Error suspending user:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Unsuspend/unban a user
 */
export const unsuspendUser = async (userId) => {
  try {
    await updateDoc(doc(db, "users", userId), {
      suspended: false,
      unsuspendedAt: new Date().toISOString(),
      suspensionReason: null,
      suspendedBy: null,
      suspendedAt: null,
    });

    await createNotification(userId, {
      type: "unsuspension",
      title: "Account Reactivated",
      message: "Your account has been reactivated. Welcome back!",
      icon: "✅",
    });

    console.log("✅ User unsuspended:", userId);
    return { success: true };
  } catch (error) {
    console.error("❌ Error unsuspending user:", error);
    return { success: false, error: error.message };
  }
};

/**
 * ============================================
 * USER DATA RETRIEVAL
 * ============================================
 */

/**
 * Get all users with optional role filter
 */
export const getAllUsers = async (roleFilter = "all") => {
  try {
    let usersQuery;

    if (roleFilter === "all") {
      usersQuery = collection(db, "users");
    } else {
      usersQuery = query(
        collection(db, "users"),
        where("role", "==", roleFilter)
      );
    }

    const snapshot = await getDocs(usersQuery);
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`📊 Loaded ${users.length} users (filter: ${roleFilter})`);
    return users;
  } catch (error) {
    console.error("❌ Error loading users:", error);
    return [];
  }
};

/**
 * Get user stats by role
 */
export const getUserStats = async () => {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const users = usersSnapshot.docs.map((doc) => doc.data());

    const stats = {
      total: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      hosts: users.filter((u) => u.role === "host").length,
      regular: users.filter((u) => u.role === "user").length,
      suspended: users.filter((u) => u.suspended).length,
    };

    console.log("📊 User stats:", stats);
    return stats;
  } catch (error) {
    console.error("❌ Error loading user stats:", error);
    return {
      total: 0,
      admins: 0,
      hosts: 0,
      regular: 0,
      suspended: 0,
    };
  }
};

/**
 * ============================================
 * VALIDATION HELPERS
 * ============================================
 */

/**
 * Check if current user can perform admin action
 */
export const canPerformAdminAction = async (currentUserId, targetUserId) => {
  try {
    const currentUserDoc = await getDoc(doc(db, "users", currentUserId));
    const targetUserDoc = await getDoc(doc(db, "users", targetUserId));

    if (!currentUserDoc.exists() || !targetUserDoc.exists()) {
      return { allowed: false, reason: "User not found" };
    }

    const currentRole = currentUserDoc.data().role;
    const targetRole = targetUserDoc.data().role;

    // Only admins can perform admin actions
    if (currentRole !== "admin") {
      return { allowed: false, reason: "Insufficient permissions" };
    }

    // Can't demote yourself
    if (currentUserId === targetUserId) {
      return { allowed: false, reason: "Cannot modify your own account" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("❌ Error checking permissions:", error);
    return { allowed: false, reason: "Error checking permissions" };
  }
};
