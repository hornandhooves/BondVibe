import React, { useState, useEffect, useRef, forwardRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { persistUserLanguage } from "../i18n";
import { registerPushToken } from "../utils/messageService";
import { logger } from "../utils/logger";
import { ActivityIndicator, View } from "react-native";

// Contexts
import { useAuthContext } from "../contexts/AuthContext";
import { ModeProvider, useMode } from "../contexts/ModeContext";
import { useBusiness } from "../contexts/BusinessContext";
import { useTheme } from "../contexts/ThemeContext";
import useUserRole from "../hooks/useUserRole";
import useCanManageBusiness from "../hooks/useCanManageBusiness";

// Components
import SuccessModal from "../components/SuccessModal";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";

// Auth Screens
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import LegalScreen from "../screens/LegalScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import ChooseHandleScreen from "../screens/ChooseHandleScreen";
import FindPeopleScreen from "../screens/FindPeopleScreen";

// Main Screens
import HomeScreen from "../screens/HomeScreen";
import SearchEventsScreen from "../screens/SearchEventsScreen";
import EventDetailScreen from "../screens/EventDetailScreen";
import CreateEventScreen from "../screens/CreateEventScreen";
import EditEventScreen from "../screens/EditEventScreen";
import MyEventsScreen from "../screens/MyEventsScreen";
import ProfileScreen from "../screens/ProfileScreen";
// Kinlo for Business (host ERP/CRM) — Pro-gated, mounted from Manage.
import BusinessHubScreen from "../screens/business/BusinessHubScreen";
import BusinessSetupScreen from "../screens/business/BusinessSetupScreen";
import MembersListScreen from "../screens/business/MembersListScreen";
import MemberFormScreen from "../screens/business/MemberFormScreen";
import MemberRecordScreen from "../screens/business/MemberRecordScreen";
import MembershipCardScreen from "../screens/business/MembershipCardScreen";
import BusinessBirthdaysScreen from "../screens/business/BusinessBirthdaysScreen";
import CsvImportScreen from "../screens/business/CsvImportScreen";
import PackagesScreen from "../screens/business/PackagesScreen";
import PackageFormScreen from "../screens/business/PackageFormScreen";
import BusinessCheckInScreen from "../screens/business/BusinessCheckInScreen";
import RedeemCodeScreen from "../screens/business/RedeemCodeScreen";
import RequestSessionScreen from "../screens/business/RequestSessionScreen";
import BusinessDashboardScreen from "../screens/business/BusinessDashboardScreen";
import MomentumBoardScreen from "../screens/business/MomentumBoardScreen";
import MomentumCardScreen from "../screens/business/MomentumCardScreen";
import MomentumColumnsScreen from "../screens/business/MomentumColumnsScreen";
import BusinessFinanceScreen from "../screens/business/BusinessFinanceScreen";
import PaymentFormScreen from "../screens/business/PaymentFormScreen";
import BusinessExpensesScreen from "../screens/business/BusinessExpensesScreen";
import ExpenseFormScreen from "../screens/business/ExpenseFormScreen";
import SetTargetScreen from "../screens/business/SetTargetScreen";
import TargetTrackerScreen from "../screens/business/TargetTrackerScreen";
import ClassesScreen from "../screens/business/ClassesScreen";
import ClassFormScreen from "../screens/business/ClassFormScreen";
import ClassRosterScreen from "../screens/business/ClassRosterScreen";
import SessionsAgendaScreen from "../screens/business/SessionsAgendaScreen";
import AgendaScreen from "../screens/business/AgendaScreen";
import SessionTypesScreen from "../screens/business/SessionTypesScreen";
import AvailabilityScreen from "../screens/business/AvailabilityScreen";
import BookingFormScreen from "../screens/business/BookingFormScreen";
import SessionDetailScreen from "../screens/business/SessionDetailScreen";
import AutomationsScreen from "../screens/business/AutomationsScreen";
import AutomationFormScreen from "../screens/business/AutomationFormScreen";
import MessageLogScreen from "../screens/business/MessageLogScreen";
import StaffScreen from "../screens/business/StaffScreen";
import RolesScreen from "../screens/business/RolesScreen";
import BranchesScreen from "../screens/business/BranchesScreen";
import PersonalityQuizScreen from "../screens/PersonalityQuizScreen";
import PersonalityResultsScreen from "../screens/PersonalityResultsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import EventChatScreen from "../screens/EventChatScreen";
import EventChatsScreen from "../screens/EventChatsScreen";
import CommunityChatsScreen from "../screens/CommunityChatsScreen";
import RequestHostScreen from "../screens/RequestHostScreen";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";

// Payment Screens
import CheckoutScreen from "../screens/payment/CheckoutScreen";

// Stripe Connect Screens
import HostTypeSelectionScreen from "../screens/HostTypeSelectionScreen";
import MembershipsScreen from "../screens/business/MembershipsScreen";
import PlanFormScreen from "../screens/business/PlanFormScreen";
import HostLiveScreen from "../screens/HostLiveScreen";
import HostStatusScreen from "../screens/HostStatusScreen";
import StripeConnectScreen from "../screens/StripeConnectScreen";

// Host Membership Screens
import MembershipPlansScreen from "../screens/MembershipPlansScreen";
import HostMembershipsScreen from "../screens/HostMembershipsScreen";
import MembershipCheckoutScreen from "../screens/MembershipCheckoutScreen";
import MyMembershipsScreen from "../screens/MyMembershipsScreen";
import MembershipHistoryScreen from "../screens/MembershipHistoryScreen";
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
import MarketplaceExploreScreen from "../screens/MarketplaceExploreScreen";
import ServiceDetailScreen from "../screens/ServiceDetailScreen";
import ServiceCheckoutScreen from "../screens/ServiceCheckoutScreen";
import RentalCheckoutScreen from "../screens/RentalCheckoutScreen";
import ActiveRentalScreen from "../screens/ActiveRentalScreen";
import MyRentalsScreen from "../screens/MyRentalsScreen";
import MyFleetScreen from "../screens/MyFleetScreen";
import PublishVehicleScreen from "../screens/PublishVehicleScreen";
import VehicleBookingsScreen from "../screens/VehicleBookingsScreen";
// Social layer (feed / posts / DMs / profiles)
import FeedScreen from "../screens/FeedScreen";
import CreatePostScreen from "../screens/CreatePostScreen";
import CommunityWallScreen from "../screens/wall/CommunityWallScreen";
import MomentViewerScreen from "../screens/wall/MomentViewerScreen";
import PostDetailScreen from "../screens/PostDetailScreen";
import DMListScreen from "../screens/DMListScreen";
import DMChatScreen from "../screens/DMChatScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import FollowListScreen from "../screens/FollowListScreen";
// Community Matching (A1–E4)
import MatchOptInScreen from "../screens/matching/MatchOptInScreen";
import MatchConsentScreen from "../screens/matching/MatchConsentScreen";
import MatchProfileScreen from "../screens/matching/MatchProfileScreen";
import MatchProfileViewScreen from "../screens/matching/MatchProfileViewScreen";
import MatchingLockedScreen from "../screens/matching/MatchingLockedScreen";
import MatchGridScreen from "../screens/matching/MatchGridScreen";
import MatchPersonScreen from "../screens/matching/MatchPersonScreen";
import MatchChatScreen from "../screens/matching/MatchChatScreen";
import PlusPaywallScreen from "../screens/matching/PlusPaywallScreen";
import CuratedSetScreen from "../screens/matching/CuratedSetScreen";
import MatchGroupsScreen from "../screens/matching/MatchGroupsScreen";
import MatchGroupChatScreen from "../screens/matching/MatchGroupChatScreen";
import MatchmakingSettingsScreen from "../screens/matching/MatchmakingSettingsScreen";
import PeopleYouMetScreen from "../screens/matching/PeopleYouMetScreen";
import HostMatchingControlsScreen from "../screens/matching/HostMatchingControlsScreen";
import HostMatchAnalyticsScreen from "../screens/matching/HostMatchAnalyticsScreen";
import MatchVisibilityScreen from "../screens/matching/MatchVisibilityScreen";
import ProUpsellScreen from "../screens/matching/ProUpsellScreen";
import ProCheckoutScreen from "../screens/matching/ProCheckoutScreen";
import PlusCheckoutScreen from "../screens/matching/PlusCheckoutScreen";
import PlusActivatedScreen from "../screens/matching/PlusActivatedScreen";
import ReportScreen from "../screens/ReportScreen";
import SafetyCenterScreen from "../screens/SafetyCenterScreen";
import ManageScreen from "../screens/ManageScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AiOptInScreen from "../screens/AiOptInScreen";
import AskKinloScreen from "../screens/AskKinloScreen";
import InboxScreen from "../screens/InboxScreen";
import YourWeekScreen from "../screens/YourWeekScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── 5-tab shell (kinlo_build/01_REDESIGN_SPEC §1.2) ─────────────────────────
// Home · Wall · Events · Rentals · Profile. Persistent AppHeader (✉/🔔 + Host
// Mode toggle) on every tab. All detail screens stay in the parent stack, so
// every existing navigate("X") keeps working.

/** Events tab root swaps by Host Mode (§1.3): MyEvents ↔ Manage. */
function EventsTabRoot(props) {
  const { isHosting } = useMode();
  const { isHost } = useUserRole();
  // BUG 32.5: an accepted staff member (business membership) can reach Manage
  // too, not just app-level hosts.
  const { businesses } = useBusiness();
  const canHostView = isHost || businesses.length > 0;
  return isHosting && canHostView ? <ManageScreen {...props} /> : <MyEventsScreen {...props} />;
}

const TAB_META = {
  HomeTab: { labelKey: "navigation.tabs.home", icon: "discover" },
  WallTab: { labelKey: "navigation.tabs.wall", icon: "wall" },
  EventsTab: { labelKey: "navigation.tabs.events", icon: "events" },
  ServicesTab: { labelKey: "navigation.tabs.services", icon: "services" },
  BusinessTab: { labelKey: "navigation.tabs.business", icon: "business" },
};

// T2: the Business tab is a LAUNCHER into the existing (pushed) BusinessHub —
// tabPress is prevented so this placeholder screen is never actually rendered.
// This keeps the hub untouched (its own back button stays meaningful).
const BusinessTabPlaceholder = () => null;

// The Events tab shows "Your events" in Hosting mode (T4b), else the tab label.
function TabHeader({ routeName, navigation }) {
  const { t } = useTranslation();
  const { mode } = useMode();
  let title = "";
  if (routeName !== "HomeTab") {
    title =
      routeName === "EventsTab" && mode === "hosting"
        ? t("manage.yourEvents")
        : t(TAB_META[routeName].labelKey);
  }
  return <AppHeader title={title} navigation={navigation} />;
}

function MainTabs() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const canManageBusiness = useCanManageBusiness();
  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        header: () => <TabHeader routeName={route.name} navigation={navigation} />,
        tabBarIcon: ({ color, focused }) => (
          <Icon
            name={TAB_META[route.name].icon}
            size={23}
            color={color}
            strokeWidth={focused ? 2.2 : 1.75}
          />
        ),
        tabBarLabel: t(TAB_META[route.name].labelKey),
        tabBarTestID: `tab-${route.name.replace("Tab", "").toLowerCase()}`,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} />
      <Tab.Screen name="WallTab" component={FeedScreen} />
      <Tab.Screen name="EventsTab" component={EventsTabRoot} />
      <Tab.Screen name="ServicesTab" component={MarketplaceExploreScreen} />
      {canManageBusiness && (
        <Tab.Screen
          name="BusinessTab"
          component={BusinessTabPlaceholder}
          options={{
            tabBarBadge: "PRO",
            tabBarBadgeStyle: { backgroundColor: colors.primary, color: "#fff", fontSize: 8, fontWeight: "800" },
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate("BusinessHub", { from: "tab" });
            },
          })}
        />
      )}
    </Tab.Navigator>
  );
}

