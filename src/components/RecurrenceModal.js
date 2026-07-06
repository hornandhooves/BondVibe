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
import Icon from "./Icon";
import DateTimePicker from "@react-native-community/datetimepicker";
import { generateMoonPhaseDates } from "../utils/lunarUtils";

// Days of the week
const DAYS_OF_WEEK = [
  { id: 0, short: "Sun", full: "Sunday" },
  { id: 1, short: "Mon", full: "Monday" },
  { id: 2, short: "Tue", full: "Tuesday" },
  { id: 3, short: "Wed", full: "Wednesday" },
  { id: 4, short: "Thu", full: "Thursday" },
  { id: 5, short: "Fri", full: "Friday" },
  { id: 6, short: "Sat", full: "Saturday" },
];

// Week of month options
const WEEK_OPTIONS = [
  { id: "first", label: "First" },
  { id: "second", label: "Second" },
  { id: "third", label: "Third" },
  { id: "fourth", label: "Fourth" },
  { id: "last", label: "Last" },
];

// Day of month options (1-28)
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

// Lunar phase options
const LUNAR_OPTIONS = [
  { id: "full", label: "Full Moon", icon: "moon" },
  { id: "new", label: "New Moon", icon: "moon" },
];

// Recurrence type options
const RECURRENCE_TYPES = [
  { id: "none", label: "One-time", icon: "calendar" },
  { id: "daily", label: "Daily", description: "Select specific days" },
  { id: "weekly", label: "Weekly", description: "Every week on selected days" },
  { id: "biweekly", label: "Biweekly", description: "Every 2 weeks" },
  { id: "monthly", label: "Monthly", description: "Same day each month" },
  { id: "lunar", label: "Lunar", description: "Follow moon phases" },
];

// Monthly mode options
const MONTHLY_MODES = [
  { id: "dayOfWeek", label: "Day of Week", description: "e.g., First Saturday" },
  { id: "dayOfMonth", label: "Day of Month", description: "e.g., The 15th" },
];

