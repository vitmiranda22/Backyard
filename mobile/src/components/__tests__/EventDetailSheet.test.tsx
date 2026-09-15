import React from "react";
import { render } from "@testing-library/react-native";
import EventDetailSheet from "../EventDetailSheet";
import { NearbyEvent } from "../../services/api";

function makeEvent(overrides: Partial<NearbyEvent> = {}): NearbyEvent {
  return {
    id: "event-1",
    name: "Sunset Street Festival",
    description: "Live music and food stalls.",
    category: "festival",
    city: "San Francisco",
    center_lat: 37.7749,
    center_lng: -122.4194,
    radius_m: 300,
    start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    source_url: null,
    distance_m: 120,
    phase: "happening",
    ...overrides,
  };
}

describe("EventDetailSheet", () => {
  it("renders nothing when there's no event", async () => {
    const { queryByText } = await render(
      <EventDetailSheet event={null} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    expect(queryByText("Sunset Street Festival")).toBeNull();
  });

  it("shows the event name and description when visible", async () => {
    const { getByText } = await render(
      <EventDetailSheet event={makeEvent()} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    expect(getByText("Sunset Street Festival")).toBeTruthy();
    expect(getByText("Live music and food stalls.")).toBeTruthy();
  });

  it("picks the happening-now phase key for an event within its time window", async () => {
    const { getByText } = await render(
      <EventDetailSheet event={makeEvent()} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    // i18n isn't initialized in this test file, so useTranslation()'s t()
    // falls back to returning the raw key -- this still proves the
    // component picked the "happening" branch over "starts in"/"ended".
    expect(getByText("events.phaseHappeningNow")).toBeTruthy();
  });

  it("picks the starts-in phase key for a future event", async () => {
    const future = makeEvent({
      start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      phase: "upcoming",
    });
    const { getByText } = await render(
      <EventDetailSheet event={future} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    expect(getByText(/^events\.phaseStartsIn /)).toBeTruthy();
  });

  it("picks the ended-ago phase key for a past event", async () => {
    const past = makeEvent({
      start_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      phase: "ended",
    });
    const { getByText } = await render(
      <EventDetailSheet event={past} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    expect(getByText(/^events\.phaseEndedAgo /)).toBeTruthy();
  });

  it("falls back to the no-description key when the event has no description", async () => {
    const { getByText } = await render(
      <EventDetailSheet event={makeEvent({ description: "" })} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    expect(getByText("events.noDescription")).toBeTruthy();
  });

  it("does not render a waypoint compass when there's no user location", async () => {
    const { queryByText } = await render(
      <EventDetailSheet event={makeEvent()} visible={true} onClose={jest.fn()} userLocation={null} />
    );
    // WaypointCompass renders its distanceLabel as plain text like "42m · N" --
    // absent userLocation, the compassRow block is skipped entirely.
    expect(queryByText(/m · /)).toBeNull();
  });

  it("renders a waypoint compass distance label when a user location is given", async () => {
    const { getByText } = await render(
      <EventDetailSheet
        event={makeEvent()}
        visible={true}
        onClose={jest.fn()}
        userLocation={{ lat: 37.7739, lng: -122.4184 }}
      />
    );
    expect(getByText(/m · /)).toBeTruthy();
  });
});