const AppNavigator = forwardRef((props, ref) => {
  const { signupInProgress } = useAuthContext();
  const [, setInitialUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Welcome");
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

  const AUTH_SCREENS = ["Welcome", "Login", "Signup"];
  // Inside MainTabs the "current route" is the focused tab, not "MainTabs".
  const TAB_ROUTES = ["HomeTab", "WallTab", "EventsTab", "ServicesTab", "BusinessTab"];

  const navigateToRoute = (routeName, { user = null, params = {} } = {}) => {
    setInitialUser(user);
    setInitialRoute(routeName);
    setInitialParams(params);

    if (ref?.current?.isReady?.()) {
      const currentRouteName = ref.current.getCurrentRoute()?.name;

      if (AUTH_SCREENS.includes(routeName) && AUTH_SCREENS.includes(currentRouteName)) {
        console.log(
          `↪️ Ya en flujo de auth (${currentRouteName}), no se fuerza reset`,
        );
        return;
      }

      // Already inside the tab shell → don't reset onto it again.
      if (routeName === "MainTabs" && TAB_ROUTES.includes(currentRouteName)) {
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
        // BUG 34: record the user's language so system notifications (push/SMS/
        // in-app) can be localized server-side per recipient.
        persistUserLanguage();
        console.log("🔄 Setting up Firestore listener for user:", user.uid);

        unsubscribeFirestore = onSnapshot(
          doc(db, "users", user.uid),
          // includeMetadataChanges is REQUIRED because the router below gates on
          // metadata.fromCache / hasPendingWrites (BUG 36). By default Firestore
          // does NOT re-deliver a snapshot for a metadata-only transition
          // (cache→server, pending→confirmed) when the document DATA is unchanged.
          // So after the guard waits on a cache/pending snapshot, the
          // server-confirmed snapshot it needs would never arrive — deadlocking
          // onboarding (sign-in appears to do nothing; stuck on Legal). Subscribing
          // to metadata changes delivers that server-confirmed snapshot so routing
          // can advance. (new-user auth-flow deadlock)
          { includeMetadataChanges: true },
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

              // BUG 36: evaluate the gates strictly — a gate is satisfied ONLY by
              // an explicit true / non-empty string, never `undefined` (a partial
              // doc must not fall through).
              const legalAccepted = userData.legalAccepted === true;
              const profileCompleted = userData.profileCompleted === true;
              const hasHandle =
                typeof userData.handleLower === "string" &&
                userData.handleLower.trim().length > 0;
              const needsHostType =
                (userData.hostApproved || userData.role === "host") &&
                !userData.hostConfig;
              // Hosting just got switched on and the outcome hasn't been shown
              // yet. Without this step the router would race the screen: writing
              // hostConfig re-fires this listener, needsHostType goes false, and
              // it would route straight past "your community is live" to the
              // next gate. "deferred" is excluded — nothing was activated.
              const hostType = userData.hostConfig && userData.hostConfig.type;
              const needsHostWelcome =
                (hostType === "free" || hostType === "paid") &&
                userData.hostWelcomeSeen !== true;
              const destinationIsMainTabs =
                legalAccepted && profileCompleted && hasHandle &&
                !needsHostType && !needsHostWelcome &&
                userData.aiOptIn !== undefined;

              // Temporary guard log (BUG 36) — prints the exact fields + snapshot
              // source at the routing decision so any stray branch is visible.
              console.log("🧭 ROUTING", {
                uid: user.uid,
                legalAccepted,
                profileCompleted,
                handleLower: userData.handleLower,
                aiOptIn: userData.aiOptIn,
                fromCache: docSnapshot.metadata.fromCache,
                hasPendingWrites: docSnapshot.metadata.hasPendingWrites,
              });

              // BUG 36 — never send a user BACKWARD into onboarding on a
              // non-authoritative snapshot. A cache copy (fresh install / stale
              // local doc) or a pending optimistic write can miss fields that are
              // already set on the server, which is exactly what routed the two
              // fully-onboarded accounts (@carlos/@jc_duarte) through phantom
              // Legal → ProfileSetup. Only make an onboarding/gate decision on a
              // server-confirmed snapshot; the fully-onboarded → MainTabs route is
              // monotonic and safe from cache (keeps returning users working offline).
              const serverConfirmed =
                !docSnapshot.metadata.fromCache &&
                !docSnapshot.metadata.hasPendingWrites;
              if (!serverConfirmed && !destinationIsMainTabs) {
                console.log(
                  "⏳ Non-authoritative snapshot (cache/pending) for a gate — waiting for the server-confirmed snapshot",
                );
                return;
              }

              // 2. Verify legal terms accepted
              if (!legalAccepted) {
                console.log("⚖️ Legal not accepted - navigating to Legal");
                navigateToRoute("Legal", { user });
              }
              // 3. Verify profile completed
              else if (!profileCompleted) {
                console.log(
                  "👤 Profile incomplete - navigating to ProfileSetup",
                );
                navigateToRoute("ProfileSetup", { user });
              }
              // 3.5 Every user needs a unique @handle (spec 10). Blocking: new
              //     users pick one right after their profile; existing users are
              //     backfilled here on their next launch. Like Legal/Profile it
              //     does NOT set hasReachedHome — claimHandle writes handleLower,
              //     this snapshot re-fires, and routing continues past this step.
              else if (!hasHandle) {
                console.log("🔗 No handle yet - navigating to ChooseHandle");
                navigateToRoute("ChooseHandle", { user });
              }
              // 4. Approved host needs to choose their type (free/paid) before
              //    hosting is activated. Only shown before Home is reached, so
              //    mid-session admin approvals won't interrupt the user.
              //    (role === "host" covers legacy hosts approved before the
              //    hostApproved flag existed.)
              else if (needsHostType) {
                console.log(
                  "🎪 Host needs to select type - navigating to HostTypeSelection",
                );
                navigateToRoute("HostTypeSelection", {
                  user,
                  params: { userEmail: user.email, fullName: "Host" },
                });
              }
              // 4.5 Hosting is on — show what happened before moving on. Free
              //     lands on "your community is live", paid on the review
              //     status. Both write hostWelcomeSeen, which clears this gate.
              else if (needsHostWelcome) {
                console.log(
                  `🎪 Host activated (${hostType}) - showing the outcome`,
                );
                navigateToRoute(hostType === "free" ? "HostLive" : "HostStatus", {
                  user,
                });
              }
              // 5. One-time "Turn on Kinlo AI" opt-in (§2.1) — gates all AI.
              //    Shown once per account (aiOptIn undefined = never answered).
              else if (userData.aiOptIn === undefined) {
                console.log("✨ AI opt-in not answered - navigating to AiOptIn");
                hasReachedHome.current = true; // don't re-route mid-decision
                // Register the push token here too (BUG 13): this branch sets
                // hasReachedHome, so a brand-new attendee who hasn't answered the
                // AI opt-in would otherwise never register a token this session
                // and would receive no push notifications.
                if (registeredPushTokenUid.current !== user.uid) {
                  registeredPushTokenUid.current = user.uid;
                  registerPushToken(user.uid);
                }
                navigateToRoute("AiOptIn", {
                  user,
                  params: { fromOnboarding: true },
                });
              }
              // 6. All checks passed - go to the tab shell
              else {
                console.log("✅ All checks passed - navigating to MainTabs");
                hasReachedHome.current = true;
                // BUG 35 route-cache: remember this uid is fully onboarded so an
                // offline cold start (empty memory cache → fromCache miss) can
                // route straight to MainTabs instead of stranding a known user on
                // the loading screen. Cleared when the account is confirmed gone.
                AsyncStorage.setItem("@onboarded_uid", user.uid).catch(() => {});
                if (registeredPushTokenUid.current !== user.uid) {
                  registeredPushTokenUid.current = user.uid;
                  registerPushToken(user.uid);
                }
                navigateToRoute("MainTabs", { user });
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
              // BUG 35: an offline / empty-cache cold start emits a fromCache
              // miss (exists()===false only because nothing is cached yet) — this
              // must NOT sign out a legitimate returning user. If this uid is a
              // known fully-onboarded user (route-cache), optimistically route to
              // MainTabs so the app is usable offline; otherwise just wait. Either
              // way, only a server-confirmed miss (fromCache false) below runs the
              // orphan/sign-out handling, which reconciles a genuinely deleted
              // account once the network returns. hasReachedHome is left false so
              // the eventual server snapshot still finalizes (push token, flag).
              if (docSnapshot.metadata.fromCache) {
                AsyncStorage.getItem("@onboarded_uid").then((onboardedUid) => {
                  if (onboardedUid === user.uid) {
                    console.log(
                      "📴 Offline, known onboarded user — routing to MainTabs from route-cache",
                    );
                    navigateToRoute("MainTabs", { user });
                  } else {
                    console.log(
                      "📴 User doc missing from cache (likely offline) — waiting for server-confirmed snapshot, not signing out",
                    );
                  }
                  setLoading(false);
                });
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
              // Account confirmed gone server-side — drop the route-cache so a
              // deleted account can't optimistically reach MainTabs offline.
              AsyncStorage.removeItem("@onboarded_uid").catch(() => {});
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
        console.log("🚪 No user, showing welcome");
        hasReachedHome.current = false; // reset for next login session
        registeredPushTokenUid.current = null;
        navigateToRoute("Welcome");
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
    <ModeProvider>
      <NavigationContainer ref={ref}>
        {/* ✅ Un solo Stack, todas las pantallas siempre registradas.
            La navegación entre estados (Login/Legal/ProfileSetup/HostTypeSelection/Home)
            se maneja con navigateToRoute() de forma imperativa, no condicionando
            qué pantallas existen. */}
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          {/* BUG 36: onboarding gates cannot be swiped past or backed out of —
              the only way forward is completing each step (which writes its flag
              and lets the router advance). */}
          <Stack.Screen
            name="Legal"
            component={LegalScreen}
            options={{ gestureEnabled: false, headerLeft: () => null, headerBackVisible: false }}
          />
          <Stack.Screen
            name="ProfileSetup"
            component={ProfileSetupScreen}
            options={{ gestureEnabled: false, headerLeft: () => null, headerBackVisible: false }}
          />
          <Stack.Screen
            name="ChooseHandle"
            component={ChooseHandleScreen}
            options={{ gestureEnabled: false, headerLeft: () => null, headerBackVisible: false }}
          />
          <Stack.Screen
            name="HostTypeSelection"
            component={HostTypeSelectionScreen}
            initialParams={initialParams}
          />
          {/* Where the host-type choice lands: free is live now, paid is under
              review. Both are gestureEnabled: false — swiping back would return
              to a choice that's already been made and written. */}
          <Stack.Screen
            name="HostLive"
            component={HostLiveScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="HostStatus"
            component={HostStatusScreen}
            options={{ gestureEnabled: false }}
          />
          {/* The authed landing: 5-tab shell. Home/Wall/Rentals/Profile live
              ONLY as tabs; MyEvents stays pushable too (Manage → hosted list). */}
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="SearchEvents" component={SearchEventsScreen} />
          <Stack.Screen name="EventDetail" component={EventDetailScreen} />
          <Stack.Screen name="CreateEvent" component={CreateEventScreen} />
          <Stack.Screen name="EditEvent" component={EditEventScreen} />
          <Stack.Screen name="MyEvents" component={MyEventsScreen} />
          {/* T1: Profile is a pushed screen (opened from the header avatar), not a tab. */}
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="BondVibePro" component={BondVibeProScreen} />
          <Stack.Screen name="CheckInScanner" component={CheckInScannerScreen} />
          <Stack.Screen name="HostCRM" component={HostCRMScreen} />
          {/* Kinlo for Business (host ERP/CRM) */}
          <Stack.Screen name="BusinessHub" component={BusinessHubScreen} />
          <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
          <Stack.Screen name="BusinessMembers" component={MembersListScreen} />
          <Stack.Screen name="BusinessMemberForm" component={MemberFormScreen} />
          <Stack.Screen name="BusinessMemberRecord" component={MemberRecordScreen} />
          <Stack.Screen name="BusinessMembershipCard" component={MembershipCardScreen} />
          <Stack.Screen name="BusinessBirthdays" component={BusinessBirthdaysScreen} />
          <Stack.Screen name="BusinessCsvImport" component={CsvImportScreen} />
          {/* Unified memberships. BusinessPackages/BusinessPackageForm stay
              registered until the migration runs and the old data is gone —
              removing them now would dead-end anything still pointing there. */}
          <Stack.Screen name="BusinessMemberships" component={MembershipsScreen} />
          <Stack.Screen name="BusinessPlanForm" component={PlanFormScreen} />
          <Stack.Screen name="BusinessPackages" component={PackagesScreen} />
          <Stack.Screen name="BusinessPackageForm" component={PackageFormScreen} />
          <Stack.Screen name="BusinessCheckIn" component={BusinessCheckInScreen} />
          <Stack.Screen name="BusinessRedeemCode" component={RedeemCodeScreen} />
          <Stack.Screen name="BusinessRequestSession" component={RequestSessionScreen} />
          <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
          <Stack.Screen name="MomentumBoard" component={MomentumBoardScreen} />
          <Stack.Screen name="MomentumCard" component={MomentumCardScreen} />
          <Stack.Screen name="MomentumColumns" component={MomentumColumnsScreen} />
          <Stack.Screen name="BusinessFinance" component={BusinessFinanceScreen} />
          <Stack.Screen name="BusinessPaymentForm" component={PaymentFormScreen} />
          <Stack.Screen name="BusinessExpenses" component={BusinessExpensesScreen} />
          <Stack.Screen name="BusinessExpenseForm" component={ExpenseFormScreen} />
          <Stack.Screen name="BusinessSetTarget" component={SetTargetScreen} />
          <Stack.Screen name="BusinessTargetTracker" component={TargetTrackerScreen} />
          <Stack.Screen name="BusinessClasses" component={ClassesScreen} />
          <Stack.Screen name="BusinessClassForm" component={ClassFormScreen} />
          <Stack.Screen name="BusinessClassRoster" component={ClassRosterScreen} />
          <Stack.Screen name="BusinessAgenda" component={SessionsAgendaScreen} />
          <Stack.Screen name="BusinessAgendaDay" component={AgendaScreen} />
          <Stack.Screen name="BusinessSessionTypes" component={SessionTypesScreen} />
          <Stack.Screen name="BusinessAvailability" component={AvailabilityScreen} />
          <Stack.Screen name="BusinessBookingForm" component={BookingFormScreen} />
          <Stack.Screen name="BusinessSessionDetail" component={SessionDetailScreen} />
          <Stack.Screen name="BusinessAutomations" component={AutomationsScreen} />
          <Stack.Screen name="BusinessAutomationForm" component={AutomationFormScreen} />
          <Stack.Screen name="BusinessMessageLog" component={MessageLogScreen} />
          <Stack.Screen name="BusinessStaff" component={StaffScreen} />
          <Stack.Screen name="BusinessRoles" component={RolesScreen} />
          <Stack.Screen name="BusinessBranches" component={BranchesScreen} />
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
          <Stack.Screen name="EventChats" component={EventChatsScreen} />
          <Stack.Screen name="CommunityChats" component={CommunityChatsScreen} />
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
            name="MembershipHistory"
            component={MembershipHistoryScreen}
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
          <Stack.Screen name="Marketplace" component={MarketplaceExploreScreen} />
          <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
          <Stack.Screen name="ServiceCheckout" component={ServiceCheckoutScreen} />
          <Stack.Screen name="RentalCheckout" component={RentalCheckoutScreen} />
          <Stack.Screen name="ActiveRental" component={ActiveRentalScreen} />
          <Stack.Screen name="MyRentals" component={MyRentalsScreen} />
          <Stack.Screen name="MyFleet" component={MyFleetScreen} />
          <Stack.Screen name="PublishVehicle" component={PublishVehicleScreen} />
          <Stack.Screen name="VehicleBookings" component={VehicleBookingsScreen} />
          {/* Social layer */}
          <Stack.Screen name="Feed" component={FeedScreen} />
          <Stack.Screen name="CreatePost" component={CreatePostScreen} />
          <Stack.Screen name="CommunityWall" component={CommunityWallScreen} />
          <Stack.Screen name="MomentViewer" component={MomentViewerScreen} options={{ presentation: "modal" }} />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          <Stack.Screen name="DMList" component={DMListScreen} />
          <Stack.Screen name="DMChat" component={DMChatScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="FollowList" component={FollowListScreen} />
          {/* Community Matching (A1–E4) */}
          <Stack.Screen name="MatchOptIn" component={MatchOptInScreen} />
          <Stack.Screen name="MatchConsent" component={MatchConsentScreen} />
          <Stack.Screen name="MatchProfile" component={MatchProfileScreen} />
          <Stack.Screen name="MatchProfileView" component={MatchProfileViewScreen} />
          <Stack.Screen name="MatchingLocked" component={MatchingLockedScreen} />
          <Stack.Screen name="MatchGrid" component={MatchGridScreen} />
          <Stack.Screen name="MatchPerson" component={MatchPersonScreen} />
          <Stack.Screen name="MatchChat" component={MatchChatScreen} />
          <Stack.Screen name="PlusPaywall" component={PlusPaywallScreen} />
          <Stack.Screen name="CuratedSet" component={CuratedSetScreen} />
          <Stack.Screen name="MatchGroups" component={MatchGroupsScreen} />
          <Stack.Screen name="MatchGroupChat" component={MatchGroupChatScreen} />
          <Stack.Screen name="MatchmakingSettings" component={MatchmakingSettingsScreen} />
          <Stack.Screen name="PeopleYouMet" component={PeopleYouMetScreen} />
          <Stack.Screen name="HostMatchingControls" component={HostMatchingControlsScreen} />
          <Stack.Screen name="HostMatchAnalytics" component={HostMatchAnalyticsScreen} />
          <Stack.Screen name="MatchVisibility" component={MatchVisibilityScreen} />
          <Stack.Screen name="ProUpsell" component={ProUpsellScreen} />
          <Stack.Screen name="ProCheckout" component={ProCheckoutScreen} />
          <Stack.Screen name="PlusCheckout" component={PlusCheckoutScreen} />
          <Stack.Screen name="PlusActivated" component={PlusActivatedScreen} />
          <Stack.Screen name="Report" component={ReportScreen} />
          <Stack.Screen name="SafetyCenter" component={SafetyCenterScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="AiOptIn" component={AiOptInScreen} />
          <Stack.Screen name="AskKinlo" component={AskKinloScreen} />
          <Stack.Screen name="Inbox" component={InboxScreen} />
          <Stack.Screen name="FindPeople" component={FindPeopleScreen} />
          <Stack.Screen name="YourWeek" component={YourWeekScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      <SuccessModal
        visible={showVerificationModal}
        onClose={handleVerificationModalClose}
        title="Verify Your Email"
        message="Please verify your email address before logging in. Check your inbox (and spam folder) and click the verification link we sent you."
        icon="mail"
        tone="brand"
      />

      <SuccessModal
        visible={showUserNotFoundModal}
        onClose={handleUserNotFoundModalClose}
        title="Account Issue"
        message="Your account was created but user data is missing. This sometimes happens if signup was interrupted. Please try signing up again or contact support."
        icon="alert"
        tone="warning"
      />
    </ModeProvider>
  );
});

AppNavigator.displayName = "AppNavigator";

export default AppNavigator;