export default function RecurrenceModal({
  visible,
  onClose,
  onSave,
  initialConfig,
  startDate: initialStartDate,
}) {
  const { colors, isDark } = useTheme();
  
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
  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  
  const formatDateShort = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // Get ordinal suffix
  const getOrdinalSuffix = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  // Get summary text
  const getSummaryText = () => {
    if (recurrenceType === "none") return "One-time event";
    
    if (recurrenceType === "lunar") {
      return lunarPhase === "full" ? "Every Full Moon" : "Every New Moon";
    }

    if (recurrenceType === "monthly" && monthlyMode === "dayOfMonth") {
      return `${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} of each month`;
    }

    if (selectedDays.length === 0) return "Select days";
    const dayNames = selectedDays.map((d) => DAYS_OF_WEEK[d].short).join(", ");

    switch (recurrenceType) {
      case "daily":
        if (selectedDays.length === 7) return "Every day";
        if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([1,2,3,4,5])) return "Weekdays (Mon-Fri)";
        if (JSON.stringify([...selectedDays].sort()) === JSON.stringify([0,6])) return "Weekends (Sat-Sun)";
        return `Every ${dayNames}`;
      case "weekly":
        return `Weekly on ${dayNames}`;
      case "biweekly":
        return `Every 2 weeks on ${dayNames}`;
      case "monthly":
        const weekLabel = WEEK_OPTIONS.find((w) => w.id === weekOfMonth)?.label;
        return `${weekLabel} ${DAYS_OF_WEEK[selectedDays[0]]?.full} of each month`;
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
              <Text style={[styles.headerButton, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Event Frequency</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Recurrence Type Selection */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Frequency</Text>
              {RECURRENCE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeOption,
                    {
                      backgroundColor: recurrenceType === type.id ? `${colors.primary}22` : colors.surfaceGlass,
                      borderColor: recurrenceType === type.id ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setRecurrenceType(type.id);
                    if (type.id === "none") setSelectedDays([]);
                  }}
                >
                  <View style={styles.typeOptionContent}>
                    <Text style={[styles.typeLabel, { color: recurrenceType === type.id ? colors.primary : colors.text }]}>
                      {type.label}
                    </Text>
                    {type.description && (
                      <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{type.description}</Text>
                    )}
                  </View>
                  {recurrenceType === type.id && (
                    <Icon name="check" size={20} color={colors.primary} type="ui" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Start Date (always show for recurring) */}
            {recurrenceType !== "none" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Start Date</Text>
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Moon Phase</Text>
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
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  Events occur on each {lunarPhase === "full" ? "full moon" : "new moon"} (~every 29.5 days)
                </Text>
              </View>
            )}

            {/* Monthly Mode Selection */}
            {recurrenceType === "monthly" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Repeat By</Text>
                <View style={styles.monthlyModeGrid}>
                  {MONTHLY_MODES.map((mode) => (
                    <TouchableOpacity
                      key={mode.id}
                      style={[
                        styles.monthlyModeChip,
                        {
                          backgroundColor: monthlyMode === mode.id ? `${colors.primary}22` : colors.surfaceGlass,
                          borderColor: monthlyMode === mode.id ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setMonthlyMode(mode.id)}
                    >
                      <Text style={[styles.monthlyModeLabel, { color: monthlyMode === mode.id ? colors.primary : colors.text }]}>
                        {mode.label}
                      </Text>
                      <Text style={[styles.monthlyModeDesc, { color: colors.textSecondary }]}>{mode.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Day of Month Selection */}
            {recurrenceType === "monthly" && monthlyMode === "dayOfMonth" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Day of Month</Text>
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
                  Days 29-31 will use the last day of shorter months
                </Text>
              </View>
            )}

            {/* Day Selection */}
            {(recurrenceType === "daily" || recurrenceType === "weekly" || recurrenceType === "biweekly" || 
              (recurrenceType === "monthly" && monthlyMode === "dayOfWeek")) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {recurrenceType === "monthly" ? "Day of Week" : "Select Days"}
                </Text>
                
                {recurrenceType === "daily" && (
                  <View style={styles.quickSelectRow}>
                    <TouchableOpacity
                      style={[styles.quickSelectButton, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
                      onPress={selectWeekdays}
                    >
                      <Text style={[styles.quickSelectText, { color: colors.primary }]}>Weekdays</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickSelectButton, { backgroundColor: `${colors.secondary}22`, borderColor: colors.secondary }]}
                      onPress={selectWeekends}
                    >
                      <Text style={[styles.quickSelectText, { color: colors.secondary }]}>Weekends</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.daysGrid}>
                  {DAYS_OF_WEEK.map((day) => (
                    <TouchableOpacity
                      key={day.id}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: selectedDays.includes(day.id) ? colors.primary : colors.surfaceGlass,
                          borderColor: selectedDays.includes(day.id) ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => toggleDay(day.id)}
                    >
                      <Text style={[styles.dayChipText, { color: selectedDays.includes(day.id) ? "#FFFFFF" : colors.text }]}>
                        {day.short}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  {recurrenceType === "biweekly" && "Select one day for biweekly recurrence"}
                  {recurrenceType === "monthly" && monthlyMode === "dayOfWeek" && "Select which day of the week"}
                  {recurrenceType === "daily" && "Events will occur on selected days"}
                  {recurrenceType === "weekly" && "Select one or more days per week"}
                </Text>
              </View>
            )}

            {/* Week of Month (for monthly dayOfWeek) */}
            {recurrenceType === "monthly" && monthlyMode === "dayOfWeek" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Week of Month</Text>
                <View style={styles.weekOptionsGrid}>
                  {WEEK_OPTIONS.map((week) => (
                    <TouchableOpacity
                      key={week.id}
                      style={[
                        styles.weekChip,
                        {
                          backgroundColor: weekOfMonth === week.id ? colors.primary : colors.surfaceGlass,
                          borderColor: weekOfMonth === week.id ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setWeekOfMonth(week.id)}
                    >
                      <Text style={[styles.weekChipText, { color: weekOfMonth === week.id ? "#FFFFFF" : colors.text }]}>
                        {week.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* End Date */}
            {recurrenceType !== "none" && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Repeat Until</Text>
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
                <Text style={[styles.summaryTitle, { color: colors.primary }]}>Summary</Text>
                <Text style={[styles.summaryText, { color: colors.text }]}>{getSummaryText()}</Text>
                <Text style={[styles.summaryCount, { color: colors.textSecondary, marginBottom: 12 }]}>
                  {previewDates.length === 52 ? "52+ events (max)" : `${previewDates.length} event${previewDates.length !== 1 ? "s" : ""}`} will be created
                </Text>
                
                {/* Date List */}
                <View style={[styles.dateListContainer, { backgroundColor: `${colors.background}88` }]}>
                  <Text style={[styles.dateListTitle, { color: colors.textSecondary }]}>Event Dates:</Text>
                  <ScrollView style={styles.dateList} nestedScrollEnabled showsVerticalScrollIndicator>
                    {previewDates.slice(0, 20).map((date, index) => (
                      <View key={index} style={styles.dateListItem}>
                        <Text style={[styles.dateListNumber, { color: colors.primary }]}>{index + 1}.</Text>
                        <Text style={[styles.dateListText, { color: colors.text }]}>{formatDateShort(date)}</Text>
                      </View>
                    ))}
                    {previewDates.length > 20 && (
                      <Text style={[styles.dateListMore, { color: colors.textTertiary }]}>
                        ... and {previewDates.length - 20} more
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
                    <Text style={[styles.headerButton, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>Select Day</Text>
                  <TouchableOpacity onPress={() => setShowDayOfMonthPicker(false)}>
                    <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>Done</Text>
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
                      <Text style={[styles.headerButton, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                      {activePicker === "start" ? "Start Date" : "End Date"}
                    </Text>
                    <TouchableOpacity onPress={confirmDateSelection}>
                      <Text style={[styles.headerButton, { color: colors.primary, fontWeight: "700" }]}>Done</Text>
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
