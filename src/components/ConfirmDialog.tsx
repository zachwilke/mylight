import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Modal } from "./ui/Modal";

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  type = "danger",
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  type?: "danger" | "info";
}) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isOpen) setError("");
  }, [isOpen]);
  const close = () => {
    if (!inFlight.current) onClose();
  };
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onConfirm();
      // Callers own closing on success: several handle errors internally, so a
      // resolved callback alone does not imply that the operation succeeded.
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete this action. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="sm"
      showCloseButton={false}
      label={title}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
              type === "danger"
                ? "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                : "bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400",
            )}
          >
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            {message}
          </p>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-700 dark:text-red-300 mb-4"
            >
              {error}
            </p>
          )}
          <div className="flex gap-3" aria-busy={pending}>
            <button
              onClick={close}
              disabled={pending}
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={pending}
              onClick={() => void confirm()}
              className={cn(
                "flex-1 px-4 py-2.5 text-white font-bold rounded-xl transition-colors shadow-lg shadow-gray-200 dark:shadow-none",
                type === "danger"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-charcoal dark:bg-gray-100 dark:text-charcoal hover:bg-gray-800 dark:hover:bg-white",
              )}
            >
              {pending ? "Working…" : confirmText}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
