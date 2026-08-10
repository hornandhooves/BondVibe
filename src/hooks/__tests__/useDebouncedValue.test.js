/**
 * useDebouncedValue — the rate-limit guard behind both artist search (KIN-200)
 * and wall song search (KIN-201).
 *
 * The test that matters is "rapid typing publishes ONCE": if the debounce
 * degraded into a plain delay, every keystroke would still fire a request and
 * the iTunes ~20 req/min ceiling would be blown inside one typed word — with no
 * visible symptom until Apple starts refusing.
 */
import { renderHook, act } from "@testing-library/react-native";
import { useDebouncedValue } from "../useDebouncedValue";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useDebouncedValue", () => {
  it("returns the initial value straight away", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 400));
    expect(result.current).toBe("a");
  });

  it("does not publish before the delay has elapsed", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => { jest.advanceTimersByTime(399); });
    expect(result.current).toBe("a");
  });

  it("publishes once the delay elapses", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current).toBe("ab");
  });

  it("RAPID TYPING PUBLISHES ONCE — a pending publish is cancelled, not queued", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
      initialProps: { v: "s" },
    });
    // Six keystrokes 100ms apart: a delay would emit six times, a debounce once.
    ["so", "sod", "soda", "sodas", "sodast"].forEach((v) => {
      rerender({ v });
      act(() => { jest.advanceTimersByTime(100); });
    });
    expect(result.current).toBe("s"); // nothing published mid-burst
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current).toBe("sodast"); // only the final value
  });
});
