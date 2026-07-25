/**
 * PostDetailScreen — a post with its comment thread.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import PostCard from "../components/PostCard";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { getPost, subscribeComments, addComment } from "../services/postService";
import { useAsyncLoad } from "../hooks/useAsyncLoad";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function PostDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { postId } = route.params || {};
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const { loading: sending, run } = useAsyncLoad(false);

  useEffect(() => {
    getPost(postId).then(setPost);
    const unsub = subscribeComments(postId, setComments);
    return unsub;
  }, [postId]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    return run(async () => {
      try {
        await addComment(postId, body);
      } catch (e) {
        console.error("PostDetailScreen: addComment failed", e);
      }
    });
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("postDetail.title")}</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            post ? (
              <PostCard post={post} navigation={navigation} />
            ) : (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
            )
          }
          renderItem={({ item }) => (
            <View style={styles.comment}>
              <AvatarDisplay avatar={normAvatar(item.authorAvatar)} size={32} />
              <View style={[styles.bubble, { backgroundColor: colors.surfaceGlass }]}>
                <Text style={[styles.cAuthor, { color: colors.text }]}>{item.authorName}</Text>
                <Text style={[styles.cText, { color: colors.text }]}>{item.text}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            post ? (
              <Text style={[styles.empty, { color: colors.textTertiary }]}>
                {t("postDetail.noComments")}
              </Text>
            ) : null
          }
        />
        <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
            placeholder={t("postDetail.commentPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
            onPress={send}
            disabled={sending}
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
    title: { fontSize: 18, fontWeight: "700" },
    list: { paddingHorizontal: 16, paddingBottom: 16 },
    comment: { flexDirection: "row", gap: 10, marginBottom: 12, alignItems: "flex-start" },
    bubble: { flex: 1, borderRadius: 14, padding: 12 },
    cAuthor: { fontSize: 13.5, fontWeight: "700", marginBottom: 2 },
    cText: { fontSize: 15, lineHeight: 20 },
    empty: { textAlign: "center", marginTop: 20, fontSize: 14 },
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
