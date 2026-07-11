/**
 * The Search filter controls (search text + city + category + price + language +
 * date range), extracted so they render BOTH inline in List mode and inside the
 * FiltersSheet in Map mode. The date-picker overlays stay at the screen level
 * (triggered via `setDatePicker`).
 */
import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import Icon from "../../components/Icon";
import FilterChips from "../../components/FilterChips";
import SelectDropdown from "../../components/SelectDropdown";
import { EVENT_LANGUAGES } from "../../utils/eventCategories";
import { formatISODate } from "../../utils/dateUtils";

const PRICE_OPTIONS = [
  { id: "all", label: "All type of events" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
];

export default function EventFilters({
  searchQuery,
  setSearchQuery,
  selectedLocation,
  setSelectedLocation,
  locations,
  selectedCategory,
  onCategoryChange,
  categoryOptions,
  priceFilter,
  setPriceFilter,
  languageFilter,
  setLanguageFilter,
  dateFrom,
  dateTo,
  setDatePicker,
  onClearDates,
  showSearch = true,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  return (
    <View>
      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <Icon name="search" size={20} color={colors.textTertiary} type="ui" />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t("searchEvents.searchPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      <FilterChips
        label={t("searchEvents.cityLabel")}
        value={selectedLocation}
        onValueChange={setSelectedLocation}
        options={locations}
        type="city"
      />

      <FilterChips
        label={t("searchEvents.communitiesLabel")}
        value={selectedCategory}
        onValueChange={onCategoryChange}
        options={categoryOptions}
        type="category"
      />

      <View style={styles.filtersRow}>
        <View style={styles.filterDropdown}>
          <SelectDropdown
            label={t("searchEvents.priceLabel")}
            value={priceFilter}
            onValueChange={setPriceFilter}
            options={PRICE_OPTIONS}
            placeholder={t("searchEvents.allPrices")}
          />
        </View>
        <View style={styles.filterDropdown}>
          <SelectDropdown
            label={t("searchEvents.languageLabel")}
            value={languageFilter}
            onValueChange={setLanguageFilter}
            options={EVENT_LANGUAGES}
            placeholder={t("searchEvents.allLanguages")}
            type="language"
            multiSelect
          />
        </View>
      </View>

      <View style={styles.filtersRow}>
        <View style={styles.filterDropdown}>
          <Text style={[styles.dateFilterLabel, { color: colors.textSecondary }]}>
            {t("searchEvents.from")}
          </Text>
          <TouchableOpacity
            style={[styles.dateFilterBtn, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
            onPress={() => setDatePicker("from")}
          >
            <Text style={{ color: dateFrom ? colors.text : colors.textTertiary }}>
              {dateFrom ? formatISODate(dateFrom.toISOString()) : t("searchEvents.anyDate")}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterDropdown}>
          <Text style={[styles.dateFilterLabel, { color: colors.textSecondary }]}>
            {t("searchEvents.to")}
          </Text>
          <TouchableOpacity
            style={[styles.dateFilterBtn, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
            onPress={() => setDatePicker("to")}
          >
            <Text style={{ color: dateTo ? colors.text : colors.textTertiary }}>
              {dateTo ? formatISODate(dateTo.toISOString()) : t("searchEvents.anyDate")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {(dateFrom || dateTo) && (
        <TouchableOpacity onPress={onClearDates} style={styles.clearDates}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>
            {t("searchEvents.clearDates")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Count the active (non-default) filters — drives the "Filters · N" pill badge.
 */
export const activeFilterCount = ({
  searchQuery,
  selectedLocation,
  selectedCategory,
  priceFilter,
  languageFilter,
  dateFrom,
  dateTo,
}) => {
  let n = 0;
  if (searchQuery && searchQuery.trim()) n++;
  if (selectedLocation && selectedLocation !== "all") n++;
  if (selectedCategory && selectedCategory !== "all") n++;
  if (priceFilter && priceFilter !== "all") n++;
  if (Array.isArray(languageFilter) && languageFilter.length < EVENT_LANGUAGES.length) n++;
  if (dateFrom || dateTo) n++;
  return n;
};

function createStyles(colors) {
  return StyleSheet.create({
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 20,
      gap: 12,
    },
    searchInput: { flex: 1, fontSize: 15 },
    filtersRow: { flexDirection: "row", marginBottom: 8, gap: 12 },
    filterDropdown: { flex: 1 },
    dateFilterLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    dateFilterBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    clearDates: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: 8 },
  });
}
