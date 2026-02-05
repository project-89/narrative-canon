import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | number | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(date: Date | number | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Entity type colors
export const entityTypeColors: Record<string, string> = {
  character: "entity-character",
  location: "entity-location",
  organization: "entity-organization",
  object: "entity-object",
  concept: "entity-concept",
  technology: "entity-technology",
};

// Interaction type colors
export const interactionTypeColors: Record<string, string> = {
  dialogue: "interaction-dialogue",
  confrontation: "interaction-confrontation",
  alliance: "interaction-alliance",
  betrayal: "interaction-betrayal",
  revelation: "interaction-revelation",
  discovery: "interaction-discovery",
  combat: "interaction-combat",
  ritual: "interaction-ritual",
};

// Weight colors
export const weightColors: Record<string, string> = {
  minor: "text-weight-minor",
  major: "text-weight-major",
  pivotal: "text-weight-pivotal",
};
