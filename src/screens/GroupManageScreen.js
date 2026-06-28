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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Check, UserMinus, Trash2 } from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import {
  getGroup,
  updateGroup,
  addMembers,
  removeMember,
  deleteGroup,
  getHostAttendeeCandidates,
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

  useEffect(() => {
    (async () => {
      const [g, c] = await Promise.all([
        getGroup(groupId),
        getHostAttendeeCandidates(),
      ]);
      setGroup(g);
      setName(g?.name || "");
      setCandidates(c);
      setLoading(false);
    })();
  }, [groupId]);

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
    label: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    hint: { fontSize: 13, lineHeight: 18 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 12 },
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
