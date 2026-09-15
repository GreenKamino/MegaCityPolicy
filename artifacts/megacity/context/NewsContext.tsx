import React, { createContext, useCallback, useContext, useRef, useState } from "react";

type NewsContextType = {
  headlines: string[];
  addHeadline: (headline: string) => void;
};

const NewsContext = createContext<NewsContextType | null>(null);

export function NewsProvider({ children }: { children: React.ReactNode }) {
  const [headlines, setHeadlines] = useState<string[]>([
    "MEGACITY COMMAND SYSTEMS ONLINE",
    "ALL SECTORS REPORTING NOMINAL STATUS",
    "SURVEILLANCE GRID OPERATIONAL",
  ]);
  const seenRef = useRef(new Set<string>());

  const addHeadline = useCallback((headline: string) => {
    if (seenRef.current.has(headline)) return;
    seenRef.current.add(headline);
    if (seenRef.current.size > 50) {
      const first = seenRef.current.values().next().value;
      if (first) seenRef.current.delete(first);
    }
    setHeadlines((prev) => [...prev.slice(-29), headline]);
  }, []);

  return (
    <NewsContext.Provider value={{ headlines, addHeadline }}>
      {children}
    </NewsContext.Provider>
  );
}

export function useNews() {
  const ctx = useContext(NewsContext);
  if (!ctx) return { headlines: [] as string[], addHeadline: (_h: string) => {} };
  return ctx;
}
