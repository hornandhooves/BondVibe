/**
 * KIN-232 — el badge de idioma leía el campo equivocado.
 *
 * Leía `event.language` (string), que sólo escribía Edit Event, con un valor
 * especial "both". Create escribe `languages` (array) y SearchEvents filtra por
 * ese array: un evento creado normalmente no tenía `language`, así que **no
 * mostraba badge en absoluto**, y uno editado sí — por el campo que nadie más
 * usaba.
 *
 * Con el array no existe "both": simplemente hay más de un elemento.
 *
 * Y hay 14 idiomas en el catálogo, no dos. El badge anterior hacía
 * `language === "es" ? Spanish : English`, así que un evento en francés,
 * japonés o alemán se anunciaba como **English**. Eso también se corrige aquí,
 * y por eso hay un caso para un idioma fuera del par en/es.
 */
import { languageBadgeText } from "../EventDetailScreen";

// Importar la pantalla arrastra su árbol de dependencias; sólo se necesita el
// helper puro, así que se cortan las que tocan red o nativo. babel-jest sube
// estos jest.mock por encima del import, así que el orden aquí es sólo lectura.
jest.mock("../../services/firebase", () => ({ db: {}, auth: { currentUser: null } }));
jest.mock("firebase/firestore", () => ({}));
jest.mock("firebase/functions", () => ({ getFunctions: jest.fn(), httpsCallable: jest.fn() }));

// Sólo se traducen las dos llaves que el badge usa; cualquier otra devuelve la
// llave, que es lo que haría notar un cambio accidental de copy.
const t = (k) =>
  ({
    "eventDetail.languageSpanish": "Spanish",
    "eventDetail.languageEnglish": "English",
  }[k] || k);

describe("languageBadgeText — KIN-232", () => {
  it("no muestra badge cuando no hay idiomas", () => {
    expect(languageBadgeText([], t)).toBeNull();
    expect(languageBadgeText(undefined, t)).toBeNull();
    expect(languageBadgeText(null, t)).toBeNull();
  });

  it("nombra un idioma único en en/es igual que antes", () => {
    expect(languageBadgeText(["es"], t)).toBe("Spanish");
    expect(languageBadgeText(["en"], t)).toBe("English");
  });

  it("nombra correctamente un idioma fuera del par en/es", () => {
    // Antes esto decía "English". Hay 14 idiomas en el catálogo.
    expect(languageBadgeText(["fr"], t)).toBe("Français");
    expect(languageBadgeText(["ja"], t)).toBe("日本語");
  });

  it("lista los códigos cuando hay más de uno, sin decir 'Bilingual'", () => {
    // "Bilingual" deja de ser cierto en cuanto son tres.
    expect(languageBadgeText(["es", "en"], t)).toBe("ES · EN");
    expect(languageBadgeText(["es", "en", "fr"], t)).toBe("ES · EN · FR");
  });

  it("ignora huecos en el array en vez de pintar un separador suelto", () => {
    expect(languageBadgeText(["es", null, undefined], t)).toBe("Spanish");
    expect(languageBadgeText([null, ""], t)).toBeNull();
  });

  it("cae en el código en mayúsculas si el idioma no está en el catálogo", () => {
    // Dato inesperado: mejor mostrar "XX" que inventar un idioma.
    expect(languageBadgeText(["xx"], t)).toBe("XX");
  });

  it("no depende del campo viejo `language`", () => {
    // Guarda explícita: si alguien reintrodujera la lectura del string, un
    // evento con sólo el campo viejo volvería a pintar badge y esto lo vería.
    expect(languageBadgeText(undefined, t)).toBeNull();
  });
});
