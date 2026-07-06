import Icon from "../components/Icon";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import MemberPulseCard from "../components/ai/MemberPulseCard";
import KeyboardAccessory from "../components/KeyboardAccessory";
import { AvatarDisplay } from "../components/AvatarPicker";
import { usePremium } from "../hooks/usePremium";
import {
  getHostCRM,
  nudgeAttendee,
  crmToCSV,
  sendAnnouncement,
} from "../services/crmService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const SEGMENTS = [
  { id: "risk", label: "At risk" },
  { id: "recurring", label: "Regulars" },
  { id: "all", label: "All" },
];

export default function HostCRMScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { isPremium, loading: premiumLoading } = usePremium();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState("risk");
  const [hostName, setHostName] = useState("your host");
  const [sent, setSent] = useState({});
  const [announceVisible, setAnnounceVisible] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  const [announcing, setAnnouncing] = useState(false);
  const styles = createStyles(colors, isDark);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = auth.currentUser?.uid;
        const [list, me] = await Promise.all([
          getHostCRM(),
          uid ? getDoc(doc(db, "users", uid)) : Promise.resolve(null),
        ]);
        setRows(list);
        if (me?.exists()) setHostName(me.data().fullName || me.data().name || hostName);
        setLoading(false);
      })();
    }, [])
  );

  const filtered = rows.filter((r) =>
    segment === "all" ? true : segment === "risk" ? r.atRisk : r.recurring
  );
  const riskCount = rows.filter((r) => r.atRisk).length;

  const act = async (row, kind) => {
    await nudgeAttendee(row.id, hostName, kind);
    setSent((s) => ({ ...s, [row.id]: true }));
  };

  const exportCSV = async () => {
    if (rows.length === 0) return;
    try {
      await Share.share({ message: crmToCSV(rows) });
    } catch (e) {
      // cancelled
    }
  };

  const sendAnnounce = async () => {
    const ids = filtered.map((r) => r.id);
    if (!announceText.trim() || ids.length === 0) return;
    setAnnouncing(true);
    const r = await sendAnnouncement(ids, announceText);
    setAnnouncing(false);
    setAnnounceVisible(false);
    setAnnounceText("");
    if (r.success) Alert.alert("Sent", `Announcement sent to ${r.count} ${r.count === 1 ? "person" : "people"}.`);
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Icon name="back" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Attendees</Text>
      <TouchableOpacity onPress={exportCSV}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Export</Text>
      </TouchableOpacity>
    </View>
  );

  if (!premiumLoading && !isPremium) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        {Header}
        <View style={styles.center}>
          <Text style={[styles.upsellTitle, { color: colors.text }]}>CRM is Pro</Text>
          <Text style={[styles.upsellText, { color: colors.textSecondary }]}>
            Know your regulars and re-engage the ones who drift away.
          </Text>
          <TouchableOpacity
            style={[styles.upsellBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BondVibePro")}
          >
            <Text style={styles.upsellBtnText}>See Kinlo Pro</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      {Header}

      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSegment(s.id)}
            style={[
              styles.segment,
              {
                backgroundColor: segment === s.id ? colors.primary : colors.surface,
                borderColor: segment === s.id ? colors.primary : colors.borderStrong,
              },
            ]}
          >
            <Text
              style={{
                color: segment === s.id ? colors.onPrimary : colors.text,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              {s.label}
              {s.id === "risk" && riskCount > 0 ? ` (${riskCount})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!loading && filtered.length > 0 && (
        <TouchableOpacity
          style={[
            styles.announceBtn,
            { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}66` },
          ]}
          onPress={() => setAnnounceVisible(true)}
        >
          <Icon name="broadcast" size={16} color={colors.primary} />
          <Text style={[styles.announceBtnText, { color: colors.primary }]}>
            Send announcement to {filtered.length}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Member Intelligence (ai_features/13) */}
          <MemberPulseCard navigation={navigation} />
          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {segment === "risk"
                ? "Nobody at risk right now"
                : "No attendees in this segment yet."}
            </Text>
          ) : (
            filtered.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <AvatarDisplay avatar={normAvatar(r.avatar)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {r.eventsCount} event{r.eventsCount === 1 ? "" : "s"}
                      {r.lastDate ? ` · last ${r.lastDate.toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                </View>

                {(r.flags.inactive || r.flags.membershipExpiring) && (
                  <View style={styles.flags}>
                    {r.flags.inactive && (
                      <View style={[styles.flag, { backgroundColor: `${colors.warning}22`, borderColor: colors.warning }]}>
                        <Text style={[styles.flagText, { color: colors.warning }]}>Broke their streak</Text>
                      </View>
                    )}
                    {r.flags.membershipExpiring && (
                      <View style={[styles.flag, { backgroundColor: `${colors.error}22`, borderColor: colors.error }]}>
                        <Text style={[styles.flagText, { color: colors.error }]}>Membership expiring</Text>
                      </View>
                    )}
                  </View>
                )}

                {sent[r.id] ? (
                  <View style={styles.sentRow}>
                    <Icon name="check" size={14} color={colors.success} />
                    <Text style={[styles.sentMsg, { color: colors.success }]}>Message sent</Text>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.action, { borderColor: colors.borderStrong }]} onPress={() => act(r, "reminder")}>
                      <Text style={[styles.actionText, { color: colors.text }]}>Reminder</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.action, { borderColor: colors.borderStrong }]} onPress={() => act(r, "checkin")}>
                      <Text style={[styles.actionText, { color: colors.text }]}>How are you?</Text>
                    </TouchableOpacity>
                    {r.flags.membershipExpiring && (
                      <TouchableOpacity style={[styles.action, { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }]} onPress={() => act(r, "renew")}>
                        <Text style={[styles.actionText, { color: colors.primary }]}>Renew</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={announceVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Announcement to {filtered.length} attendee{filtered.length === 1 ? "" : "s"}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: colors.text, borderColor: colors.borderStrong },
              ]}
              placeholder="Write your announcement…"
              placeholderTextColor={colors.textTertiary}
              value={announceText}
              onChangeText={setAnnounceText}
              multiline
              maxLength={300}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setAnnounceVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendAnnounce} disabled={announcing || !announceText.trim()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {announcing ? "Sending…" : "Send"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <KeyboardAccessory />
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
    upsellTitle: { fontSize: 22, fontWeight: "800" },
    upsellText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    upsellBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 26, marginTop: 8 },
    upsellBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    segments: { flexDirection: "row", gap: 8, paddingHorizontal: 24, marginBottom: 8 },
    segment: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    empty: { fontSize: 14, textAlign: "center", marginTop: 40, lineHeight: 20 },
    card: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: cardBg,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    name: { fontSize: 15, fontWeight: "700" },
    meta: { fontSize: 13, marginTop: 2 },
    flags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    flag: { borderWidth: 1, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
    flagText: { fontSize: 12, fontWeight: "700" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    action: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
    actionText: { fontSize: 13, fontWeight: "700" },
    sentRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
    sentMsg: { fontSize: 13, fontWeight: "700" },
    announceBtn: {
      marginHorizontal: 24,
      marginBottom: 10,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 12,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    },
    announceBtnText: { fontSize: 14, fontWeight: "700" },
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
    modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      fontSize: 15,
      minHeight: 90,
      textAlignVertical: "top",
    },
    modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  });
}
