"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  MapPin,
  Building2,
  Box,
  Lightbulb,
  Cpu,
  ArrowLeft,
  Network,
  MessageSquare,
  Clock,
  GitBranch,
  Loader2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  name: string;
  type: string;
  description: string;
  properties?: Record<string, unknown>;
  aliases?: string[];
  firstMention?: number;
}

interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  description?: string;
}

const typeIcons: Record<string, typeof Users> = {
  character: Users,
  location: MapPin,
  organization: Building2,
  object: Box,
  concept: Lightbulb,
  technology: Cpu,
  event: Calendar,
};

const typeColors: Record<string, string> = {
  character: "text-entity-character border-entity-character/30 bg-entity-character/10",
  location: "text-entity-location border-entity-location/30 bg-entity-location/10",
  organization: "text-entity-organization border-entity-organization/30 bg-entity-organization/10",
  object: "text-entity-object border-entity-object/30 bg-entity-object/10",
  concept: "text-entity-concept border-entity-concept/30 bg-entity-concept/10",
  technology: "text-entity-technology border-entity-technology/30 bg-entity-technology/10",
  event: "text-purple-400 border-purple-400/30 bg-purple-400/10",
};

export default function EntityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const entityId = params.id as string;

  const [entity, setEntity] = useState<Entity | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch entity, relationships, and all entities in parallel
        const [entityRes, relsRes, entitiesRes] = await Promise.all([
          fetch(`http://localhost:3088/api/narrative/entities/${entityId}`),
          fetch("http://localhost:3088/api/narrative/relationships"),
          fetch("http://localhost:3088/api/narrative/entities"),
        ]);

        if (!entityRes.ok) {
          throw new Error(`Entity not found: ${entityId}`);
        }

        const entityData = await entityRes.json();
        const relsData = await relsRes.json();
        const entitiesData = await entitiesRes.json();

        setEntity(entityData);
        setAllEntities(entitiesData);

        // Filter relationships that involve this entity
        const entityRels = relsData.filter(
          (r: Relationship) => r.source === entityId || r.target === entityId
        );
        setRelationships(entityRels);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch entity");
        console.error("Error fetching entity:", err);
      } finally {
        setIsLoading(false);
      }
    }

    if (entityId) {
      fetchData();
    }
  }, [entityId]);

  // Get entity name by ID
  const getEntityName = (id: string) => {
    const ent = allEntities.find((e) => e.id === id);
    return ent?.name || id;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading entity...</p>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Box className="h-12 w-12 text-red-500/50" />
        <h3 className="mt-4 font-semibold text-red-500">Entity not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => router.push(`/p/${projectId}/entities`)}
          className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Entities
        </button>
      </div>
    );
  }

  const Icon = typeIcons[entity.type] || Box;
  const colorClasses = typeColors[entity.type] || "text-foreground border-border bg-muted";

  // Separate incoming and outgoing relationships
  const outgoing = relationships.filter((r) => r.source === entityId);
  const incoming = relationships.filter((r) => r.target === entityId);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push(`/p/${projectId}/entities`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Entities
      </button>

      {/* Entity header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-6">
          {/* Icon */}
          <div className={cn("flex h-16 w-16 items-center justify-center rounded-xl border-2", colorClasses)}>
            <Icon className="h-8 w-8" />
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{entity.name}</h1>
              <span className={cn("rounded-full border px-3 py-1 text-sm capitalize", colorClasses)}>
                {entity.type}
              </span>
            </div>
            <p className="mt-3 text-muted-foreground">{entity.description}</p>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                <span>{relationships.length} relationships</span>
              </div>
              {entity.aliases && entity.aliases.length > 0 && (
                <div className="flex items-center gap-2">
                  <span>Also known as: {entity.aliases.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Properties */}
      {entity.properties && Object.keys(entity.properties).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Properties</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(entity.properties).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{key}</div>
                <div className="mt-1 text-sm text-foreground">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Relationships ({relationships.length})
        </h2>

        {relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationships found</p>
        ) : (
          <div className="space-y-6">
            {/* Outgoing */}
            {outgoing.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Outgoing ({outgoing.length})
                </h3>
                <div className="space-y-2">
                  {outgoing.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/p/${projectId}/entities/${rel.target}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{entity.name}</span>
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                            {rel.type.replace(/_/g, " ")}
                          </span>
                          <span className="font-medium text-foreground">{getEntityName(rel.target)}</span>
                        </div>
                        {rel.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{rel.description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Incoming */}
            {incoming.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Incoming ({incoming.length})
                </h3>
                <div className="space-y-2">
                  {incoming.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/p/${projectId}/entities/${rel.source}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{getEntityName(rel.source)}</span>
                          <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-400">
                            {rel.type.replace(/_/g, " ")}
                          </span>
                          <span className="font-medium text-foreground">{entity.name}</span>
                        </div>
                        {rel.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{rel.description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View in Graph */}
      <div className="flex gap-3">
        <Link
          href={`/p/${projectId}/graph`}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <GitBranch className="h-4 w-4" />
          View in Graph
        </Link>
      </div>
    </div>
  );
}
