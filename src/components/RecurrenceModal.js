import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import DateTimePicker from "@react-native-community/datetimepicker";
import { generateMoonPhaseDates } from "../utils/lunarUtils";
import { formatDate as fmtDate } from "../utils/formatDate";

// Days of the week (ids only; display strings are translated at render time)
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

// Week of month option ids
const WEEK_OPTIONS = ["first", "second", "third", "fourth", "last"];

// Day of month options (1-28)
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

// Lunar phase option ids
const LUNAR_OPTIONS = [
  { id: "full", icon: "moon" },
  { id: "new", icon: "moon" },
];

// Recurrence type option ids
const RECURRENCE_TYPES = ["none", "daily", "weekly", "biweekly", "monthly", "lunar"];

// Monthly mode option ids
const MONTHLY_MODES = ["dayOfWeek", "dayOfMonth"];

export default function RecurrenceModal({
  visible,
  onClose,
  onSave,
  initialConfig,
  startDate: initialStartDate,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  // State
  const [recurrenceType, setRecurrenceType] = useState(initialConfig?.type || "none");
  const [selectedDays, setSelectedDays] = useState(initialConfig?.selectedDays || []);
  const [weekOfMonth, setWeekOfMonth] = useState(initialConfig?.weekOfMonth || "first");
  const [monthlyMode, setMonthlyMode] = useState(initialConfig?.monthlyMode || "dayOfWeek");
  const [dayOfMonth, setDayOfMonth] = useState(initialConfig?.dayOfMonth || 1);
  const [lunarPhase, setLunarPhase] = useState(initialConfig?.lunarPhase || "full");
  
  // Start date state (managed in modal)
  const [startDate, setStartDate] = useState(() => {
    if (initialConfig?.startDate) return new Date(initialConfig.startDate);
    if (initialStartDate) return new Date(initialStartDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0);
    return tomorrow;
  });
  
  const [endDate, setEndDate] = useState(() => {
    if (initialConfig?.endDate) return new Date(initialConfig.endDate);
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 3);
    return defaultEnd;
  });
  
  // Date picker state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [activePicker, setActivePicker] = useState(null); // 'start' or 'end'
  
  // Day of month picker state
  const [showDayOfMonthPicker, setShowDayOfMonthPicker] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setRecurrenceType(initialConfig?.type || "none");
      setSelectedDays(initialConfig?.selectedDays || []);
      setWeekOfMonth(initialConfig?.weekOfMonth || "first");
      setMonthlyMode(initialConfig?.monthlyMode || "dayOfWeek");
      setDayOfMonth(initialConfig?.dayOfMonth || 1);
      setLunarPhase(initialConfig?.lunarPhase || "full");
      
      if (initialConfig?.startDate) {
        setStartDate(new Date(initialConfig.startDate));
      } else if (initialStartDate) {
        setStartDate(new Date(initialStartDate));
      }
      
      if (initialConfig?.endDate) {
        setEndDate(new Date(initialConfig.endDate));
      }
    }
  }, [visible, initialConfig, initialStartDate]);

  // Auto-select day based on start date
  useEffect(() => {
    if (startDate && (recurrenceType === "biweekly" || (recurrenceType === "monthly" && monthlyMode === "dayOfWeek"))) {
      const dayOfWeek = startDate.getDay();
      if (selectedDays.length === 0 || !selectedDays.includes(dayOfWeek)) {
        setSelectedDays([dayOfWeek]);
      }
    }
    if (startDate && recurrenceType === "monthly" && monthlyMode === "dayOfMonth") {
      const day = startDate.getDate();
      if (day <= 28) {
        setDayOfMonth(day);
      }
    }
  }, [recurrenceType, monthlyMode, startDate]);

  
  // Helper: Check if date is nth day of month
  const isNthDayOfMonth = (date, week, targetDay) => {
    if (date.getDay() !== targetDay) return false;
    const dom = date.getDate();
    const month = date.getMonth();

    if (week === "last") {
      const nextWeek = new Date(date);
      nextWeek.setDate(dom + 7);
      return nextWeek.getMonth() !== month;
    }

    const weekNumber = Math.ceil(dom / 7);
    const weekMap = { first: 1, second: 2, third: 3, fourth: 4 };
    return weekNumber === weekMap[week];
  };

  // Generate preview dates
  const previewDates = useMemo(() => {
    if (recurrenceType === "none") return [startDate];
    
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const maxPreview = 52;
    
    if (recurrenceType === "lunar") {
      return generateMoonPhaseDates(start, end, lunarPhase).slice(0, maxPreview);
    }
    
    if (recurrenceType === "monthly" && monthlyMode === "dayOfMonth") {
      const current = new Date(start);
      current.setDate(1);
      while (current <= end && dates.length < maxPreview) {
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        // Use target day or last day of month if target doesn't exist
        const actualDay = Math.min(dayOfMonth, daysInMonth);
        const eventDate = new Date(current.getFullYear(), current.getMonth(), actualDay);
        eventDate.setHours(start.getHours(), start.getMinutes(), 0, 0);
        if (eventDate >= start && eventDate <= end) {
          dates.push(new Date(eventDate));
        }
        current.setMonth(current.getMonth() + 1);
      }
      return dates;
    }
    
    if (selectedDays.length === 0 && recurrenceType !== "lunar") return [];
    
    let current = new Date(start);
    let iterations = 0;
    const maxIterations = 365;
    
    while (current <= end && dates.length < maxPreview && iterations < maxIterations) {
      iterations++;
      const dayOfWeek = current.getDay();
      
      if (recurrenceType === "daily" || recurrenceType === "weekly") {
        if (selectedDays.includes(dayOfWeek)) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      } else if (recurrenceType === "biweekly") {
        if (selectedDays.includes(dayOfWeek)) {
          dates.push(new Date(current));
          current.setDate(current.getDate() + 14);
        } else {
          current.setDate(current.getDate() + 1);
        }
      } else if (recurrenceType === "monthly" && monthlyMode === "dayOfWeek") {
        if (isNthDayOfMonth(current, weekOfMonth, selectedDays[0])) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
    }
    
    return dates;
  }, [recurrenceType, selectedDays, weekOfMonth, monthlyMode, dayOfMonth, lunarPhase, startDate, endDate]);

  // Toggle day selection
  const toggleDay = (dayId) => {
    if (recurrenceType === "biweekly" || (recurrenceType === "monthly" && monthlyMode === "dayOfWeek")) {
      setSelectedDays([dayId]);
    } else {
      setSelectedDays((prev) =>
        prev.includes(dayId)
          ? prev.filter((d) => d !== dayId)
          : [...prev, dayId].sort((a, b) => a - b)
      );
    }
  };

  // Quick select
  const selectWeekdays = () => setSelectedDays([1, 2, 3, 4, 5]);
  const selectWeekends = () => setSelectedDays([0, 6]);


  // Format date
  // Aliased: this component already has local formatDate/formatDateShort names.
  const formatDate = (date) =>
    fmtDate(date, { month: "short", day: "numeric", year: "numeric" });

  const formatDateShort = (date) =>
    fmtDate(date, { weekday: "short", month: "short", day: "numeric" });

  // Get ordinal suffix
  const getOrdinalSuffix = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  // Get summary text
  const getSummaryText = () => {
    if (recurrenceType === "none") return t("recurrenceModal.summaryOneTime");

    if (recurrenceType === "lunar") {
      return lunarPhase === "full"
        ? t("recurrenceModal.summaryEveryFullMoon")
        : t("recurrenceModal.summaryEveryNewMoon");
    }

    if (recurrenceType === "monthly" && monthlyMode === "dayOfMonth") {
      return t("recurrenceModal.summaryDayOfMonth", {
        day: dayOfMonth,
        suffix: getOrdinalSuffix(dayOfMonth),
      });
    }

    if (selectedDays.length === 0) return t("recurrenceModal.summarySelectDays");
    const dayNames = selectedDays.map((d) => t(`recurrenceModal.days.${DAY_KEYS[d]}.short`)).join(", ");

    switch (recurrenceType) {
      case "daily":
        if (selectedDays.length === 7) return t("recurrenceModal.summaryEveryDay");
        if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([1,2,3,4,5])) return t("recurrenceModal.summaryWeekdays");
        if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([0,6])) return t("recurrenceModal.summaryWeekends");
        return t("recurrenceModal.summaryEveryDays", { days: dayNames });
      case "weekly":
        return t("recurrenceModal.summaryWeekly", { days: dayNames });
      case "biweekly":
        return t("recurrenceModal.summaryBiweekly", { days: dayNames });
      case "monthly": {
        const weekLabel = t(`recurrenceModal.weekOptions.${weekOfMonth}`);
        const dayFull = t(`recurrenceModal.days.${DAY_KEYS[selectedDays[0]]}.full`);
        return t("recurrenceModal.summaryMonthly", { week: weekLabel, day: dayFull });
      }
      default:
        return "";
    }
  };

  // Handle save
  const handleSave = () => {
    const config = {
      type: recurrenceType,
      selectedDays,
      weekOfMonth: recurrenceType === "monthly" && monthlyMode === "dayOfWeek" ? weekOfMonth : null,
      monthlyMode: recurrenceType === "monthly" ? monthlyMode : null,
      dayOfMonth: recurrenceType === "monthly" && monthlyMode === "dayOfMonth" ? dayOfMonth : null,
      lunarPhase: recurrenceType === "lunar" ? lunarPhase : null,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      eventCount: previewDates.length,
      summary: getSummaryText(),
      previewDates: previewDates.map(d => d.toISOString()),
    };
    onSave(config);
    onClose();
  };

  // Date picker handlers
  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowStartDatePicker(false);
      setShowEndDatePicker(false);
      if (event.type === "set" && selectedDate) {
        if (activePicker === "start") {
          const newDate = new Date(selectedDate);
          newDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
          setStartDate(newDate);
        } else {
          setEndDate(selectedDate);
        }
      }
      setActivePicker(null);
    } else {
      if (selectedDate) setTempDate(selectedDate);
    }
  };

  const confirmDateSelection = () => {
    if (activePicker === "start") {
      const newDate = new Date(tempDate);
      newDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      setStartDate(newDate);
      setShowStartDatePicker(false);
    } else {
      setEndDate(tempDate);
      setShowEndDatePicker(false);
    }
    setActivePicker(null);
  };

  const openStartDatePicker = () => {
    setTempDate(startDate);
    setActivePicker("start");
    setShowStartDatePicker(true);
  };

  const openEndDatePicker = () => {
    setTempDate(endDate);
    setActivePicker("end");
    setShowEndDatePicker(true);
  };

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.headerButton, { color: colors.textSecondary }]}>{t("recurrenceModal.cancel")}</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t("recurrenceModal.eventFrequency")}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>{t("recurrenceModal.done")}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Recurrence Type Selection */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.frequency")}</Text>
              {RECURRENCE_TYPES.map((typeId) => (
                <TouchableOpacity
                  key={typeId}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor: recurrenceType === typeId ? `${colors.primary}22` : colors.surfaceGlass,
                      borderColor: recurrenceType === typeId ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setRecurrenceType(typeId);
                    if (typeId === "none") setSelectedDays([]);
                  }}
                >
                  <View style={styles.typeOptionContent}>
                    <Text style={[styles.typeLabel, { color: recurrenceType === typeId ? colors.primary : colors.text }]}>
                      {t(`recurrenceModal.types.${typeId}.label`)}
                    </Text>
                    {typeId !== "none" && (
                      <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{t(`recurrenceModal.types.${typeId}.description`)}</Text>
                    )}
                  </View>
                  {recurrenceType === typeId && (
                    <Icon name="check" size={20} color={colors.primary} type="ui" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Start Date (always show for recurring) */}
            {recurrenceType !== "none" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.startDate")}</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                  onPress={openStartDatePicker}
                >
                  <Icon name="calendar" size={20} color={colors.primary} type="ui" />
                  <Text style={[styles.dateButtonText, { color: colors.text }]}>{formatDate(startDate)}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Lunar Phase Selection */}
            {recurrenceType === "lunar" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.moonPhase")}</Text>
                <View style={styles.lunarGrid}>
                  {LUNAR_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.lunarChip,
                        {
                          backgroundColor: lunarPhase === option.id ? colors.primary : colors.surfaceGlass,
                          borderColor: lunarPhase === option.id ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setLunarPhase(option.id)}
                    >
                      <Icon
                        name={option.icon}
                        size={32}
                        color={lunarPhase === option.id ? "#FFFFFF" : colors.text}
                        style={styles.lunarIcon}
                      />
                      <Text style={[styles.lunarLabel, { color: lunarPhase === option.id ? "#FFFFFF" : colors.text }]}>
                        {t(`recurrenceModal.lunar.${option.id}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  {t("recurrenceModal.lunarHelper", {
                    phase: lunarPhase === "full" ? t("recurrenceModal.lunarHelperFull") : t("recurrenceModal.lunarHelperNew"),
                  })}
                </Text>
              </View>
            )}

            {/* Monthly Mode Selection */}
            {recurrenceType === "monthly" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.repeatBy")}</Text>
                <View style={styles.monthlyModeGrid}>
                  {MONTHLY_MODES.map((modeId) => (
                    <TouchableOpacity
                      key={modeId}
                      style={[
                        styles.monthlyModeChip,
                        {
                          backgroundColor: monthlyMode === modeId ? `${colors.primary}22` : colors.surfaceGlass,
                          borderColor: monthlyMode === modeId ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setMonthlyMode(modeId)}
                    >
                      <Text style={[styles.monthlyModeLabel, { color: monthlyMode === modeId ? colors.primary : colors.text }]}>
                        {t(`recurrenceModal.monthlyModes.${modeId}.label`)}
                      </Text>
                      <Text style={[styles.monthlyModeDesc, { color: colors.textSecondary }]}>{t(`recurrenceModal.monthlyModes.${modeId}.description`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Day of Month Selection */}
            {recurrenceType === "monthly" && monthlyMode === "dayOfMonth" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.dayOfMonth")}</Text>
                <TouchableOpacity
                  style={[styles.dayOfMonthButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                  onPress={() => setShowDayOfMonthPicker(true)}
                >
                  <Text style={[styles.dayOfMonthText, { color: colors.primary }]}>
                    {dayOfMonth}{getOrdinalSuffix(dayOfMonth)}
                  </Text>
                  <Icon name="chevronRight" size={20} color={colors.textSecondary} type="ui" />
                </TouchableOpacity>
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  {t("recurrenceModal.dayOfMonthHelper")}
                </Text>
              </View>
            )}

            {/* Day Selection */}
            {(recurrenceType === "daily" || recurrenceType === "weekly" || recurrenceType === "biweekly" || 
              (recurrenceType === "monthly" && monthlyMode === "dayOfWeek")) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {recurrenceType === "monthly" ? t("recurrenceModal.dayOfWeekTitle") : t("recurrenceModal.selectDays")}
                </Text>

                {recurrenceType === "daily" && (
                  <View style={styles.quickSelectRow}>
                    <TouchableOpacity
                      style={[styles.quickSelectButton, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
                      onPress={selectWeekdays}
                    >
                      <Text style={[styles.quickSelectText, { color: colors.primary }]}>{t("recurrenceModal.weekdays")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickSelectButton, { backgroundColor: `${colors.secondary}22`, borderColor: colors.secondary }]}
                      onPress={selectWeekends}
                    >
                      <Text style={[styles.quickSelectText, { color: colors.secondary }]}>{t("recurrenceModal.weekends")}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.daysGrid}>
                  {DAYS_OF_WEEK.map((dayId) => (
                    <TouchableOpacity
                      key={dayId}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: selectedDays.includes(dayId) ? colors.primary : colors.surfaceGlass,
                          borderColor: selectedDays.includes(dayId) ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => toggleDay(dayId)}
                    >
                      <Text style={[styles.dayChipText, { color: selectedDays.includes(dayId) ? "#FFFFFF" : colors.text }]}>
                        {t(`recurrenceModal.days.${DAY_KEYS[dayId]}.short`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  {recurrenceType === "biweekly" && t("recurrenceModal.helperBiweekly")}
                  {recurrenceType === "monthly" && monthlyMode === "dayOfWeek" && t("recurrenceModal.helperMonthlyDow")}
                  {recurrenceType === "daily" && t("recurrenceModal.helperDaily")}
                  {recurrenceType === "weekly" && t("recurrenceModal.helperWeekly")}
                </Text>
              </View>
            )}

            {/* Week of Month (for monthly dayOfWeek) */}
            {recurrenceType === "monthly" && monthlyMode === "dayOfWeek" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.weekOfMonth")}</Text>
                <View style={styles.weekOptionsGrid}>
                  {WEEK_OPTIONS.map((weekId) => (
                    <TouchableOpacity
                      key={weekId}
                      style={[
                        styles.weekChip,
                        {
                          backgroundColor: weekOfMonth === weekId ? colors.primary : colors.surfaceGlass,
                          borderColor: weekOfMonth === weekId ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setWeekOfMonth(weekId)}
                    >
                      <Text style={[styles.weekChipText, { color: weekOfMonth === weekId ? "#FFFFFF" : colors.text }]}>
                        {t(`recurrenceModal.weekOptions.${weekId}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* End Date */}
            {recurrenceType !== "none" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("recurrenceModal.repeatUntil")}</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                  onPress={openEndDatePicker}
                >
                  <Icon name="calendar" size={20} color={colors.textSecondary} type="ui" />
                  <Text style={[styles.dateButtonText, { color: colors.text }]}>{formatDate(endDate)}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Summary with Date List */}
            {recurrenceType !== "none" && previewDates.length > 0 && (
              <View style={[styles.summaryCard, { backgroundColor: `${colors.primary}11`, borderColor: `${colors.primary}33` }]}>
                <Text style={[styles.summaryTitle, { color: colors.primary }]}>{t("recurrenceModal.summary")}</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>{getSummaryText()}</Text>
                <Text style={[styles.summaryCount, { color: colors.textSecondary, marginBottom: 12 }]}>
                  {previewDates.length === 52
                    ? t("recurrenceModal.eventsMax")
                    : t("recurrenceModal.eventCount", { count: previewDates.length })}
                </Text>

                {/* Date List */}
                <View style={[styles.dateListContainer, { backgroundColor: `${colors.background}88` }]}>
                  <Text style={[styles.dateListTitle, { color: colors.textSecondary }]}>{t("recurrenceModal.eventDates")}</Text>
                  <ScrollView style={styles.dateList} nestedScrollEnabled showsVerticalScrollIndicator>
                    {previewDates.slice(0, 20).map((date, index) => (
                      <View key={index} style={styles.dateListItem}>
                        <Text style={[styles.dateListNumber, { color: colors.primary }]}>{index + 1}.</Text>
                        <Text style={[styles.dateListText, { color: colors.text }]}>{formatDateShort(date)}</Text>
                      </View>
                    ))}
                    {previewDates.length > 20 && (
                      <Text style={[styles.dateListMore, { color: colors.textTertiary }]}>
                        {t("recurrenceModal.andMore", { count: previewDates.length - 20 })}
                      </Text>
                    )}
                  </ScrollView>
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Day of Month Picker Modal */}
          <Modal visible={showDayOfMonthPicker} transparent animationType="slide">
            <View style={styles.overlay}>
              <View style={[styles.pickerModal, { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" }]}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowDayOfMonthPicker(false)}>
                    <Text style={[styles.headerButton, { color: colors.textSecondary }]}>{t("recurrenceModal.cancel")}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>{t("recurrenceModal.selectDay")}</Text>
                  <TouchableOpacity onPress={() => setShowDayOfMonthPicker(false)}>
                    <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>{t("recurrenceModal.done")}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.dayOfMonthGrid} contentContainerStyle={styles.dayOfMonthGridContent}>
                  {DAY_OF_MONTH_OPTIONS.map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayOfMonthChip,
                        {
                          backgroundColor: dayOfMonth === day ? colors.primary : colors.surfaceGlass,
                          borderColor: dayOfMonth === day ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setDayOfMonth(day)}
                    >
                      <Text style={[styles.dayOfMonthChipText, { color: dayOfMonth === day ? "#FFFFFF" : colors.text }]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* iOS Date Picker */}
          {Platform.OS === "ios" && (showStartDatePicker || showEndDatePicker) && (
            <Modal visible={showStartDatePicker || showEndDatePicker} transparent animationType="slide">
              <View style={styles.overlay}>
                <View style={[styles.pickerModal, { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" }]}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={() => {
                      setShowStartDatePicker(false);
                      setShowEndDatePicker(false);
                      setActivePicker(null);
                    }}>
                      <Text style={[styles.headerButton, { color: colors.textSecondary }]}>{t("recurrenceModal.cancel")}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                      {activePicker === "start" ? t("recurrenceModal.startDate") : t("recurrenceModal.endDate")}
                    </Text>
                    <TouchableOpacity onPress={confirmDateSelection}>
                      <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>{t("recurrenceModal.done")}</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={tempDate}
                    mode="date"
                    display="spinner"
                    onChange={onDateChange}
                    minimumDate={activePicker === "end" ? startDate : new Date()}
                    textColor={colors.text}
                    themeVariant={isDark ? "dark" : "light"}
                    style={{ height: 200 }}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Android Date Picker */}
          {Platform.OS === "android" && (showStartDatePicker || showEndDatePicker) && (
            <DateTimePicker
              value={activePicker === "start" ? startDate : endDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={activePicker === "end" ? startDate : new Date()}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContainer: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "90%",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.1)",
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "600",
    },
    headerButton: {
      fontSize: 16,
    },
    content: {
      padding: 20,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 12,
      letterSpacing: -0.2,
    },
    typeOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
    },
    typeOptionContent: {
      flex: 1,
    },
    typeLabel: {
      fontSize: 16,
      fontWeight: "600",
    },
    typeDescription: {
      fontSize: 13,
      marginTop: 2,
    },
    quickSelectRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    quickSelectButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
    },
    quickSelectText: {
      fontSize: 14,
      fontWeight: "600",
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    dayChip: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      justifyContent: "center",
      alignItems: "center",
    },
    dayChipText: {
      fontSize: 13,
      fontWeight: "600",
    },
    helperText: {
      fontSize: 12,
      marginTop: 12,
      fontStyle: "italic",
    },
    weekOptionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    weekChip: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    weekChipText: {
      fontSize: 14,
      fontWeight: "600",
    },
    monthlyModeGrid: {
      flexDirection: "row",
      gap: 12,
    },
    monthlyModeChip: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: "center",
    },
    monthlyModeLabel: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 4,
    },
    monthlyModeDesc: {
      fontSize: 11,
      textAlign: "center",
    },
    dayOfMonthButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    dayOfMonthText: {
      fontSize: 24,
      fontWeight: "700",
    },
    lunarGrid: {
      flexDirection: "row",
      gap: 12,
    },
    lunarChip: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: "center",
    },
    lunarIcon: {
      marginBottom: 8,
    },
    lunarLabel: {
      fontSize: 14,
      fontWeight: "600",
    },
    dateButton: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      gap: 12,
    },
    dateButtonText: {
      fontSize: 16,
      fontWeight: "500",
    },
    summaryCard: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    summaryTitle: {
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 8,
    },
    summaryText: {
      fontSize: 15,
      fontWeight: "500",
      marginBottom: 4,
    },
    summaryCount: {
      fontSize: 13,
    },
    dateListContainer: {
      borderRadius: 8,
      padding: 12,
    },
    dateListTitle: {
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 8,
    },
    dateList: {
      maxHeight: 150,
    },
    dateListItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 4,
    },
    dateListNumber: {
      fontSize: 12,
      fontWeight: "600",
      width: 24,
    },
    dateListText: {
      fontSize: 13,
    },
    dateListMore: {
      fontSize: 12,
      fontStyle: "italic",
      marginTop: 8,
      textAlign: "center",
    },
    pickerModal: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 34,
    },
    pickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.1)",
    },
    dayOfMonthGrid: {
      maxHeight: 300,
    },
    dayOfMonthGridContent: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: 20,
      gap: 10,
      justifyContent: "center",
    },
    dayOfMonthChip: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 1.5,
      justifyContent: "center",
      alignItems: "center",
    },
    dayOfMonthChipText: {
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
