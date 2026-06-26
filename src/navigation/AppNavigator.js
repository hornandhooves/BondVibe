import React, { useState, useEffect, useRef, forwardRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { registerPushToken } from "../utils/messageService";
import { ActivityIndicator, View } from "react-native";

// Contexts
import { useAuthContext } from "../contexts/AuthContext";

// Components
import SuccessModal from "../components/SuccessModal";

// Auth Screens
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import LegalScreen from "../screens/LegalScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";

// Main Screens
import HomeScreen from "../screens/HomeScreen";
import SearchEventsScreen from "../screens/SearchEventsScreen";
import EventDetailScreen from "../screens/EventDetailScreen";
import CreateEventScreen from "../screens/CreateEventScreen";
import EditEventScreen from "../screens/EditEventScreen";
import MyEventsScreen from "../screens/MyEventsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PersonalityQuizScreen from "../screens/PersonalityQuizScreen";
import PersonalityResultsScreen from "../screens/PersonalityResultsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import EventChatScreen from "../screens/EventChatScreen";
import RequestHostScreen from "../screens/RequestHostScreen";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";

// Payment Screens
import CheckoutScreen from "../screens/payment/CheckoutScreen";

// Stripe Connect Screens
import HostTypeSelectionScreen from "../screens/HostTypeSelectionScreen";
import StripeConnectScreen from "../screens/StripeConnectScreen";

const Stack = createNativeStackNavigator();

const AppNavigator = forwardRef((props, ref) => {
  const { signupInProgress } = useAuthContext();
  const [initialUser, setInitialUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");
  const [initialParams, setInitialParams] = useState({});
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showUserNotFoundModal, setShowUserNotFoundModal] = useState(false);
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const registeredPushTokenUid = useRef(null);
  // Tracks whether the initial routing has been decided for the current session.
  // After first routing, mid-session Firestore updates should NOT re-trigger
  // routing screens like HostTypeSelection — those interruptions come via notifications.
  const hasInitiallyRouted = useRef(false);

  const AUTH_SCREENS = ["Login", "Signup"];

  const navigateToRoute = (routeName, { user = null, params = {} } = {}) => {
    setInitialUser(user);
    setInitialRoute(routeName);
    setInitialParams(params);

    if (ref?.current?.isReady?.()) {
      const currentRouteName = ref.current.getCurrentRoute()?.name;

      if (routeName === "Login" && AUTH_SCREENS.includes(currentRouteName)) {
        console.log(
          `↪️ Ya en flujo de auth (${currentRouteName}), no se fuerza reset`,
        );
        return;
      }

      if (currentRouteName !== routeName) {
        console.log(`🧭 Navegando imperativamente a: ${routeName}`);
        ref.current.reset({
          index: 0,
          routes: [{ name: routeName, params }],
        });
      }
    }
  };

  // Initialize Firebase dynamically
  useEffect(() => {
    console.log("🔥 Initializing Firebase...");

    const initFirebase = async () => {
      try {
        const firebase = await import("../services/firebase");
        setAuth(firebase.auth);
        setDb(firebase.db);
        console.log("✅ Firebase initialized successfully");
      } catch (error) {
        console.error("❌ Firebase initialization failed:", error);
      }
    };

    initFirebase();
  }, []);

  // Set up auth listener once Firebase is ready
  useEffect(() => {
    if (!auth || !db) {
      console.log("⏳ Waiting for Firebase...");
      return;
    }

    console.log("🔄 Setting up auth listener...");

    let unsubscribeFirestore = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (signupInProgress) {
        console.log("⏭️ Signup in progress - ignoring auth state change");
        return;
      }

      console.log("🔐 Auth state changed:", user?.uid || "null");

      if (unsubscribeFirestore) {
        console.log("🧹 Cleaning up previous Firestore listener");
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (user) {
        console.log("👤 User logged in:", user.uid);
        console.log("📧 Email verified:", user.emailVerified);
        console.log("🔄 Setting up Firestore listener for user:", user.uid);

        unsubscribeFirestore = onSnapshot(
          doc(db, "users", user.uid),
          (docSnapshot) => {
            console.log("📄 Firestore document updated");

            if (docSnapshot.exists()) {
              const userData = docSnapshot.data();
              console.log("✅ User data:", userData);

              // Email verification is always enforced — even mid-session — because
              // it's a security gate. All other routing only runs on initial load.
              if (!userData.emailVerified) {
                console.log(
                  "❌ Email not verified - showing modal and signing out",
                );
                setShowVerificationModal(true);
                navigateToRoute("Login");
                auth.signOut();
                return;
              }

              // Mid-session Firestore updates (e.g. admin approves host role) should
              // NOT interrupt the user. Only run the full routing on initial load.
              if (hasInitiallyRouted.current) {
                console.log("🔄 Mid-session update — routing already done, skipping");
                return;
              }
              hasInitiallyRouted.current = true;

              // 2. Verify legal terms accepted
              if (!userData.legalAccepted) {
                console.log("⚖️ Legal not accepted - navigating to Legal");
                navigateToRoute("Legal", { user });
              }
              // 3. Verify profile completed
              else if (!userData.profileCompleted) {
                console.log(
                  "👤 Profile incomplete - navigating to ProfileSetup",
                );
                navigateToRoute("ProfileSetup", { user });
              }
              // 4. Check if host needs to select type (only on initial login,
              //    NOT triggered by mid-session role changes from admin)
              else if (userData.role === "host" && !userData.hostConfig) {
                console.log(
                  "🎪 Host needs to select type - navigating to HostTypeSelection",
                );
                navigateToRoute("HostTypeSelection", {
                  user,
                  params: { userEmail: user.email, fullName: "Host" },
                });
              }
              // 5. All checks passed - go to Home
              else {
                console.log("✅ All checks passed - navigating to Home");
                if (registeredPushTokenUid.current !== user.uid) {
                  registeredPushTokenUid.current = user.uid;
                  registerPushToken(user.uid);
                }
                navigateToRoute("Home", { user });
              }
            } else {
              AsyncStorage.getItem("@account_deleting").then(
                (isDeletingAccount) => {
                  if (isDeletingAccount === "true") {
                    console.log(
                      "🗑️ Account deletion completed, skipping modal",
                    );
                    AsyncStorage.removeItem("@account_deleting");
                  } else {
                    console.log(
                      "❌ User doc does not exist - showing modal and signing out",
                    );
                    setShowUserNotFoundModal(true);
                  }
                },
              );
              navigateToRoute("Login");
              auth.signOut();
            }

            console.log("✅ Initialization complete");
            setLoading(false);
          },
          (error) => {
            console.error("❌ Error listening to user doc:", error);
            navigateToRoute("Login");
            setLoading(false);
          },
        );
      } else {
        console.log("🚪 No user, showing login");
        hasInitiallyRouted.current = false; // reset for next login session
        registeredPushTokenUid.current = null;
        navigateToRoute("Login");
        setLoading(false);
      }
    });

    return () => {
      console.log("🧹 Cleaning up listeners");
      unsubscribeAuth();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [auth, db, signupInProgress]);

  const handleVerificationModalClose = () => {
    console.log("✅ Verification modal closed");
    setShowVerificationModal(false);
  };

  const handleUserNotFoundModalClose = () => {
    console.log("✅ User not found modal closed");
    setShowUserNotFoundModal(false);
  };

  if (loading || !auth || !db) {
    console.log("⏳ Loading...");
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0B0F1A",
        }}
      >
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  console.log("🗺️ AppNavigator rendering, initialRoute:", initialRoute);

  return (
    <>
      <NavigationContainer ref={ref}>
        {/* ✅ Un solo Stack, todas las pantallas siempre registradas.
            La navegación entre estados (Login/Legal/ProfileSetup/HostTypeSelection/Home)
            se maneja con navigateToRoute() de forma imperativa, no condicionando
            qué pantallas existen. */}
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Legal" component={LegalScreen} />
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
          <Stack.Screen
            name="HostTypeSelection"
            component={HostTypeSelectionScreen}
            initialParams={initialParams}
          />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="SearchEvents" component={SearchEventsScreen} />
          <Stack.Screen name="EventDetail" component={EventDetailScreen} />
          <Stack.Screen name="CreateEvent" component={CreateEventScreen} />
          <Stack.Screen name="EditEvent" component={EditEventScreen} />
          <Stack.Screen name="MyEvents" component={MyEventsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen
            name="PersonalityQuiz"
            component={PersonalityQuizScreen}
          />
          <Stack.Screen
            name="PersonalityResults"
            component={PersonalityResultsScreen}
          />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="EventChat" component={EventChatScreen} />
          <Stack.Screen name="RequestHost" component={RequestHostScreen} />
          <Stack.Screen
            name="AdminDashboard"
            component={AdminDashboardScreen}
          />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="StripeConnect" component={StripeConnectScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      <SuccessModal
        visible={showVerificationModal}
        onClose={handleVerificationModalClose}
        title="Verify Your Email"
        message="Please verify your email address before logging in. Check your inbox (and spam folder) and click the verification link we sent you."
        emoji="📧"
      />

      <SuccessModal
        visible={showUserNotFoundModal}
        onClose={handleUserNotFoundModalClose}
        title="Account Issue"
        message="Your account was created but user data is missing. This sometimes happens if signup was interrupted. Please try signing up again or contact support."
        emoji="⚠️"
      />
    </>
  );
});

export default AppNavigator;
