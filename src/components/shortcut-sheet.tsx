"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const GROUPS: Array<{
  label: string;
  rows: Array<{ keys: string[]; action: string }>;
}> = [
  {
    label: "general",
    rows: [
      { keys: ["⌘", "K"], action: "open command palette" },
      { keys: ["?"], action: "show this sheet" },
      { keys: ["⌘", "B"], action: "toggle documents panel" },
      { keys: ["⌘", "J"], action: "toggle right panel" },
    ],
  },
  {
    label: "editing",
    rows: [
      { keys: ["⌘", "Z"], action: "undo" },
      { keys: ["⌘", "⇧", "Z"], action: "redo" },
    ],
  },
];

export function ShortcutSheet({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>keyboard</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <span className="text-label text-muted-foreground">
                {g.label}
              </span>
              <div className="flex flex-col">
                {g.rows.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-t border-border first:border-t-0"
                  >
                    <span className="text-sm text-foreground">{r.action}</span>
                    <div className="flex items-center gap-1">
                      {r.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && (
                            <span className="text-[10px] text-muted-foreground/60 font-mono">
                              +
                            </span>
                          )}
                          <Kbd>{k}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
