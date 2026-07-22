/**
 * Social gifting — entry router (Boards 2b/2c, 3a, 4a).
 *
 * Two ways in:
 *  - recipientId known (from a profile / birthday reminder / carpool nudge) →
 *    suggest PAID events from their PUBLIC interests (Decision D), pick one.
 *  - eventId known (from EventDetail "Gift this event") → pick a recipient from
 *    the people you follow (upcoming birthdays first).
 * Either way we hand off to GiftConfirm with { recipientId, eventId }.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import { formatCentavos } from "../../utils/pricing";
import {
  getGiftRecipient, getGiftSuggestions, getUpcomingBirthdays,
} from "../../services/giftService";
import { getFollowing } from "../../services/followService";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../services/firebase";

const Avatar = ({ name, colors }) => (
  <View style={[st.avatar, { backgroundColor: colors.brandSoft }]}>
    <Text style={[TYPE.title, { color: colors.primary }]}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </Text>
  </View>
);

export default function GiftingScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { recipientId, eventId, eventTitle } = route.params || {};
  const mode = recipientId ? "suggest" : "pick";

  const [loading, setLoading] = useState(true);
  const [recipient, setRecipient] = useState(null);
  const [suggest, setSuggest] = useState({ noPrefs: false, events: [] });
  const [following, setFollowing] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (mode === "suggest") {
          const r = await getGiftRecipient(recipientId);
          setRecipient(r);
          setSuggest(await getGiftSuggestions(r));
        } else {
          const [bdays, followIds] = await Promise.all([
            getUpcomingBirthdays(30),
            getFollowing(),
          ]);
          setBirthdays(bdays);
          const people = await Promise.all(
            followIds.slice(0, 60).map(async (uid) => {
              const s = await getDoc(doc(db, "users", uid));
              return s.exists()
                ? { id: uid, name: s.data().fullName || s.data().name || "", avatar: s.data().avatar }
                : null;
            })
          );
          setFollowing(people.filter(Boolean));
        }
      } catch (_e) {
        // best-effort; empty states cover it
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, recipientId]);

  const goConfirm = (evId, evTitle, evPrice, rId, rName) =>
    navigation.navigate("GiftConfirm", {
      recipientId: rId, eventId: evId, eventTitle: evTitle, eventPrice: evPrice,
      recipientName: rName,
    });

  const Header = ({ title, sub }) => (
    <View style={st.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Back">
        <Icon name="back" size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, marginLeft: SPACING.md }}>
        <Text style={[TYPE.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{sub}</Text>}
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── PICK A RECIPIENT (entered from an event) ──────────────────────────────
  if (mode === "pick") {
    const q = search.trim().toLowerCase();
    const list = following.filter((p) => !q || p.name.toLowerCase().includes(q));
    return (
      <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
        <Header title={t("gifting.pick.title")} sub={eventTitle} />
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <View style={[st.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="search" size={18} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("gifting.pick.search")}
              placeholderTextColor={colors.textTertiary}
              style={[TYPE.body, { color: colors.text, flex: 1, marginLeft: SPACING.sm }]}
            />
          </View>

          {birthdays.length > 0 && (
            <>
              <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
                {t("gifting.pick.upcomingBirthdays")}
              </Text>
              {birthdays.map((b) => (
                <RecipientRow key={b.id} p={b} colors={colors}
                  sub={t("gifting.pick.birthdayInDays", { count: b.daysUntil })}
                  onPress={() => navigation.navigate("GiftConfirm", {
                    recipientId: b.id, recipientName: b.name, eventId,
                    eventTitle, eventPrice: route.params?.eventPrice,
                  })} />
              ))}
            </>
          )}

          <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
            {t("gifting.pick.following")}
          </Text>
          {list.length === 0 && (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>{t("gifting.pick.empty")}</Text>
          )}
          {list.map((p) => (
            <RecipientRow key={p.id} p={p} colors={colors} sub={t("gifting.pick.youFollow")}
              onPress={() => navigation.navigate("GiftConfirm", {
                recipientId: p.id, recipientName: p.name, eventId,
                eventTitle, eventPrice: route.params?.eventPrice,
              })} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── SUGGEST EVENTS (entered from a person) ────────────────────────────────
  const days = recipient?.birthday
    ? Math.max(0, dayCount(recipient.birthday)) : null;
  return (
    <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
      <Header
        title={t("gifting.suggest.title", { name: recipient?.name || "" })}
        sub={days != null ? t("gifting.suggest.subtitleDays", { count: days }) : null}
      />
      <ScrollView contentContainerStyle={st.body}>
        {suggest.noPrefs ? (
          <View style={[st.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[TYPE.title, { color: colors.text }]}>{t("gifting.suggest.emptyTitle")}</Text>
            <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: SPACING.xs }]}>
              {t("gifting.suggest.emptyBlurb", { name: recipient?.name || "" })}
            </Text>
            <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
              {t("gifting.suggest.popular")}
            </Text>
          </View>
        ) : (
          <>
            {recipient?.publicInterests?.length > 0 && (
              <View style={st.chips}>
                {recipient.publicInterests.slice(0, 6).map((c) => (
                  <View key={c} style={[st.chip, { backgroundColor: colors.brandSoft }]}>
                    <Text style={[TYPE.caption, { color: colors.primary }]}>{c}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[TYPE.caption, { color: colors.textTertiary, marginBottom: SPACING.sm }]}>
              {t("gifting.suggest.fromPublic")}
            </Text>
          </>
        )}

        {suggest.events.map((e) => (
          <View key={e.id} style={[st.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              {e.affinity > 0 && (
                <Text style={[TYPE.eyebrow, { color: colors.success }]}>
                  {t("gifting.suggest.affinity", { pct: 90 + Math.round(e.affinity * 8) })}
                </Text>
              )}
              <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={2}>{e.title}</Text>
              <Text style={[TYPE.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {fmtDate(e.date)} · {formatCentavos((e.price || 0) * 100)}
              </Text>
            </View>
            <TouchableOpacity
              style={[st.giftBtn, { backgroundColor: colors.primary }]}
              onPress={() => goConfirm(e.id, e.title, e.price, recipient.id, recipient.name)}
              accessibilityRole="button">
              <Text style={[TYPE.label, { color: colors.onPrimary }]}>{t("gifting.suggest.gift")}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const RecipientRow = ({ p, sub, onPress, colors }) => (
  <TouchableOpacity style={[st.recipRow, { borderColor: colors.border }]} onPress={onPress}
    accessibilityRole="button">
    <Avatar name={p.name} colors={colors} />
    <View style={{ flex: 1, marginLeft: SPACING.md }}>
      <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
      {!!sub && <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{sub}</Text>}
    </View>
    <Icon name="forward" size={18} color={colors.textTertiary} />
  </TouchableOpacity>
);

const dayCount = (bd) => {
  const now = new Date();
  const y = now.getFullYear();
  let next = new Date(y, bd.month - 1, bd.day);
  const today = new Date(y, now.getMonth(), now.getDate());
  if (next < today) next = new Date(y + 1, bd.month - 1, bd.day);
  return Math.round((next - today) / 86400000);
};
const fmtDate = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(); } catch { return ""; }
};

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.screen, paddingVertical: SPACING.md },
  body: { paddingHorizontal: SPACING.screen, paddingBottom: 40 },
  eyebrow: { marginTop: SPACING.lg, marginBottom: SPACING.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: RADII.pill, paddingHorizontal: SPACING.lg, height: 46 },
  recipRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.md, borderBottomWidth: 1 },
  row: {},
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADII.pill },
  emptyCard: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginBottom: SPACING.md },
  eventCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginBottom: SPACING.md },
  giftBtn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADII.pill, marginLeft: SPACING.md },
});
