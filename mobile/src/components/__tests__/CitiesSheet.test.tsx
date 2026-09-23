import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import CitiesSheet from "../CitiesSheet";
import { ExploredCity } from "../../services/api";

const SAMPLE: ExploredCity[] = [
  { city: "Chicago", count: 14, percentage: null },
  { city: "San Francisco", count: 20, percentage: 20 },
];

describe("CitiesSheet", () => {
  it("shows the loading state", async () => {
    const { getByText } = await render(
      <CitiesSheet visible={true} onClose={jest.fn()} cities={[]} loading={true} failed={false} />
    );
    expect(getByText("cities.loading")).toBeTruthy();
  });

  it("shows the failed state instead of an empty list when the fetch errors", async () => {
    const { getByText } = await render(
      <CitiesSheet visible={true} onClose={jest.fn()} cities={[]} loading={false} failed={true} />
    );
    expect(getByText("cities.failedToLoad")).toBeTruthy();
  });

  it("shows the empty state when there's real data (not loading, not failed) but no cities yet", async () => {
    const { getByText } = await render(
      <CitiesSheet visible={true} onClose={jest.fn()} cities={[]} loading={false} failed={false} />
    );
    expect(getByText("cities.empty")).toBeTruthy();
  });

  it("renders each city's name and count", async () => {
    const { getByText } = await render(
      <CitiesSheet visible={true} onClose={jest.fn()} cities={SAMPLE} loading={false} failed={false} />
    );

    expect(getByText("Chicago")).toBeTruthy();
    expect(getByText("San Francisco")).toBeTruthy();
    expect(getByText('cities.spots {"count":14}')).toBeTruthy();
    expect(getByText('cities.spots {"count":20}')).toBeTruthy();
  });

  it("uses the singular string for exactly 1 spot", async () => {
    const { getByText } = await render(
      <CitiesSheet
        visible={true}
        onClose={jest.fn()}
        cities={[{ city: "New York", count: 1, percentage: null }]}
        loading={false}
        failed={false}
      />
    );
    expect(getByText('cities.spot {"count":1}')).toBeTruthy();
  });

  it("shows a percentage badge only for a city with a mapped boundary", async () => {
    const { getByText, queryByText } = await render(
      <CitiesSheet visible={true} onClose={jest.fn()} cities={SAMPLE} loading={false} failed={false} />
    );

    // San Francisco has percentage: 20 -- shows the percent badge.
    expect(getByText('cities.percentExplored {"percent":20}')).toBeTruthy();
    // Chicago has percentage: null -- shows the "no boundary" note instead,
    // and there should be exactly one such note (not one per row).
    const noBoundaryNotes = queryByText("cities.noBoundaryYet");
    expect(noBoundaryNotes).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = jest.fn();
    const { getAllByText } = await render(
      <CitiesSheet visible={true} onClose={onClose} cities={SAMPLE} loading={false} failed={false} />
    );

    // closeA11y is used as both the accessibilityLabel and the button's
    // own text -- getAllByText covers either being matched first.
    await fireEvent.press(getAllByText("cities.closeA11y")[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
