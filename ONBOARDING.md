# Onboarding — BondVibe (Kinlo)

Welcome. This gets a new team member from zero to their first merged PR. Read
[`CLAUDE.md`](./CLAUDE.md) too — it's the working agreement (conventions,
Firebase/OTA coordination) that every dev (and their Claude) follows.

**Stack:** Expo / React Native (Expo SDK 54) + Firebase (`bondvibe-dev`).

---

## Part 0 — Repo owner does these first (one time, per new dev)
1. **Add them as a GitHub collaborator:** repo → *Settings → Collaborators → Add
   people* → their GitHub username/email. They accept the emailed invite.
2. **Share the `.env` file privately** (Slack DM / 1Password / AirDrop — **never
   via git**). It's gitignored and holds the Firebase config
   (`EXPO_PUBLIC_FIREBASE_*`); without it the app can't connect to Firebase.
3. *(Only if they'll touch backend/deploys)* invite them to the Firebase project
   `bondvibe-dev` and the Expo org `hornandhooves`.

---

## Part 1 — New dev: set up the environment (one time)
1. Install **Node 20 LTS** (matches CI; 22 also works), **VS Code 1.98+**, **git**.
2. **Authenticate git to GitHub** so you can push (clone works anonymously since
   the repo is public, but push needs auth as a collaborator): easiest is
   `gh auth login` (GitHub CLI) or an SSH key.
3. *(Optional) Claude Code in VS Code:* install the CLI
   (`curl -fsSL https://claude.ai/install.sh | bash`) + the **"Claude Code"**
   VS Code extension, then sign in **with your own Claude account** (Pro/Max or an
   API key). Each dev uses their own account — nothing is shared. On first open,
   Claude reads `CLAUDE.md` from the repo automatically.

---

## Part 2 — Clone and run
```bash
git clone https://github.com/hornandhooves/BondVibe.git
cd BondVibe
npm install
# put the .env you were given at the repo root (BondVibe/.env)
npm test          # 347 tests should pass on your machine
npm run ios       # iOS simulator   (or: npm start)
```

---

## Part 3 — Your first change (the PR flow — required)
`main` is **protected**: no direct pushes. Everything goes through a Pull Request
that needs the CI green (`Jest + i18n parity`) **and 1 approval** before merging.

```bash
git checkout main && git pull origin main
git checkout -b feat/<short-name>      # one branch per task
# ...work (use Claude in VS Code if you like)...
npm test                                # green before pushing
git add -A && git commit -m "feat: ..."
git push -u origin feat/<short-name>
```
Then on GitHub: **Compare & pull request** → a teammate reviews → once the CI
check is green and it has 1 approval, **Merge**. Delete the branch, back to `main`.

> **Tip:** make your very first PR something tiny (a copy tweak) to exercise the
> whole loop — git auth, `.env`, tests, branch protection — before a real task.

Keep `main` fresh in your branch to avoid conflicts:
```bash
git checkout feat/<short-name> && git merge origin/main
```

---

## Part 4 — Team rules (also in `CLAUDE.md`)
- 🚫 **Never push directly to `main`** (branch protection blocks it).
- 🔥 **Firebase `bondvibe-dev` is the only project.** Deploying rules
  (`firebase deploy --only firestore:rules` / `--only storage`) is **global — last
  deploy wins, regardless of branch.** Deploy **only from merged `main`**, and tell
  your teammate.
- 📲 **OTA (`eas update --branch production --platform ios`) only from `main`** —
  the last update wins for all TestFlight users. Use the `preview` channel to test.
  Don't run `eas build`; simulator builds are fine. Native-module changes need a
  native build (not OTA).
- ⚠️ **Hot files** two devs both edit — merge often, keep blocks in distinct
  regions: `src/navigation/AppNavigator.js`, `src/i18n/locales/en.json` + `es.json`,
  `firestore.rules`.
- ✅ **EN/ES parity:** every new user-facing string goes in BOTH `en.json` and
  `es.json` (CI enforces it via `scripts/check-i18n-parity.js`).
- 🆕 A **new Firestore subcollection needs a rule in `firestore.rules` + a deploy**,
  or reads/writes fail with `Missing or insufficient permissions`.
- 🔒 **Never commit secrets:** `.env`, `*-firebase-adminsdk-*.json`,
  `ANTHROPIC_API_KEY`. They're gitignored — keep it that way.

---

## Handy commands
| What | Command |
|---|---|
| Install deps | `npm install` |
| Run tests | `npm test` |
| i18n parity check | `node scripts/check-i18n-parity.js` |
| Run on iOS simulator | `npm run ios` |
| Start Metro / Expo | `npm start` |
