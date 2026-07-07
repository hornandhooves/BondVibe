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
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { subscribeUserGroups } from "../services/hostGroupService";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

export default function CommunityChatsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <Text style={[TYPE.titleLg, { color: colors.text }]}>Community chats</Text>
        <View style={{ width: 26 }} />
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
                  {(item.name || "C").trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[TYPE.bodySemibold, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name || "Community"}
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
                    {(item.memberIds?.length || 0)} member
                    {(item.memberIds?.length || 0) === 1 ? "" : "s"}
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
              No communities yet — join one with an invite code.
            </Text>
          }
        />
      )}
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
  });
}
