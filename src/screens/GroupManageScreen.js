import React, { useState, useEffect } from "react";
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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Check, Trash2, Share2, RotateCcw } from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
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
} from "../services/hostGroupService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function GroupManageScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { groupId } = route.params || {};
  const [group, setGroup] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
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
      Alert.alert("Couldn't update photo", e.message || "Please try again.");
    } finally {
      setSavingPhoto(false);
    }
  };

  useEffect(() => {
    (async () => {
      const [g, c] = await Promise.all([
        getGroup(groupId),
        getHostAttendeeCandidates(),
      ]);
      setGroup(g);
      setName(g?.name || "");
      setCandidates(c);
      if (g) setInviteCode(await ensureInviteCode(g));
      setLoading(false);
    })();
  }, [groupId]);

  const inviteLink = (code) => `bondvibe://join-group/${code}`;

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join my group "${name}" on BondVibe.\nOpen: ${inviteLink(
          inviteCode
        )}\nor enter code: ${inviteCode}`,
      });
    } catch (e) {
      // user cancelled
    }
  };

  const handleRegenerate = () => {
    Alert.alert(
      "New invite code?",
      "The current link/code will stop working.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: async () => setInviteCode(await regenerateInviteCode(groupId)),
        },
      ]
    );
  };

  const handleAddByEmail = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setAddingEmail(true);
    const user = await findUserByEmail(target);
    setAddingEmail(false);
    if (!user) {
      Alert.alert("Not found", "No BondVibe user with that email.");
      return;
    }
    if ((group.memberIds || []).includes(user.id)) {
      Alert.alert("Already a member", `${user.fullName || target} is already in the group.`);
      return;
    }
    await addMembers(groupId, [user.id]);
    setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), user.id] }));
    setEmail("");
    Alert.alert("Added", `${user.fullName || target} was added to the group.`);
  };

  const handleAddByPhone = async () => {
    const target = phone.trim();
    if (!target) return;
    setAddingPhone(true);
    const user = await findUserByPhone(target);
    setAddingPhone(false);
    if (!user) {
      Alert.alert("Not found", "No BondVibe user with that phone number.");
      return;
    }
    if ((group.memberIds || []).includes(user.id)) {
      Alert.alert("Already a member", `${user.fullName || target} is already in the group.`);
      return;
    }
    await addMembers(groupId, [user.id]);
    setGroup((g) => ({ ...g, memberIds: [...(g.memberIds || []), user.id] }));
    setPhone("");
    Alert.alert("Added", `${user.fullName || target} was added to the group.`);
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
    await updateGroup(groupId, { name: name.trim() });
    setSaving(false);
    setGroup((g) => ({ ...g, name: name.trim() }));
  };

  const handleDelete = () => {
    Alert.alert("Delete group?", "This removes the group and its chat for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Manage group</Text>
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
            {savingPhoto ? "Saving…" : "Change group photo"}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.textSecondary }]}>GROUP NAME</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            maxLength={50}
          />
          <TouchableOpacity onPress={handleSaveName} disabled={saving}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {saving ? "…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Invite link / code */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          INVITE
        </Text>
        <View style={styles.inviteBox}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.codeText, { color: colors.text }]}>{inviteCode}</Text>
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Share this code or link to let anyone join.
            </Text>
          </View>
          <TouchableOpacity onPress={handleRegenerate} style={styles.inviteIcon}>
            <RotateCcw size={18} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite} activeOpacity={0.85}>
          <View style={[styles.shareGlass, { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` }]}>
            <Share2 size={18} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.shareText, { color: colors.primary }]}>Share invite</Text>
          </View>
        </TouchableOpacity>

        {/* Add by email */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          ADD BY EMAIL
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
              {addingEmail ? "…" : "Add"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Add by phone */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          ADD BY PHONE
        </Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="+52 55 1234 5678"
            placeholderTextColor={colors.textTertiary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity onPress={handleAddByPhone} disabled={addingPhone}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {addingPhone ? "…" : "Add"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
          MEMBERS ({memberIds.length})
        </Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Tap an attendee to add or remove them.
        </Text>

        {candidates.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
            No past attendees yet. Once people join your events, they'll appear here.
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
                  {u.fullName || u.name || "Member"}
                </Text>
                {isMember ? (
                  <Check size={20} color={colors.primary} strokeWidth={2.5} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Add</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Trash2 size={18} color="#EF4444" strokeWidth={2} />
          <Text style={styles.deleteText}>Delete group</Text>
        </TouchableOpacity>
      </ScrollView>

      <AvatarPicker
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        currentAvatar={normAvatar(group?.avatar)}
        onAvatarChange={handleAvatarChange}
      />
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
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    photoWrap: { alignItems: "center", marginBottom: 20, gap: 8 },
    photoText: { fontSize: 14, fontWeight: "700" },
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
  });
}
