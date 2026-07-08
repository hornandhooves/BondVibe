/**
 * InstructorPicker — pick which staff member runs an event/class/session
 * (kinlo_business/06 FIX 3). Lists staff whose role is owner|instructor, plus
 * "Me" (the signed-in host). Returns { instructorUid, instructorName } so the
 * item can be filtered onto that person's Agenda. Required for classes.
 */
import React, { useEffect, useState } from "react";
import SelectDropdown from "../SelectDropdown";
import { auth } from "../../services/firebase";
import { listStaff, STAFF_ROLES } from "../../services/businessStaffService";

const INSTRUCTOR_ROLES = [STAFF_ROLES[0], STAFF_ROLES[1]]; // owner, instructor

export default function InstructorPicker({ value, onChange, label, placeholder, t }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let staff = [];
      try {
        staff = await listStaff();
      } catch (e) {
        staff = [];
      }
      const me = auth.currentUser?.uid;
      const rows = staff
        .filter((s) => INSTRUCTOR_ROLES.includes(s.role))
        .map((s) => ({
          id: s.id,
          label: s.id === me ? (t ? t("business.instructor.me") : "Me") : (s.name || s.email || (t ? t("business.instructor.staff") : "Staff")),
        }));
      // Always offer "Me" even if the owner staff doc is missing/unnamed.
      if (me && !rows.some((r) => r.id === me)) {
        rows.unshift({ id: me, label: t ? t("business.instructor.me") : "Me" });
      }
      if (alive) setOptions(rows);
    })();
    return () => { alive = false; };
  }, [t]);

  return (
    <SelectDropdown
      label={label}
      value={value}
      onValueChange={(id) => {
        const opt = options.find((o) => o.id === id);
        onChange(id, opt?.label || "");
      }}
      options={options}
      placeholder={placeholder}
      type="default"
    />
  );
}
