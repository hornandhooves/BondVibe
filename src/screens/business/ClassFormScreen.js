/**
 * ClassFormScreen — a class IS the full Create-Event form + recurrence + an
 * instructor (kinlo_business/06 FIX 2). The bespoke reduced form was removed;
 * this is now a thin wrapper that opens CreateEventScreen in class mode, so a
 * class carries images, description, category, two-tier pricing and membership
 * credit exactly like an event. Saving routes to businessClassesService.
 */
import React from "react";
import CreateEventScreen from "../CreateEventScreen";

export default function ClassFormScreen({ navigation, route }) {
  return (
    <CreateEventScreen
      navigation={navigation}
      route={{ ...route, params: { ...(route?.params || {}), mode: "class" } }}
    />
  );
}
