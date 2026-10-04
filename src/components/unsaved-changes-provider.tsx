"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ConfirmNavigation = (action: () => void) => void;

const UnsavedChangesContext = createContext<{
  confirmNavigation: ConfirmNavigation;
  setDirty: (dirty: boolean) => void;
}>({
  confirmNavigation: (action) => action(),
  setDirty: () => undefined,
});

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const confirmNavigation = useCallback<ConfirmNavigation>((action) => {
    if (!dirty || window.confirm("当前修改尚未保存，确定要离开吗？")) action();
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const value = useMemo(() => ({ confirmNavigation, setDirty }), [confirmNavigation]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

export function useConfirmNavigation() {
  return useContext(UnsavedChangesContext).confirmNavigation;
}

export function useUnsavedChanges(dirty: boolean) {
  const { confirmNavigation, setDirty } = useContext(UnsavedChangesContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  return confirmNavigation;
}
