// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);
it("prevents duplicate confirmation and dismissal while the action is pending", async () => {
  let finish!: () => void;
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      onConfirm={onConfirm}
      onClose={onClose}
      title="Delete fixture"
      message="Test only"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Working…" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => finish());
  expect(
    (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  // Callers deliberately own successful closure; a handled API error may resolve.
  expect(onClose).not.toHaveBeenCalled();
});
it("renders rejected callbacks and permits retry without closing", async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error("Test save failed"));
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      onConfirm={onConfirm}
      onClose={onClose}
      title="Delete fixture"
      message="Test only"
    />,
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Delete" })),
  );
  expect(screen.getByRole("alert").textContent).toContain("Test save failed");
  expect(onClose).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Delete",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
