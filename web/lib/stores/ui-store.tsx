"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { SIDEBAR_COOKIE } from "@/lib/config";

/** Состояние интерфейса (не данные): сайдбар, мобильное меню, командная палитра. Store создаётся на каждый запрос/клиент через провайдер. */
export interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  paletteOpen: boolean;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setPalette: (open: boolean) => void;
}

function writeSidebarCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

export function createUiStore(initialCollapsed: boolean): StoreApi<UiState> {
  return createStore<UiState>()((set, get) => ({
    sidebarCollapsed: initialCollapsed,
    mobileNavOpen: false,
    paletteOpen: false,
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      writeSidebarCookie(next);
      set({ sidebarCollapsed: next });
    },
    setMobileNav: (open) => set({ mobileNavOpen: open }),
    setPalette: (open) => set({ paletteOpen: open })
  }));
}

const UiStoreContext = createContext<StoreApi<UiState> | null>(null);

export function UiStoreProvider({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [store] = useState(() => createUiStore(initialCollapsed));
  return <UiStoreContext.Provider value={store}>{children}</UiStoreContext.Provider>;
}

export function useUi<T>(selector: (s: UiState) => T): T {
  const store = useContext(UiStoreContext);
  if (!store) throw new Error("useUi вызван вне UiStoreProvider");
  return useStore(store, selector);
}
