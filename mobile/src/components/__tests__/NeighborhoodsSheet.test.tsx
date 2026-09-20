import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import NeighborhoodsSheet from "../NeighborhoodsSheet";
import { ExploredNeighborhood } from "../../services/api";

const SAMPLE: ExploredNeighborhood[] = [
  { neighborhood: "Mission", city: "San Francisco", count: 14, percentage: null },
  { neighborhood: "Western Addition", city: "San Francisco", count: 20, percentage: 20 },
];

describe("NeighborhoodsSheet", () => {
  it("shows the loading state", async () => {
    const { getByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={jest.fn()} neighborhoods={[]} loading={true} failed={false} />
    );
    expect(getByText("neighborhoods.loading")).toBeTruthy();
  });

  it("shows the failed state instead of an empty list when the fetch errors", async () => {
    const { getByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={jest.fn()} neighborhoods={[]} loading={false} failed={true} />
    );
    expect(getByText("neighborhoods.failedToLoad")).toBeTruthy();
  });

  it("shows the empty state when there's real data (not loading, not failed) but no neighborhoods yet", async () => {
    const { getByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={jest.fn()} neighborhoods={[]} loading={false} failed={false} />
    );
    expect(getByText("neighborhoods.empty")).toBeTruthy();
  });

  it("renders each neighborhood's name, city, and count", async () => {
    const { getByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={jest.fn()} neighborhoods={SAMPLE} loading={false} failed={false} />
    );

    expect(getByText("Mission")).toBeTruthy();
    expect(getByText("Western Addition")).toBeTruthy();
    expect(getByText('neighborhoods.spots {"count":14}')).toBeTruthy();
    expect(getByText('neighborhoods.spots {"count":20}')).toBeTruthy();
  });

  it("uses the singular string for exactly 1 spot", async () => {
    const { getByText } = await render(
      <NeighborhoodsSheet
        visible={true}
        onClose={jest.fn()}
        neighborhoods={[{ neighborhood: "Chinatown", city: "San Francisco", count: 1, percentage: null }]}
        loading={false}
        failed={false}
      />
    );
    expect(getByText('neighborhoods.spot {"count":1}')).toBeTruthy();
  });

  it("shows a percentage badge only for a neighborhood with a mapped boundary", async () => {
    const { getByText, queryByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={jest.fn()} neighborhoods={SAMPLE} loading={false} failed={false} />
    );

    // Western Addition has percentage: 20 -- shows the percent badge.
    expect(getByText('neighborhoods.percentExplored {"percent":20}')).toBeTruthy();
    // Mission has percentage: null -- shows the "no boundary" note instead,
    // and there should be exactly one such note (not one per row).
    const noBoundaryNotes = queryByText("neighborhoods.noBoundaryYet");
    expect(noBoundaryNotes).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = jest.fn();
    const { getAllByText } = await render(
      <NeighborhoodsSheet visible={true} onClose={onClose} neighborhoods={SAMPLE} loading={false} failed={false} />
    );

    // closeA11y is used as both the accessibilityLabel and the button's
    // own text -- getAllByText covers either being matched first.
    await fireEvent.press(getAllByText("neighborhoods.closeA11y")[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
