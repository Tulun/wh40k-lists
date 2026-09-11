import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Centered confirmation modal for destructive actions. Replaces
 * window.confirm, which iOS standalone/PWA browsers silently suppress —
 * returning false and making the action look broken.
 */
export default function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    // Portal to <body>: sticky/backdrop-blur ancestors would clip a fixed dialog.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 animate-fade-in bg-black/70"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-pop-in rounded-lg border border-edge bg-surface p-4 shadow-2xl">
        <p className="text-sm font-bold">{title}</p>
        {detail && <p className="mt-1 text-xs text-ink-dim">{detail}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded-md bg-panel px-4 py-2 text-sm font-semibold text-ink-dim hover:bg-edge hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-opponent/15 px-4 py-2 text-sm font-bold text-opponent hover:bg-opponent/25"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
