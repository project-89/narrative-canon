"use client";

import { usePathname } from "next/navigation";
import { Search, Command, Bell, Plus } from "lucide-react";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/": { title: "Dashboard", description: "Overview of your narrative universe" },
  "/timeline": { title: "Timeline", description: "Commit history and version control" },
  "/entities": { title: "Entities", description: "Characters, locations, and objects" },
  "/graph": { title: "Relationship Graph", description: "Visualize entity connections" },
  "/branches": { title: "Branches", description: "Timeline branches and alternate paths" },
  "/interactions": { title: "Interactions", description: "Story beats and character moments" },
  "/visuals": { title: "Visual Generation", description: "Portraits, panels, and comics" },
};

export function Header() {
  const pathname = usePathname();
  const pageInfo = pageTitles[pathname] || { title: "Page", description: "" };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Page title */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">{pageInfo.title}</h2>
        <p className="text-sm text-muted-foreground">{pageInfo.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <button className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Search className="h-4 w-4" />
          <span>Search...</span>
          <kbd className="ml-2 flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
            <Command className="h-3 w-3" />K
          </kbd>
        </button>

        {/* Quick add */}
        <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" />
        </button>

        {/* Notifications */}
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
