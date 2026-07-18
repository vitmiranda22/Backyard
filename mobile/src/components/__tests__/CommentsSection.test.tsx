import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

jest.mock("../../services/api", () => ({
  getComments: jest.fn(),
  postComment: jest.fn(),
  reportComment: jest.fn(),
}));
jest.mock("../../services/toast", () => ({ showToast: jest.fn() }));
jest.mock("../../services/haptics", () => ({ tap: jest.fn() }));

import CommentsSection from "../CommentsSection";
import { getComments, reportComment } from "../../services/api";
import { showToast } from "../../services/toast";

const mockGetComments = getComments as jest.Mock;
const mockReportComment = reportComment as jest.Mock;
const mockShowToast = showToast as jest.Mock;

function comment(overrides = {}) {
  return {
    comment_id: "c1",
    tour_id: "tour-1",
    body: "Great walk!",
    is_anonymous: false,
    display_name: "Ada",
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("CommentsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("submits a comment report with the chosen reason and shows a confirmation toast", async () => {
    mockGetComments.mockResolvedValue([comment()]);
    mockReportComment.mockResolvedValue({ report_id: "r1", target_type: "comment", target_id: "c1", reason: "offensive", status: "pending" });

    const { findByText } = await render(<CommentsSection tourId="tour-1" />);
    await findByText("Great walk!");

    await fireEvent.press(await findByText("comments.reportLink"));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const offensiveButton = buttons.find((b: any) => b.text === "report.reasonOffensive");
    await offensiveButton.onPress();

    expect(mockReportComment).toHaveBeenCalledWith("tour-1", "c1", "offensive");
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("report.submitted"));
  });

  it("shows a toast when submitting a comment report fails", async () => {
    mockGetComments.mockResolvedValue([comment()]);
    mockReportComment.mockRejectedValue(new Error("network error"));

    const { findByText } = await render(<CommentsSection tourId="tour-1" />);
    await findByText("Great walk!");

    await fireEvent.press(await findByText("comments.reportLink"));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const spamButton = buttons.find((b: any) => b.text === "report.reasonSpam");
    await spamButton.onPress();

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("report.couldntSubmit"));
  });

  it("shows the empty state when there are no comments", async () => {
    mockGetComments.mockResolvedValue([]);

    const { findByText } = await render(<CommentsSection tourId="tour-1" />);

    expect(await findByText("comments.noneYet")).toBeTruthy();
  });
});
