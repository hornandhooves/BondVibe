/**
 * BusinessHubScreen — home of the Kinlo for Business module (Pro-gated upstream
 * in ManageScreen). Loads the host's business; routes first-timers to setup,
 * otherwise lists the module areas. Areas light up block by block.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs } from "firebase/firestore";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import ListRow from "../../components/ListRow";
import SectionHeader from "../../components/SectionHeader";
import ProBadge from "../../components/ProBadge";
import { useTheme } from "../../contexts/ThemeContext";
import { ELEVATION, RADII, SPACING } from "../../constants/theme-tokens";
import { db, auth } from "../../services/firebase";
import { getBusiness } from "../../services/businessService";
import { useBusinessScope } from "../../contexts/BusinessScopeContext";
import useBusinessPerms from "../../hooks/useBusinessPerms";
import { verticalLabelKey } from "../../constants/businessVerticals";

export default function BusinessHubScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isEventScoped, event: scopeEvent, setEventScope, setWholeBusiness } = useBusinessScope();
  const { allows } = useBusinessPerms(); // owner → all; staff → their role's perms
  const [business, setBusiness] = useState(undefined); // undefined=loading, null=none
  const [pickerOpen, setPickerOpen] = useState(false);
  const [events, setEvents] = useState([]);

  const openEventPicker = useCallback(async () => {
    setPickerOpen(true);
    try {
      const uid = auth.currentUser?.uid;
      const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", uid)));
      const rows = snap.docs
        .map((d) => ({ id: d.id, title: d.data().title || "Event", date: d.data().date }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setEvents(rows);
    } catch (e) {
      setEvents([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getBusiness().then((b) => alive && setBusiness(b));
      return () => {
        alive = false;
      };
    }, [])
  );

  const styles = createStyles(colors);

  if (business === undefined) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  // First run — no business yet.
  if (business === null) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.hub.title")}</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="wallet" size={34} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.hub.setupTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.hub.setupText")}</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BusinessSetup")}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>{t("business.hub.setupCta")}</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  const card = [styles.card, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {business.name}
            </Text>
            <ProBadge tier="pro" />
          </View>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]}>
            {t(verticalLabelKey(business.vertical))}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("BusinessSetup")}>
          <Icon name="settings" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Scope filter (kinlo_business/06 FIX 1): whole business or one event. */}
        <View style={[styles.scopeTrack, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.scopeSeg, !isEventScoped && { backgroundColor: colors.primary }]}
            onPress={setWholeBusiness}
            activeOpacity={0.85}
          >
            <Text style={[styles.scopeText, { color: !isEventScoped ? "#fff" : colors.textSecondary }]}>
              {t("business.hub.scopeWhole")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeSeg, isEventScoped && { backgroundColor: colors.primary }]}
            onPress={openEventPicker}
            activeOpacity={0.85}
          >
            <Text style={[styles.scopeText, { color: isEventScoped ? "#fff" : colors.textSecondary }]} numberOfLines={1}>
              {isEventScoped ? scopeEvent.title : t("business.hub.scopeEvent")}
            </Text>
            <Icon name="down" size={14} color={isEventScoped ? "#fff" : colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {isEventScoped && (
          <TouchableOpacity style={styles.scopeClear} onPress={setWholeBusiness}>
            <Text style={[styles.scopeClearText, { color: colors.primary }]}>{t("business.hub.scopeClear")}</Text>
          </TouchableOpacity>
        )}

        <SectionHeader title={t("business.hub.overviewSection")} />
        <View style={card}>
          <ListRow
            icon="chart"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.dashboardTitle")}
            subtitle={t("business.hub.dashboardSubtitle")}
            onPress={() => navigation.navigate("BusinessDashboard")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.peopleMoneySection")} />
        <View style={card}>
          <ListRow
            icon="users"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.membersTitle")}
            titleBadge={t("business.hub.crmBadge")}
            subtitle={t("business.hub.membersSubtitle", { count: business.memberCount || 0 })}
            onPress={() => navigation.navigate("BusinessMembers")}
          />
          <ListRow
            icon="ticket"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.packagesTitle")}
            subtitle={t("business.hub.packagesSubtitle")}
            onPress={() => navigation.navigate("BusinessPackages")}
          />
          {allows("finance") && (
            <ListRow
              icon="dollar"
              iconColor={colors.success}
              iconBg={`${colors.success}1A`}
              title={t("business.hub.financeTitle")}
              subtitle={t("business.hub.financeSubtitle")}
              onPress={() => navigation.navigate("BusinessFinance")}
            />
          )}
          <ListRow
            icon="qr"
            iconColor={colors.success}
            iconBg={`${colors.success}1A`}
            title={t("business.hub.checkInTitle")}
            subtitle={t("business.hub.checkInSubtitle")}
            onPress={() => navigation.navigate("BusinessCheckIn")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.programmingSection")} />
        <View style={card}>
          <ListRow
            icon="calendar"
            iconColor={colors.error}
            iconBg={`${colors.error}1A`}
            title={t("business.hub.classesTitle")}
            titleBadge={t("business.hub.newBadge")}
            subtitle={t("business.hub.classesSubtitle")}
            onPress={() => navigation.navigate("BusinessClasses")}
          />
          <ListRow
            icon="calendarCheck"
            iconColor={colors.error}
            iconBg={`${colors.error}1A`}
            title={t("business.hub.agendaTitle")}
            titleBadge={t("business.hub.newBadge")}
            subtitle={t("business.hub.agendaSubtitle")}
            onPress={() => navigation.navigate("BusinessAgendaDay")}
          />
          <ListRow
            icon="clock"
            iconColor={colors.error}
            iconBg={`${colors.error}1A`}
            title={t("business.hub.sessionsTitle")}
            subtitle={t("business.hub.sessionsSubtitle")}
            onPress={() => navigation.navigate("BusinessAgenda")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.retentionOrgSection")} />
        <View style={card}>
          {allows("momentum") && (
            <ListRow
              icon="analytics"
              iconColor={colors.warning}
              iconBg={`${colors.warning}1A`}
              title={t("business.hub.momentumTitle")}
              subtitle={t("business.hub.momentumSubtitle")}
              onPress={() => navigation.navigate("MomentumBoard")}
            />
          )}
          {allows("automations") && (
            <ListRow
              icon="broadcast"
              iconColor={colors.warning}
              iconBg={`${colors.warning}1A`}
              title={t("business.hub.automationsTitle")}
              subtitle={t("business.hub.automationsSubtitle")}
              onPress={() => navigation.navigate("BusinessAutomations")}
            />
          )}
          {allows("branches") && (
            <ListRow
              icon="location"
              iconColor={colors.textSecondary}
              iconBg={`${colors.textTertiary}22`}
              title={t("business.hub.branchesTitle")}
              subtitle={t("business.hub.branchesSubtitle")}
              onPress={() => navigation.navigate("BusinessBranches")}
            />
          )}
          {allows("staff") && (
            <ListRow
              icon="users"
              iconColor={colors.textSecondary}
              iconBg={`${colors.textTertiary}22`}
              title={t("business.hub.staffTitle")}
              subtitle={t("business.hub.staffSubtitle")}
              onPress={() => navigation.navigate("BusinessStaff")}
              divider={false}
            />
          )}
        </View>
      </ScrollView>

      {/* Event picker for "This event" scope */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.hub.pickEvent")}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {events.length === 0 ? (
                <Text style={{ color: colors.textTertiary, textAlign: "center", paddingVertical: 24 }}>
                  {t("business.hub.noEvents")}
                </Text>
              ) : (
                events.map((ev) => (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.eventRow, { borderColor: colors.border }]}
                    onPress={() => {
                      setEventScope({ id: ev.id, title: ev.title });
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
                    <Text style={[styles.eventDate, { color: colors.textTertiary }]}>
                      {ev.date ? new Date(ev.date).toLocaleDateString() : ""}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 20, fontWeight: "800", flexShrink: 1 },
    headerSub: { fontSize: 12, marginTop: 1 },
    content: { paddingBottom: SPACING.xxxl },
    scopeTrack: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 4, gap: 4, marginHorizontal: SPACING.screen, marginTop: SPACING.sm },
    scopeSeg: { flex: 1, height: 40, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
    scopeText: { fontSize: 13.5, fontWeight: "800" },
    scopeClear: { alignSelf: "flex-end", marginHorizontal: SPACING.screen, marginTop: 6 },
    scopeClearText: { fontSize: 12.5, fontWeight: "700" },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    eventRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14, gap: 12 },
    eventName: { fontSize: 15, fontWeight: "600", flex: 1 },
    eventDate: { fontSize: 12.5 },
    card: { borderRadius: RADII.card, borderWidth: 1, marginHorizontal: SPACING.screen, overflow: "hidden" },
    soon: { fontSize: 12.5, textAlign: "center", marginTop: 20, paddingHorizontal: 40, lineHeight: 18 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 18 },
    emptyTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 22 },
    cta: { borderRadius: 26, paddingVertical: 15, paddingHorizontal: 32 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
