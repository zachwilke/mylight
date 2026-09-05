// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import type { FamilyMember } from "../../types";
import { CalendarFamilyFilters } from "./components/CalendarFamilyFilters";

vi.mock("../../hooks/useCalendarEvents", () => ({
  useCalendarEvents: vi.fn(),
}));
vi.mock("./components/EventModal", () => ({ EventModal: () => null }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const members: FamilyMember[] = [10, 20].map((id) => ({
  id,
  name: "Alex",
  color: null,
  avatar: null,
  stars: 0,
  phone: null,
  visible: true,
}));

function fixture() {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return {
    members,
    events: [
      { id: 1, title: "First Alex appointment", member: members[0] },
      { id: 2, title: "Second Alex appointment", member: members[1] },
      {
        id: 3,
        title: "Shared picnic",
        member: { ...members[0], id: 0, name: "Family" },
      },
    ].map((event) => ({
      ...event,
      original_id: event.id,
      occurrenceId: `${event.id}-occ`,
      start_date: date.toISOString(),
      date,
      end: new Date(date.getTime() + 3600000),
      startMinutes: 540,
      durationMinutes: 60,
    })),
    error: "",
    loading: false,
    retry: () => {},
  };
}

it("retains ID-based selections across month, day, week, agenda, navigation and refresh", () => {
  vi.mocked(useCalendarEvents).mockReturnValue(fixture());
  render(<CalendarView />);
  fireEvent.click(screen.getByRole("button", { name: "Alex · #20" }));
  expect(screen.queryByText("First Alex appointment")).toBeNull();
  expect(screen.queryByText("Shared picnic")).toBeNull();
  expect(screen.getByText("Second Alex appointment")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "day" }));
  expect(screen.queryByText("First Alex appointment")).toBeNull();
  expect(screen.getByText("Second Alex appointment")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next period" }));
  expect(
    screen
      .getByRole("button", { name: "Alex · #20" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  fireEvent.click(screen.getByRole("button", { name: "week" }));
  expect(screen.queryByText("First Alex appointment")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
  expect(screen.getByText("Second Alex appointment")).toBeTruthy();
  fireEvent(window, new globalThis.Event("system-update"));
  expect(
    screen
      .getByRole("button", { name: "Alex · #20" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Shared" }));
  expect(screen.getByText("Shared picnic")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Everyone" }));
  expect(screen.getByText("First Alex appointment")).toBeTruthy();
});

it("explains empty selection and date ranges with no matching events", () => {
  vi.mocked(useCalendarEvents).mockReturnValue(fixture());
  render(<CalendarView />);
  const alex = screen.getByRole("button", { name: "Alex · #10" });
  fireEvent.click(alex);
  fireEvent.click(alex);
  expect(screen.getByRole("status").textContent).toContain("Nobody selected");
  expect(screen.queryByText("First Alex appointment")).toBeNull();
  fireEvent.click(alex);
  vi.mocked(useCalendarEvents).mockReturnValue({ ...fixture(), events: [] });
  fireEvent.click(screen.getByRole("button", { name: "Next period" }));
  expect(screen.getByRole("status").textContent).toContain(
    "No events match this selection",
  );
});

it("keeps unavailable selected members removable and distinguishes a member named Shared", () => {
  const change = vi.fn();
  render(
    <CalendarFamilyFilters
      members={[{ ...members[0], name: "Shared" }]}
      selection={[99]}
      onChange={change}
      empty
    />,
  );
  expect(screen.getByRole("button", { name: "Shared · #0" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Shared · #10" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Unavailable member #99" }),
  );
  expect(change).toHaveBeenCalledWith([]);
});
