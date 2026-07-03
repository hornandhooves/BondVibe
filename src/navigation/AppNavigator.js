import React, { useState, useEffect, useRef, forwardRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { registerPushToken } from "../utils/messageService";
import { logger } from "../utils/logger";
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

// Host Membership Screens
import MembershipPlansScreen from "../screens/MembershipPlansScreen";
import HostMembershipsScreen from "../screens/HostMembershipsScreen";
import MembershipCheckoutScreen from "../screens/MembershipCheckoutScreen";
import MyMembershipsScreen from "../screens/MyMembershipsScreen";
import EventCheckInScreen from "../screens/EventCheckInScreen";
import HostAnalyticsScreen from "../screens/HostAnalyticsScreen";
import BondVibeProScreen from "../screens/BondVibeProScreen";
import CheckInScannerScreen from "../screens/CheckInScannerScreen";
import HostCRMScreen from "../screens/HostCRMScreen";
import HowToAttendScreen from "../screens/HowToAttendScreen";
import PromoteEventScreen from "../screens/PromoteEventScreen";
import RatingDetailScreen from "../screens/RatingDetailScreen";
import HostGroupsScreen from "../screens/HostGroupsScreen";
import GroupChatScreen from "../screens/GroupChatScreen";
import GroupManageScreen from "../screens/GroupManageScreen";
import PollVotesScreen from "../screens/PollVotesScreen";
import MembershipSaleScreen from "../screens/MembershipSaleScreen";
import FinanceScreen from "../screens/FinanceScreen";
import AnalyticsDetailScreen from "../screens/AnalyticsDetailScreen";
import RatingsOverviewScreen from "../screens/RatingsOverviewScreen";
import EventRosterScreen from "../screens/EventRosterScreen";
import ConnectScreen from "../screens/ConnectScreen";
import RentalHubScreen from "../screens/RentalHubScreen";
import VehicleDetailScreen from "../screens/VehicleDetailScreen";
import RentalCheckoutScreen from "../screens/RentalCheckoutScreen";
import ActiveRentalScreen from "../screens/ActiveRentalScreen";
import MyRentalsScreen from "../screens/MyRentalsScreen";
import MyFleetScreen from "../screens/MyFleetScreen";
import PublishVehicleScreen from "../screens/PublishVehicleScreen";
import VehicleBookingsScreen from "../screens/VehicleBookingsScreen";
// Social layer (feed / posts / DMs / profiles)
import FeedScreen from "../screens/FeedScreen";
import CreatePostScreen from "../screens/CreatePostScreen";
import PostDetailScreen from "../screens/PostDetailScreen";
import DMListScreen from "../screens/DMListScreen";
import DMChatScreen from "../screens/DMChatScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import FollowListScreen from "../screens/FollowListScreen";
// Community Matching (A1–E4)
import MatchOptInScreen from "../screens/matching/MatchOptInScreen";
import MatchConsentScreen from "../screens/matching/MatchConsentScreen";
import MatchProfileScreen from "../screens/matching/MatchProfileScreen";
import MatchingLockedScreen from "../screens/matching/MatchingLockedScreen";
import MatchGridScreen from "../screens/matching/MatchGridScreen";
import MatchPersonScreen from "../screens/matching/MatchPersonScreen";
import MatchChatScreen from "../screens/matching/MatchChatScreen";
import PlusPaywallScreen from "../screens/matching/PlusPaywallScreen";
import PeopleYouMetScreen from "../screens/matching/PeopleYouMetScreen";
import HostMatchingControlsScreen from "../screens/matching/HostMatchingControlsScreen";
import HostMatchAnalyticsScreen from "../screens/matching/HostMatchAnalyticsScreen";
import MatchVisibilityScreen from "../screens/matching/MatchVisibilityScreen";
import ProUpsellScreen from "../screens/matching/ProUpsellScreen";
import ProCheckoutScreen from "../screens/matching/ProCheckoutScreen";
import PlusCheckoutScreen from "../screens/matching/PlusCheckoutScreen";
import PlusActivatedScreen from "../screens/matching/PlusActivatedScreen";

const Stack = createNativeStackNavigator();

const AppNavigator = forwardRef((props, ref) => {
  const { signupInProgress } = useAuthContext();
  const [, setInitialUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");
  const [initialParams, setInitialParams] = useState({});
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showUserNotFoundModal, setShowUserNotFoundModal] = useState(false);
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const registeredPushTokenUid = useRef(null);
  // Set to true once the user successfully reaches Home.
  // Prevents mid-session Firestore updates (e.g. admin approving host)
  // from re-routing the user away from the app while they're using it.
  // Does NOT block the sequential onboarding flow (legal → profile → home).
  const hasReachedHome = useRef(false);

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
              logger.log("✅ User data loaded for:", user.uid);

              // 1. Email verification — use Firebase Auth token (always fresh after
              //    user.reload() in LoginScreen), not the Firestore field, to avoid
              //    race conditions with the Firestore sync.
              if (!user.emailVerified) {
                console.log(
                  "❌ Email not verified - showing modal and signing out",
                );
                setShowVerificationModal(true);
                navigateToRoute("Login");
                auth.signOut();
                return;
              }

              // Once the user has reached Home, mid-session Firestore updates
              // (e.g. admin approving host role) must NOT re-route them.
              // The sequential onboarding flow (legal → profile → home) still
              // works because hasReachedHome is false until Home is reached.
              if (hasReachedHome.current) {
                console.log("🔄 Mid-session update — user at Home, skipping routing");
                return;
              }

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
              // 4. Approved host needs to choose their type (free/paid) before
              //    hosting is activated. Only shown before Home is reached, so
              //    mid-session admin approvals won't interrupt the user.
              //    (role === "host" covers legacy hosts approved before the
              //    hostApproved flag existed.)
              else if (
                (userData.hostApproved || userData.role === "host") &&
                !userData.hostConfig
              ) {
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
                hasReachedHome.current = true;
                if (registeredPushTokenUid.current !== user.uid) {
                  registeredPushTokenUid.current = user.uid;
                  registerPushToken(user.uid);
                }
                navigateToRoute("Home", { user });
              }
            } else {
              // No user doc yet. For a BRAND-NEW account (just created via
              // social/email sign-in) the doc is being written by ensureUserDoc
              // — wait for the next snapshot instead of signing out. This fixes
              // the Google/Apple sign-up race where onAuthStateChanged fires
              // before the Firestore doc exists. Genuinely orphaned/deleted
              // accounts (old creationTime) still sign out as before.
              const createdMs = user.metadata?.creationTime
                ? Date.parse(user.metadata.creationTime)
                : 0;
              const isBrandNew = createdMs && Date.now() - createdMs < 120000;
              if (isBrandNew) {
                console.log(
                  "🆕 New account - waiting for user doc to be created",
                );
                setLoading(false);
                return;
              }
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
        hasReachedHome.current = false; // reset for next login session
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
    // navigateToRoute only closes over stable values (state setters + the
    // module-level navigation ref + a constant array), so it never changes. The
    // auth/Firestore listener must re-subscribe ONLY on auth/db/signup changes —
    // adding navigateToRoute here would be a no-op at best and risk re-subscribe
    // loops at worst. Verified stable; intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          backgroundColor: "#F1F0F4",
        }}
      >
        <ActivityIndicator size="large" color="#7C3AED" />
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
          <Stack.Screen name="BondVibePro" component={BondVibeProScreen} />
          <Stack.Screen name="CheckInScanner" component={CheckInScannerScreen} />
          <Stack.Screen name="HostCRM" component={HostCRMScreen} />
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
          <Stack.Screen
            name="MembershipPlans"
            component={MembershipPlansScreen}
          />
          <Stack.Screen
            name="HostMemberships"
            component={HostMembershipsScreen}
          />
          <Stack.Screen
            name="MembershipCheckout"
            component={MembershipCheckoutScreen}
          />
          <Stack.Screen
            name="MyMemberships"
            component={MyMembershipsScreen}
          />
          <Stack.Screen
            name="EventCheckIn"
            component={EventCheckInScreen}
          />
          <Stack.Screen
            name="HostAnalytics"
            component={HostAnalyticsScreen}
          />
          <Stack.Screen
            name="HowToAttend"
            component={HowToAttendScreen}
          />
          <Stack.Screen
            name="PromoteEvent"
            component={PromoteEventScreen}
          />
          <Stack.Screen
            name="RatingDetail"
            component={RatingDetailScreen}
          />
          <Stack.Screen name="HostGroups" component={HostGroupsScreen} />
          <Stack.Screen name="GroupChat" component={GroupChatScreen} />
          <Stack.Screen name="GroupManage" component={GroupManageScreen} />
          <Stack.Screen name="PollVotes" component={PollVotesScreen} />
          <Stack.Screen name="MembershipSale" component={MembershipSaleScreen} />
          <Stack.Screen name="Finance" component={FinanceScreen} />
          <Stack.Screen name="AnalyticsDetail" component={AnalyticsDetailScreen} />
          <Stack.Screen name="RatingsOverview" component={RatingsOverviewScreen} />
          <Stack.Screen name="EventRoster" component={EventRosterScreen} />
          <Stack.Screen name="Connect" component={ConnectScreen} />
          <Stack.Screen name="RentalHub" component={RentalHubScreen} />
          <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
          <Stack.Screen name="RentalCheckout" component={RentalCheckoutScreen} />
          <Stack.Screen name="ActiveRental" component={ActiveRentalScreen} />
          <Stack.Screen name="MyRentals" component={MyRentalsScreen} />
          <Stack.Screen name="MyFleet" component={MyFleetScreen} />
          <Stack.Screen name="PublishVehicle" component={PublishVehicleScreen} />
          <Stack.Screen name="VehicleBookings" component={VehicleBookingsScreen} />
          {/* Social layer */}
          <Stack.Screen name="Feed" component={FeedScreen} />
          <Stack.Screen name="CreatePost" component={CreatePostScreen} />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          <Stack.Screen name="DMList" component={DMListScreen} />
          <Stack.Screen name="DMChat" component={DMChatScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="FollowList" component={FollowListScreen} />
          {/* Community Matching (A1–E4) */}
          <Stack.Screen name="MatchOptIn" component={MatchOptInScreen} />
          <Stack.Screen name="MatchConsent" component={MatchConsentScreen} />
          <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
          <Stack.Screen name="MatchingLocked" component={MatchingLockedScreen} />
          <Stack.Screen name="MatchGrid" component={MatchGridScreen} />
          <Stack.Screen name="MatchPerson" component={MatchPersonScreen} />
          <Stack.Screen name="MatchChat" component={MatchChatScreen} />
          <Stack.Screen name="PlusPaywall" component={PlusPaywallScreen} />
          <Stack.Screen name="PeopleYouMet" component={PeopleYouMetScreen} />
          <Stack.Screen name="HostMatchingControls" component={HostMatchingControlsScreen} />
          <Stack.Screen name="HostMatchAnalytics" component={HostMatchAnalyticsScreen} />
          <Stack.Screen name="MatchVisibility" component={MatchVisibilityScreen} />
          <Stack.Screen name="ProUpsell" component={ProUpsellScreen} />
          <Stack.Screen name="ProCheckout" component={ProCheckoutScreen} />
          <Stack.Screen name="PlusCheckout" component={PlusCheckoutScreen} />
          <Stack.Screen name="PlusActivated" component={PlusActivatedScreen} />
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

AppNavigator.displayName = "AppNavigator";

export default AppNavigator;
