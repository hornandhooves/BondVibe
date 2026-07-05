/**
 * useKinloChat — Ask Kinlo conversation state. Streams the reply live over
 * SSE (askKinloStream, via React Native XHR's progressive responseText) and
 * falls back to the request/response callable when streaming is unavailable.
 * Replies carry grounded event attachments + suggestion chips. History
 * persists per user in AsyncStorage so the pinned thread survives relaunch.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { auth } from "../services/firebase";
import { callClaude } from "../services/claudeService";

const PROJECT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const STREAM_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/askKinloStream`;

/**
 * Stream the reply over SSE. Calls onChunk(text) as tokens arrive and
 * resolves { reply, attachments, suggestions }. Rejects with
 * {needsPlus} / generic errors so the caller can fall back.
 */
function streamAskKinlo(idToken, question, onChunk) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seen = 0;
    let reply = "";
    let finalMeta = null;
    xhr.open("POST", STREAM_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${idToken}`);
    const pump = () => {
      const text = xhr.responseText || "";
      const fresh = text.slice(seen);
      // Only consume complete SSE frames; keep the offset at the last "\n\n".
      const lastFrame = fresh.lastIndexOf("\n\n");
      if (lastFrame < 0) return;
      seen += lastFrame + 2;
      for (const line of fresh.slice(0, lastFrame).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (typeof evt.t === "string") {
          reply += evt.t;
          onChunk(reply);
        }
        if (evt.done) {
          finalMeta = { attachments: evt.attachments || [], suggestions: evt.suggestions || [] };
        }
      }
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3) pump();
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          pump();
          resolve({ reply, ...(finalMeta || { attachments: [], suggestions: [] }) });
        } else {
          let body = {};
          try {
            body = JSON.parse(xhr.responseText || "{}");
          } catch {
            // opaque error
          }
          reject(Object.assign(new Error(body.error || `http_${xhr.status}`), body));
        }
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(JSON.stringify({ question }));
  });
}

const keyFor = (uid) => `kinlo.askKinlo.history.${uid}`;
const MAX_HISTORY = 40;

export default function useKinloChat() {
  const uid = auth.currentUser?.uid;
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [tasteLimit, setTasteLimit] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!uid || loadedRef.current) return;
    loadedRef.current = true;
    AsyncStorage.getItem(keyFor(uid))
      .then((raw) => raw && setMessages(JSON.parse(raw)))
      .catch(() => {});
  }, [uid]);

  const persist = useCallback(
    (msgs) => {
      if (!uid) return;
      AsyncStorage.setItem(keyFor(uid), JSON.stringify(msgs.slice(-MAX_HISTORY))).catch(() => {});
    },
    [uid]
  );

  const send = useCallback(
    async (text) => {
      const question = (text || "").trim();
      if (!question || sending) return;
      const userMsg = { id: `u${Date.now()}`, role: "user", text: question };
      const aiId = `a${Date.now()}`;
      setMessages((prev) => {
        const next = [...prev, userMsg];
        persist(next);
        return next;
      });
      setSending(true);

      const finish = (aiMsg) => {
        setMessages((prev) => {
          const withoutDraft = prev.filter((m) => m.id !== aiId);
          const next = [...withoutDraft, { ...aiMsg, id: aiId }];
          persist(next);
          return next;
        });
        setSending(false);
      };

      // Streaming path: tokens render live into a draft assistant bubble.
      try {
        const idToken = await auth.currentUser.getIdToken();
        const upsertDraft = (replySoFar) =>
          setMessages((prev) => {
            const rest = prev.filter((m) => m.id !== aiId);
            return [...rest, { id: aiId, role: "assistant", text: replySoFar, streaming: true }];
          });
        const res = await streamAskKinlo(idToken, question, upsertDraft);
        finish({
          role: "assistant",
          text: res.reply || "…",
          attachments: res.attachments,
          suggestions: res.suggestions,
        });
        return;
      } catch (e) {
        if (e.needsPlus) {
          setTasteLimit(true);
          finish({
            role: "assistant",
            text: "You've used your free questions for this week. Upgrade to Kinlo Plus for unlimited Ask Kinlo.",
            needsPlus: true,
          });
          return;
        }
        // Streaming unavailable → request/response callable fallback.
      }

      const res = await callClaude("ask_kinlo", { question });
      if (res.ok) {
        finish({
          role: "assistant",
          text: res.data.reply,
          attachments: res.data.attachments || [],
          suggestions: res.data.suggestions || [],
        });
      } else if (res.needsPlus) {
        setTasteLimit(true);
        finish({
          role: "assistant",
          text: "You've used your free questions for this week. Upgrade to Kinlo Plus for unlimited Ask Kinlo.",
          needsPlus: true,
        });
      } else {
        finish({
          role: "assistant",
          text: "Kinlo AI is taking a break — please try again in a moment.",
          fallback: true,
        });
      }
    },
    [sending, persist]
  );

  return { messages, send, sending, tasteLimit };
}
