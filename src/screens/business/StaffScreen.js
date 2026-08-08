/**
 * StaffScreen — staff roles (kinlo_business/01 §7). Invite by email, set a
 * scoped role (owner / instructor / reception), and remove. Reception can't see
 * finance (enforced in rules).
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listStaff, inviteStaff, inviteStaffByHandle, updateStaffRole, setStaffName, removeStaff, getWorkingHours, setWorkingHours, listRoles, listStaffInvites, isValidHM, staffDisplayName, requestOwnerTransfer, findUnclaimedPlaceholderByName, claimPlaceholderStaff } from "../../services/businessStaffService";
import UserSearchField from "../../components/UserSearchField";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";

const weekdayShort = (i, lang) => new Date(2024, 0, 7 + i).toLocaleDateString(lang || "en", { weekday: "narrow" });

export default function StaffScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [staff, setStaff] = useState([]);
  const { loading, run } = useAsyncLoad();
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reception");
  const [roles, setRoles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [whEdit, setWhEdit] = useState(null); // { id, days, start, end }
  const [editStaff, setEditStaff] = useState(null); // { id, name, role, isOwner } (32.3)
  const [savingEdit, setSavingEdit] = useState(false);
  const [transferring, setTransferring] = useState(false); // owner-transfer sheet (32.4)
  const me = auth.currentUser?.uid;

  const assignable = roles.filter((r) => r.id !== "owner");
  // BUG 32.4: only the current owner sees the transfer entry.
  const iAmOwner = staff.find((s) => s.id === me)?.role === "owner";

  // Pick a recipient (validated host) and request the transfer — Kinlo admin
  // must approve before anything changes.
  const doTransfer = async (user) => {
    setTransferring(false);
    const res = await requestOwnerTransfer(user.uid || user.id);
    if (res.ok) {
      Alert.alert(t("business.staff.transfer.requestedTitle"), t("business.staff.transfer.requestedMsg", { name: user.name || `@${user.handle}` }));
    } else {
      const msg = res.error === "not_host" ? t("business.staff.transfer.notHost")
        : res.error === "pending" ? t("business.staff.transfer.alreadyPending")
          : t("business.common.tryAgain");
      Alert.alert(t("business.staff.transfer.failTitle"), msg);
    }
  };

  const openWorkingHours = (s) => {
    const wh = getWorkingHours(s);
    setWhEdit({ id: s.id, days: [...wh.days], start: wh.start, end: wh.end });
  };
  const toggleWhDay = (d) =>
    setWhEdit((w) => ({ ...w, days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] }));
  const saveWorkingHours = async () => {
    // Reject invalid 24h times (BUG 7.1).
    if (!isValidHM(whEdit.start) || !isValidHM(whEdit.end)) {
      Alert.alert(t("business.staff.invalidTime"));
      return;
    }
    await setWorkingHours(whEdit.id, { days: whEdit.days, start: whEdit.start.trim(), end: whEdit.end.trim() });
    setWhEdit(null);
    load();
  };

  const load = useCallback(
    () =>
      run(async () => {
        const [st, rl, iv] = await Promise.all([listStaff(), listRoles(), listStaffInvites()]);
        setStaff(st);
        setRoles(rl);
        setInvites(iv);
        setRole((cur) => (rl.some((r) => r.id === cur && r.id !== "owner") ? cur : (rl.find((r) => r.id !== "owner")?.id || "reception")));
      }),
    [run]
  );
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const roleName = (id) => roles.find((r) => r.id === id)?.name || t(`business.staff.role.${id}`, { defaultValue: id });

  // KIN-190 etapa 4: before adding someone for real, check whether the owner
  // already created a PLACEHOLDER for them (an event named them before they had
  // an account). If so, ask — never merge automatically — and on "yes" claim the
  // placeholder instead of creating a second row for the same human.
  // Resolves to true when the claim happened and the caller should stop.
  const claimedInsteadOfInviting = async (name, uid) => {
    if (!uid || !name) return false;
    const ph = await findUnclaimedPlaceholderByName(name);
    if (!ph) return false;
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        t("business.staff.samePersonTitle"),
        t("business.staff.samePersonMsg", { name: ph.name }),
        [
          { text: t("business.staff.samePersonNo"), style: "cancel", onPress: () => resolve(false) },
          { text: t("business.staff.samePersonYes"), onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
    if (!confirmed) return false;
    const res = await claimPlaceholderStaff(ph.id, uid, role);
    if (!res.ok) {
      Alert.alert(t("business.staff.failTitle"), t("business.common.tryAgain"));
      return true; // handled (and failed) — don't also run the normal invite
    }
    setInviting(false); setEmail(""); load();
    Alert.alert(
      t("business.staff.mergedTitle"),
      t("business.staff.mergedMsg", { name: ph.name, count: res.backfilled || 0 }),
    );
    return true;
  };

  // Add an existing app user to the team by @handle (spec 10).
  const doInviteByHandle = async (user) => {
    if (await claimedInsteadOfInviting(user.name || user.handle, user.uid)) return;
    const res = await inviteStaffByHandle(user.handle, role);
    if (res.ok) {
      setInviting(false); setEmail(""); load();
      Alert.alert(t("business.staff.invitedTitle"), t("business.staff.invitedMsg", { name: res.name || user.name || `@${user.handle}` }));
    } else {
      Alert.alert(t("business.staff.failTitle"), res.error === "self" ? t("business.staff.selfMsg") : t("business.common.tryAgain"));
    }
  };

  const doInvite = async () => {
    if (!email.trim()) { Alert.alert(t("business.staff.emailRequired")); return; }
    const res = await inviteStaff(email, role);
    if (res.ok && res.pending) {
      setInviting(false); setEmail(""); load();
      Alert.alert(t("business.staff.pendingTitle"), t("business.staff.pendingMsg", { email: email.trim() }));
    } else if (res.ok) {
      // The uid only exists once the server resolved a real account, so unlike
      // the @handle path the placeholder check has to run AFTER the invite. A
      // `pending` invite (branch above) has no account to merge into yet.
      if (await claimedInsteadOfInviting(res.name || email, res.uid)) return;
      setInviting(false); setEmail(""); load();
      Alert.alert(t("business.staff.invitedTitle"), t("business.staff.invitedMsg", { name: res.name || email }));
    } else {
      Alert.alert(t("business.staff.failTitle"), res.error === "self" ? t("business.staff.selfMsg") : t("business.common.tryAgain"));
    }
  };

  // BUG 32.3: the pencil now opens a name + role edit sheet (was a role-only
  // alert). Allowed for every row including the owner/self — the owner's role
  // stays locked (a business always needs an owner).
  const openEdit = (s) => {
    setEditStaff({
      id: s.id,
      name: s.displayName || s.name || "",
      role: s.role,
      isOwner: s.role === "owner",
    });
  };
  const saveEdit = async () => {
    if (!editStaff) return;
    setSavingEdit(true);
    try {
      await setStaffName(editStaff.id, editStaff.name);
      if (!editStaff.isOwner && editStaff.role) {
        await updateStaffRole(editStaff.id, editStaff.role);
      }
    } finally {
      setSavingEdit(false);
      setEditStaff(null);
      load();
    }
  };

  const remove = (s) =>
    Alert.alert(t("business.staff.removeTitle"), t("business.staff.removeMsg", { name: staffDisplayName(s, t("business.staff.member")) }), [
      { text: t("business.common.cancel"), style: "cancel" },
      { text: t("business.staff.remove"), style: "destructive", onPress: () => removeStaff(s.id).then(load) },
    ]);

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.staff.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setInviting(true)}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.staff.hint")}</Text>

          <TouchableOpacity
            style={[styles.rolesEntry, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate("BusinessRoles")}
          >
            <View style={[styles.rolesIcon, { backgroundColor: colors.brandSoft }]}><Icon name="settings" size={17} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rolesTitle, { color: colors.text }]}>{t("business.roles.title")}</Text>
              <Text style={[styles.rolesSub, { color: colors.textTertiary }]}>{t("business.roles.entrySub")}</Text>
            </View>
            <Icon name="forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          {invites.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.staff.pendingSection")}</Text>
              {invites.map((iv) => (
                <View key={iv.id} style={[styles.inviteRow, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                  <Icon name="clock" size={15} color={colors.warning} />
                  <Text style={[styles.inviteEmail, { color: colors.text }]} numberOfLines={1}>{iv.email}</Text>
                  <Text style={[styles.inviteRole, { color: colors.textTertiary }]}>{roleName(iv.role)}</Text>
                </View>
              ))}
            </>
          )}

          {staff.map((s) => {
            const wh = getWorkingHours(s);
            const canHaveHours = (s.role === "owner" || s.role === "instructor") && s.status !== "invited";
            return (
              <View key={s.id} style={[styles.cardWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]}>{staffDisplayName(s, t("business.staff.member"))}</Text>
                    <Text style={[styles.email, { color: colors.textTertiary }]} numberOfLines={1}>{s.email}</Text>
                    {s.status === "invited" && (
                      <View style={styles.pendingChip}>
                        <Icon name="clock" size={11} color={colors.warning} />
                        <Text style={[styles.pendingText, { color: colors.warning }]}>{t("business.staff.pendingAcceptance")}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: s.role === "owner" ? `${colors.primary}18` : colors.surfaceGlass }]}>
                    <Text style={[styles.roleText, { color: s.role === "owner" ? colors.primary : colors.textSecondary }]}>{roleName(s.role)}</Text>
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity onPress={() => openEdit(s)}><Icon name="edit" size={18} color={colors.textSecondary} /></TouchableOpacity>
                    {s.role !== "owner" && s.id !== me && (
                      <TouchableOpacity onPress={() => remove(s)}><Icon name="close" size={18} color={colors.error} /></TouchableOpacity>
                    )}
                  </View>
                </View>
                {canHaveHours && (
                  <TouchableOpacity style={[styles.whRow, { borderTopColor: colors.border }]} onPress={() => openWorkingHours(s)}>
                    <Icon name="clock" size={15} color={colors.textTertiary} />
                    <Text style={[styles.whText, { color: colors.textSecondary }]}>
                      {t("business.staff.workingHours")}: {wh.start}–{wh.end} · {wh.days.map((d) => weekdayShort(d, i18n.language)).join("")}
                    </Text>
                    <Icon name="edit" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Transfer ownership (BUG 32.4) — owner only; admin-approved. */}
          {iAmOwner && (
            <TouchableOpacity
              style={[styles.transferRow, { borderColor: colors.border }]}
              onPress={() => setTransferring(true)}
              activeOpacity={0.85}
            >
              <Icon name="refresh" size={17} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.transferTitle, { color: colors.text }]}>{t("business.staff.transfer.entry")}</Text>
                <Text style={[styles.transferSub, { color: colors.textTertiary }]}>{t("business.staff.transfer.entrySub")}</Text>
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Transfer ownership sheet (32.4) — pick a validated host. */}
      <Modal visible={transferring} transparent animationType="slide" onRequestClose={() => setTransferring(false)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.transfer.entry")}</Text>
              <TouchableOpacity onPress={() => setTransferring(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>{t("business.staff.transfer.sheetHint")}</Text>
            <UserSearchField placeholder={t("business.staff.handlePlaceholder")} onSelect={doTransfer} maxHeight={220} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={inviting} transparent animationType="slide" onRequestClose={() => setInviting(false)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.invite")}</Text><TouchableOpacity onPress={() => setInviting(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>{t("business.staff.pickRole")}</Text>
            <View style={styles.roleWrap}>
              {assignable.map((r) => {
                const on = role === r.id;
                return <TouchableOpacity key={r.id} onPress={() => setRole(r.id)} style={[styles.roleChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : "transparent" }]}><Text style={[styles.segText, { color: on ? colors.primary : colors.textSecondary }]}>{r.name}</Text></TouchableOpacity>;
              })}
            </View>
            {/* Add by @handle: search an existing app user → add with the role above. */}
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginBottom: 8 }]}>{t("business.staff.addByHandle")}</Text>
            <UserSearchField placeholder={t("business.staff.handlePlaceholder")} onSelect={doInviteByHandle} maxHeight={200} />
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 14, marginBottom: 8 }]}>{t("business.staff.orByEmail")}</Text>
            <TextInput style={[styles.input, inputStyle]} value={email} onChangeText={setEmail} placeholder={t("business.staff.emailPlaceholder")} placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={doInvite}><Text style={styles.saveText}>{t("business.staff.sendInvite")}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Working-hours editor (frames the Agenda's default range) */}
      <Modal visible={!!whEdit} transparent animationType="slide" onRequestClose={() => setWhEdit(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.workingHours")}</Text><TouchableOpacity onPress={() => setWhEdit(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 10 }]}>{t("business.staff.workingDays")}</Text>
            <View style={styles.dayRow}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = whEdit?.days.includes(d);
                return (
                  <TouchableOpacity key={d} onPress={() => toggleWhDay(d)} style={[styles.dayChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : "transparent" }]}>
                    <Text style={[styles.dayChipText, { color: on ? colors.primary : colors.textSecondary }]}>{weekdayShort(d, i18n.language)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 6 }]}>{t("business.staff.startTime")}</Text>
                <TextInput style={[styles.input, inputStyle, { marginBottom: 0 }]} value={whEdit?.start} onChangeText={(v) => setWhEdit((w) => ({ ...w, start: v }))} placeholder="07:00" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 6 }]}>{t("business.staff.endTime")}</Text>
                <TextInput style={[styles.input, inputStyle, { marginBottom: 0 }]} value={whEdit?.end} onChangeText={(v) => setWhEdit((w) => ({ ...w, end: v }))} placeholder="20:00" placeholderTextColor={colors.textTertiary} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 8 }]}>{t("business.staff.timeFormatHint")}</Text>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveWorkingHours}><Text style={styles.saveText}>{t("business.agenda.save")}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit staff — name + role (BUG 32.3). Owner role is locked. */}
      <Modal visible={!!editStaff} transparent animationType="slide" onRequestClose={() => setEditStaff(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.editTitle")}</Text>
              <TouchableOpacity onPress={() => setEditStaff(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>{t("business.staff.nameLabel")}</Text>
            <TextInput
              style={[styles.input, inputStyle]}
              value={editStaff?.name}
              onChangeText={(v) => setEditStaff((e) => ({ ...e, name: v }))}
              placeholder={t("business.staff.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              maxLength={60}
            />
            {!editStaff?.isOwner && (
              <>
                <Text style={[styles.roleHint, { color: colors.textTertiary, marginBottom: 8 }]}>{t("business.staff.pickRole")}</Text>
                <View style={styles.roleWrap}>
                  {assignable.map((r) => {
                    const on = editStaff?.role === r.id;
                    return (
                      <TouchableOpacity key={r.id} onPress={() => setEditStaff((e) => ({ ...e, role: r.id }))} style={[styles.roleChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : "transparent" }]}>
                        <Text style={[styles.segText, { color: on ? colors.primary : colors.textSecondary }]}>{r.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: savingEdit ? 0.6 : 1 }]} onPress={saveEdit} disabled={savingEdit}>
              <Text style={styles.saveText}>{savingEdit ? t("business.agenda.saving") : t("business.agenda.save")}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    hint: { fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
    card: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    cardWrap: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: "hidden" },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    whRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 11 },
    whText: { flex: 1, fontSize: 12.5, fontWeight: "600" },
    dayRow: { flexDirection: "row", gap: 6 },
    dayChip: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    dayChipText: { fontSize: 12, fontWeight: "800" },
    timeRow: { flexDirection: "row", gap: 12, marginTop: 14 },
    name: { fontSize: 15, fontWeight: "700" },
    email: { fontSize: 12, marginTop: 2 },
    pendingChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    pendingText: { fontSize: 11.5, fontWeight: "700" },
    transferRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginTop: 6,
    },
    transferTitle: { fontSize: 14.5, fontWeight: "700" },
    transferSub: { fontSize: 12, marginTop: 2 },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    roleText: { fontSize: 11.5, fontWeight: "700" },
    actions: { flexDirection: "row", gap: 12, marginLeft: 4 },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
    segRow: { flexDirection: "row", gap: 8 },
    seg: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
    segText: { fontSize: 13.5, fontWeight: "700" },
    rolesEntry: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
    rolesIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    rolesTitle: { fontSize: 14.5, fontWeight: "800" },
    rolesSub: { fontSize: 12, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    inviteRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
    inviteEmail: { flex: 1, fontSize: 13.5, fontWeight: "600" },
    inviteRole: { fontSize: 12, fontWeight: "700" },
    roleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    roleChip: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
    roleHint: { fontSize: 12, lineHeight: 17, marginTop: 10 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 14 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
