/**
 * Smoke test — SUBFOLDER screens (business/, matching/, payment/, wall/).
 *
 * Complements smoke.test.js, which only walks the top-level src/screens/*Screen.js
 * and therefore never mounted the ~65 screens living in subfolders. Same harness,
 * same global mocks: mount each screen and assert it renders without throwing
 * (catches "white screen" crashes — undefined components, hook misuse, undefined
 * access in render). It does NOT exercise behaviour; data sources are stubbed.
 *
 * Once this is green, it can be folded back into smoke.test.js as a single
 * recursive walk. Kept separate for now so the proven top-level baseline stays
 * untouched while the subfolder coverage is triaged.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import fs from "fs";
import path from "path";

// ---------- Theme: any color key resolves to a string ----------
jest.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => "#7C3AED" }),
    isDark: true,
    theme: "dark",
    toggleTheme: jest.fn(),
    setTheme: jest.fn(),
  }),
  ThemeProvider: ({ children }) => children,
}));
jest.mock("../../contexts/AuthContext", () => ({
  useAuthContext: () => ({ setSignupInProgress: jest.fn(), user: null, signupInProgress: false }),
  AuthProvider: ({ children }) => children,
}));

// ---------- Firebase ----------
jest.mock("../../services/firebase", () => ({
  auth: { currentUser: { uid: "u1", email: "a@b.com", emailVerified: true } },
  db: {},
  storage: {},
}));
jest.mock("firebase/firestore", () => {
  const snap = { exists: () => false, data: () => ({}), forEach: () => {}, docs: [], empty: true, size: 0, id: "x" };
  const batch = { set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn(() => Promise.resolve()) };
  return {
    collection: jest.fn(() => ({})), collectionGroup: jest.fn(() => ({})), doc: jest.fn(() => ({})), query: jest.fn(() => ({})),
    where: jest.fn(() => ({})), orderBy: jest.fn(() => ({})), limit: jest.fn(() => ({})),
    getDoc: jest.fn(() => Promise.resolve(snap)), getDocs: jest.fn(() => Promise.resolve(snap)),
    onSnapshot: jest.fn((q, cb) => { try { typeof cb === "function" && cb(snap); } catch (e) { /* ignore */ } return () => {}; }),
    addDoc: jest.fn(() => Promise.resolve({ id: "x" })), setDoc: jest.fn(() => Promise.resolve()),
    updateDoc: jest.fn(() => Promise.resolve()), deleteDoc: jest.fn(() => Promise.resolve()),
    serverTimestamp: jest.fn(() => ({})), arrayUnion: jest.fn(() => ({})), arrayRemove: jest.fn(() => ({})),
    increment: jest.fn(() => ({})), writeBatch: jest.fn(() => batch),
    getFirestore: jest.fn(() => ({})),
    Timestamp: { now: () => ({ toMillis: () => 0, toDate: () => new Date() }), fromDate: (d) => ({ toMillis: () => +d, toDate: () => d }) },
  };
});
jest.mock("firebase/functions", () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn(() => () => Promise.resolve({ data: {} })) }));
jest.mock("firebase/auth", () => ({ getAuth: jest.fn(() => ({})), signOut: jest.fn(() => Promise.resolve()), onAuthStateChanged: jest.fn(() => () => {}), sendEmailVerification: jest.fn(() => Promise.resolve()), updateProfile: jest.fn(() => Promise.resolve()) }));
jest.mock("firebase/storage", () => ({ getStorage: jest.fn(() => ({})), ref: jest.fn(() => ({})), uploadBytes: jest.fn(() => Promise.resolve()), getDownloadURL: jest.fn(() => Promise.resolve("x")), deleteObject: jest.fn(() => Promise.resolve()) }));

// ---------- Navigation ----------
jest.mock("@react-navigation/native", () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), push: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => {}), removeListener: jest.fn(), dispatch: jest.fn(), reset: jest.fn(), canGoBack: () => true, isFocused: () => true };
  const React = require("react");
  return {
    useNavigation: () => nav,
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
    useFocusEffect: (cb) => React.useEffect(() => { const r = cb(); return typeof r === "function" ? r : undefined; }, []),
    NavigationContainer: ({ children }) => children,
    DefaultTheme: { colors: {} },
    DarkTheme: { colors: {} },
  };
});

// ---------- Native modules that aren't auto-mocked ----------
jest.mock("@stripe/stripe-react-native", () => {
  const { View } = require("react-native");
  return {
    CardField: (p) => <View {...p} />,
    StripeProvider: ({ children }) => children,
    useStripe: () => ({ confirmPayment: jest.fn(() => Promise.resolve({})), initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }),
    useConfirmPayment: () => ({ confirmPayment: jest.fn(() => Promise.resolve({})), loading: false }),
  };
});
jest.mock("react-native-qrcode-svg", () => (p) => { const { View } = require("react-native"); return <View {...p} />; });
jest.mock("@react-native-community/datetimepicker", () => (p) => { const { View } = require("react-native"); return <View {...p} />; });
jest.mock("expo-camera", () => { const { View } = require("react-native"); return { CameraView: (p) => <View {...p} />, useCameraPermissions: () => [{ granted: true }, jest.fn()], Camera: { requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })) } }; });

// ---------- Discover subfolder screens ----------
const screensDir = path.join(__dirname, "..");
const SUBFOLDERS = ["business", "matching", "payment", "wall"];
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "__tests__" || e.name === "__mocks__") return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith("Screen.js") ? [full] : [];
  });
const files = SUBFOLDERS.flatMap((sub) => {
  const dir = path.join(screensDir, sub);
  return fs.existsSync(dir) ? walk(dir) : [];
}).map((f) => path.relative(screensDir, f).replace(/\\/g, "/").replace(/\.js$/, ""));

// Rich generic params so screens that read nested params can still render.
const params = {
  conversationId: "event_e1", eventId: "e1", groupId: "g1", hostId: "h1",
  userId: "u1", planId: "p1", eventTitle: "Event", hostName: "Host",
  amount: 1000, price: 0, reservationId: "r1", bizId: "biz1", memberId: "m1",
  sessionId: "s1", classId: "c1", matchId: "mt1", packageId: "pk1",
  otherUser: { id: "u2", fullName: "Other", avatar: "😊", emoji: "😊" },
  profile: { userId: "u2", displayName: "Other", photoUrl: null, age: 28, compatibility: 80, profession: "Designer", lookingFor: [], interests: [], bio: "Hi", affinity: null },
  plan: { id: "p1", name: "Pack", priceCentavos: 19900, credits: 3, type: "credits" },
  member: { id: "m1", name: "Member", fullName: "Member" },
  scores: { OPENNESS: 3, CONSCIENTIOUSNESS: 4, EXTRAVERSION: 2, AGREEABLENESS: 5, NEUROTICISM: 3 },
  results: {}, answers: {},
  event: { id: "e1", title: "Event", date: new Date(Date.now() + 864e5).toISOString(), attendees: [], creatorId: "h1", price: 0 },
};
const routeProp = { params };
const navProp = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), push: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => () => {}), dispatch: jest.fn(), canGoBack: () => true };

describe("Subfolder screen smoke render", () => {
  it("found subfolder screens to test", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s renders without crashing", (name) => {
    // eslint-disable-next-line
    const mod = require(`../${name}`);
    const Screen = mod.default || mod;
    expect(Screen).toBeTruthy();
    expect(() => render(<Screen navigation={navProp} route={routeProp} />)).not.toThrow();
  });
});
