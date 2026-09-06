// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WeekView } from "./WeekView";
import { useCalendarEvents } from "../../../hooks/useCalendarEvents";

vi.mock("../../../hooks/useCalendarEvents", () => ({
  useCalendarEvents: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("switches a busy week to a readable agenda and back without losing events", () => {
  vi.mocked(useCalendarEvents).mockReturnValue({
    members: [],
    events: [
      {
        id: "slice",
        original_id: 7,
        occurrenceId: "occ",
        title: "School appointment",
        start_date: "2026-09-05T09:00:00",
        date: new Date(2026, 8, 5, 9),
        end: new Date(2026, 8, 5, 10),
        startMinutes: 540,
        durationMinutes: 60,
        member: {
          id: 1,
          name: "Alex",
          color: null,
          avatar: null,
          stars: 0,
          phone: null,
          visible: true,
        },
      },
    ],
    loading: false,
    error: "",
    retry: () => {},
  });
  render(
    <WeekView
      currentDate={new Date(2026, 8, 5)}
      onEventClick={() => {}}
      refreshTrigger={0}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Time grid" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByTitle(/School appointment/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
  expect(screen.queryByTitle(/School appointment/)).toBeNull();
  expect(screen.getByText("School appointment")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Agenda" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Time grid" }));
  expect(screen.queryByTitle(/School appointment/)).not.toBeNull();
});
