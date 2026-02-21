import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'camello-sidebar-collapsed';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* noop */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  return { collapsed, toggle } as const;
}
