import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Share,
  Switch,
  Modal,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import PhoneInput from "../components/PhoneInput";
import UserSearchField from "../components/UserSearchField";
import { resolveGroupAvatar } from "../services/storageService";
import {
  getGroup,
  updateGroup,
  addMembers,
  removeMember,
  deleteGroup,
  getHostAttendeeCandidates,
  ensureInviteCode,
  regenerateInviteCode,
  findUserByEmail,
  findUserByPhone,
  blockUserInGroup,
} from "../services/hostGroupService";
import { uploadReportEvidence } from "../services/storageService";
import { useAsyncLoad } from "../hooks/useAsyncLoad";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function GroupManageScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { groupId } = route.params || {};
  const [group, setGroup] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [name, setName] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [savingSpotify, setSavingSpotify] = useState(false);
  const { loading, run } = useAsyncLoad();
  const [saving, setSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [phone, setPhone] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const handleAvatarChange = async (avatar) => {
    setShowAvatarPicker(false);
    setSavingPhoto(true);
    try {
      const saved = await resolveGroupAvatar(avatar, groupId);
      await updateGroup(groupId, { avatar: saved });
      setGroup((g) => ({ ...g, avatar: saved }));
    } catch (e) {
      Alert.alert(t("groupManage.couldntUpdatePhoto"), e.message || t("groupManage.pleaseTryAgain"));
    } finally {
      setSavingPhoto(false);
    }
  };

  useEffect(() => {
    run(async () => {
      const [g, c] = await Promise.all([
        getGroup(groupId),
        getHostAttendeeCandidates(),
      ]);
      setGroup(g);
      setName(g?.name || "");
      setSpotifyUrl(g?.spotifyUrl || "");
      setCandidates(c);
      if (g) setInviteCode(await ensureInviteCode(g));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const inviteLink = (code) => `kinlo://join-group/${code}`;

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: t("groupManage.shareInviteMessage", {
          name,
          link: inviteLink(inviteCode),
          code: inviteCode,
        }),
      });
    } catch (e) {
      // user cancelled
    }
  };

  // A valid Spotify PLAYLIST link — not just any spotify.com URL (BUG 41).
  const SPOTIFY_PLAYLIST_RE = /(open\.spotify\.com\/playlist\/|spotify:playlist:)/i;

  const applySpotify = async (url) => {
    setSavingSpotify(true);
    try {
      await updateGroup(groupId, { spotifyUrl: url });
      setGroup((g) => ({ ...g, spotifyUrl: url }));
      // Title matches the action — never "Saved" for a removal.
      Alert.alert(
        url ? t("groupManage.saved") : t("groupManage.playlistRemovedToast"),
        url ? t("groupManage.spotifyPlaylistSaved") : undefined
      );
    } catch (e) {
      Alert.alert(t("groupManage.couldntSave"), e.message || t("groupManage.pleaseTryAgain"));
    } finally {
      setSavingSpotify(false);
    }
  };

  const handleSaveSpotify = () => {
    const url = spotifyUrl.trim();
    const hadPlaylist = !!(group?.spotifyUrl || "").trim();

    if (!url) {
      // Empty field — nothing to save.
      if (!hadPlaylist) return; // no-op: there was no playlist to remove
      // Removing an existing playlist — confirm first.
      Alert.alert(t("groupManage.removePlaylistTitle"), undefined, [
        { text: t("groupManage.cancel"), style: "cancel" },
        { text: t("groupManage.removePlaylist"), style: "destructive", onPress: () => applySpotify("") },
      ]);
      return;
    }

    // Non-empty — require a valid Spotify playlist link before saving.
    if (!SPOTIFY_PLAYLIST_RE.test(url)) {
      Alert.alert(t("groupManage.invalidSpotifyLink"), t("groupManage.invalidLinkMessage"));
      return;
    }
    applySpotify(url);
  };

  const handleRegenerate = () => {
    Alert.alert(
      t("groupManage.newInviteCode"),
      t("groupManage.newInviteCodeMessage"),
      [
        { text: t("groupManage.cancel"), style: "cancel" },
        {
          text: t("groupManage.generate"),
          onPress: async () => setInviteCode(await regenerateInviteCode(groupId)),
        },
      ]
    );
  };

  // Add a member by @handle (spec 10) — the search returns app users directly.
  const handleAddByHandle = async (user) => {
    if ((group.memberIds || []).includes(user.uid)) {
      Alert.alert(t("groupManage.alreadyAMember"), t("groupManage.alreadyAMemberMessage", { name: user.name || `@${user.handle}` }));
      return;
    }
    await addMembers(groupId, [user.uid]);
    setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), user.uid] }));
    Alert.alert(t("groupManage.added"), t("groupManage.addedMessage", { name: user.name || `@${user.handle}` }));
  };

  const handleAddByEmail = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setAddingEmail(true);
    try {
      const user = await findUserByEmail(target);
      if (!user) {
        Alert.alert(
          t("groupManage.notOnKinloYet"),
          t("groupManage.notOnKinloYetMessage", { target }),
          [
            { text: t("groupManage.cancel"), style: "cancel" },
            { text: t("groupManage.sendInvite"), onPress: () => handleShareInvite(target) },
          ]
        );
        return;
      }
      if ((group.memberIds || []).includes(user.id)) {
        Alert.alert(t("groupManage.alreadyAMember"), t("groupManage.alreadyAMemberMessage", { name: user.fullName || target }));
        return;
      }
      await addMembers(groupId, [user.id]);
      setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), user.id] }));
      setEmail("");
      Alert.alert(t("groupManage.added"), t("groupManage.addedMessage", { name: user.fullName || target }));
    } catch (e) {
      Alert.alert(t("groupManage.couldntUpdate"), t("groupManage.pleaseTryAgain"));
    } finally {
      setAddingEmail(false);
    }
  };

  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockEvidence, setBlockEvidence] = useState(null);
  const [blocking, setBlocking] = useState(false);

  const pickEvidence = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]) setBlockEvidence(res.assets[0].uri);
  };

  const confirmBlock = async () => {
    if (!blockTarget) return;
    setBlocking(true);
    try {
      let evidenceUrl = null;
      if (blockEvidence) evidenceUrl = await uploadReportEvidence(groupId, blockEvidence);
      await blockUserInGroup(groupId, blockTarget.id, {
        reason: blockReason.trim(),
        evidenceUrl,
      });
      setGroup((g) => ({
        ...g,
        memberIds: (g.memberIds || []).filter((m) => m !== blockTarget.id),
        blockedIds: [...(g.blockedIds || []), blockTarget.id],
      }));
      setBlockTarget(null);
      setBlockReason("");
      setBlockEvidence(null);
      Alert.alert(
        t("groupManage.userBlocked"),
        t("groupManage.userBlockedMessage")
      );
    } catch (e) {
      Alert.alert(t("groupManage.couldntBlock"), e.message || t("groupManage.pleaseTryAgain"));
    } finally {
      setBlocking(false);
    }
  };

  const handleToggleHostOnly = async (value) => {
    setGroup((g) => ({ ...g, hostOnly: value }));
    try {
      await updateGroup(groupId, { hostOnly: value });
    } catch (e) {
      setGroup((g) => ({ ...g, hostOnly: !value }));
      Alert.alert(t("groupManage.couldntUpdate"), e.message || t("groupManage.pleaseTryAgain"));
    }
  };

  const handleAddByPhone = async () => {
    const target = phone.trim();
    if (!target) return;
    setAddingPhone(true);
    try {
      const user = await findUserByPhone(target);
      if (!user) {
        Alert.alert(
          t("groupManage.notOnKinloYet"),
          t("groupManage.notOnKinloYetMessage", { target }),
          [
            { text: t("groupManage.cancel"), style: "cancel" },
            { text: t("groupManage.sendInvite"), onPress: () => handleShareInvite(target) },
          ]
        );
        return;
      }
      if ((group.memberIds || []).includes(user.id)) {
        Alert.alert(t("groupManage.alreadyAMember"), t("groupManage.alreadyAMemberMessage", { name: user.fullName || target }));
        return;
      }
      await addMembers(groupId, [user.id]);
      setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), user.id] }));
      setPhone("");
      Alert.alert(t("groupManage.added"), t("groupManage.addedMessage", { name: user.fullName || target }));
    } catch (e) {
      Alert.alert(t("groupManage.couldntUpdate"), t("groupManage.pleaseTryAgain"));
    } finally {
      setAddingPhone(false);
    }
  };

  const memberIds = group?.memberIds || [];

  const toggleMember = async (uid) => {
    if (memberIds.includes(uid)) {
      await removeMember(groupId, uid);
      setGroup((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== uid) }));
    } else {
      await addMembers(groupId, [uid]);
      setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), uid] }));
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // KIN-95 #1: updateGroup() is a bare updateDoc with no internal
      // try/catch (unlike createGroup right above it in the same service
      // file) — this handler was the one place in this screen that forgot
      // to guard it, leaving Save permanently stuck on rejection.
      await updateGroup(groupId, { name: name.trim() });
      setGroup((g) => ({ ...g, name: name.trim() }));
    } catch (e) {
      Alert.alert(t("groupManage.couldntUpdate"), t("groupManage.pleaseTryAgain"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t("groupManage.deleteGroupConfirmTitle"), t("groupManage.deleteGroupMessage"), [
      { text: t("groupManage.cancel"), style: "cancel" },
      {
        text: t("groupManage.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteGroup(groupId);
          navigation.navigate("HostGroups");
        },
      },
    ]);
  };

  const styles = createStyles(colors, isDark);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("groupManage.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.photoWrap}
          onPress={() => setShowAvatarPicker(true)}
          disabled={savingPhoto}
          activeOpacity={0.85}
        >
          <AvatarDisplay avatar={normAvatar(group?.avatar)} size={84} />
          <Text style={[styles.photoText, { color: colors.primary }]}>
            {savingPhoto ? t("groupManage.saving") : t("groupManage.changeGroupPhoto")}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t("groupManage.groupName")}</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            maxLength={50}
          />
          <TouchableOpacity onPress={handleSaveName} disabled={saving}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {saving ? "…" : t("groupManage.save")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Invite link / code */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.invite")}
        </Text>
        <View style={styles.inviteBox}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.codeText, { color: colors.text }]}>{inviteCode}</Text>
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {t("groupManage.inviteHint")}
            </Text>
          </View>
          <TouchableOpacity onPress={handleRegenerate} style={styles.inviteIcon}>
            <Icon name="rotate" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite} activeOpacity={0.85}>
          <View style={[styles.shareGlass, { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` }]}>
            <Icon name="share" size={18} color={colors.primary} />
            <Text style={[styles.shareText, { color: colors.primary }]}>{t("groupManage.shareInvite")}</Text>
          </View>
        </TouchableOpacity>

        {/* Spotify playlist */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.spotifyPlaylist")}
        </Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder={t("groupManage.spotifyPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            value={spotifyUrl}
            onChangeText={setSpotifyUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={handleSaveSpotify} disabled={savingSpotify}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {savingSpotify ? "…" : t("groupManage.save")}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {t("groupManage.spotifyHint")}
        </Text>

        {/* Posting mode */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.posting")}
        </Text>
        <View style={[styles.hostOnlyRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>
              {t("groupManage.onlyHostCanPost")}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
              {t("groupManage.onlyHostCanPostHint")}
            </Text>
          </View>
          <Switch
            value={!!group?.hostOnly}
            onValueChange={handleToggleHostOnly}
            trackColor={{ true: colors.primary }}
          />
        </View>

        {/* Add by @handle (spec 10) */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.addByHandle")}
        </Text>
        <UserSearchField placeholder={t("userSearch.placeholder")} onSelect={handleAddByHandle} maxHeight={200} />

        {/* Add by email */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.addByEmail")}
        </Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="person@email.com"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity onPress={handleAddByEmail} disabled={addingEmail}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {addingEmail ? "…" : t("groupManage.add")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Add by phone */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.addByPhone")}
        </Text>
        <View style={styles.nameRow}>
          <PhoneInput value={phone} onChangeText={setPhone} style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleAddByPhone} disabled={addingPhone}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {addingPhone ? "…" : t("groupManage.add")}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          {t("groupManage.membersCount", { count: memberIds.length })}
        </Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {t("groupManage.tapAttendeeHint")}
        </Text>

        {candidates.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
            {t("groupManage.noPastAttendeesYet")}
          </Text>
        ) : (
          candidates.map((u) => {
            const isMember = memberIds.includes(u.id);
            return (
              <TouchableOpacity
                key={u.id}
                testID={`candidate-${u.id}`}
                style={[
                  styles.row,
                  isMember && { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
                ]}
                onPress={() => toggleMember(u.id)}
                activeOpacity={0.8}
              >
                <AvatarDisplay avatar={normAvatar(u.avatar)} size={36} />
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                  {u.fullName || u.name || t("groupManage.member")}
                </Text>
                {isMember ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <TouchableOpacity
                      onPress={() => setBlockTarget(u)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Icon name="block" size={18} color="#EF4444" />
                    </TouchableOpacity>
                    <Icon name="check" size={20} color={colors.primary} />
                  </View>
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("groupManage.add")}</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Icon name="delete" size={18} color="#EF4444" />
          <Text style={styles.deleteText}>{t("groupManage.deleteGroup")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AvatarPicker
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        currentAvatar={normAvatar(group?.avatar)}
        onAvatarChange={handleAvatarChange}
      />

      <Modal
        visible={!!blockTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setBlockTarget(null)}
      >
        <View style={styles.blockOverlay}>
          <View style={[styles.blockCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.blockTitle, { color: colors.text }]}>
              {t("groupManage.blockUserTitle", { name: blockTarget?.fullName || blockTarget?.name || t("groupManage.user") })}
            </Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
              {t("groupManage.blockUserDescription")}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 70 }]}
              placeholder={t("groupManage.reasonPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              maxLength={300}
            />
            <TouchableOpacity style={styles.evidenceBtn} onPress={pickEvidence}>
              <Icon name="imagePlus" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                {blockEvidence ? t("groupManage.changeEvidence") : t("groupManage.addEvidenceOptional")}
              </Text>
            </TouchableOpacity>
            {blockEvidence && (
              <Image source={{ uri: blockEvidence }} style={styles.evidencePreview} />
            )}
            <View style={styles.blockActions}>
              <TouchableOpacity
                onPress={() => {
                  setBlockTarget(null);
                  setBlockReason("");
                  setBlockEvidence(null);
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  {t("groupManage.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmBlock} disabled={blocking}>
                <Text style={{ color: "#EF4444", fontWeight: "700" }}>
                  {blocking ? t("groupManage.blocking") : t("groupManage.blockUser")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    photoWrap: { alignItems: "center", marginBottom: 20, gap: 8 },
    photoText: { fontSize: 14, fontWeight: "700" },
    hostOnlyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
    },
    label: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    hint: { fontSize: 13, lineHeight: 18 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    inviteBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 14,
      marginBottom: 10,
    },
    codeText: { fontSize: 22, fontWeight: "800", letterSpacing: 3 },
    inviteIcon: { padding: 6 },
    shareBtn: { borderRadius: 12, overflow: "hidden" },
    shareGlass: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      paddingVertical: 12,
    },
    shareText: { fontSize: 15, fontWeight: "700" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 12,
      marginBottom: 10,
    },
    rowName: { flex: 1, fontSize: 15, fontWeight: "600" },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 28,
      paddingVertical: 12,
    },
    deleteText: { color: "#EF4444", fontWeight: "700", fontSize: 15 },
    blockOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    blockCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
    },
    blockTitle: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
    evidenceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
    },
    evidencePreview: { width: 120, height: 120, borderRadius: 12, marginBottom: 8 },
    blockActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 12,
    },
  });
}
