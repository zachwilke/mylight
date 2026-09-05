// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TimedEventCards } from "./TimedEventCards";

afterEach(cleanup);
it("renders overlapping cards side by side with full accessible names and original event IDs", () => {
  const onEventClick = vi.fn();
  const base = {
    title: "Family appointment",
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
  };
  render(
    <TimedEventCards
      events={[
        { ...base, id: "slice-a", original_id: 10, occurrenceId: "occ-a" },
        {
          ...base,
          id: "slice-b",
          original_id: 20,
          occurrenceId: "occ-b",
          title: "Dentist",
        },
      ]}
      onEventClick={onEventClick}
    />,
  );
  const a = screen.getByRole("button", {
    name: /Family appointment.*9:00 AM.*10:00 AM.*Alex/,
  });
  const b = screen.getByRole("button", { name: /Dentist/ });
  expect(a.style.width).toBe("calc(50% - 6px)");
  expect(a.style.left).not.toBe(b.style.left);
  expect(a.tabIndex).toBe(0);
  fireEvent.click(b);
  expect(onEventClick).toHaveBeenCalledWith(
    expect.objectContaining({ id: 20, title: "Dentist" }),
  );
});
