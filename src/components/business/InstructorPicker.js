/**
 * InstructorPicker — pick who runs an event/class/session (kinlo_business/06
 * FIX 3). Lists staff whose role is owner|instructor, plus "Me" (the signed-in
 * host). Returns { instructorUid, instructorName } so the item can be filtered
 * onto that person's Agenda.
 *
 * KIN-190: an instructor is now required for every event, not just classes, so
 * this picker has to be able to name someone who ISN'T in the app yet —
 * otherwise the requirement would be unsatisfiable for a host whose staff
 * haven't signed up. "+ Add someone" creates a placeholder staff doc
 * (addPlaceholderStaff) and selects it immediately. The placeholder carries a
 * real name from the first moment; it is never a free-text field on the event.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";
import SelectDropdown from "../SelectDropdown";
import { auth, db } from "../../services/firebase";
import {
  listStaff,
  STAFF_ROLES,
  staffDisplayName,
  addPlaceholderStaff,
} from "../../services/businessStaffService";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS, RADII, SPACING } from "../../constants/theme-tokens";

const INSTRUCTOR_ROLES = [STAFF_ROLES[0], STAFF_ROLES[1]]; // owner, instructor

// Sentinel option id. Picking it opens the name prompt instead of selecting a
// value — it must never reach onChange as an instructorUid.
const ADD_SOMEONE = "__kin190_add_someone__";

export default function InstructorPicker({ value, onChange, label, placeholder, t }) {
  const { colors } = useTheme();
  const [options, setOptions] = useState([]);
  const [prompting, setPrompting] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const tr = useCallback((key, fallback) => (t ? t(key) : fallback), [t]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let staff = [];
      try {
        staff = await listStaff();
      } catch (_e) {
        staff = [];
      }
      const me = auth.currentUser?.uid;

      // The host's own name, so their row reads "Ana Torres" rather than a
      // generic "Me" — the whole point of KIN-190 is that an event names a real
      // person. Best-effort: an unreadable/absent profile just falls back.
      let myName = "";
      if (me) {
        try {
          const snap = await getDoc(doc(db, "users", me));
          if (snap.exists()) myName = snap.data().fullName || "";
        } catch (_e) {
          myName = "";
        }
      }
      const meLabel = myName || tr("business.instructor.me", "Me");

      const rows = staff
        .filter((s) => INSTRUCTOR_ROLES.includes(s.role))
        .map((s) => ({
          id: s.id,
          // staffDisplayName covers displayName → name → fullName → email; the
          // old inline chain here ignored displayName and fullName outright.
          label: s.id === me
            ? meLabel
            : staffDisplayName(s, tr("business.instructor.staff", "Staff")),
        }));
      // Always offer "Me" even if the owner staff doc is missing/unnamed.
      if (me && !rows.some((r) => r.id === me)) {
        rows.unshift({ id: me, label: meLabel });
      }
      rows.push({ id: ADD_SOMEONE, label: tr("business.instructor.addSomeone", "+ Add someone") });
      if (alive) setOptions(rows);
    })();
    return () => { alive = false; };
  }, [tr]);

  const closePrompt = () => {
    setPrompting(false);
    setNewName("");
  };

  const confirmAdd = async () => {
    const clean = newName.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      const created = await addPlaceholderStaff(clean);
      if (!created) return; // no bizId / rejected — leave the prompt open
      // Show it in the list AHEAD of the "+ Add someone" row, and select it.
      setOptions((prev) => [
        ...prev.filter((o) => o.id !== ADD_SOMEONE),
        { id: created.id, label: created.name },
        prev.find((o) => o.id === ADD_SOMEONE),
      ].filter(Boolean));
      onChange(created.id, created.name);
      closePrompt();
    } catch (e) {
      // Swallow: the prompt stays open so the host can retry. Never leave
      // `saving` stuck — that's what the finally is for (CLAUDE.md §7).
      console.error("addPlaceholderStaff failed:", e?.message || e);
    } finally {
      setSaving(false);
    }
  };

  const s = createStyles(colors);

  return (
    <>
      <SelectDropdown
        label={label}
        value={value}
        onValueChange={(id) => {
          if (id === ADD_SOMEONE) {
            setPrompting(true);
            return;
          }
          const opt = options.find((o) => o.id === id);
          onChange(id, opt?.label || "");
        }}
        options={options}
        placeholder={placeholder}
        type="default"
      />

      <Modal
        visible={prompting}
        transparent
        animationType="fade"
        onRequestClose={closePrompt}
      >
        <View style={s.backdrop}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.title, { color: colors.text }]}>
              {tr("business.instructor.addTitle", "Add someone")}
            </Text>
            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
              testID="instructor-new-name"
              accessibilityLabel={tr("business.instructor.namePlaceholder", "Full name")}
              value={newName}
              onChangeText={setNewName}
              placeholder={tr("business.instructor.namePlaceholder", "Full name")}
              placeholderTextColor={colors.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmAdd}
            />
            <View style={s.actions}>
              <TouchableOpacity
                onPress={closePrompt}
                style={s.btn}
                disabled={saving}
                testID="instructor-cancel"
                accessibilityRole="button"
                accessibilityLabel={tr("business.instructor.cancel", "Cancel")}
              >
                <Text style={[s.btnTxt, { color: colors.textSecondary }]}>
                  {tr("business.instructor.cancel", "Cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmAdd}
                style={[s.btn, s.btnPrimary, { backgroundColor: colors.primary, opacity: newName.trim() && !saving ? 1 : 0.5 }]}
                disabled={!newName.trim() || saving}
                testID="instructor-confirm"
                accessibilityRole="button"
                accessibilityLabel={tr("business.instructor.addConfirm", "Add")}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[s.btnTxt, { color: "#fff" }]}>
                    {tr("business.instructor.addConfirm", "Add")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.xxl,
    },
    card: {
      width: "100%",
      borderWidth: 1,
      borderRadius: RADII.card,
      padding: SPACING.xl,
    },
    title: { fontFamily: FONTS.bodyExtra, fontSize: 16, marginBottom: SPACING.md },
    input: {
      borderWidth: 1,
      borderRadius: 13,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: FONTS.bodyMedium,
      fontSize: 15,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: SPACING.sm,
      marginTop: SPACING.lg,
    },
    btn: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: RADII.button,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 92,
    },
    btnPrimary: {},
    btnTxt: { fontFamily: FONTS.bodyBold, fontSize: 14 },
  });
}
