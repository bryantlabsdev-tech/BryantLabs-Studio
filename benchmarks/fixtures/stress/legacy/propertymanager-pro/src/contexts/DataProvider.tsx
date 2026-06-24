import { createContext, type ReactNode, useMemo, useState } from "react";

type Store = Record<string, unknown>;
const AppDataContext = createContext<Store>({});

export function DataProvider({ children }: { children: ReactNode }) {
  const [store] = useState<Store>(() => {
    try {
      const raw = localStorage.getItem("app-data");
      return raw ? (JSON.parse(raw) as Store) : {};
    } catch {
      return {};
    }
  });
  const value = useMemo(() => store, [store]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
