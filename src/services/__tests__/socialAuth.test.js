/**
 * KIN-229 — el alta social tiene que guardar el email en el doc de Firestore.
 *
 * El email vivía sólo en Firebase Auth. findUserByEmail consulta
 * `where("email","==",...)` contra `users`, así que devolvía null para todo el
 * mundo y no se podía invitar a nadie como co-anfitrión: el campo simplemente
 * no existía en ningún documento.
 *
 * Se prueba a través de signInWithGoogle, no exportando ensureUserDoc sólo para
 * el test: lo que importa es que un alta real deje el dato, no que una función
 * interna se comporte bien en aislamiento.
 *
 * El caso de Apple con "Hide My Email" —sin email— es el que decide la forma del
 * código: ahí NO se escribe la clave, en vez de guardar "". Una cadena vacía es
 * un valor, y sería un valor falso que además haría match con una búsqueda vacía.
 */
import { setDoc, getDoc } from "firebase/firestore";
import { signInWithCredential } from "firebase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { signInWithGoogle } from "../socialAuth";

jest.mock("../firebase", () => ({ auth: {}, db: {} }));
jest.mock("expo-constants", () => ({
  expoConfig: { extra: { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web", EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios" } },
}));
jest.mock("expo-apple-authentication", () => ({}));
jest.mock("expo-crypto", () => ({}));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
  },
}));
jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credential: jest.fn(() => ({ __cred: true })) },
  OAuthProvider: jest.fn(),
  signInWithCredential: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => ({ __ref: true })),
  getDoc: jest.fn(),
  setDoc: jest.fn(async () => {}),
}));

/** Un alta social nueva con el email que devuelva el proveedor. */
const signInAsNewUser = async (email) => {
  GoogleSignin.signIn.mockResolvedValue({ idToken: "tok" });
  signInWithCredential.mockResolvedValue({
    user: { uid: "u1", displayName: "Ada", email },
  });
  getDoc.mockResolvedValue({ exists: () => false }); // primera vez
  await signInWithGoogle();
  return setDoc.mock.calls[0]?.[1];
};

beforeEach(() => jest.clearAllMocks());

describe("ensureUserDoc (vía signInWithGoogle) — KIN-229", () => {
  it("guarda el email en el doc del usuario", async () => {
    const written = await signInAsNewUser("ada@example.com");
    expect(written.email).toBe("ada@example.com");
  });

  it("lo normaliza a minúsculas y sin espacios", async () => {
    // findUserByEmail compara exacto contra trim+lowercase; si se guarda con
    // mayúsculas, la búsqueda no encuentra a un usuario que sí existe.
    const written = await signInAsNewUser("  Ada@Example.COM  ");
    expect(written.email).toBe("ada@example.com");
  });

  it("NO escribe la clave cuando el proveedor no da email", async () => {
    // Apple con "Hide My Email". Guardar "" sería peor que no guardar nada.
    const written = await signInAsNewUser(null);
    expect(written).not.toHaveProperty("email");
  });

  it("tampoco la escribe si el email viene vacío o en blanco", async () => {
    expect(await signInAsNewUser("")).not.toHaveProperty("email");
    jest.clearAllMocks();
    expect(await signInAsNewUser("   ")).not.toHaveProperty("email");
  });

  it("sigue escribiendo el resto del perfil", async () => {
    // Guarda de no-regresión: el campo nuevo no debe haber desplazado nada.
    const written = await signInAsNewUser("ada@example.com");
    expect(written).toMatchObject({
      fullName: "Ada",
      profileCompleted: false,
      emailVerified: true,
      legalAccepted: false,
      role: "user",
    });
  });

  it("no reescribe el doc de alguien que ya existe", async () => {
    GoogleSignin.signIn.mockResolvedValue({ idToken: "tok" });
    signInWithCredential.mockResolvedValue({
      user: { uid: "u1", displayName: "Ada", email: "ada@example.com" },
    });
    getDoc.mockResolvedValue({ exists: () => true }); // ya estaba
    await signInWithGoogle();
    expect(setDoc).not.toHaveBeenCalled();
  });
});
