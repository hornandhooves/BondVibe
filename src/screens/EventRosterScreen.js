import Icon from "../components/Icon";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AttendeeRow, PaymentPill } from "../components/primitives";
import { getEventReservations } from "../services/membershipService";
import { getAttendeeIds } from "../utils/eventHelpers";

export default function EventRosterScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { eventId } = route.params || {};
  const [rows, setRows] = useState([]);
  const [waitRows, setWaitRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const evSnap = await getDoc(doc(db, "events", eventId));
        if (!evSnap.exists()) return;
        const e = evSnap.data();
        const attendees = getAttendeeIds(e.attendees);
        const waitlist = Array.isArray(e.waitlist) ? e.waitlist : [];
        const isPast = e.date && new Date(e.date).getTime() < Date.now();
        const isFree = (e.price || 0) === 0;

        const [checkSnap, reservations] = await Promise.all([
          getDocs(collection(db, "events", eventId, "checkins")),
          getEventReservations(eventId).catch(() => []),
        ]);
        const checkedIn = new Set(checkSnap.docs.map((d) => d.id));
        const membershipIds = new Set(reservations.map((r) => r.userId));

        const resolve = async (ids) =>
          Promise.all(
            ids.map(async (id) => {
              const u = await getDoc(doc(db, "users", id));
              const d = u.exists() ? u.data() : {};
              return { id, name: d.fullName || d.name || t("eventRoster.member"), avatar: d.avatar };
            })
          );

        const [aUsers, wUsers] = await Promise.all([
          resolve(attendees),
          resolve(waitlist),
        ]);

        setRows(
          aUsers.map((u) => ({
            ...u,
            tagKind: isFree ? "free" : membershipIds.has(u.id) ? "membership" : "paid",
            tag: isFree
              ? t("eventRoster.free")
              : membershipIds.has(u.id)
              ? t("eventRoster.membership")
              : t("eventRoster.paid"),
            status: checkedIn.has(u.id) ? "checked-in" : isPast ? "no-show" : "going",
          }))
        );
        setWaitRows(wUsers);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const styles = createStyles(colors, isDark);
  const STATUS = {
    "checked-in": { label: t("eventRoster.checkedIn"), color: "#34C759" },
    "no-show": { label: t("eventRoster.noShow"), color: "#EF4444" },
    going: { label: t("eventRoster.going"), color: colors.textSecondary },
  };

  const PAYMENT = [t("eventRoster.paid"), t("eventRoster.membership"), t("eventRoster.free")];
  const Row = ({ u }) => (
    <AttendeeRow
      name={u.name}
      avatar={u.avatar}
      subtitle={u.tag && !PAYMENT.includes(u.tag) ? u.tag : undefined}
      right={u.tag && PAYMENT.includes(u.tag) ? <PaymentPill status={u.tag} kind={u.tagKind} /> : undefined}
      status={u.status ? STATUS[u.status].label : undefined}
      statusColor={u.status ? STATUS[u.status].color : undefined}
    />
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("eventRoster.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.counts}>
            <Text style={[styles.count, { color: colors.text }]}>
              {t("eventRoster.goingCount", { count: rows.length })}
            </Text>
            <Text style={[styles.count, { color: "#34C759" }]}>
              {t("eventRoster.checkedInCount", {
                count: rows.filter((r) => r.status === "checked-in").length,
              })}
            </Text>
            {rows.some((r) => r.status === "no-show") && (
              <Text style={[styles.count, { color: "#EF4444" }]}>
                {t("eventRoster.noShowCount", {
                  count: rows.filter((r) => r.status === "no-show").length,
                })}
              </Text>
            )}
          </View>

          {rows.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>{t("eventRoster.noAttendees")}</Text>
          ) : (
            rows.map((u) => <Row key={u.id} u={u} />)
          )}

          {waitRows.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.textSecondary }]}>
                {t("eventRoster.waitlistHeader", { count: waitRows.length })}
              </Text>
              {waitRows.map((u, i) => (
                <Row key={u.id} u={{ ...u, tag: t("eventRoster.inLine", { position: i + 1 }) }} />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    counts: { flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" },
    count: { fontSize: 14, fontWeight: "700" },
    muted: { fontSize: 13 },
    section: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 20, marginBottom: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    name: { fontSize: 15, fontWeight: "700" },
    tag: { fontSize: 12, marginTop: 2 },
    status: { fontSize: 13, fontWeight: "700" },
  });
}
