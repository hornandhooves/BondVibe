/**
 * CommunityChatsScreen — the group chats for every community (host group) you
 * belong to. Reached from the Inbox "Community chats" row; each row opens that
 * community's GroupChat. Live-updates as you join/leave.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { subscribeUserGroups, createGroup, joinGroupByCode } from "../services/hostGroupService";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";
import useUserRole from "../hooks/useUserRole";
import { isApprovedHost } from "../utils/hostGate";

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

export default function CommunityChatsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  // Create a community + join-by-code, both reachable here (BUG 22).
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Creating a community requires an approved host (unified gate — same as
  // marketplace/rentals). Joining by code stays open to everyone. (BUG 42)
  const onCreatePress = () => {
    if (approved) {
      setCreateOpen(true);
      return;
    }
    Alert.alert(t("hostGate.title"), t("hostGate.body"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("hostGate.cta"), onPress: () => navigation.navigate("RequestHost") },
    ]);
  };

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await createGroup(name, description, []);
    setBusy(false);
    if (r.success) {
      setCreateOpen(false);
      setName("");
      setDescription("");
      // Straight to management: the host sees the join code + can invite by
      // email/phone there (BUG 22).
      navigation.navigate("GroupManage", { groupId: r.groupId });
    } else {
      Alert.alert(t("communityChats.couldntCreate"), r.error || t("communityChats.tryAgain"));
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    const r = await joinGroupByCode(joinCode);
    setBusy(false);
    if (r.success) {
      setJoinOpen(false);
      setJoinCode("");
      if (r.groupId) navigation.navigate("GroupChat", { groupId: r.groupId });
    } else {
      Alert.alert(t("communityChats.couldntJoin"), r.error || t("communityChats.tryAgain"));
    }
  };

  useEffect(() => {
    const unsub = subscribeUserGroups((list) => {
      setGroups(
        [...list].sort(
          (a, b) =>
            (b.lastMessageAt?.toMillis?.() || 0) -
            (a.lastMessageAt?.toMillis?.() || 0)
        )
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("communityChats.title")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity onPress={() => setJoinOpen(true)} hitSlop={hit} testID="community-join">
            <Icon name="ticket" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onCreatePress} hitSlop={hit} testID="community-create">
            <Icon name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                ELEVATION.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => navigation.navigate("GroupChat", { groupId: item.id })}
              activeOpacity={0.8}
            >
              <View style={[styles.initial, { backgroundColor: colors.brandSoft }]}>
                <Text style={[TYPE.bodySemibold, { color: colors.primary }]}>
                  {(item.name || t("communityChats.defaultName")).trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[TYPE.bodySemibold, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name || t("communityChats.defaultName")}
                </Text>
                {item.lastMessage ? (
                  <Text
                    style={[TYPE.caption, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </Text>
                ) : (
                  <Text
                    style={[TYPE.caption, { color: colors.textTertiary }]}
                    numberOfLines={1}
                  >
                    {t("communityChats.memberCount", { count: item.memberIds?.length || 0 })}
                  </Text>
                )}
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text
              style={[TYPE.caption, styles.emptyText, { color: colors.textTertiary }]}
            >
              {t("communityChats.empty")}
            </Text>
          }
        />
      )}

      {/* Create a community chat (BUG 22) */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t("communityChats.createTitle")}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={name}
              onChangeText={setName}
              placeholder={t("communityChats.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t("communityChats.descPlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("communityChats.createHint")}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setCreateOpen(false)}>
                <Text style={[styles.btnText, { color: colors.textSecondary }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: name.trim() ? 1 : 0.5 }]} onPress={handleCreate} disabled={busy || !name.trim()}>
                <Text style={[styles.btnText, { color: "#fff" }]}>{busy ? t("communityChats.creating") : t("communityChats.create")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join a community by its code (BUG 22 — the invitee accepts by joining) */}
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t("communityChats.joinTitle")}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder={t("communityChats.codePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setJoinOpen(false)}>
                <Text style={[styles.btnText, { color: colors.textSecondary }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: joinCode.trim() ? 1 : 0.5 }]} onPress={handleJoin} disabled={busy || !joinCode.trim()}>
                <Text style={[styles.btnText, { color: "#fff" }]}>{busy ? t("communityChats.joining") : t("communityChats.join")}</Text>
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.screen,
      paddingTop: 60,
      paddingBottom: SPACING.md,
    },
    list: {
      paddingHorizontal: SPACING.screen,
      paddingBottom: SPACING.xxxl,
      paddingTop: SPACING.sm,
      gap: SPACING.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      borderRadius: RADII.card,
      borderWidth: 1,
      padding: SPACING.card,
    },
    initial: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { textAlign: "center", marginTop: 40 },
    backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 28 },
    card: { width: "100%", borderRadius: 20, padding: 20 },
    cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
    hint: { fontSize: 12, marginBottom: 6 },
    actions: { flexDirection: "row", gap: 10, marginTop: 8 },
    btn: { flex: 1, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    btnText: { fontSize: 14, fontWeight: "800" },
  });
}
