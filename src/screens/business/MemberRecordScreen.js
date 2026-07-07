/**
 * MemberRecordScreen — the member record (kinlo_business/01 §1). Identity,
 * hand-settable status, guest-code→QR, tags, notes timeline. Credits /
 * attendance / payments sections show their empty state until those blocks
 * (packages & attendance, finance) wire real data into the SAME record.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import StatusPill from "../../components/business/StatusPill";
import GuestCodeCard from "../../components/business/GuestCodeCard";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness } from "../../services/businessService";
import {
  getMember,
  updateMember,
  deleteMember,
  regenerateInviteCode,
  MEMBER_STATUS,
} from "../../services/businessMembersService";

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function MemberRecordScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const memberId = route.params?.memberId;
  const [member, setMember] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, b] = await Promise.all([getMember(memberId), getBusiness()]);
    setMember(m);
    setBusiness(b);
    setLoading(false);
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setStatus = async (status) => {
    setMember((m) => ({ ...m, status }));
    await updateMember(memberId, { status });
  };

  const onRegenerate = async () => {
    const code = await regenerateInviteCode(memberId, business?.name || "");
    setMember((m) => ({ ...m, inviteCode: code, redeemedAt: null, linkedUid: null }));
  };

  const onDelete = () =>
    Alert.alert(t("business.record.deleteTitle"), t("business.record.deleteMsg"), [
      { text: t("business.common.cancel"), style: "cancel" },
      {
        text: t("business.record.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteMember(memberId);
          navigation.goBack();
        },
      },
    ]);

  const styles = createStyles(colors);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }
  if (!member) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>{t("business.record.notFound")}</Text>
        </View>
      </GradientBackground>
    );
  }

  const statusOptions = [MEMBER_STATUS.ACTIVE, MEMBER_STATUS.AT_RISK, MEMBER_STATUS.INACTIVE];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.record.title")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("BusinessMemberForm", { memberId })}>
          <Icon name="edit" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(member.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{member.name}</Text>
            {!!(member.phone || member.email) && (
              <Text style={[styles.contact, { color: colors.textTertiary }]} numberOfLines={1}>
                {[member.phone, member.email].filter(Boolean).join(" · ")}
              </Text>
            )}
            <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
              <StatusPill status={member.status} />
            </View>
          </View>
        </View>

        {/* Hand-settable status (manual-first) */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.setStatus")}</Text>
        <View style={styles.statusRow}>
          {statusOptions.map((s) => {
            const active = (member.status || "active") === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" },
                ]}
              >
                <StatusPill status={s} size="sm" />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Guest code → QR */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.appAccess")}</Text>
        <GuestCodeCard
          code={member.inviteCode}
          businessName={business?.name}
          redeemed={!!member.redeemedAt}
          onRegenerate={member.redeemedAt ? null : onRegenerate}
        />

        {/* Tags */}
        {Array.isArray(member.tags) && member.tags.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.tags")}</Text>
            <View style={styles.tagsWrap}>
              {member.tags.map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceGlass }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Credits — populated in the Packages block */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.credits")}</Text>
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyCardText, { color: colors.textTertiary }]}>{t("business.record.creditsEmpty")}</Text>
        </View>

        {/* Attendance — populated in the Attendance block */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.attendance")}</Text>
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyCardText, { color: colors.textTertiary }]}>{t("business.record.attendanceEmpty")}</Text>
        </View>

        {/* Notes timeline */}
        {Array.isArray(member.notes) && member.notes.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.notes")}</Text>
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {member.notes.map((n, i) => (
                <View key={i} style={[styles.noteRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.noteText, { color: colors.text }]}>{n.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Icon name="delete" size={16} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>{t("business.record.delete")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    identity: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
    avatar: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 20, fontWeight: "800" },
    name: { fontSize: 20, fontWeight: "800" },
    contact: { fontSize: 12.5, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10 },
    statusRow: { flexDirection: "row", gap: 8 },
    statusChip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
    tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    tagText: { fontSize: 13, fontWeight: "600" },
    emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center" },
    emptyCardText: { fontSize: 12.5, textAlign: "center", lineHeight: 18 },
    notesCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
    noteRow: { paddingVertical: 12 },
    noteText: { fontSize: 13.5, lineHeight: 19 },
    deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 20, marginTop: 10 },
    deleteText: { fontSize: 14, fontWeight: "700" },
  });
}
