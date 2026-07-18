import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import ErrorBoundary from "../ErrorBoundary";

// @sentry/react-native ships ESM that jest's default transformIgnorePatterns
// doesn't transpile, and neither package is used by any other test yet --
// both need an explicit mock the first time they show up here.
jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("expo-updates", () => ({ reloadAsync: jest.fn() }));

function Bomb(): React.ReactElement {
  throw new Error("Boom");
}

describe("ErrorBoundary", () => {
  // React logs caught render errors to console.error itself -- expected
  // noise for these tests, silenced so it doesn't look like a failure.
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("renders children normally when nothing throws", async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>
    );

    expect(getByText("All good")).toBeTruthy();
  });

  it("shows the fallback screen and reports to Sentry when a child throws", async () => {
    const { getByText, queryByText } = await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(getByText("errorBoundary.title")).toBeTruthy();
    expect(queryByText("All good")).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect((Sentry.captureException as jest.Mock).mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("restart button skips the OTA reload path in a dev build", async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(getByText("errorBoundary.title")).toBeTruthy();

    await fireEvent.press(getByText("errorBoundary.restart"));

    // __DEV__ is true under jest, matching a real dev build -- pressing
    // restart resets local state instead of calling the production-only
    // OTA reload, which would be a no-op (or throw) outside a real build.
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });
});
