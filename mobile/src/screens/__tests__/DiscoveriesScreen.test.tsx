import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getDiscoveries: jest.fn(),
}));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import DiscoveriesScreen from "../DiscoveriesScreen";
import { getDiscoveries } from "../../services/api";

const mockGetDiscoveries = getDiscoveries as jest.Mock;

const ALHAMBRA = {
  id: "d1",
  geo_hash: "9q8zn1n",
  mood: "time_machine",
  street_name: "Polk Street",
  neighborhood: "Polk Gulch",
  city: "San Francisco",
  teaser: "In 1926, the Alhambra Theatre opened at 2330 Polk Street.",
  discovered_at: "2026-09-14T20:43:00+00:00",
};

const DRAGON = {
  id: "d2",
  geo_hash: "9q8yyt2",
  mood: "hidden_city",
  street_name: "Ross Alley",
  neighborhood: "Chinatown",
  city: "San Francisco",
  teaser: "Look closely at the red-bricked wall past 822 Washington Street.",
  discovered_at: "2026-09-14T21:00:00+00:00",
};

function baseProps(overrides = {}) {
  return { onBack: jest.fn(), ...overrides };
}

describe("DiscoveriesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the loading state before the fetch resolves", async () => {
    mockGetDiscoveries.mockReturnValue(new Promise(() => {})); // never resolves
    const { findByText } = await render(<DiscoveriesScreen {...baseProps()} />);
    expect(await findByText("discoveries.loading")).toBeTruthy();
  });

  it("shows the failed state when the fetch rejects, with a retry", async () => {
    mockGetDiscoveries.mockRejectedValue(new Error("network error"));
    const { findByText } = await render(<DiscoveriesScreen {...baseProps()} />);
    expect(await findByText("discoveries.failedToLoad")).toBeTruthy();
  });

  it("shows the empty state for a caller with nothing collected yet", async () => {
    mockGetDiscoveries.mockResolvedValue({ discoveries: [], total_count: 0 });
    const { findByText } = await render(<DiscoveriesScreen {...baseProps()} />);
    expect(await findByText("discoveries.empty")).toBeTruthy();
  });

  it("renders each discovery's place and teaser, and the stat tiles", async () => {
    mockGetDiscoveries.mockResolvedValue({ discoveries: [ALHAMBRA, DRAGON], total_count: 2 });
    const { findByText, getAllByTestId, getAllByText } = await render(<DiscoveriesScreen {...baseProps()} />);

    expect(await findByText("Polk Street · Polk Gulch")).toBeTruthy();
    expect(await findByText(`“${ALHAMBRA.teaser}”`)).toBeTruthy();
    expect(getAllByTestId("discovery-card")).toHaveLength(2);
    // Appears twice: once as this card's mood tag, once as the filter chip.
    expect(getAllByText("moods.time_machine.label")).toHaveLength(2);

    // 2 collected, 2 distinct neighborhoods, 2 distinct moods -- all three
    // stat tiles happen to read "2" for this fixture.
    expect(getAllByText("2")).toHaveLength(3);
  });

  it("derives the card name without cutting at a street abbreviation", async () => {
    // Regression guard: splitting on the first "." alone used to turn
    // "823 Grant Ave. was once a busy corner store." into the nonsensical
    // title "823 Grant Ave".
    const abbreviationCase = {
      ...ALHAMBRA,
      id: "d3",
      teaser: "823 Grant Ave. was once a busy corner store, back before the block changed hands twice.",
    };
    mockGetDiscoveries.mockResolvedValue({ discoveries: [abbreviationCase], total_count: 1 });
    const { findByText, queryByText } = await render(<DiscoveriesScreen {...baseProps()} />);

    await findByText(`“${abbreviationCase.teaser}”`); // wait for the card to render
    expect(queryByText("823 Grant Ave")).toBeNull();
  });

  it("filters the list when a mood chip is pressed", async () => {
    mockGetDiscoveries.mockResolvedValue({ discoveries: [ALHAMBRA, DRAGON], total_count: 2 });
    const { findByText, findByTestId, getAllByTestId, queryByText } = await render(<DiscoveriesScreen {...baseProps()} />);

    await findByText("Polk Street · Polk Gulch"); // wait for the list to settle

    fireEvent.press(await findByTestId("filter-chip-hidden_city"));

    await waitFor(() => expect(getAllByTestId("discovery-card")).toHaveLength(1));
    expect(queryByText("Polk Street · Polk Gulch")).toBeNull();
  });

  it("calls onBack when the back button is pressed", async () => {
    mockGetDiscoveries.mockResolvedValue({ discoveries: [], total_count: 0 });
    const props = baseProps();
    const { findByLabelText } = await render(<DiscoveriesScreen {...props} />);

    fireEvent.press(await findByLabelText("common.back"));

    expect(props.onBack).toHaveBeenCalled();
  });
});
