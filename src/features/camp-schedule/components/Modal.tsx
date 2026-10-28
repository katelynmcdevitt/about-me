import { useEffect, useRef, type ReactNode } from "react";

// Native dialogs provide keyboard focus containment, Escape, and focus restoration.
export default function Modal({
  children,
  onClose,
  className = "",
  label,
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  label?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
