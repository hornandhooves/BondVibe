/**
 * Match group chat (P3) — the shared chat for a joined group of 4-6. Only
 * available once 3+ candidates have joined (chatActive, enforced by the join
 * Function + rules). Mirrors the 1:1 MatchChat UI.
 */
import React, { useState, useEffect, useRef } from "react";
import Icon from "../../components/Icon";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader } from "./matchUi";
import { subscribeGroupMessages, sendGroupMessage } from "../../services/matchGroupService";

export default function MatchGroupChatScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { groupId, size } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const me = auth.currentUser?.uid;

  useEffect(() => subscribeGroupMessages(groupId, setMessages), [groupId]);

  const onSend = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    await sendGroupMessage(groupId, body);
  };

  const styles = createStyles(colors);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <MatchHeader
        title={t("matchmaking.groups.cardTitle", { count: size || "" }).trim()}
        onBack={() => navigation.goBack()}
      />
      <FlatList
        ref={listRef}
        inverted
        data={[...messages].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const mine = item.senderId === me;
          return (
            <View
              style={[
                styles.bubble,
                mine
                  ? { backgroundColor: colors.primary, alignSelf: "flex-end" }
                  : { backgroundColor: colors.surfaceGlass, alignSelf: "flex-start" },
              ]}
            >
              <Text style={{ color: mine ? "#fff" : colors.text, fontSize: 15 }}>{item.text}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textTertiary, transform: [{ scaleY: -1 }] }]}>
            {t("matchmaking.groups.chatEmpty")}
          </Text>
        }
      />
      <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
          value={text}
          onChangeText={setText}
          placeholder={t("matching.matchChat.messagePlaceholder")}
          placeholderTextColor={colors.textTertiary}
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={onSend}>
          <Icon name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    list: { padding: 16, flexGrow: 1 },
    bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
    empty: { textAlign: "center", marginTop: 40, fontSize: 15 },
    inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
    input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 120, fontSize: 15 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  });
}
