import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { AuthProvider } from "./src/contexts/AuthContext";
import { StripeProvider } from "@stripe/stripe-react-native";
import { ThemeProvider } from "./src/contexts/ThemeContext";
import AppNavigator from "./src/navigation/AppNavigator";
import * as Notifications from "expo-notifications";

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Stripe Publishable Key
const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51SdBpqRZsYFCeXAcmSW4kr8AQpqRK8R9RJIApqlyIu6AMH3fdAWqxWAb6udURsLfVbkjennOcqXLqvux7IBM3R3N00hHaNCeTE";

// ✅ Global navigation reference for handling notification taps
export const navigationRef = React.createRef();

// ✅ Helper function to navigate from outside components
export const navigate = (name, params) => {
  if (navigationRef.current?.isReady()) {
    navigationRef.current.navigate(name, params);
  } else {
    // If navigation isn't ready, wait and retry
    setTimeout(() => {
      if (navigationRef.current?.isReady()) {
        navigationRef.current.navigate(name, params);
      }
    }, 1000);
  }
};

export default function App() {
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Verify Stripe key on app start
    console.log("💳 Stripe Configuration:");
    console.log("  Key length:", STRIPE_PUBLISHABLE_KEY?.length);
    console.log(
      "  Starts with pk_test:",
      STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
    );
    console.log(
      "  Key preview:",
      STRIPE_PUBLISHABLE_KEY?.substring(0, 30) + "..."
    );

    // Set up push notifications
    setupPushNotifications();

    // Listen for incoming notifications while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log(
          "📬 Notification received in foreground:",
          notification.request.content.title
        );
      });

    // ✅ FIXED: Listen for user interactions with notifications (tap)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("👆 Notification tapped!");
        const data = response.notification.request.content.data;
        console.log("📦 Notification data:", JSON.stringify(data));

        // ✅ Handle navigation based on notification type
        handleNotificationNavigation(data);
      });

    // ✅ Check if app was opened from a notification (cold start)
    checkInitialNotification();

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // ✅ NEW: Check if app was opened from a notification when closed
  const checkInitialNotification = async () => {
    try {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        console.log("🚀 App opened from notification (cold start)");
        const data = response.notification.request.content.data;

        // Poll until navigator is ready instead of using a fixed timeout
        const tryNavigate = (attemptsLeft) => {
          if (navigationRef.current?.isReady()) {
            handleNotificationNavigation(data);
          } else if (attemptsLeft > 0) {
            setTimeout(() => tryNavigate(attemptsLeft - 1), 300);
          } else {
            console.warn("⚠️ Navigator never became ready for cold-start notification");
          }
        };
        tryNavigate(10); // up to 3 seconds (10 × 300ms)
      }
    } catch (error) {
      console.error("Error checking initial notification:", error);
    }
  };

  // ✅ NEW: Centralized navigation handler for notifications
  const handleNotificationNavigation = (data) => {
    if (!data) {
      console.log("⚠️ No data in notification");
      return;
    }

    console.log("🧭 Handling notification navigation:", data.type);

    switch (data.type) {
      case "event_message":
      case "event_messages":
        // Navigate to EventChat
        if (data.eventId && data.eventTitle) {
          console.log(`📍 Navigating to EventChat: ${data.eventId}`);
          navigate("EventChat", {
            eventId: data.eventId,
            eventTitle: data.eventTitle,
          });
        } else if (data.eventId) {
          // If no title, try to navigate anyway
          console.log(`📍 Navigating to EventChat (no title): ${data.eventId}`);
          navigate("EventChat", {
            eventId: data.eventId,
            eventTitle: "Event Chat",
          });
        }
        break;

      case "event_joined":
      case "event_paid_attendee":
      case "attendee_cancelled":
        // Navigate to EventDetail
        if (data.eventId) {
          console.log(`📍 Navigating to EventDetail: ${data.eventId}`);
          navigate("EventDetail", {
            eventId: data.eventId,
          });
        }
        break;

      case "host_approved":
      case "host_rejected":
        // Navigate to Profile
        console.log("📍 Navigating to Profile");
        navigate("Profile");
        break;

      case "host_request":
        // Navigate to AdminDashboard
        console.log("📍 Navigating to AdminDashboard");
        navigate("AdminDashboard");
        break;

      default:
        // Default: go to Notifications screen
        console.log("📍 Navigating to Notifications (default)");
        navigate("Notifications");
        break;
    }
  };

  const setupPushNotifications = async () => {
    try {
      // Request permissions
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("⚠️ Push notification permission not granted");
        return;
      }

      console.log("✅ Push notification permission granted");

      // Configure Android channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF6B9D",
          sound: "default",
        });
        console.log("✅ Android notification channel configured");
      }

    } catch (error) {
      console.error("❌ Error setting up push notifications:", error);
    }
  };

  return (
    <AuthProvider>
      <ThemeProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.bondvibe.app"
          urlScheme="bondvibe"
        >
          <AppNavigator ref={navigationRef} />
        </StripeProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
