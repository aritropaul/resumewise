"use client";

import * as React from "react";
import {
  FileText,
  Plus,
  UploadSimple,
  Sun,
  MoonStars,
  DownloadSimple,
  ArrowUUpLeft,
  ArrowUUpRight,
  Sparkle,
  PaintBrush,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useResumeStore } from "@/lib/resume-store";
import { templateOptions } from "@/lib/templates";
import type { SavedDocument } from "@/lib/storage";

const PLACEHOLDERS = [
  "what do you want to do?",
  "jump to a section, or run an ai polish…",
  "find a resume by name…",
];

const AI_PROMPTS = [
  "tighten my work bullets",
  "tailor to my job description",
  "rewrite my summary to sound senior",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: SavedDocument[];
  activeId: string | null;
  onSelectDoc: (id: string) => void;
  onPrefillAi: (prompt: string) => void;
  onToggleTheme: () => void;
  onNewBlank: () => void;
  onUpload: () => void;
  onDownload: () => void;
  theme: "light" | "dark";
}

export function CommandPalette({
  open,
  onOpenChange,
  files,
  activeId,
  onSelectDoc,
  onPrefillAi,
  onToggleTheme,
  onNewBlank,
  onUpload,
  onDownload,
  theme,
}: Props) {
  const [placeholder, setPlaceholder] = React.useState(PLACEHOLDERS[0]);
  React.useEffect(() => {
    if (open) {
      setPlaceholder(
        PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
      );
    }
  }, [open]);
  const store = useResumeStore();
  const templates = templateOptions();

  const run = (fn: () => void) => {
    onOpenChange(false);
    // Let the close animation start before we trigger downstream state changes.
    setTimeout(fn, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]" showClose={false}>
        <Command shouldFilter={true} loop>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>nothing found.</CommandEmpty>
            {files.length > 0 && (
              <CommandGroup heading="documents">
                {files.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`doc ${f.name}`}
                    onSelect={() => run(() => onSelectDoc(f.id))}
                  >
                    <FileText weight="light" />
                    <span className="flex-1 truncate">
                      {f.name.replace(/\.pdf$/i, "")}
                    </span>
                    {f.id === activeId && (
                      <span className="text-[10px] text-muted-foreground">
                        active
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {templates.length > 1 && (
              <CommandGroup heading="templates">
                {templates.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`template ${t.name}`}
                    onSelect={() =>
                      run(() => {
                        store.setTemplate(t.id);
                      })
                    }
                  >
                    <PaintBrush weight="light" />
                    <span>switch to {t.name.toLowerCase()}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="ai">
              {AI_PROMPTS.map((p) => (
                <CommandItem
                  key={p}
                  value={`ai ${p}`}
                  onSelect={() => run(() => onPrefillAi(p))}
                >
                  <Sparkle weight="light" />
                  <span className="truncate">{p}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="actions">
              <CommandItem
                value="action new blank"
                onSelect={() => run(onNewBlank)}
              >
                <Plus weight="light" />
                <span>new blank resume</span>
              </CommandItem>
              <CommandItem
                value="action import pdf"
                onSelect={() => run(onUpload)}
              >
                <UploadSimple weight="light" />
                <span>import pdf</span>
              </CommandItem>
              <CommandItem
                value="action download pdf"
                onSelect={() => run(onDownload)}
              >
                <DownloadSimple weight="light" />
                <span>download pdf</span>
              </CommandItem>
              <CommandItem
                value="action toggle theme"
                onSelect={() => run(onToggleTheme)}
              >
                {theme === "dark" ? (
                  <Sun weight="light" />
                ) : (
                  <MoonStars weight="light" />
                )}
                <span>
                  switch to {theme === "dark" ? "light" : "dark"} mode
                </span>
              </CommandItem>
              <CommandItem
                value="action undo"
                disabled={!store.canUndo()}
                onSelect={() => run(() => store.undo())}
              >
                <ArrowUUpLeft weight="light" />
                <span>undo</span>
                <CommandShortcut>⌘Z</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="action redo"
                disabled={!store.canRedo()}
                onSelect={() => run(() => store.redo())}
              >
                <ArrowUUpRight weight="light" />
                <span>redo</span>
                <CommandShortcut>⌘⇧Z</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border px-3 h-8 flex items-center gap-2 text-[10px] text-muted-foreground">
            <MagnifyingGlass weight="light" className="size-3" />
            <span>use arrows, enter to run</span>
            <div className="flex-1" />
            <Kbd>esc</Kbd>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
