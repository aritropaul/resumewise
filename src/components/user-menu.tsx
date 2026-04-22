"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SignOut, Gear, User } from "@phosphor-icons/react";

export function UserMenu() {
  const router = useRouter();
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!session.data) return null;

  const user = session.data.user;
  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="size-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium hover:bg-muted/80 transition-colors"
        aria-label="user menu"
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="size-7 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-md shadow-lg py-1 z-50 animate-in fade-in slide-in-from-bottom-1 duration-100" style={{ animationFillMode: "both" }}>
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>

          <button
            onClick={() => {
              setOpen(false);
              router.push("/app/settings");
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Gear weight="light" className="size-4" />
            settings
          </button>

          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <SignOut weight="light" className="size-4" />
            sign out
          </button>
        </div>
      )}
    </div>
  );
}
