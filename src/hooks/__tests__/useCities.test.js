/**
 * useCities — KIN-295 baja lógica de ciudades.
 *
 * A deactivated city stays in config/cities (flagged `inactive: true`)
 * instead of being dropped, because services/events already published store
 * the city LABEL and would orphan — unresolvable in their own edit screen,
 * invisible to every filter — the moment the id disappeared from the
 * catalog entirely. What matters here:
 *  - an entry with no `inactive` field is ACTIVE, explicitly, not by
 *    coincidence of it being falsy/undefined;
 *  - `cities` (active only) and `allCities` (everything) diverge exactly
 *    where an `inactive: true` entry exists;
 *  - the static LOCATIONS fallback (no entry ever carries the field) stays
 *    fully active, all three cities, under the same rule.
 */
import { renderHook, act } from "@testing-library/react-native";
import { onSnapshot } from "firebase/firestore";
import useCities from "../useCities";

jest.mock("../../services/firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: jest.fn(() => "cities-doc-ref"),
  onSnapshot: jest.fn(),
}));

const snap = (cities) => ({ exists: () => true, data: () => ({ cities }) });

describe("useCities", () => {
  beforeEach(() => {
    onSnapshot.mockReset();
  });

  it("falls back to the static LOCATIONS while loading, all three active", () => {
    onSnapshot.mockImplementation(() => () => {}); // never resolves — mirrors "still loading"
    const { result } = renderHook(() => useCities());
    expect(result.current.cities.map((c) => c.id)).toEqual(["tulum", "playa-del-carmen", "cancun"]);
    expect(result.current.allCities.map((c) => c.id)).toEqual(["tulum", "playa-del-carmen", "cancun"]);
  });

  it("treats an entry with no inactive field as active", () => {
    let onNext;
    onSnapshot.mockImplementation((ref, next) => {
      onNext = next;
      return () => {};
    });
    const { result } = renderHook(() => useCities());
    act(() => onNext(snap([{ id: "merida", label: "Mérida" }])));
    expect(result.current.cities).toEqual([{ id: "merida", label: "Mérida" }]);
    expect(result.current.allCities).toEqual([{ id: "merida", label: "Mérida" }]);
  });

  it("excludes an inactive entry from `cities` but keeps it in `allCities`", () => {
    let onNext;
    onSnapshot.mockImplementation((ref, next) => {
      onNext = next;
      return () => {};
    });
    const { result } = renderHook(() => useCities());
    act(() =>
      onNext(
        snap([
          { id: "merida", label: "Mérida" },
          { id: "oaxaca", label: "Oaxaca", inactive: true },
        ])
      )
    );
    expect(result.current.cities.map((c) => c.id)).toEqual(["merida"]);
    expect(result.current.allCities.map((c) => c.id)).toEqual(["merida", "oaxaca"]);
  });

  it("includeAll only prepends ALL to `cities`, never to `allCities`", () => {
    let onNext;
    onSnapshot.mockImplementation((ref, next) => {
      onNext = next;
      return () => {};
    });
    const { result } = renderHook(() => useCities({ includeAll: true }));
    act(() =>
      onNext(
        snap([
          { id: "merida", label: "Mérida" },
          { id: "oaxaca", label: "Oaxaca", inactive: true },
        ])
      )
    );
    expect(result.current.cities.map((c) => c.id)).toEqual(["all", "merida"]);
    expect(result.current.allCities.map((c) => c.id)).toEqual(["merida", "oaxaca"]);
  });
});
