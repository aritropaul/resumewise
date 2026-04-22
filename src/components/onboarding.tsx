"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Sparkle,
  ArrowRight,
  Check,
  Key,
  Plus,
  UploadSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { OnboardingState } from "@/lib/use-onboarding";
import type { Provider } from "@/lib/ai";

const PROVIDERS: { id: Provider; label: string; placeholder: string; rec?: boolean }[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", rec: true },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];

const transition = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };

interface OnboardingFlowProps {
  state: OnboardingState;
  onCreate: () => void;
  onUpload: () => void;
  onImportBackup: () => void;
}

export function OnboardingFlow({
  state,
  onCreate,
  onUpload,
  onImportBackup,
}: OnboardingFlowProps) {
  const prefersReducedMotion = useReducedMotion();

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, x: 12 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -12 },
        transition,
      };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-background">
      <div className="max-w-[480px] w-full">
        <AnimatePresence mode="wait">
          {state.step === "welcome" && (
            <motion.div key="welcome" {...motionProps}>
              <WelcomeStep
                onSetupAI={state.advance}
                onSkip={() => {
                  onCreate();
                  state.dismiss();
                }}
              />
            </motion.div>
          )}
          {state.step === "api-key" && (
            <motion.div key="api-key" {...motionProps}>
              <ApiKeyStep
                onComplete={() => {
                  state.advance();
                }}
                onSkip={state.advance}
              />
            </motion.div>
          )}
          {state.step === "create" && (
            <motion.div key="create" {...motionProps}>
              <CreateStep
                onCreate={() => {
                  onCreate();
                  state.dismiss();
                }}
                onUpload={() => {
                  onUpload();
                  state.dismiss();
                }}
                onImportBackup={() => {
                  onImportBackup();
                  state.dismiss();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Steps ─── */

function WelcomeStep({
  onSetupAI,
  onSkip,
}: {
  onSetupAI: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={0} />
      <div className="flex items-baseline gap-3 select-none">
        <span className="text-display-lg text-foreground tabular" data-tabular>
          01
        </span>
        <span className="text-label text-muted-foreground">/ welcome</span>
      </div>
      <h1 className="text-heading text-foreground font-semibold max-w-[32ch]">
        welcome to resumewise
      </h1>
      <p className="text-sm text-muted-foreground max-w-[52ch] text-pretty leading-relaxed">
        AI-powered resume editor. bring your own API key to unlock importing,
        rewriting, tailoring, and fit analysis. your data stays local, your keys
        are encrypted at rest.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={onSetupAI}>
          <Key weight="light" className="size-3.5" />
          set up AI
          <ArrowRight weight="light" className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>
          skip, start blank
        </Button>
      </div>
    </div>
  );
}

function ApiKeyStep({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!key.trim() || key.length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, provider }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "failed to save key");
        return;
      }
      setSaved(true);
      toast.success(`${provider} key saved`);
      setTimeout(onComplete, 800);
    } catch {
      toast.error("failed to save key");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={1} />
      <div className="flex items-baseline gap-3 select-none">
        <span className="text-display-lg text-foreground tabular" data-tabular>
          02
        </span>
        <span className="text-label text-muted-foreground">/ api key</span>
      </div>
      <h1 className="text-heading text-foreground font-semibold max-w-[32ch]">
        add an API key for AI features
      </h1>
      <p className="text-sm text-muted-foreground max-w-[52ch] text-pretty leading-relaxed">
        any one key unlocks all AI features. you can add more later in settings.
      </p>

      {saved ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <Check weight="bold" className="size-4" />
          key saved — continuing...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors duration-150 ${
                  provider === p.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
                {p.rec && (
                  <span className="ml-1 text-[10px] opacity-60">rec</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder={
                PROVIDERS.find((p) => p.id === provider)?.placeholder
              }
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !key.trim() || key.length < 8}
            >
              {saving ? "..." : "save"}
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={onSkip}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        skip for now
      </button>
    </div>
  );
}

function CreateStep({
  onCreate,
  onUpload,
  onImportBackup,
}: {
  onCreate: () => void;
  onUpload: () => void;
  onImportBackup: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={2} />
      <div className="flex items-baseline gap-3 select-none">
        <span className="text-display-lg text-foreground tabular" data-tabular>
          03
        </span>
        <span className="text-label text-muted-foreground">/ create</span>
      </div>
      <h1 className="text-heading text-foreground font-semibold max-w-[32ch]">
        how would you like to start?
      </h1>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={onCreate}>
          <Plus weight="light" className="size-3.5" />
          start blank
        </Button>
        <Button size="sm" variant="outline" onClick={onUpload}>
          <UploadSimple weight="light" className="size-3.5" />
          import pdf
        </Button>
        <Button size="sm" variant="ghost" disabled className="opacity-50">
          <Sparkle weight="light" className="size-3.5" />
          draft with ai
          <Badge
            variant="outline"
            size="sm"
            className="ml-1 uppercase tracking-wider"
          >
            soon
          </Badge>
        </Button>
      </div>
      <div className="pt-4 border-t border-border">
        <Button size="sm" variant="outline" onClick={onImportBackup}>
          import backup (.json)
        </Button>
      </div>
    </div>
  );
}

/* ─── Step indicator ─── */

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-200 ease-[var(--ease-ios)] ${
            i === current
              ? "w-6 bg-foreground"
              : i < current
              ? "w-1.5 bg-foreground/40"
              : "w-1.5 bg-border"
          }`}
        />
      ))}
    </div>
  );
}
