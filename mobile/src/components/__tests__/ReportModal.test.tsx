import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import ReportModal from "../ReportModal";

describe("ReportModal", () => {
  it("shows the title, body, and all 4 reasons plus Cancel", async () => {
    const { getByText } = await render(
      <ReportModal visible={true} onCancel={jest.fn()} onSelectReason={jest.fn()} />
    );

    expect(getByText("report.title")).toBeTruthy();
    expect(getByText("report.body")).toBeTruthy();
    expect(getByText("report.reasonInaccurate")).toBeTruthy();
    expect(getByText("report.reasonOffensive")).toBeTruthy();
    expect(getByText("report.reasonSpam")).toBeTruthy();
    expect(getByText("report.reasonOther")).toBeTruthy();
    expect(getByText("common.cancel")).toBeTruthy();
  });

  it("calls onSelectReason with the pressed reason's value", async () => {
    const onSelectReason = jest.fn();
    const { getByText } = await render(
      <ReportModal visible={true} onCancel={jest.fn()} onSelectReason={onSelectReason} />
    );

    await fireEvent.press(getByText("report.reasonOffensive"));

    expect(onSelectReason).toHaveBeenCalledWith("offensive");
  });

  it("calls onCancel when Cancel is pressed", async () => {
    const onCancel = jest.fn();
    const { getByText } = await render(
      <ReportModal visible={true} onCancel={onCancel} onSelectReason={jest.fn()} />
    );

    await fireEvent.press(getByText("common.cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
