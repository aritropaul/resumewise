"use client";

import { useState, useCallback, useEffect } from "react";

export type OnboardingStep = "welcome" | "api-key" | "create" | "done";

export interface OnboardingState {
  step: OnboardingStep;
  hasKeys: boolean | null; // null = still loading
  dismissed: boolean;
  advance: () => void;
  goToStep: (step: OnboardingStep) => void;
  dismiss: () => void;
}

const STORAGE_KEY = "rw-onboarding-dismissed";

export function useOnboarding(
  docsLoaded: boolean,
  docsCount: number
): OnboardingState {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  // Check if user has any API keys configured
  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    fetch("/api/keys")
      .then((r) => (r.ok ? r.json() : []))
      .then((keys) => {
        if (!cancelled) setHasKeys(Array.isArray(keys) && keys.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasKeys(false);
      });
    return () => { cancelled = true; };
  }, [dismissed]);

  // Auto-dismiss if user already has documents
  useEffect(() => {
    if (docsLoaded && docsCount > 0) {
      setDismissed(true);
    }
  }, [docsLoaded, docsCount]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
    setStep("done");
  }, []);

  const advance = useCallback(() => {
    setStep((prev) => {
      if (prev === "welcome") return hasKeys ? "create" : "api-key";
      if (prev === "api-key") return "create";
      return "done";
    });
  }, [hasKeys]);

  const goToStep = useCallback((s: OnboardingStep) => {
    setStep(s);
  }, []);

  return {
    step: dismissed ? "done" : step,
    hasKeys,
    dismissed,
    advance,
    goToStep,
    dismiss,
  };
}
