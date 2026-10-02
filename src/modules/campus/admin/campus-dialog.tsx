"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CampusDialog({
  children,
  onClose,
  title,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnTarget?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        aria-label={title}
        aria-modal="true"
        className={`campus-dialog${wide ? " campus-dialog-wide" : ""}`}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
        role="dialog"
      >
        <header className="dialog-header">
          <h2>{title}</h2>
          <button aria-label={`关闭${title}`} className="icon-button" onClick={onClose} ref={closeRef} type="button">
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </section>
    </div>
  );
}
