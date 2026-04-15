"use client";

import * as React from "react";
import { Check } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { templateOptions } from "@/lib/templates";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onSelect: (id: string) => void;
}

export function TemplatePicker({ open, onOpenChange, value, onSelect }: Props) {
  const opts = templateOptions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>choose a template</DialogTitle>
          <DialogDescription>
            live preview updates as you switch.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-2">
            {opts.map((o) => {
              const isActive = o.id === value;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    onSelect(o.id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 hover:bg-muted",
                    isActive && "ring-1 ring-brand border-brand/40"
                  )}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {o.name.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {o.description}
                    </span>
                  </div>
                  {isActive ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                      <Check weight="bold" className="size-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
