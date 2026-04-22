"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { OnboardingFlow } from "@/components/onboarding";
import type { OnboardingStep } from "@/lib/use-onboarding";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);

  // Check keys on mount
  useState(() => {
    fetch("/api/keys")
      .then((r) => (r.ok ? r.json() : []))
      .then((keys) => setHasKeys(Array.isArray(keys) && keys.length > 0))
      .catch(() => setHasKeys(false));
  });

  const advance = useCallback(() => {
    setStep((prev) => {
      if (prev === "welcome") return hasKeys ? "create" : "api-key";
      if (prev === "api-key") return "create";
      return "done";
    });
  }, [hasKeys]);

  const dismiss = useCallback(() => {
    router.push("/app");
  }, [router]);

  const goToStep = useCallback((s: OnboardingStep) => {
    setStep(s);
  }, []);

  const noop = useCallback(() => {}, []);

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 h-11 border-b border-border shrink-0">
        <span className="font-serif text-sm tracking-tight">resumewise</span>
        <span className="text-label text-muted-foreground">onboarding preview</span>
      </header>
      <OnboardingFlow
        state={{
          step,
          hasKeys,
          dismissed: false,
          advance,
          goToStep,
          dismiss,
        }}
        onCreate={dismiss}
        onUpload={dismiss}
        onImportBackup={noop}
      />
    </div>
  );
}
