/**
 * Moment viewer (Wall v2 · P3) — full-screen, tap-through view of one author's
 * active 24h moments. Images render inline; a video shows its poster + a play
 * badge (inline playback needs a native player module — a native build, not
 * OTA — so it's intentionally deferred). Tap right advances; left goes back.
 */
import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import { getMomentsFeed, deleteMoment } from "../../services/momentService";

const { width } = Dimensions.get("window");

export default function MomentViewerScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { authorId } = route.params || {};
  const me = auth.currentUser?.uid;
  const [items, setItems] = useState(null);
  const [i, setI] = useState(0);

  React.useEffect(() => {
    (async () => {
      const groups = await getMomentsFeed();
      const g = groups.find((x) => x.authorId === authorId);
      setItems(g ? g.items : []);
    })();
  }, [authorId]);

  if (items === null) {
    return <View style={[styles.container, { backgroundColor: "#000" }]} />;
  }
  if (items.length === 0) {
    // All expired between the row and here — honest, close out.
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.gone}>{t("wall.moments.gone")}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Icon name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  }

  const item = items[i];
  const advance = () => (i < items.length - 1 ? setI(i + 1) : navigation.goBack());
  const back = () => (i > 0 ? setI(i - 1) : navigation.goBack());

  return (
    <View style={styles.container}>
      {/* progress segments */}
      <View style={styles.progress}>
        {items.map((_, k) => (
          <View key={k} style={[styles.seg, { backgroundColor: k <= i ? "#FFFFFF" : "rgba(255,255,255,0.3)" }]} />
        ))}
      </View>

      <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />
      {item.mediaType === "video" && (
        <View style={styles.playBadge}>
          <Icon name="play" size={30} color="#FFFFFF" />
          <Text style={styles.playNote}>{t("wall.moments.videoNote")}</Text>
        </View>
      )}

      {/* tap zones */}
      <TouchableOpacity style={styles.left} activeOpacity={1} onPress={back} />
      <TouchableOpacity style={styles.right} activeOpacity={1} onPress={advance} />

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
        <Icon name="close" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      {authorId === me && (
        <TouchableOpacity
          onPress={async () => {
            await deleteMoment(item.id);
            navigation.goBack();
          }}
          style={styles.deleteBtn}
        >
          <Icon name="delete" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },
  media: { flex: 1, width },
  progress: { position: "absolute", top: 54, left: 12, right: 12, flexDirection: "row", gap: 4, zIndex: 5 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  left: { position: "absolute", left: 0, top: 0, bottom: 0, width: width * 0.35 },
  right: { position: "absolute", right: 0, top: 0, bottom: 0, width: width * 0.65 },
  closeBtn: { position: "absolute", top: 48, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", zIndex: 6 },
  deleteBtn: { position: "absolute", bottom: 40, right: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 6 },
  playBadge: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", gap: 8 },
  playNote: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: "#FFFFFF", opacity: 0.85 },
  gone: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: "#FFFFFF", marginBottom: 16 },
});
