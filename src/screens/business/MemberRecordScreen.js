/**
 * MemberRecordScreen — the member record (kinlo_business/01 §1,3,4). Identity,
 * hand-settable status, guest-code→QR, packages/credits (assign + manual +/-
 * with reason), attendance ledger (mark present, auto-deduct, history), tags,
 * notes timeline.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import StatusPill from "../../components/business/StatusPill";
import GuestCodeCard from "../../components/business/GuestCodeCard";
import CreditCard from "../../components/business/CreditCard";
import PricingTierToggle from "../../components/business/PricingTierToggle";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness } from "../../services/businessService";
import {
  getMember,
  updateMember,
  deleteMember,
  regenerateInviteCode,
  MEMBER_STATUS,
  PRICING_TIER,
} from "../../services/businessMembersService";
import { listPackages, assignPackage, adjustCredits, PACKAGE_KIND } from "../../services/businessPackagesService";
import { markPresent, listMemberAttendance } from "../../services/businessAttendanceService";
import { listMemberPayments } from "../../services/businessPaymentsService";
import { audienceAllows } from "../../utils/membershipUtils";
import { formatCentavos } from "../../utils/pricing";

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function MemberRecordScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const memberId = route.params?.memberId;
  const [member, setMember] = useState(null);
  const [business, setBusiness] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [assignVisible, setAssignVisible] = useState(false);
  const [packages, setPackages] = useState([]);
  const [adjust, setAdjust] = useState(null); // { delta, reason }

  const load = useCallback(async () => {
    const [m, b, att, pay] = await Promise.all([
      getMember(memberId),
      getBusiness(),
      listMemberAttendance(memberId),
      listMemberPayments(memberId),
    ]);
    setMember(m);
    setBusiness(b);
    setAttendance(att);
    setPayments(pay);
    setLoading(false);
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reloadMember = async () => {
    const [m, att, pay] = await Promise.all([
      getMember(memberId),
      listMemberAttendance(memberId),
      listMemberPayments(memberId),
    ]);
    setMember(m);
    setAttendance(att);
    setPayments(pay);
  };

  const setStatus = async (status) => {
    setMember((m) => ({ ...m, status }));
    await updateMember(memberId, { status });
  };

  const setPricingTier = async (pricingTier) => {
    setMember((m) => ({ ...m, pricingTier }));
    await updateMember(memberId, { pricingTier });
  };

  const openAssign = async () => {
    const all = await listPackages({ activeOnly: true });
    // Only offer packages whose audience matches this member's pricing tier.
    setPackages(all.filter((p) => audienceAllows(p.audienceTier, member?.pricingTier)));
    setAssignVisible(true);
  };

  // Deep-link from Birthdays "Gift a pack": open the assign sheet once the member
  // has loaded (openAssign filters packages by the member's pricing tier).
  const autoAssignedRef = useRef(false);
  useEffect(() => {
    if (route.params?.openAssign && member && !autoAssignedRef.current) {
      autoAssignedRef.current = true;
      openAssign();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  const onAssignPackage = async (pkg) => {
    setAssignVisible(false);
    try {
      await assignPackage(memberId, pkg.id);
      await reloadMember();
    } catch (e) {
      Alert.alert(t("business.credits.audienceMismatchTitle"), t("business.credits.audienceMismatchMsg"));
    }
  };

  const confirmAdjust = async () => {
    const delta = adjust.delta;
    const reason = adjust.reason;
    setAdjust(null);
    await adjustCredits({ ...member, id: memberId }, delta, reason || "manual");
    await reloadMember();
  };

  const onMarkPresent = async () => {
    const res = await markPresent({ ...member, id: memberId });
    await reloadMember();
    if (res.creditDeducted) {
      Alert.alert(t("business.attendance.markedTitle"), t("business.attendance.markedCredit", { remaining: res.remaining }));
    } else if (res.noCredit) {
      // Recorded, but the member is out of credits (or expired) — prompt to renew/charge.
      Alert.alert(t("business.attendance.noCreditTitle"), t("business.attendance.noCreditMsg"));
    } else {
      Alert.alert(t("business.attendance.markedTitle"), t("business.attendance.marked"));
    }
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

        {/* Pricing tier (kinlo_business/05 §A) — locals get the special rate */}
        <View style={[styles.tierCard, { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}33` }]}>
          <View style={styles.tierHeader}>
            <Icon name="location" size={18} color={colors.primary} />
            <Text style={[styles.tierTitle, { color: colors.primary }]}>{t("business.pricingTier.title")}</Text>
          </View>
          <PricingTierToggle
            value={member.pricingTier || PRICING_TIER.GENERAL}
            onChange={setPricingTier}
            t={t}
          />
          <Text style={[styles.tierHint, { color: colors.textSecondary }]}>
            {t("business.pricingTier.memberHint", { name: (member.name || "").split(" ")[0] || t("business.members.unnamed") })}
          </Text>
        </View>

        {/* Hand-settable status */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.setStatus")}</Text>
        <View style={styles.statusRow}>
          {statusOptions.map((s) => {
            const active = (member.status || "active") === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}
              >
                <StatusPill status={s} size="sm" />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Credits / package */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.credits")}</Text>
        <CreditCard
          member={member}
          onAssign={openAssign}
          onPlus={() => setAdjust({ delta: 1, reason: "" })}
          onMinus={() => setAdjust({ delta: -1, reason: "" })}
        />

        {/* Attendance */}
        <View style={styles.attHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 0 }]}>{t("business.record.attendance")}</Text>
          <TouchableOpacity style={[styles.markBtn, { backgroundColor: colors.primary }]} onPress={onMarkPresent}>
            <Icon name="add" size={14} color="#fff" />
            <Text style={styles.markText}>{t("business.attendance.markPresent")}</Text>
          </TouchableOpacity>
        </View>
        {attendance.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyCardText, { color: colors.textTertiary }]}>{t("business.record.attendanceEmpty")}</Text>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {attendance.slice(0, 12).map((a, i) => (
              <View key={a.id} style={[styles.attRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.attTitle, { color: colors.text }]} numberOfLines={1}>
                  {a.classTitle || t("business.attendance.checkedIn")}
                </Text>
                <Text style={[styles.attDate, { color: colors.textTertiary }]}>{new Date(a.date).toLocaleDateString()}</Text>
                <Text style={[styles.attSource, { color: a.source === "qr" ? colors.success : colors.textTertiary }]}>
                  {a.source === "qr" ? t("business.attendance.qr") : t("business.attendance.manual")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Payments */}
        <View style={styles.attHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 0 }]}>{t("business.record.payments")}</Text>
          <TouchableOpacity style={[styles.markBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessPaymentForm", { memberId })}>
            <Icon name="add" size={14} color="#fff" />
            <Text style={styles.markText}>{t("business.record.recordPayment")}</Text>
          </TouchableOpacity>
        </View>
        {(member.balanceOwedCents || 0) > 0 && (
          <View style={[styles.balancePill, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}44` }]}>
            <Text style={[styles.balanceText, { color: colors.warning }]}>
              {t("business.record.balanceOwed", { amount: formatCentavos(member.balanceOwedCents) })}
            </Text>
          </View>
        )}
        {payments.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyCardText, { color: colors.textTertiary }]}>{t("business.record.paymentsEmpty")}</Text>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {payments.slice(0, 10).map((p, i) => (
              <View key={p.id} style={[styles.attRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.attTitle, { color: colors.text }]} numberOfLines={1}>{t(`business.payment.method.${p.method}`)}</Text>
                <Text style={[styles.attDate, { color: colors.textTertiary }]}>{new Date(p.date).toLocaleDateString()}</Text>
                <Text style={[styles.attSource, { color: colors.success }]}>{formatCentavos(p.amountCents)}</Text>
              </View>
            ))}
          </View>
        )}

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

        {/* Guest code → QR */}
        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.appAccess")}</Text>
        <GuestCodeCard
          code={member.inviteCode}
          businessName={business?.name}
          redeemed={!!member.redeemedAt}
          onRegenerate={member.redeemedAt ? null : onRegenerate}
        />

        {/* Notes */}
        {Array.isArray(member.notes) && member.notes.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.record.notes")}</Text>
            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

      {/* Assign-package modal */}
      <Modal visible={assignVisible} transparent animationType="slide" onRequestClose={() => setAssignVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.credits.pickPackage")}</Text>
              <TouchableOpacity onPress={() => setAssignVisible(false)}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {packages.length === 0 ? (
              <View style={{ paddingVertical: 30, alignItems: "center" }}>
                <Text style={{ color: colors.textTertiary, textAlign: "center" }}>{t("business.credits.noPackages")}</Text>
                <TouchableOpacity
                  style={[styles.createPkgBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setAssignVisible(false);
                    navigation.navigate("BusinessPackageForm", {});
                  }}
                >
                  <Text style={styles.createPkgText}>{t("business.packages.addFirst")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {packages.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pkgRow, { borderColor: colors.border }]}
                    onPress={() => onAssignPackage(p)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pkgName, { color: colors.text }]}>{p.name}</Text>
                      <Text style={[styles.pkgMeta, { color: colors.textTertiary }]}>
                        {t("business.packages.creditsCount", { count: p.credits || 0 })}
                        {` · ${p.priceCents ? formatCentavos(p.priceCents) : t("business.packages.free")}`}
                      </Text>
                    </View>
                    <Icon name="forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Credit adjust modal (with reason) */}
      <Modal visible={!!adjust} transparent animationType="fade" onRequestClose={() => setAdjust(null)}>
        <View style={styles.centerBackdrop}>
          <View style={[styles.adjustCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.adjustTitle, { color: colors.text }]}>
              {adjust?.delta > 0 ? t("business.credits.addCredit") : t("business.credits.removeCredit")}
            </Text>
            <TextInput
              style={[styles.reasonInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={adjust?.reason}
              onChangeText={(v) => setAdjust((a) => ({ ...a, reason: v }))}
              placeholder={t("business.credits.reasonPlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.adjustActions}>
              <TouchableOpacity style={[styles.adjustBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setAdjust(null)}>
                <Text style={[styles.adjustBtnText, { color: colors.textSecondary }]}>{t("business.common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.adjustBtn, { backgroundColor: colors.primary }]} onPress={confirmAdjust}>
                <Text style={[styles.adjustBtnText, { color: "#fff" }]}>{t("business.credits.apply")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    identity: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
    avatar: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 20, fontWeight: "800" },
    name: { fontSize: 20, fontWeight: "800" },
    contact: { fontSize: 12.5, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10 },
    tierCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 18 },
    tierHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    tierTitle: { fontSize: 15, fontWeight: "800" },
    tierHint: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
    statusRow: { flexDirection: "row", gap: 8 },
    statusChip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
    attHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
    markBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    markText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
    tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    tagText: { fontSize: 13, fontWeight: "600" },
    emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center" },
    emptyCardText: { fontSize: 12.5, textAlign: "center", lineHeight: 18 },
    balancePill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
    balanceText: { fontSize: 13, fontWeight: "700" },
    listCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
    attRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
    attTitle: { fontSize: 13.5, fontWeight: "600", flex: 1 },
    attDate: { fontSize: 12 },
    attSource: { fontSize: 11, fontWeight: "700" },
    noteRow: { paddingVertical: 12 },
    noteText: { fontSize: 13.5, lineHeight: 19 },
    deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 20, marginTop: 10 },
    deleteText: { fontSize: 14, fontWeight: "700" },
    // modals
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    pkgRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
    pkgName: { fontSize: 14.5, fontWeight: "700" },
    pkgMeta: { fontSize: 12, marginTop: 2 },
    createPkgBtn: { marginTop: 16, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 24 },
    createPkgText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    centerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 32 },
    adjustCard: { width: "100%", borderRadius: 20, padding: 20 },
    adjustTitle: { fontSize: 16, fontWeight: "800", marginBottom: 14 },
    reasonInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 16 },
    adjustActions: { flexDirection: "row", gap: 10 },
    adjustBtn: { flex: 1, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    adjustBtnText: { fontSize: 14, fontWeight: "700" },
  });
}
