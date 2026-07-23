import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import { AvatarDisplay } from "../components/AvatarPicker";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Share,
} from "react-native";
import { getFunctions, httpsCallable } from "firebase/functions";
import { StatusBar } from "expo-status-bar";
import { setDoc,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { slugifyCity } from "../hooks/useCities";
import { LOCATIONS } from "../utils/locations";
import {
  COMMUNITY_TYPES,
  MEET_FREQUENCIES,
  GROUP_SIZES,
} from "../constants/hostOnboarding";
import GradientBackground from "../components/GradientBackground";
import { createNotification } from "../utils/notificationService";
import AdminMessageModal from "../components/AdminMessageModal";
import AdminConfirmModal from "../components/AdminConfirmModal";
import { normalizeCategory } from "../utils/eventCategories";

/**
 * One-line summary of a host request's structured answers, e.g.
 * "Yoga · Weekly · Small 2–8". Returns "" for pre-redesign requests, which have
 * none of these fields — the caller then renders nothing rather than an empty
 * row. Unknown ids (an option retired later) are skipped, not shown raw.
 * @param {object} request a hostRequests doc
 * @param {(k: string) => string} t
 * @returns {string}
 */
function describeCommunity(request, t) {
  const label = (options, id) => {
    const found = id && options.find((o) => o.id === id);
    return found ? t(found.labelKey) : null;
  };
  return [
    label(COMMUNITY_TYPES, request.communityType),
    label(MEET_FREQUENCIES, request.frequency),
    label(GROUP_SIZES, request.groupSize),
  ]
    .filter(Boolean)
    .join(" · ");
}
import {
  getAllUsers,
  getUserStats,
  removeAdminRole,
  removeHostRole,
  suspendUser,
  unsuspendUser,
  canPerformAdminAction,
} from "../utils/adminService";
import {
  getPricingConfig,
  updatePricingConfig,
  getSubscriptionConfig,
  updateSubscriptionConfig,
} from "../services/configService";
import { approveOwnerTransfer } from "../services/businessStaffService";
import { formatDate, formatDateTime } from "../utils/formatDate";

export default function AdminDashboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("requests"); // requests | users

  // Host Requests state
  const [pendingRequests, setPendingRequests] = useState([]);
  const [hostRequestsProcessing, setHostRequestsProcessing] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [modalType, setModalType] = useState("approve");

  // Owner transfers state (BUG 32.4)
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [transfersProcessing, setTransfersProcessing] = useState(null);

  // User Management state
  const [users, setUsers] = useState([]);
  const [crashes, setCrashes] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all"); // all | admin | host | user
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    pending: 0,
    events: 0,
    users: 0,
    admins: 0,
    hosts: 0,
    regular: 0,
    suspended: 0,
  });

  // Confirmation Modal state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);

  const [loading, setLoading] = useState(true);
  // null = still checking; false = denied; true = admin
  const [authorized, setAuthorized] = useState(null);

  // Pricing config (admin-tunable fees). Percents shown as whole numbers (5 = 5%),
  // Stripe fixed fee shown in pesos.
  const [pricingForm, setPricingForm] = useState(null);
  // Operating cities (config/cities) — the single source for every city
  // dropdown in the app (events, profile, vehicles, search filters).
  const [citiesList, setCitiesList] = useState(null);
  const [newCityLabel, setNewCityLabel] = useState("");
  const [citySaving, setCitySaving] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);

  // Subscription pricing (Kinlo Pro + Kinlo Plus), edited as major-unit amounts.
  const [subForm, setSubForm] = useState(null);
  const [subSaving, setSubSaving] = useState(false);

  // ✅ HELPER: Get user display name (handles both fullName and name fields)
  const getUserDisplayName = (user) => {
    if (!user) return t("adminDashboard.unknown");
    return user.fullName || user.name || t("adminDashboard.unknown");
  };

  // Access guard: only admins may use this screen. This is defense-in-depth on
  // top of the Firestore rules (which already restrict admin-only writes), so a
  // non-admin who reaches here (e.g. via a stale notification) is sent back.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const isAdmin = snap.exists() && snap.data().role === "admin";
        if (!active) return;
        setAuthorized(isAdmin);
        if (!isAdmin) {
          setLoading(false);
          Alert.alert(
            t("adminDashboard.accessDeniedTitle"),
            t("adminDashboard.accessDeniedMessage"),
            [{ text: t("adminDashboard.ok"), onPress: () => navigation.goBack() }]
          );
        }
      } catch (e) {
        if (!active) return;
        setAuthorized(false);
        setLoading(false);
        navigation.goBack();
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized]);

  useEffect(() => {
    if (authorized && activeTab === "users") {
      loadUsers(roleFilter);
    }
    if (authorized && activeTab === "crashes") {
      loadCrashes();
    }
    if (authorized && activeTab === "transfers") {
      loadTransfers();
    }
    if (authorized && activeTab === "pricing" && !citiesList) {
      getDoc(doc(db, "config", "cities"))
        .then((snap) => {
          const list = snap.exists() ? snap.data().cities : null;
          setCitiesList(
            Array.isArray(list) && list.length
              ? list
              : LOCATIONS.filter((l) => l.id !== "all")
          );
        })
        .catch(() => setCitiesList(LOCATIONS.filter((l) => l.id !== "all")));
    }
    if (authorized && activeTab === "pricing" && !pricingForm) {
      loadPricing();
      loadSubscriptions();
    }
  }, [authorized, activeTab, roleFilter]);

  // BUG 32.4: pending ownership transfers awaiting admin approval.
  const loadTransfers = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "ownerTransfers"), where("status", "==", "pending_admin"))
      );
      const rows = await Promise.all(
        snap.docs.map(async (d) => {
          const tr = { id: d.id, ...d.data() };
          try {
            const [fromS, toS] = await Promise.all([
              getDoc(doc(db, "users", tr.fromUid)),
              getDoc(doc(db, "users", tr.toUid)),
            ]);
            tr.fromName = fromS.exists() ? (fromS.data().fullName || fromS.data().name || tr.fromUid) : tr.fromUid;
            tr.toDisplay = toS.exists() ? (toS.data().fullName || toS.data().name || tr.toUid) : tr.toUid;
            tr.toRole = toS.exists() ? (toS.data().role || "user") : "user";
          } catch {
            // best-effort
          }
          return tr;
        })
      );
      setPendingTransfers(rows);
    } catch {
      setPendingTransfers([]);
    }
  };

  const decideTransfer = (transfer, approve) => {
    const doIt = async () => {
      setTransfersProcessing(transfer.id);
      const res = await approveOwnerTransfer(transfer.id, approve);
      setTransfersProcessing(null);
      if (res.ok) {
        setPendingTransfers((prev) => prev.filter((tr) => tr.id !== transfer.id));
      } else {
        Alert.alert(t("adminDashboard.transfers.failTitle"), t("adminDashboard.transfers.failMsg"));
      }
    };
    Alert.alert(
      approve ? t("adminDashboard.transfers.confirmApproveTitle") : t("adminDashboard.transfers.confirmRejectTitle"),
      approve
        ? t("adminDashboard.transfers.confirmApproveMsg", { business: transfer.businessName || "", to: transfer.toDisplay || "" })
        : t("adminDashboard.transfers.confirmRejectMsg"),
      [
        { text: t("adminDashboard.cancel"), style: "cancel" },
        {
          text: approve ? t("adminDashboard.transfers.approve") : t("adminDashboard.transfers.reject"),
          style: approve ? "default" : "destructive",
          onPress: doIt,
        },
      ]
    );
  };

  const loadPricing = async () => {
    const c = await getPricingConfig();
    setPricingForm({
      eventPct: String(+(c.eventPlatformFeePercent * 100).toFixed(4)),
      rentalPct: String(+(c.rentalPlatformFeePercent * 100).toFixed(4)),
      stripePct: String(+(c.stripeFeePercent * 100).toFixed(4)),
      stripeFixed: String(+(c.stripeFixedCentavos / 100).toFixed(2)),
    });
  };

  const loadSubscriptions = async () => {
    const c = await getSubscriptionConfig();
    setSubForm({
      proAmount: String(c.pro.amount),
      proCurrency: c.pro.currency,
      plusAmount: String(c.plus.amount),
      plusCurrency: c.plus.currency,
    });
  };

  const saveSubscriptions = async () => {
    setSubSaving(true);
    try {
      await updateSubscriptionConfig({
        pro: { amount: Number(subForm.proAmount) || 0, currency: subForm.proCurrency, interval: "month" },
        plus: { amount: Number(subForm.plusAmount) || 0, currency: subForm.plusCurrency, interval: "month" },
      });
      Alert.alert(t("adminDashboard.saved"), t("adminDashboard.subscriptionsSaved"));
    } catch (e) {
      Alert.alert(t("adminDashboard.error"), e.message || t("adminDashboard.couldNotSaveSubscriptions"));
    } finally {
      setSubSaving(false);
    }
  };

  const persistCities = async (next) => {
    setCitySaving(true);
    try {
      await setDoc(doc(db, "config", "cities"), { cities: next }, { merge: false });
      setCitiesList(next);
    } catch (e) {
      Alert.alert(t("adminDashboard.couldntSave"), e.message || t("adminDashboard.pleaseTryAgain"));
    } finally {
      setCitySaving(false);
    }
  };

  const addCity = () => {
    const label = newCityLabel.trim();
    if (!label) return;
    const id = slugifyCity(label);
    if (!id) return;
    if ((citiesList || []).some((c) => c.id === id)) {
      Alert.alert(t("adminDashboard.alreadyListed"), t("adminDashboard.alreadyListedMessage", { label }));
      return;
    }
    setNewCityLabel("");
    persistCities([...(citiesList || []), { id, label }]);
  };

  const removeCity = (city) => {
    if ((citiesList || []).length <= 1) {
      Alert.alert(t("adminDashboard.cantRemove"), t("adminDashboard.cantRemoveMessage"));
      return;
    }
    Alert.alert(
      t("adminDashboard.removeCity"),
      t("adminDashboard.removeCityMessage", { label: city.label }),
      [
        { text: t("adminDashboard.cancel"), style: "cancel" },
        {
          text: t("adminDashboard.remove"),
          style: "destructive",
          onPress: () => persistCities(citiesList.filter((c) => c.id !== city.id)),
        },
      ]
    );
  };

  const savePricing = async () => {
    const pct = (v) => (Number(v) || 0) / 100;
    setPricingSaving(true);
    try {
      await updatePricingConfig({
        eventPlatformFeePercent: pct(pricingForm.eventPct),
        rentalPlatformFeePercent: pct(pricingForm.rentalPct),
        stripeFeePercent: pct(pricingForm.stripePct),
        stripeFixedCentavos: Math.round((Number(pricingForm.stripeFixed) || 0) * 100),
      });
      Alert.alert(t("adminDashboard.saved"), t("adminDashboard.pricingSaved"));
    } catch (e) {
      Alert.alert(t("adminDashboard.error"), e.message || t("adminDashboard.couldNotSavePricing"));
    } finally {
      setPricingSaving(false);
    }
  };

  const loadCrashes = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "crashes"), orderBy("createdAt", "desc"), limit(50))
      );
      setCrashes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error loading crashes:", e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load host requests
      const requestsQuery = query(
        collection(db, "hostRequests"),
        where("status", "==", "pending")
      );
      const requestsSnapshot = await getDocs(requestsQuery);
      const requests = await Promise.all(
        requestsSnapshot.docs.map(async (docSnap) => {
          const requestData = docSnap.data();
          const userDoc = await getDoc(doc(db, "users", requestData.userId));
          const userData = userDoc.data();
          return {
            id: docSnap.id,
            ...requestData,
            // ✅ FIX: Use fullName OR name
            userName: userData?.fullName || userData?.name || t("adminDashboard.unknownUser"),
          };
        })
      );
      setPendingRequests(requests);

      // Load stats
      const eventsSnapshot = await getDocs(collection(db, "events"));
      const userStats = await getUserStats();

      setStats({
        pending: requests.length,
        events: eventsSnapshot.size,
        ...userStats,
      });
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (filter) => {
    setLoading(true);
    try {
      const allUsers = await getAllUsers(filter);
      // Emails are no longer in the world-readable users doc — fetch them
      // from Firebase Auth via the admin-gated Cloud Function and merge.
      let emails = {};
      try {
        const fn = httpsCallable(getFunctions(), "adminListUserEmails");
        emails = (await fn()).data.emails || {};
      } catch (e) {
        console.warn("Could not load emails:", e.message);
      }
      setUsers(allUsers.map((u) => ({ ...u, email: emails[u.id] || u.email || null })));
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // HOST REQUESTS HANDLERS
  // ==========================================

  const handleApproveClick = (request) => {
    setCurrentRequest(request);
    setModalType("approve");
    setModalVisible(true);
  };

  const handleRejectClick = (request) => {
    setCurrentRequest(request);
    setModalType("reject");
    setModalVisible(true);
  };

  const handleApproveSubmit = async (message) => {
    if (!currentRequest) return;

    setHostRequestsProcessing(currentRequest.id);
    try {
      await updateDoc(doc(db, "hostRequests", currentRequest.id), {
        status: "approved",
        reviewedAt: new Date().toISOString(),
        adminMessage: message,
      });

      // hostApproved grants the RIGHT to become a host. The user does not get
      // host privileges (role: "host") until they explicitly choose a host
      // type (free/paid) in HostTypeSelection. If they defer, they stay a
      // normal user but can choose their type later from their Profile.
      await updateDoc(doc(db, "users", currentRequest.userId), {
        hostApproved: true,
      });

      // BUG 34: send key+params so the REQUESTER sees it in their language
      // (not the admin's). The admin's custom {{message}} is passed as a param.
      await createNotification(currentRequest.userId, {
        type: "host_approved",
        titleKey: "notifications.host.approved.title",
        bodyKey: "notifications.host.approved.body",
        params: { message },
        icon: "tent",
      });

      console.log("✅ Host request approved");

      setPendingRequests((prev) => prev.filter((r) => r.id !== currentRequest.id));
      setStats((prev) => ({ ...prev, pending: Math.max(0, (prev.pending || 1) - 1) }));

      Alert.alert(
        t("adminDashboard.success"),
        t("adminDashboard.hostApprovedAlert", { name: currentRequest.userName }),
        [{ text: t("adminDashboard.ok") }]
      );
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert(t("adminDashboard.error"), t("adminDashboard.couldNotApprove"));
    } finally {
      setHostRequestsProcessing(null);
      setCurrentRequest(null);
    }
  };

  const handleRejectSubmit = async (message) => {
    if (!currentRequest) return;

    setHostRequestsProcessing(currentRequest.id);
    try {
      await updateDoc(doc(db, "hostRequests", currentRequest.id), {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        adminMessage: message,
      });

      await createNotification(currentRequest.userId, {
        type: "host_rejected",
        titleKey: "notifications.host.rejected.title",
        bodyKey: "notifications.host.rejected.body",
        params: { message },
        icon: "clipboard",
      });

      console.log("✅ Host request rejected");
      Alert.alert(
        t("adminDashboard.rejected"),
        t("adminDashboard.hostRejectedAlert", { name: currentRequest.userName })
      );
      await loadData();
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert(t("adminDashboard.error"), t("adminDashboard.couldNotReject"));
    } finally {
      setHostRequestsProcessing(null);
      setCurrentRequest(null);
    }
  };

  // ==========================================
  // USER MANAGEMENT HANDLERS
  // ==========================================

  const handleRemoveHostRole = (user) => {
    setConfirmUser(user);
    setConfirmAction("remove_host");
    setConfirmModalVisible(true);
  };

  const handleRemoveAdminRole = (user) => {
    setConfirmUser(user);
    setConfirmAction("remove_admin");
    setConfirmModalVisible(true);
  };

  const handleSuspendUser = (user) => {
    setConfirmUser(user);
    setConfirmAction("suspend");
    setConfirmModalVisible(true);
  };

  const handleUnsuspendUser = (user) => {
    setConfirmUser(user);
    setConfirmAction("unsuspend");
    setConfirmModalVisible(true);
  };

  const handleResetPassword = (user) => {
    if (!user.email) {
      Alert.alert(t("adminDashboard.noEmail"), t("adminDashboard.noEmailMessage"));
      return;
    }
    Alert.alert(
      t("adminDashboard.resetPassword"),
      t("adminDashboard.resetPasswordMessage", { email: user.email }),
      [
        { text: t("adminDashboard.cancel"), style: "cancel" },
        {
          text: t("adminDashboard.generate"),
          onPress: async () => {
            try {
              const fn = httpsCallable(getFunctions(), "adminResetPassword");
              const res = await fn({ email: user.email });
              const link = res.data?.link;
              if (link) {
                await Share.share({
                  message: t("adminDashboard.resetPasswordShareMessage", { email: user.email, link }),
                });
              }
            } catch (e) {
              Alert.alert(t("adminDashboard.error"), e.message || t("adminDashboard.couldNotGenerateLink"));
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = (user) => {
    Alert.alert(
      t("adminDashboard.deleteUser"),
      t("adminDashboard.deleteUserMessage", { name: getUserDisplayName(user), email: user.email }),
      [
        { text: t("adminDashboard.cancel"), style: "cancel" },
        {
          text: t("adminDashboard.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const fn = httpsCallable(getFunctions(), "adminDeleteUser");
              await fn({ uid: user.id });
              await loadUsers(roleFilter);
              Alert.alert(t("adminDashboard.deletedTitle"), t("adminDashboard.deletedMessage"));
            } catch (e) {
              Alert.alert(t("adminDashboard.error"), e.message || t("adminDashboard.couldNotDeleteUser"));
            }
          },
        },
      ]
    );
  };

  const handleConfirmAction = async (reason) => {
    if (!confirmUser) return;

    // Check permissions
    const permission = await canPerformAdminAction(
      auth.currentUser.uid,
      confirmUser.id
    );

    if (!permission.allowed) {
      Alert.alert(t("adminDashboard.error"), permission.reason);
      setConfirmModalVisible(false);
      return;
    }

    setLoading(true);
    setConfirmModalVisible(false);

    // ✅ FIX: Use getUserDisplayName for alerts
    const displayName = getUserDisplayName(confirmUser);

    try {
      let result;

      switch (confirmAction) {
        case "remove_host":
          result = await removeHostRole(confirmUser.id, reason);
          if (result.success) {
            Alert.alert(
              t("adminDashboard.success"),
              t("adminDashboard.removedHostRole", { name: displayName, count: result.eventsCancelled })
            );
          }
          break;

        case "remove_admin":
          result = await removeAdminRole(confirmUser.id);
          if (result.success) {
            Alert.alert(t("adminDashboard.success"), t("adminDashboard.removedAdminRole", { name: displayName }));
          }
          break;

        case "suspend":
          result = await suspendUser(
            confirmUser.id,
            reason,
            auth.currentUser.uid
          );
          if (result.success) {
            Alert.alert(
              t("adminDashboard.success"),
              t("adminDashboard.suspendedUser", { name: displayName, count: result.eventsCancelled })
            );
          }
          break;

        case "unsuspend":
          result = await unsuspendUser(confirmUser.id);
          if (result.success) {
            Alert.alert(t("adminDashboard.success"), t("adminDashboard.unsuspendedUser", { name: displayName }));
          }
          break;
      }

      if (!result.success) {
        Alert.alert(t("adminDashboard.error"), result.error || t("adminDashboard.actionFailed"));
      }

      await loadData();
      await loadUsers(roleFilter);
    } catch (error) {
      console.error("Error performing admin action:", error);
      Alert.alert(t("adminDashboard.error"), t("adminDashboard.couldNotCompleteAction"));
    } finally {
      setLoading(false);
      setConfirmUser(null);
      setConfirmAction(null);
    }
  };

  // ==========================================
  // FILTERS
  // ==========================================

  // ✅ FIX: Search uses both fullName and name
  const filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const displayName = getUserDisplayName(user).toLowerCase();
    return (
      displayName.includes(query) || user.email?.toLowerCase().includes(query)
    );
  });

  // ==========================================
  // RENDER COMPONENTS
  // ==========================================

  const styles = createStyles(colors);

  const UserCard = ({ user }) => (
    <View style={styles.userCard}>
      <View
        style={[
          styles.userGlass,
          {
            backgroundColor: user.suspended
              ? "rgba(255, 69, 58, 0.1)"
              : colors.surfaceGlass,
            borderColor: user.suspended
              ? "rgba(255, 69, 58, 0.3)"
              : colors.border,
          },
        ]}
      >
        {/* User Header */}
        <View style={styles.userHeader}>
          <AvatarDisplay
            avatar={user.avatar}
            size={48}
            name={getUserDisplayName(user)}
            style={{ marginRight: 12 }}
          />
          <View style={styles.userInfo}>
            {/* ✅ FIX: Use getUserDisplayName */}
            <Text style={[styles.userName, { color: colors.text }]}>
              {getUserDisplayName(user)}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textTertiary }]}>
              {user.email}
            </Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: getRoleBadgeColor(user.role),
                borderColor: getRoleBadgeColor(user.role, true),
              },
            ]}
          >
            <Text
              style={[styles.roleText, { color: getRoleTextColor(user.role) }]}
            >
              {user.role?.toUpperCase() || t("adminDashboard.roleUser").toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Suspended Badge */}
        {user.suspended && (
          <View style={styles.suspendedBanner}>
            <Text style={styles.suspendedText}>
              {t("adminDashboard.suspendedBanner")}{" "}
              {user.suspensionReason ? `• ${user.suspensionReason}` : ""}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.userActions}>
          {user.suspended ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleUnsuspendUser(user)}
            >
              <View
                style={[
                  styles.actionGlass,
                  {
                    backgroundColor: "rgba(52, 199, 89, 0.1)",
                    borderColor: "rgba(52, 199, 89, 0.3)",
                  },
                ]}
              >
                <Text style={[styles.actionText, { color: "#34C759" }]}>
                  {t("adminDashboard.unsuspend")}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
              {user.role === "host" && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemoveHostRole(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 159, 10, 0.1)",
                        borderColor: "rgba(255, 159, 10, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: colors.warning }]}>
                      {t("adminDashboard.removeHost")}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {user.role === "admin" && user.id !== auth.currentUser.uid && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemoveAdminRole(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 159, 10, 0.1)",
                        borderColor: "rgba(255, 159, 10, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: colors.warning }]}>
                      {t("adminDashboard.removeAdmin")}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {user.id !== auth.currentUser.uid && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleSuspendUser(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 69, 58, 0.1)",
                        borderColor: "rgba(255, 69, 58, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: colors.error }]}>
                      {t("adminDashboard.suspend")}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}

          {user.id !== auth.currentUser.uid && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleResetPassword(user)}
            >
              <View
                style={[
                  styles.actionGlass,
                  {
                    backgroundColor: "rgba(0, 122, 255, 0.1)",
                    borderColor: "rgba(0, 122, 255, 0.3)",
                  },
                ]}
              >
                <Text style={[styles.actionText, { color: colors.brand }]}>
                  {t("adminDashboard.resetPassword")}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {user.id !== auth.currentUser.uid && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDeleteUser(user)}
            >
              <View
                style={[
                  styles.actionGlass,
                  {
                    backgroundColor: "rgba(255, 69, 58, 0.18)",
                    borderColor: "rgba(255, 69, 58, 0.45)",
                  },
                ]}
              >
                <Text style={[styles.actionText, { color: colors.error }]}>
                  {t("adminDashboard.delete")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const getRoleBadgeColor = (role, isBorder = false) => {
    const alpha = isBorder ? "4D" : "26";
    switch (role) {
      case "admin":
        return `#FF453A${alpha}`;
      case "host":
        return `#FF9F0A${alpha}`;
      default:
        return `#007AFF${alpha}`;
    }
  };

  const getRoleTextColor = (role) => {
    switch (role) {
      case "admin":
        return "#FF453A";
      case "host":
        return "#FF9F0A";
      default:
        return "#7C3AED";
    }
  };

  if (loading && activeTab === "requests") {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Don't render the admin UI for non-admins (or while the check is pending).
  if (authorized !== true) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("adminDashboard.title")}
        </Text>
        {/* Admin-only entry to the payouts (escrow) ledger. This whole screen is
            already admin-gated, so it's not exposed to normal users. */}
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminPayouts")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t("adminPayouts.title")}
        >
          <Icon name="dollar" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab("requests")}
        >
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "requests"
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                borderColor:
                  activeTab === "requests"
                    ? `${colors.primary}66`
                    : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "requests"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              {t("adminDashboard.tabHostRequests")}
            </Text>
            {stats.pending > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{stats.pending}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab("users")}
        >
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "users"
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                borderColor:
                  activeTab === "users" ? `${colors.primary}66` : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "users"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              {t("adminDashboard.tabUsers")}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab("crashes")}>
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "crashes" ? `${colors.primary}33` : colors.surfaceGlass,
                borderColor:
                  activeTab === "crashes" ? `${colors.primary}66` : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "crashes" ? colors.primary : colors.textSecondary },
              ]}
            >
              {t("adminDashboard.tabCrashes")}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab("pricing")}>
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "pricing" ? `${colors.primary}33` : colors.surfaceGlass,
                borderColor:
                  activeTab === "pricing" ? `${colors.primary}66` : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "pricing" ? colors.primary : colors.textSecondary },
              ]}
            >
              {t("adminDashboard.tabPricing")}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab("transfers")}>
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "transfers" ? `${colors.primary}33` : colors.surfaceGlass,
                borderColor:
                  activeTab === "transfers" ? `${colors.primary}66` : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "transfers" ? colors.primary : colors.textSecondary },
              ]}
            >
              {t("adminDashboard.tabTransfers")}
            </Text>
            {pendingTransfers.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingTransfers.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Row */}
        {activeTab !== "pricing" && (
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.statIcon}>
              <Icon
                name={activeTab === "requests" ? "clock" : "users"}
                size={28}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.pending : stats.regular}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? t("adminDashboard.statPending") : t("adminDashboard.statUsers")}
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.statIcon}>
              <Icon
                name={activeTab === "requests" ? "party" : "pro"}
                size={28}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.events : stats.admins}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? t("adminDashboard.statEvents") : t("adminDashboard.statAdmins")}
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.statIcon}>
              <Icon
                name={activeTab === "requests" ? "users" : "tent"}
                size={28}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.regular : stats.hosts}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? t("adminDashboard.statUsers") : t("adminDashboard.statHosts")}
            </Text>
          </View>
        </View>
        )}

        {/* HOST REQUESTS TAB */}
        {activeTab === "requests" && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("adminDashboard.pendingHostRequests")}
            </Text>

            {pendingRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyArt}>
                  <Icon name="successCircle" size={36} color={colors.primary} />
                </View>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  {t("adminDashboard.noPendingRequests")}
                </Text>
              </View>
            ) : (
              pendingRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View
                    style={[
                      styles.requestGlass,
                      {
                        backgroundColor: colors.surfaceGlass,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.requestHeader}>
                      <AvatarDisplay
                        avatar={null}
                        size={48}
                        name={request.userName}
                        style={{ marginRight: 12 }}
                      />
                      <View style={styles.requestInfo}>
                        <Text
                          style={[styles.requestName, { color: colors.text }]}
                        >
                          {request.userName}
                        </Text>
                        <Text
                          style={[
                            styles.requestDate,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {formatDate(request.createdAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Requests now arrive as structured answers plus a tagline;
                        older ones carry three free-text essays. Render whatever a
                        request actually has — unconditional rows printed a label
                        with an empty value for every field the new form dropped. */}
                    <View style={styles.requestDetails}>
                      {!!describeCommunity(request, t) && (
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {t("adminDashboard.community")}
                          </Text>
                          <Text
                            style={[styles.detailValue, { color: colors.text }]}
                          >
                            {describeCommunity(request, t)}
                          </Text>
                        </View>
                      )}

                      {!!request.whyHost && (
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {t("adminDashboard.whyHost")}
                          </Text>
                          <Text
                            style={[styles.detailValue, { color: colors.text }]}
                          >
                            {request.whyHost}
                          </Text>
                        </View>
                      )}

                      {!!request.experience && (
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {t("adminDashboard.experience")}
                          </Text>
                          <Text
                            style={[styles.detailValue, { color: colors.text }]}
                          >
                            {request.experience}
                          </Text>
                        </View>
                      )}

                      {!!request.eventIdeas && (
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {t("adminDashboard.eventIdeas")}
                          </Text>
                          <Text
                            style={[styles.detailValue, { color: colors.text }]}
                          >
                            {request.eventIdeas}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => handleRejectClick(request)}
                        disabled={hostRequestsProcessing === request.id}
                      >
                        <View
                          style={[
                            styles.rejectGlass,
                            {
                              backgroundColor: "rgba(255, 69, 58, 0.1)",
                              borderColor: "rgba(255, 69, 58, 0.3)",
                              opacity:
                                hostRequestsProcessing === request.id ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.rejectText}>
                            {hostRequestsProcessing === request.id
                              ? t("adminDashboard.processing")
                              : t("adminDashboard.reject")}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => handleApproveClick(request)}
                        disabled={hostRequestsProcessing === request.id}
                      >
                        <View
                          style={[
                            styles.approveGlass,
                            {
                              backgroundColor: "rgba(52, 199, 89, 0.1)",
                              borderColor: "rgba(52, 199, 89, 0.3)",
                              opacity:
                                hostRequestsProcessing === request.id ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.approveText}>
                            {hostRequestsProcessing === request.id
                              ? t("adminDashboard.processing")
                              : t("adminDashboard.approve")}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* USERS TAB */}
        {activeTab === "crashes" && (
          <View style={styles.section}>
            {crashes.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 24 }}>
                {t("adminDashboard.noCrashesReported")}
              </Text>
            ) : (
              crashes.map((c) => (
                <View
                  key={c.id}
                  style={[
                    styles.crashCard,
                    { backgroundColor: colors.surfaceGlass, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.crashMsg, { color: colors.text }]} numberOfLines={2}>
                    {c.message || t("adminDashboard.unknownError")}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
                    {(c.platform || "?")} · {c.screen || c.source || "js"}
                    {c.createdAt?.toDate ? ` · ${formatDateTime(c.createdAt.toDate())}` : ""}
                  </Text>
                  {!!c.stack && (
                    <Text
                      style={{ color: colors.textTertiary, fontSize: 11, marginTop: 6 }}
                      numberOfLines={4}
                    >
                      {c.stack}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "transfers" && (
          <View style={styles.section}>
            {pendingTransfers.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 24 }}>
                {t("adminDashboard.transfers.empty")}
              </Text>
            ) : (
              pendingTransfers.map((tr) => (
                <View
                  key={tr.id}
                  style={[styles.crashCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                >
                  <Text style={[styles.crashMsg, { color: colors.text }]} numberOfLines={2}>
                    {tr.businessName || tr.bizId}
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 6 }}>
                    {t("adminDashboard.transfers.fromTo", { from: tr.fromName || tr.fromUid, to: tr.toDisplay || tr.toUid })}
                  </Text>
                  <Text style={{ color: tr.toRole === "host" || tr.toRole === "admin" ? colors.success : colors.error, fontSize: 12, marginTop: 4, fontWeight: "700" }}>
                    {tr.toRole === "host" || tr.toRole === "admin"
                      ? t("adminDashboard.transfers.recipientHost")
                      : t("adminDashboard.transfers.recipientNotHost")}
                  </Text>
                  <View style={styles.transferActions}>
                    <TouchableOpacity
                      style={[styles.transferBtn, { borderColor: colors.border }]}
                      disabled={transfersProcessing === tr.id}
                      onPress={() => decideTransfer(tr, false)}
                    >
                      <Text style={[styles.transferBtnText, { color: colors.error }]}>{t("adminDashboard.transfers.reject")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.transferBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: transfersProcessing === tr.id ? 0.6 : 1 }]}
                      disabled={transfersProcessing === tr.id}
                      onPress={() => decideTransfer(tr, true)}
                    >
                      <Text style={[styles.transferBtnText, { color: "#fff" }]}>
                        {transfersProcessing === tr.id ? t("adminDashboard.transfers.working") : t("adminDashboard.transfers.approve")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "users" && (
          <View style={styles.section}>
            {/* Search Bar */}
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Icon
                name="search"
                size={18}
                color={colors.textTertiary}
                style={styles.searchIcon}
              />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t("adminDashboard.searchUsersPlaceholder")}
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Role Filters */}
            <View style={styles.roleFilters}>
              {["all", "admin", "host", "user"].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={styles.filterChip}
                  onPress={() => setRoleFilter(filter)}
                >
                  <View
                    style={[
                      styles.filterGlass,
                      {
                        backgroundColor:
                          roleFilter === filter
                            ? `${colors.primary}33`
                            : colors.surfaceGlass,
                        borderColor:
                          roleFilter === filter
                            ? `${colors.primary}66`
                            : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        {
                          color:
                            roleFilter === filter
                              ? colors.primary
                              : colors.text,
                        },
                      ]}
                    >
                      {t(`adminDashboard.roleFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("adminDashboard.userCount", { count: filteredUsers.length })}
            </Text>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyArt}>
                  <Icon name="users" size={36} color={colors.primary} />
                </View>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  {t("adminDashboard.noUsersFound")}
                </Text>
              </View>
            ) : (
              filteredUsers.map((user) => (
                <UserCard key={user.id} user={user} />
              ))
            )}
          </View>
        )}

        {/* PRICING TAB */}
        {activeTab === "pricing" && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("adminDashboard.feesAndPricing")}
            </Text>
            {!pricingForm ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <>
                <Text style={[styles.feeHint, { color: colors.textSecondary }]}>
                  {t("adminDashboard.feesHint")}
                </Text>

                <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                  {t("adminDashboard.eventPlatformFee")}
                </Text>
                <TextInput
                  style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                  keyboardType="numeric"
                  value={pricingForm.eventPct}
                  onChangeText={(v) => setPricingForm((p) => ({ ...p, eventPct: v }))}
                  placeholder="5"
                  placeholderTextColor={colors.textTertiary}
                />

                <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                  {t("adminDashboard.rentalPlatformFee")}
                </Text>
                <TextInput
                  style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                  keyboardType="numeric"
                  value={pricingForm.rentalPct}
                  onChangeText={(v) => setPricingForm((p) => ({ ...p, rentalPct: v }))}
                  placeholder="5"
                  placeholderTextColor={colors.textTertiary}
                />

                <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                  {t("adminDashboard.stripeFee")}
                </Text>
                <TextInput
                  style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                  keyboardType="numeric"
                  value={pricingForm.stripePct}
                  onChangeText={(v) => setPricingForm((p) => ({ ...p, stripePct: v }))}
                  placeholder="2.9"
                  placeholderTextColor={colors.textTertiary}
                />

                <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                  {t("adminDashboard.stripeFixedFee")}
                </Text>
                <TextInput
                  style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                  keyboardType="numeric"
                  value={pricingForm.stripeFixed}
                  onChangeText={(v) => setPricingForm((p) => ({ ...p, stripeFixed: v }))}
                  placeholder="3"
                  placeholderTextColor={colors.textTertiary}
                />

                <TouchableOpacity
                  style={[styles.saveFeeBtn, { backgroundColor: colors.primary, opacity: pricingSaving ? 0.6 : 1 }]}
                  onPress={savePricing}
                  disabled={pricingSaving}
                  activeOpacity={0.85}
                >
                  {pricingSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveFeeTxt}>{t("adminDashboard.savePricing")}</Text>
                  )}
                </TouchableOpacity>

                {/* Operating cities — feeds every city dropdown in the app */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>
                  {t("adminDashboard.operatingCities")}
                </Text>
                <Text style={[styles.feeHint, { color: colors.textSecondary }]}>
                  {t("adminDashboard.operatingCitiesHint")}
                </Text>
                {!citiesList ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                ) : (
                  <>
                    <View style={styles.cityChips}>
                      {citiesList.map((c) => (
                        <View
                          key={c.id}
                          style={[styles.cityChip, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                        >
                          <Text style={[styles.cityChipText, { color: colors.text }]}>{c.label}</Text>
                          <TouchableOpacity onPress={() => removeCity(c)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                            <Icon name="close" size={14} color={colors.textTertiary} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                    <View style={styles.cityAddRow}>
                      <TextInput
                        style={[styles.feeInput, { flex: 1, marginBottom: 0, color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                        value={newCityLabel}
                        onChangeText={setNewCityLabel}
                        placeholder={t("adminDashboard.newCityPlaceholder")}
                        placeholderTextColor={colors.textTertiary}
                        onSubmitEditing={addCity}
                      />
                      <TouchableOpacity
                        style={[styles.saveFeeBtn, { backgroundColor: colors.primary, paddingHorizontal: 18, marginTop: 0, opacity: citySaving ? 0.6 : 1 }]}
                        onPress={addCity}
                        disabled={citySaving}
                      >
                        <Text style={styles.saveFeeTxt}>{t("adminDashboard.add")}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Subscriptions — Kinlo Pro (host) + Kinlo Plus (attendee) */}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 32 }]}>
                  {t("adminDashboard.subscriptions")}
                </Text>
                <Text style={[styles.feeHint, { color: colors.textSecondary }]}>
                  {t("adminDashboard.subscriptionsHint")}
                </Text>

                {subForm && (
                  <>
                    <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                      {t("adminDashboard.kinloProAmount", { currency: subForm.proCurrency })}
                    </Text>
                    <TextInput
                      style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                      keyboardType="numeric"
                      value={subForm.proAmount}
                      onChangeText={(v) => setSubForm((p) => ({ ...p, proAmount: v }))}
                      placeholder="199"
                      placeholderTextColor={colors.textTertiary}
                    />

                    <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>
                      {t("adminDashboard.kinloPlusAmount", { currency: subForm.plusCurrency })}
                    </Text>
                    <TextInput
                      style={[styles.feeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                      keyboardType="numeric"
                      value={subForm.plusAmount}
                      onChangeText={(v) => setSubForm((p) => ({ ...p, plusAmount: v }))}
                      placeholder="129"
                      placeholderTextColor={colors.textTertiary}
                    />

                    <TouchableOpacity
                      style={[styles.saveFeeBtn, { backgroundColor: colors.primary, opacity: subSaving ? 0.6 : 1 }]}
                      onPress={saveSubscriptions}
                      disabled={subSaving}
                      activeOpacity={0.85}
                    >
                      {subSaving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveFeeTxt}>{t("adminDashboard.saveSubscriptions")}</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Host Request Modal */}
      <AdminMessageModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={
          modalType === "approve" ? handleApproveSubmit : handleRejectSubmit
        }
        title={modalType === "approve" ? t("adminDashboard.approveRequestTitle") : t("adminDashboard.rejectRequestTitle")}
        userName={currentRequest?.userName || ""}
        type={modalType}
      />

      {/* Confirmation Modal */}
      <AdminConfirmModal
        visible={confirmModalVisible}
        onClose={() => setConfirmModalVisible(false)}
        onConfirm={handleConfirmAction}
        actionType={confirmAction}
        userName={confirmUser ? getUserDisplayName(confirmUser) : ""}
        userRole={confirmUser?.role}
      />
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    cityChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 12 },
    cityChip: {
      flexDirection: "row", alignItems: "center", gap: 8,
      borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    },
    cityChipText: { fontSize: 14, fontWeight: "600" },
    cityAddRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    container: { flex: 1 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    tabsContainer: {
      flexDirection: "row",
      paddingHorizontal: 24,
      marginBottom: 20,
      gap: 12,
    },
    tab: { flex: 1, borderRadius: 12, overflow: "hidden" },
    tabGlass: {
      borderWidth: 1,
      paddingVertical: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    tabText: { fontSize: 15, fontWeight: "600" },
    badge: {
      backgroundColor: colors.error,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    badgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
    statCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      alignItems: "center",
    },
    statIcon: { marginBottom: 8 },
    statValue: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
    statLabel: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      textAlign: "center",
    },
    section: { marginBottom: 28 },
    crashCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    crashMsg: { fontSize: 14, fontWeight: "700" },
    transferActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    transferBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: "center",
    },
    transferBtnText: { fontSize: 14, fontWeight: "800" },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 16,
    },
    searchIcon: { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 15 },
    roleFilters: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 20,
    },
    filterChip: {
      borderRadius: 12,
      overflow: "hidden",
    },
    filterGlass: {
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    filterText: {
      fontSize: 14,
      fontWeight: "600",
    },
    // Request Card Styles
    requestCard: { marginBottom: 16, borderRadius: 16, overflow: "hidden" },
    requestGlass: { borderWidth: 1, padding: 16 },
    requestHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    requestInfo: { flex: 1 },
    requestName: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    requestDate: { fontSize: 12 },
    requestDetails: { marginBottom: 16 },
    detailRow: { marginBottom: 12 },
    detailLabel: {
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    detailValue: { fontSize: 14, lineHeight: 20 },
    actionsRow: { flexDirection: "row", gap: 12 },
    rejectButton: { flex: 1, borderRadius: 12, overflow: "hidden" },
    rejectGlass: { borderWidth: 1, paddingVertical: 12, alignItems: "center" },
    rejectText: { fontSize: 15, fontWeight: "600", color: colors.error },
    approveButton: { flex: 1, borderRadius: 12, overflow: "hidden" },
    approveGlass: { borderWidth: 1, paddingVertical: 12, alignItems: "center" },
    approveText: { fontSize: 15, fontWeight: "600", color: "#34C759" },
    // User Card Styles
    userCard: { marginBottom: 16, borderRadius: 16, overflow: "hidden" },
    userGlass: { borderWidth: 1, padding: 16 },
    userHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    userInfo: { flex: 1 },
    userName: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    userEmail: { fontSize: 13 },
    roleBadge: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    roleText: {
      fontSize: 11,
      fontWeight: "600",
    },
    suspendedBanner: {
      backgroundColor: "rgba(255, 69, 58, 0.15)",
      padding: 8,
      borderRadius: 8,
      marginBottom: 12,
    },
    suspendedText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.error,
      textAlign: "center",
    },
    userActions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    actionButton: {
      borderRadius: 10,
      overflow: "hidden",
      flex: 1,
      minWidth: "45%",
    },
    actionGlass: {
      borderWidth: 1,
      paddingVertical: 10,
      alignItems: "center",
    },
    actionText: {
      fontSize: 13,
      fontWeight: "600",
    },
    emptyState: { alignItems: "center", paddingVertical: 40 },
    emptyArt: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    emptyText: { fontSize: 14 },
    // Pricing form
    feeHint: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
    feeLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    feeInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 16,
    },
    saveFeeBtn: {
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
      marginTop: 4,
    },
    saveFeeTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
