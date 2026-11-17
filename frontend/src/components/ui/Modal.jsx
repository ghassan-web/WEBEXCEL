import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import IconButton from "./IconButton";

export default function Modal({
  open,
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  maxWidth,
  footer,
  actions,
  children,
  className = "",
}) {
  const isVisible = open !== undefined ? open : isOpen;
  const resolvedFooter = footer !== undefined ? footer : actions;
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-6xl",
  };

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (isVisible) {
      previousActiveElement.current = document.activeElement;
      if (modalRef.current) {
        modalRef.current.focus();
      }

      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          onCloseRef.current?.();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
        if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-dialog-title" : undefined}
        aria-describedby={description ? "modal-dialog-description" : undefined}
        className={`relative w-full ${maxWidth || sizes[size] || sizes.md} bg-[var(--color-surface)] rounded-[var(--radius-surface)] shadow-[var(--shadow-overlay)] border border-[var(--color-line)] flex flex-col max-h-[90vh] z-10 focus:outline-none ${className}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-line)] shrink-0">
          <div className="flex flex-col gap-0.5 pr-4">
            {title && (
              <h3 id="modal-dialog-title" className="text-[var(--text-lead)] font-semibold text-[var(--color-ink)] tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p id="modal-dialog-description" className="text-[var(--text-caption)] text-[var(--color-ink-muted)]">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="Close dialog"
            icon={XMarkIcon}
            size="sm"
            onClick={onClose}
          />
        </div>

        <div className="p-6 overflow-y-auto modal-scroll flex-1 text-[var(--text-body)] text-[var(--color-ink-body)]">
          {children}
        </div>

        {resolvedFooter && (
          <div className="px-6 py-3.5 border-t border-[var(--color-line)] bg-[var(--color-surface-sunken)]/80 rounded-b-[var(--radius-surface)] flex items-center justify-end gap-2.5 shrink-0">
            {resolvedFooter}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
