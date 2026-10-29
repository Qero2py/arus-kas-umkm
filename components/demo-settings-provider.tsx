"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loadLiveWorkspace, saveLiveSettings } from "@/app/actions/workspace";
import { demoBusiness } from "@/lib/demo-data";
import type { LiveWorkspace } from "@/lib/supabase/workspace";

type DemoSettings = {
  openingBalance: number;
  threshold: number;
  horizon: 7 | 14 | 30;
};

type DemoSettingsContextValue = {
  settings: DemoSettings;
  saveSettings: (settings: DemoSettings) => Promise<boolean>;
  ready: boolean;
  storageError: "invalid" | "unavailable" | "remote" | null;
  resetDemo: () => boolean;
};

const defaults: DemoSettings = { openingBalance: 12_500_000, threshold: demoBusiness.threshold, horizon: 30 };
const DemoSettingsContext = createContext<DemoSettingsContextValue | null>(null);
const storageKey = "arus-demo-settings-v1";

function isStoredSettings(value: unknown): value is DemoSettings {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<DemoSettings>;
  return Number.isSafeInteger(stored.openingBalance) && Number(stored.openingBalance) >= 0
    && Number.isSafeInteger(stored.threshold) && Number(stored.threshold) >= 0
    && (stored.horizon === 7 || stored.horizon === 14 || stored.horizon === 30);
}

export function DemoSettingsProvider({ children, live = false }: { children: ReactNode; live?: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<"invalid" | "unavailable" | "remote" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (live) {
        loadLiveWorkspace().then((result) => {
          if (result.status === "unauthorized") { router.replace("/login"); return; }
          if (result.status === "onboarding") { router.replace("/onboarding"); return; }
          if (result.status !== "ok") { setStorageError("remote"); setReady(true); return; }
          setSettings(result.workspace.settings);
          setReady(true);
        }).catch(() => { setStorageError("remote"); setReady(true); });
        return;
      }
      let saved: string | null;
      try {
        saved = window.localStorage.getItem(storageKey);
      } catch {
        setStorageError("unavailable");
        setReady(true);
        return;
      }
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (isStoredSettings(parsed)) setSettings(parsed);
          else setStorageError("invalid");
        } catch {
          setStorageError("invalid");
        }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [live, router]);

  useEffect(() => {
    if (!live) return;
    const onWorkspace = (event: Event) => {
      const workspace = (event as CustomEvent<LiveWorkspace>).detail;
      setSettings(workspace.settings);
      setStorageError(null);
      setReady(true);
    };
    window.addEventListener("arus:workspace-updated", onWorkspace);
    return () => window.removeEventListener("arus:workspace-updated", onWorkspace);
  }, [live]);

  async function saveSettings(next: DemoSettings) {
    if (live) { const result = await saveLiveSettings(next); if (!result.ok) return false; setSettings(result.workspace.settings); return true; }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSettings(next);
      return true;
    } catch {
      return false;
    }
  }

  function resetDemo() {
    if (live) return false;
    try { window.localStorage.setItem(storageKey, JSON.stringify(defaults)); } catch { return false; }
    setSettings(defaults);
    const saved = true;
    if (saved) setStorageError(null);
    return saved;
  }

  return <DemoSettingsContext.Provider value={{ settings, saveSettings, ready, storageError, resetDemo }}>{children}</DemoSettingsContext.Provider>;
}

export function useDemoSettings() {
  const value = useContext(DemoSettingsContext);
  if (!value) throw new Error("useDemoSettings must be used inside DemoSettingsProvider");
  return value;
}
