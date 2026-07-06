import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";
import { auth, db } from "../services/firebase";
import {
  subscribeCarpool,
  subscribeRiders,
  requestSeat,
  cancelSeat,
  respondToRequest,
  closeCarpool,
} from "../services/carpoolService";

/**
 * Live car-pool card rendered for a "carpool" chat message.
 */
export default function CarpoolCard({ eventId, carpoolId, currentUserName }) {
  const { colors, isDark } = useTheme();
  const [carpool, setCarpool] = useState(null);
  const [riders, setRiders] = useState([]);
  const [driverSeatsShared, setDriverSeatsShared] = useState(0);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!eventId || !carpoolId) return;
    const a = subscribeCarpool(eventId, carpoolId, setCarpool);
    const b = subscribeRiders(eventId, carpoolId, setRiders);
    return () => {
      a();
      b();
    };
  }, [eventId, carpoolId]);

  // Driver loyalty badge (server-maintained, can't be self-inflated).
  useEffect(() => {
    if (!carpool?.driverId) return;
    getDoc(doc(db, "users", carpool.driverId)).then((s) => {
      if (s.exists()) setDriverSeatsShared(s.data().carpoolStats?.seatsShared || 0);
    });
  }, [carpool?.driverId]);

  const styles = createStyles(colors, isDark);
  if (!carpool) {
    return (
      <View style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>Loading ride…</Text>
      </View>
    );
  }

  const isDriver = uid === carpool.driverId;
  const approved = riders.filter((r) => r.status === "approved");
  const pending = riders.filter((r) => r.status === "requested");
  const mine = riders.find((r) => r.userId === uid);
  const seatsLeft = Math.max(0, carpool.seatsTotal - approved.length);
  const closed = carpool.status === "closed" || seatsLeft === 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <Icon name="car" size={11} color={colors.primary} />
          <Text style={styles.badge}>CAR POOL{closed ? " · FULL" : ""}</Text>
        </View>
        {isDriver && carpool.status !== "closed" && (
          <TouchableOpacity onPress={() => closeCarpool(eventId, carpoolId)}>
            <Text style={[styles.close, { color: colors.primary }]}>Close</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.driver, { color: colors.text }]}>
        {carpool.driverName} is driving
      </Text>
      {driverSeatsShared > 0 && (
        <Text style={[styles.loyalty, { color: colors.primary }]}>
          Has helped {driverSeatsShared} {driverSeatsShared === 1 ? "person" : "people"} get to events
        </Text>
      )}
      <Text style={[styles.detail, { color: colors.textSecondary }]}>
        <Icon name="location" size={12} color={colors.textSecondary} /> From{" "}
        {carpool.from}
        {carpool.departureTime ? (
          <>
            {" · "}
            <Icon name="clock" size={12} color={colors.textSecondary} />{" "}
            {carpool.departureTime}
          </>
        ) : null}
      </Text>
      {!!carpool.notes && (
        <Text style={[styles.notes, { color: colors.textTertiary }]}>{carpool.notes}</Text>
      )}
      <Text style={[styles.seats, { color: colors.text }]}>
        {seatsLeft} of {carpool.seatsTotal} seat{carpool.seatsTotal === 1 ? "" : "s"} left
      </Text>

      {/* Driver view: pending requests */}
      {isDriver && pending.length > 0 && (
        <View style={styles.section}>
          {pending.map((r) => (
            <View key={r.userId} style={styles.reqRow}>
              <Text style={[styles.reqName, { color: colors.text }]} numberOfLines={1}>
                {r.name}
              </Text>
              <View style={styles.reqActions}>
                <TouchableOpacity
                  onPress={() => respondToRequest(eventId, carpoolId, r.userId, true)}
                  disabled={seatsLeft === 0}
                >
                  <Text style={[styles.approve, { color: seatsLeft === 0 ? colors.textTertiary : "#34C759" }]}>
                    Approve
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => respondToRequest(eventId, carpoolId, r.userId, false)}>
                  <Text style={[styles.decline, { color: "#EF4444" }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Approved riders */}
      {approved.length > 0 && (
        <Text style={[styles.riders, { color: colors.textSecondary }]}>
          <Icon name="successCircle" size={12} color={colors.success} />{" "}
          {approved.map((r) => r.name).join(", ")}
        </Text>
      )}

      {/* Rider actions */}
      {!isDriver && (
        <View style={{ marginTop: 10 }}>
          {!mine && !closed && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` }]}
              onPress={() => requestSeat(eventId, carpoolId, currentUserName)}
            >
              <Text style={[styles.btnText, { color: colors.primary }]}>Request a seat</Text>
            </TouchableOpacity>
          )}
          {mine?.status === "requested" && (
            <TouchableOpacity
              style={[styles.btn, { borderColor: colors.border }]}
              onPress={() => cancelSeat(eventId, carpoolId)}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>
                Requested · tap to cancel
              </Text>
            </TouchableOpacity>
          )}
          {mine?.status === "approved" && (
            <Text style={[styles.confirmed, { color: "#34C759" }]}>
              You're in! See you there.
            </Text>
          )}
          {mine?.status === "declined" && (
            <Text style={[styles.confirmed, { color: colors.textTertiary }]}>
              The driver couldn't fit you this time.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.92)",
      padding: 14,
      width: 270,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    badge: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    close: { fontSize: 13, fontWeight: "700" },
    driver: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
    loyalty: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
    detail: { fontSize: 13, marginBottom: 4 },
    notes: { fontSize: 13, fontStyle: "italic", marginBottom: 4 },
    seats: { fontSize: 14, fontWeight: "600", marginTop: 4 },
    section: { marginTop: 10, gap: 8 },
    reqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    reqName: { fontSize: 14, flex: 1, marginRight: 8 },
    reqActions: { flexDirection: "row", gap: 14 },
    approve: { fontSize: 13, fontWeight: "700" },
    decline: { fontSize: 13, fontWeight: "700" },
    riders: { fontSize: 13, marginTop: 8 },
    btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    btnText: { fontSize: 14, fontWeight: "700" },
    confirmed: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  });
}
