"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash, Plus, Key } from "@phosphor-icons/react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import type { Provider } from "@/lib/ai";

interface KeyMeta {
  provider: string;
  keyPrefix: string;
  createdAt: string;
  source?: "env" | "db";
}

const PROVIDERS: { id: Provider; label: string; placeholder: string }[] = [
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "gemini", label: "Google Gemini", placeholder: "AIzaSy..." },
  { id: "grok", label: "Grok (xAI)", placeholder: "xai-..." },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyMeta[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) setKeys(await res.json() as KeyMeta[]);
    } catch {}
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  async function handleSave(provider: string) {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, provider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error || "Failed to save key");
        return;
      }
      track("key_save");
      toast.success(`${provider} key saved`);
      setAdding(null);
      setNewKey("");
      loadKeys();
    } catch {
      toast.error("Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(provider: string) {
    try {
      const res = await fetch(`/api/keys?provider=${provider}`, { method: "DELETE" });
      if (res.ok) {
        track("key_delete");
        toast.success(`${provider} key removed`);
        loadKeys();
      }
    } catch {
      toast.error("Failed to remove key");
    }
  }

  const configuredProviders = new Set(keys.map((k) => k.provider));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft weight="light" className="size-4" />
          back to editor
        </Link>

        <h1 className="font-serif text-2xl tracking-tight mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Manage your API keys. Keys are encrypted at rest.
          <br />
          <span className="text-muted-foreground/70">
            Any one key unlocks all AI features — import, rewrite, tailor, analyze.
          </span>
        </p>

        <div className="flex flex-col gap-4">
          {PROVIDERS.map((p, i) => {
            const existing = keys.find((k) => k.provider === p.id);
            const isAdding = adding === p.id;

            return (
              <div
                key={p.id}
                className="border border-border rounded-md p-4 animate-in fade-in slide-in-from-bottom-1 duration-200"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key weight="light" className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>

                  {existing ? (
                    <div className="flex items-center gap-3">
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {existing.keyPrefix}
                      </code>
                      {existing.source === "env" ? (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                          server
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          aria-label={`remove ${p.label} key`}
                        >
                          <Trash weight="light" className="size-4" />
                        </button>
                      )}
                    </div>
                  ) : !isAdding ? (
                    <button
                      onClick={() => { setAdding(p.id); setNewKey(""); }}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus weight="light" className="size-3.5" />
                      add key
                    </button>
                  ) : null}
                </div>

                {isAdding && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      placeholder={p.placeholder}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSave(p.id)}
                      disabled={saving || !newKey.trim()}
                      className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {saving ? "..." : "save"}
                    </button>
                    <button
                      onClick={() => { setAdding(null); setNewKey(""); }}
                      className="text-sm text-muted-foreground hover:text-foreground px-2"
                    >
                      cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
