/**
 * KIN-150 — useFocusRefresh must actually refetch on focus (not just on
 * mount, which is what broke Home's carousels: React Navigation tabs stay
 * mounted, so a plain useEffect(() => load(), []) only ever fires once for
 * the life of the app process). Mocks @react-navigation/native's
 * useFocusEffect to capture the callback the hook registers, so the test
 * can simulate real focus events on demand instead of only the one
 * mount-time call jest-expo's default environment would give it.
 */
import React, { forwardRef, useImperativeHandle } from "react";
import { render, act, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

let focusCallback = null;
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => {
    focusCallback = cb;
  },
}));

import { useFocusRefresh } from "../useFocusRefresh";

const Probe = forwardRef(function Probe({ loadFn, ttlMs }, ref) {
  const { loading, reload } = useFocusRefresh(loadFn, { ttlMs });
  useImperativeHandle(ref, () => ({ reload }), [reload]);
  return <Text>{loading ? "loading" : "idle"}</Text>;
});

const simulateFocus = () => act(() => focusCallback());

describe("useFocusRefresh", () => {
  beforeEach(() => {
    focusCallback = null;
  });

  it("loads on the first focus", async () => {
    const loadFn = jest.fn().mockResolvedValue(undefined);
    render(<Probe loadFn={loadFn} ttlMs={60000} />);
    simulateFocus();
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(1));
  });

  it("does NOT reload on a second focus while still within the TTL window", async () => {
    const loadFn = jest.fn().mockResolvedValue(undefined);
    render(<Probe loadFn={loadFn} ttlMs={60000} />);
    simulateFocus();
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(1));

    simulateFocus(); // refocus immediately — data is still fresh
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  it("reloads on focus once the TTL has elapsed — this is the actual KIN-150 fix", async () => {
    const loadFn = jest.fn().mockResolvedValue(undefined);
    render(<Probe loadFn={loadFn} ttlMs={10} />);
    simulateFocus();
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(1));

    await new Promise((resolve) => setTimeout(resolve, 25));
    simulateFocus();
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(2));
  });

  it("reload() always bypasses the TTL (pull-to-refresh escape hatch)", async () => {
    const loadFn = jest.fn().mockResolvedValue(undefined);
    const ref = React.createRef();
    render(<Probe ref={ref} loadFn={loadFn} ttlMs={60000} />);
    simulateFocus();
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(1));

    await act(async () => {
      await ref.current.reload();
    });
    expect(loadFn).toHaveBeenCalledTimes(2);
  });

  it("never gets stuck loading even if loadFn rejects (useAsyncLoad guarantee)", async () => {
    const loadFn = jest.fn().mockRejectedValue(new Error("boom"));
    const { getByText } = render(<Probe loadFn={loadFn} ttlMs={60000} />);
    simulateFocus();
    await waitFor(() => expect(getByText("idle")).toBeTruthy());
  });
});
