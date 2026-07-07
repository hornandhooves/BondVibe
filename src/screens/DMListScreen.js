/**
 * DMListScreen — the user's 1:1 conversations, most recent first. Blocked users
 * are hidden.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { db, auth } from "../services/firebase";
import { getMyThreads } from "../services/dmService";
import { getBlockedIds } from "../services/blockService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function DMListScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const me = auth.currentUser?.uid;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [threads, blocked] = await Promise.all([getMyThreads(), getBlockedIds()]);
        const resolved = await Promise.all(
          threads.map(async (thread) => {
            const otherUid = (thread.users || []).find((u) => u !== me);
            if (!otherUid || blocked.includes(otherUid)) return null;
            const s = await getDoc(doc(db, "users", otherUid));
            const u = s.exists() ? s.data() : {};
            return {
              id: thread.id,
              otherUid,
              name: u.fullName || u.name || t("inbox.defaultUserName"),
              avatar: u.avatar,
              lastMessage: thread.lastMessage || "",
            };
          })
        );
        setRows(resolved.filter(Boolean));
        setLoading(false);
      })();
    }, [])
  );

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("inbox.title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="chat" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("inbox.noMessagesYet")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("DMChat", {
                  threadId: item.id,
                  otherUid: item.otherUid,
                  name: item.name,
                })
              }
            >
              <AvatarDisplay avatar={normAvatar(item.avatar)} size={50} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                {!!item.lastMessage && (
                  <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                )}
              </View>
              <Icon name="forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        />
      )}
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
    name: { fontSize: 16, fontWeight: "700" },
    preview: { fontSize: 13.5, marginTop: 2 },
    empty: { alignItems: "center", marginTop: 70, paddingHorizontal: 40, gap: 12 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
}
