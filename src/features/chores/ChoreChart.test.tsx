// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChoreChart } from "./ChoreChart";
import { apiFetch } from "../../lib/api";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("does not let an older reload overwrite a pending task completion", async () => {
  let resolveStale!: (response: Response) => void;
  let resolveSave!: (response: Response) => void;
  let reads = 0;
  let saved = false;
  let writes = 0;
  const chores = (completed: boolean) => ({
    Sam: [
      {
        id: 1,
        title: "Feed cat",
        member_id: 1,
        time_of_day: "Morning",
        completed,
      },
    ],
  });
  const response = (value: unknown) => new Response(JSON.stringify(value));
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === "/api/chores/1/toggle") {
      writes++;
      return new Promise<Response>((resolve) => {
        resolveSave = resolve;
      });
    }
    if (path === "/api/chores") {
      reads++;
      if (reads === 2)
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      return response(chores(saved));
    }
    if (path === "/api/family")
      return response([
        { id: 1, name: "Sam", stars: saved ? 1 : 0, visible: true },
      ]);
    if (path === "/api/settings")
      return response({
        enable_confetti: "false",
        enable_major_celebration: "false",
      });
    throw new Error(`Unexpected test request ${path}`);
  });
  render(<ChoreChart />);
  const button = await screen.findByRole("button", { name: "Feed cat" });
  await act(async () => {
    window.dispatchEvent(new Event("system-update"));
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(writes).toBe(1);
  expect(screen.getByText("Feed cat").className).toContain("line-through");
  await act(async () => resolveStale(response(chores(false))));
  expect(screen.getByText("Feed cat").className).toContain("line-through");
  saved = true;
  await act(async () => resolveSave(response({ success: true })));
  expect(reads).toBe(3);
  expect(screen.getByText("Feed cat").className).toContain("line-through");
});
