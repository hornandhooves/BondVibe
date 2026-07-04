# 02 · AI Foundation — wiring Anthropic Claude into Kinlo

**Build this before any feature.** Everything calls this layer.

## Architecture (secure by default)
```
App (Expo/RN)  ──►  Cloud Function `callClaude`  ──►  Anthropic Messages API
                     (API key server-side only)        (Claude model)
        ◄── structured JSON ──────────────────────────◄
```
- **Never** put `ANTHROPIC_API_KEY` in the app bundle or client env. It lives only in the Cloud Function config / secret manager.
- The app authenticates to the function with the user's Firebase Auth token. The function loads that user's context from Firestore, builds the prompt, calls Claude, validates the JSON, and returns it.

## The `callClaude` Cloud Function (contract)
```
POST /callClaude
Auth: Firebase ID token (required)
Body: {
  feature: 'smart_wall' | 'ask_kinlo' | 'host_copilot' | 'member_intel' | 'weekly_digest' | 'match_intel',
  input:   { ...feature-specific },     // e.g. { question } for ask_kinlo
  stream?: boolean                      // true only for ask_kinlo chat
}
Returns: { ok: true, data: <feature JSON> } | { ok:false, error, fallback:true }
```
Server steps:
1. Verify auth; rate-limit per user (e.g. token bucket) to control cost/abuse.
2. Load only the context this feature needs (see each feature file) — least-privilege.
3. Compose `system` + `user` prompt from the templates in the feature files.
4. Call Anthropic Messages API with the **current Claude model** (use the latest Sonnet id from Anthropic docs; do not hardcode an outdated one). `max_tokens` sized per feature.
5. **Force structured output**: instruct JSON-only and set/parse accordingly; validate against a schema (zod/valibot). On parse failure, retry once, then return `fallback:true`.
6. Log tokens + latency + feature for cost dashboards. Strip PII from logs.

## Client hook
```ts
const { data, loading, error, fallback } = useClaude('smart_wall', input);
// or for chat:
const { messages, send, streaming } = useKinloChat();
```
- On `error`/`fallback`, the UI hides the AI card or shows a plain non-AI version. **Never fake AI output.**
- Cache non-chat results (e.g. Smart Wall ranking, digest) for a sensible TTL to cut cost.

## Grounding rules (critical to the differentiator)
- Pass Claude **only real data**: the user's Vibes, personality scores, RSVPs, check-ins, attendance history, and (for hosts) aggregated member stats.
- Tell Claude in the system prompt: *"Only reference events, people, and numbers present in the provided context. If you can't ground a claim, omit it."*
- Every user-facing AI statement must map to a real entity id returned in the JSON so the UI can link it.

## Safety & privacy
- **Attendee AI is opt-in** (reuse the Community Matching consent). **Host AI is aggregate-only** — never reveal who liked/DMed whom; sentiment and counts only.
- **Moderation:** for match chats, run a lightweight Claude classification pass to flag harassment; store the flag, notify moderation, never auto-share contact. Mirror Community Matching privacy.
- Add an AI usage note in Settings + the privacy policy: what's sent, that it's opt-in, deletion applies.

## Cost control
- Rate-limit per user; cache; size `max_tokens` tightly; batch where possible (e.g. digest is one weekly call, not per-open).
- Prefer one grounded call returning structured lists over many small calls.

## Shared prompt skeleton (all features)
```
SYSTEM: You are Kinlo's community intelligence. You help people belong and show up in real life.
You are given ONLY this user's real Kinlo context. Never invent events, people, or numbers.
Return STRICT JSON matching the schema. Warm, concise, first-person-friendly. English.

USER: <feature template> + <grounded context JSON>
```
