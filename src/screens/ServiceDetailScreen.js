import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import { formatCentavos } from "../utils/pricing";
import { getListing, getListingBusiness } from "../services/marketplaceService";
import { getMembershipPlan } from "../services/membershipService";
import { VERTICAL_META } from "./MarketplaceExploreScreen";

const capacityKindKey = (n) =>
  n <= 1 ? "marketplace.detail.oneToOne" : n === 2 ? "marketplace.detail.couple" : "marketplace.detail.group";
const locationKey = (m) =>
  m === "at_customer"
    ? "marketplace.detail.atCustomer"
    : m === "online"
    ? "marketplace.detail.online"
    : "marketplace.detail.atStudio";

export default function ServiceDetailScreen({ route, navigation }) {
  const { bizId, listingId } = route.params || {};
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors, isDark);

  const [listing, setListing] = useState(null);
  const [business, setBusiness] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [l, b] = await Promise.all([getListing(bizId, listingId), getListingBusiness(bizId)]);
      setListing(l);
      setBusiness(b);
      // Plan variant (P2): a service linked to a membership plan → reuse the
      // existing membership checkout instead of a per-slot booking.
      if (l && l.planPackageId) {
        try {
          setPlan(await getMembershipPlan(l.planPackageId));
        } catch (e) {
          /* plan unavailable — falls back to slot/quote */
        }
      }
      setLoading(false);
    })();
  }, [bizId, listingId]);

  if (loading) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 120 }} />
      </View>
    );
  }
  if (!listing) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background, paddingTop: 120, alignItems: "center" }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Text style={{ color: colors.textSecondary, fontFamily: FONTS.bodyMedium }}>
          {t("marketplace.detail.notFound")}
        </Text>
      </View>
    );
  }

  const meta = VERTICAL_META[listing.vertical] || VERTICAL_META.wellness;
  const isPlan = !!plan;
  const isQuote = !isPlan && (listing.bookingMode === "quote" || !listing.priceCents);
  const priceCents = isPlan ? plan.priceCentavos || 0 : listing.priceCents;
  const ctaLabel = isPlan
    ? t("marketplace.detail.viewPlan")
    : isQuote
    ? t("marketplace.detail.requestQuote")
    : t("marketplace.detail.bookSlot");

  const onBook = () => {
    if (isPlan) {
      // Plan → the existing membership checkout (multi-session package).
      navigation.navigate("MembershipCheckout", { plan });
    } else if (isQuote) {
      // Quote / free → the existing on-demand request flow (host confirms).
      navigation.navigate("BusinessRequestSession", {
        bizId,
        businessName: business?.name || listing.name,
      });
    } else {
      // Paid slot → the transactional reserve-and-pay checkout (M4).
      navigation.navigate("ServiceCheckout", { bizId, listingId: listing.id });
    }
  };

  return (
    <View style={[s.fill, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: meta.bg }]}>
          {listing.photos[0] ? (
            <Image source={{ uri: listing.photos[0] }} style={s.heroImg} resizeMode="cover" />
          ) : (
            <Icon name={meta.icon} size={64} color={meta.fg} />
          )}
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="back" size={22} color="#171523" />
          </TouchableOpacity>
        </View>

        <View style={s.body}>
          <Text style={[s.eyebrow, { color: meta.fg }]}>
            {t(`marketplace.vertical.${listing.vertical || "wellness"}`)} · {t(capacityKindKey(listing.capacityMax))} ·{" "}
            {t(locationKey(listing.locationMode))}
          </Text>
          <Text style={[s.title, { color: colors.text }]}>{listing.name}</Text>
          {!!listing.city && (
            <Text style={[s.sub, { color: colors.textSecondary }]}>{listing.city}</Text>
          )}

          {/* Spec tiles */}
          <View style={s.specs}>
            <SpecTile s={s} colors={colors} emoji="⏱️" label={t("marketplace.detail.duration", { min: listing.durationMin })} />
            <SpecTile s={s} colors={colors} emoji="👤" label={t(capacityKindKey(listing.capacityMax))} />
            <SpecTile s={s} colors={colors} emoji="📍" label={t(locationKey(listing.locationMode))} />
          </View>

          {/* Host card */}
          {!!business && (
            <View style={[s.hostCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[s.hostAvatar, { backgroundColor: colors.brandSoft }]}>
                <Icon name="user" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.hostName, { color: colors.text }]} numberOfLines={1}>
                  {t("marketplace.detail.hostedBy", { name: business.name || "Kinlo" })}
                </Text>
              </View>
              {business.verified && (
                <View style={[s.verifiedPill, { backgroundColor: colors.successBg }]}>
                  <Icon name="verified" size={13} color={colors.success} />
                  <Text style={[s.verifiedTxt, { color: colors.success }]}>
                    {t("marketplace.detail.verified")}
                  </Text>
                </View>
              )}
            </View>
          )}

          {!!listing.description && (
            <Text style={[s.desc, { color: colors.textSecondary }]}>{listing.description}</Text>
          )}

          {/* P3: per-vertical intake preview (Home/Auto fieldsSchema). */}
          {Array.isArray(listing.fieldsSchema) && listing.fieldsSchema.length > 0 && (
            <View style={s.intake}>
              <Text style={[s.intakeTitle, { color: colors.textSecondary }]}>{t("marketplace.intake.title")}</Text>
              <View style={s.intakeChips}>
                {listing.fieldsSchema.map((f) => (
                  <View key={f} style={[s.intakeChip, { backgroundColor: colors.brandSoft }]}>
                    <Text style={[s.intakeChipTxt, { color: colors.primary }]}>{t(`marketplace.intake.${f}`)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky book bar */}
      <View style={[s.bookBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View>
          <Text style={[s.priceLabel, { color: colors.textSecondary }]}>
            {isPlan
              ? t("marketplace.detail.plan")
              : listing.bookingMode === "quote"
              ? t("marketplace.detail.quoteFree")
              : isQuote
              ? t("marketplace.detail.free")
              : t("marketplace.detail.fromPrice", { price: "" }).trim()}
          </Text>
          {(isPlan || !isQuote) && (
            <Text style={[s.price, { color: colors.text }]}>{formatCentavos(priceCents)}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.cta, { backgroundColor: colors.primary }]}
          activeOpacity={0.9}
          onPress={onBook}
        >
          <Text style={s.ctaTxt}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SpecTile({ s, colors, emoji, label }) {
  return (
    <View style={[s.specTile, { borderColor: colors.border }]}>
      <Text style={s.specEmoji}>{emoji}</Text>
      <Text style={[s.specLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    fill: { flex: 1 },
    hero: { height: 210, alignItems: "center", justifyContent: "center" },
    heroImg: { width: "100%", height: "100%" },
    backBtn: {
      position: "absolute",
      top: 52,
      left: 16,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.92)",
      alignItems: "center",
      justifyContent: "center",
    },
    body: { paddingHorizontal: 18, paddingTop: 18 },
    eyebrow: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
    title: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.5, color: colors.text },
    sub: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, marginTop: 3 },
    specs: { flexDirection: "row", gap: 10, marginTop: 18 },
    specTile: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    specEmoji: { fontSize: 20, marginBottom: 6 },
    specLabel: { fontFamily: FONTS.bodyBold, fontSize: 11.5 },
    hostCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      marginTop: 18,
    },
    hostAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    hostName: { fontFamily: FONTS.bodyBold, fontSize: 14 },
    verifiedPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    verifiedTxt: { fontFamily: FONTS.bodyBold, fontSize: 10.5 },
    desc: { fontFamily: FONTS.bodyMedium, fontSize: 14, lineHeight: 21, marginTop: 18 },
    intake: { marginTop: 20 },
    intakeTitle: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
    intakeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    intakeChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    intakeChipTxt: { fontFamily: FONTS.bodySemibold, fontSize: 12.5 },
    bookBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 26,
    },
    priceLabel: { fontFamily: FONTS.bodyMedium, fontSize: 12 },
    price: { fontFamily: FONTS.display, fontSize: 20, letterSpacing: -0.5, marginTop: 1 },
    cta: { borderRadius: 25, paddingVertical: 15, paddingHorizontal: 30 },
    ctaTxt: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 15 },
  });
}
