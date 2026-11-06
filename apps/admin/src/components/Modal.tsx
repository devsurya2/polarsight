import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, description, onClose, children, footer, wide }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so keyboard users are not stranded
    // behind it on the page underneath.
    panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button"
    )?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel w-full ${wide ? "max-w-3xl" : "max-w-lg"} shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-faint">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="px-5 py-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function Confirm({
  open, title, message, confirmLabel = "Confirm", destructive, busy, onConfirm, onCancel,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-body">{message}</p>
    </Modal>
  );
}
