import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import { auth } from '../services/firebase';
import { sendMessage, subscribeToMessages } from '../utils/messageService';

export default function ChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { conversationId, otherUser } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    const unsubscribe = subscribeToMessages(conversationId, (newMessages) => {
      setMessages(newMessages);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return () => unsubscribe();
  }, [conversationId]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendMessage(conversationId, auth.currentUser.uid, text);
    } catch (error) {
      console.error('Error sending message:', error);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const styles = createStyles(colors);

  const MessageBubble = ({ message }) => {
    const isMe = message.senderId === auth.currentUser.uid;
    const time = new Date(message.createdAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <View style={[
        styles.messageBubble,
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        <View style={[
          styles.bubbleGlass,
          {
            backgroundColor: isMe ? `${colors.primary}33` : colors.surfaceGlass,
            borderColor: isMe ? `${colors.primary}66` : colors.border
          }
        ]}>
          <Text style={[styles.messageText, { color: colors.text }]}>
            {message.text}
          </Text>
          <Text style={[styles.timeStamp, { color: colors.textTertiary }]}>
            {time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={[styles.headerAvatar, {
            backgroundColor: `${colors.primary}26`,
            borderColor: `${colors.primary}4D`
          }]}>
            <Text style={styles.headerAvatarEmoji}>{
              (() => {
                const a = otherUser?.avatar;
                if (!a) return otherUser?.emoji || '😊';
                if (typeof a === 'string') return a;
                if (a.type === 'emoji') return a.value || '😊';
                return '😊';
              })()
            }</Text>
          </View>
          <Text style={[styles.headerName, { color: colors.text }]}>
            {otherUser.fullName || 'Unknown'}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatEmoji}>👋</Text>
            <Text style={[styles.emptyChatText, { color: colors.textSecondary }]}>
              Start the conversation!
            </Text>
          </View>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputContainer, {
        backgroundColor: isDark ? 'rgba(11, 15, 26, 0.95)' : 'rgba(250, 250, 252, 0.95)',
        borderTopColor: colors.border
      }]}>
        <View style={[styles.inputWrapper, {
          backgroundColor: colors.surfaceGlass,
          borderColor: colors.border
        }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <View style={[
              styles.sendButtonGlass,
              {
                backgroundColor: inputText.trim() ? `${colors.primary}33` : colors.surfaceGlass,
                borderColor: inputText.trim() ? `${colors.primary}66` : colors.border
              }
            ]}>
              <Text style={styles.sendIcon}>
                {sending ? '⏳' : '↑'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: { fontSize: 28 },
    headerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 16 },
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    headerAvatarEmoji: { fontSize: 18 },
    headerName: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
    messagesContainer: { flex: 1 },
    messagesContent: { paddingHorizontal: 24, paddingVertical: 20 },
    emptyChat: { alignItems: 'center', marginTop: 100 },
    emptyChatEmoji: { fontSize: 56, marginBottom: 12 },
    emptyChatText: { fontSize: 14 },
    messageBubble: { marginBottom: 12, maxWidth: '75%' },
    myMessage: { alignSelf: 'flex-end' },
    theirMessage: { alignSelf: 'flex-start' },
    bubbleGlass: {
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    messageText: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
    timeStamp: { fontSize: 11, textAlign: 'right' },
    inputContainer: {
      borderTopWidth: 1,
      padding: 16,
      paddingBottom: 32,
    },
    inputWrapper: {
      borderWidth: 1,
      borderRadius: 24,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    input: {
      flex: 1,
      fontSize: 15,
      maxHeight: 100,
      paddingVertical: 8,
    },
    sendButton: { marginLeft: 8 },
    sendButtonGlass: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendIcon: { fontSize: 20 },
  });
}
