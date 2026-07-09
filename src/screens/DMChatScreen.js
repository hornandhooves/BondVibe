/**
 * DMChatScreen — 1:1 direct message thread. Accepts an existing threadId or an
 * otherUid (created on the fly).
 */
import React, { useState, useEffect, useRef } from "react";
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
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
import {
  getOrCreateThread,
  subscribeThreadMessages,
  sendDM,
} from "../services/dmService";

export default function DMChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { threadId: initialThreadId, otherUid, name } = route.params || {};
  const [threadId, setThreadId] = useState(initialThreadId || null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const me = auth.currentUser?.uid;

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const id = initialThreadId || (await getOrCreateThread(otherUid));
      if (!id) return;
      setThreadId(id);
      unsub = subscribeThreadMessages(id, setMessages);
    })();
    return () => unsub();
  }, [initialThreadId, otherUid]);

  const send = async () => {
    const body = text.trim();
    if (!body || !threadId) return;
    setText("");
    await sendDM(threadId, body);
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {name || t("dmChat.defaultTitle")}
        </Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
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
                <Text style={{ color: mine ? "#fff" : colors.text, fontSize: 15 }}>
                  {item.text}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textTertiary, transform: [{ scaleY: -1 }] }]}>{t("dmChat.sayHi")}</Text>
          }
        />
        <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
            placeholder={t("dmChat.messagePlaceholder")}
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
            onPress={send}
          >
            <Icon name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
    list: { padding: 16, flexGrow: 1 },
    bubble: {
      maxWidth: "78%",
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    empty: { textAlign: "center", marginTop: 40, fontSize: 15 },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      flex: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxHeight: 120,
      fontSize: 15,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  });
}
