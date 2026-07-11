/**
 * MembersListScreen — the CRM member list (kinlo_business/01 §1).
 * Search, filter by status, add manually, import from CSV. Manual-first:
 * a cash/walk-in with no app account is a first-class member.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import MemberRow from "../../components/business/MemberRow";
import { useTheme } from "../../contexts/ThemeContext";
import { listMembers, summarizeMembers, MEMBER_STATUS } from "../../services/businessMembersService";

export default function MembersListScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);

  const load = useCallback(async () => {
    const rows = await listMembers();
    setMembers(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const summary = summarizeMembers(members);
  const filtered = members.filter((m) => {
    if (statusFilter && (m.status || "active") !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        (m.name || "").toLowerCase().includes(q) ||
        (m.phone || "").includes(q) ||
        (m.email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const chips = [
    { key: null, label: t("business.members.filterAll", { count: summary.total }) },
    { key: MEMBER_STATUS.ACTIVE, label: t("business.members.filterActive", { count: summary.active }) },
    { key: MEMBER_STATUS.AT_RISK, label: t("business.members.filterAtRisk", { count: summary.atRisk }) },
  ];

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.members.title")}</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("BusinessMemberForm", {})}
        >
          <Icon name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceGlass }]}>
          <Icon name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t("business.members.searchPlaceholder", { count: summary.total })}
            placeholderTextColor={colors.textTertiary}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.chipsRow}
      >
        {chips.map((c) => {
          const active = statusFilter === c.key;
          return (
            <TouchableOpacity
              key={c.label}
              onPress={() => setStatusFilter(c.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.text : colors.surfaceGlass,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.background : colors.textSecondary }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : members.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="users" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.members.emptyTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.members.emptyText")}</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BusinessMemberForm", {})}
          >
            <Text style={styles.ctaText}>{t("business.members.addFirst")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              onPress={() => navigation.navigate("BusinessMemberRecord", { memberId: item.id })}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.csvRow} onPress={() => navigation.navigate("BusinessCsvImport")}>
              <Icon name="add" size={16} color={colors.primary} />
              <Text style={[styles.csvText, { color: colors.primary }]}>{t("business.members.importCsv")}</Text>
            </TouchableOpacity>
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
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 10,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    searchWrap: { paddingHorizontal: 20, paddingBottom: 10 },
    searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, borderRadius: 20, paddingHorizontal: 14 },
    searchInput: { flex: 1, fontSize: 14 },
    chipsRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 10, alignItems: "center" },
    chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16 },
    chipText: { fontSize: 12.5, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    csvRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18 },
    csvText: { fontSize: 13.5, fontWeight: "700" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
