import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import { getHostGroups, createGroup } from "../services/hostGroupService";
import { AvatarDisplay } from "../components/AvatarPicker";
import { usePremium } from "../hooks/usePremium";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const FREE_GROUP_LIMIT = 1;

export default function HostGroupsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isPremium } = usePremium();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setGroups(await getHostGroups());
    setLoading(false);
  };

  const openCreate = () => {
    if (!isPremium && groups.length >= FREE_GROUP_LIMIT) {
      Alert.alert(
        t("hostGroups.unlockUnlimitedGroups"),
        t("hostGroups.unlockUnlimitedGroupsMessage"),
        [
          { text: t("hostGroups.notNow"), style: "cancel" },
          { text: t("hostGroups.goPro"), onPress: () => navigation.navigate("BondVibePro") },
        ]
      );
      return;
    }
    setModalVisible(true);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await createGroup(name, description, []);
      if (r.success) {
        setModalVisible(false);
        setName("");
        setDescription("");
        load();
        // Go straight to managing members.
        navigation.navigate("GroupManage", { groupId: r.groupId });
      } else {
        Alert.alert(t("hostGroups.couldntCreateGroup"), r.error || t("hostGroups.pleaseTryAgain"));
      }
    } catch (e) {
      Alert.alert(t("hostGroups.couldntCreateGroup"), t("hostGroups.pleaseTryAgain"));
    } finally {
      setCreating(false);
    }
  };

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("hostGroups.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t("hostGroups.introText")}
          </Text>

          <TouchableOpacity style={styles.newBtn} onPress={openCreate} activeOpacity={0.85}>
            <View style={[styles.newGlass, { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` }]}>
              <Icon name="plus" size={20} color={colors.primary} />
              <Text style={[styles.newText, { color: colors.primary }]}>{t("hostGroups.newGroup")}</Text>
            </View>
          </TouchableOpacity>

          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="users" size={44} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("hostGroups.noGroupsYet")}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("hostGroups.noGroupsYetSubtitle")}
              </Text>
            </View>
          ) : (
            groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.card}
                onPress={() => navigation.navigate("GroupChat", { groupId: g.id })}
                activeOpacity={0.85}
              >
                {g.avatar ? (
                  <AvatarDisplay avatar={normAvatar(g.avatar)} size={40} />
                ) : (
                  <View style={styles.iconCircle}>
                    <Icon name="users" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t("hostGroups.memberCount", { count: g.memberIds?.length || 0 })}
                    {g.lastMessage ? ` · ${g.lastMessage}` : ""}
                  </Text>
                </View>
                <Icon name="forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t("hostGroups.newGroup")}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder={t("hostGroups.groupNamePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              maxLength={50}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 70 }]}
              placeholder={t("hostGroups.descriptionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("hostGroups.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} disabled={creating}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {creating ? t("hostGroups.creating") : t("hostGroups.create")}
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
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    intro: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
    newBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 20 },
    newGlass: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      paddingVertical: 14,
    },
    newText: { fontSize: 16, fontWeight: "700" },
    empty: { alignItems: "center", paddingVertical: 30 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 16,
      marginBottom: 12,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}1F`,
    },
    name: { fontSize: 16, fontWeight: "700" },
    meta: { fontSize: 13, marginTop: 2 },
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
    modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 12,
    },
    modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  });
}
