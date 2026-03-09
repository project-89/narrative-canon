"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

interface ReferenceItem {
  url: string;
  label: string;
  type: string;
  entityId?: string;
  sceneId?: string;
  frameId?: string;
}

export interface ReferenceSelection {
  url: string;
  label: string;
  type: string;
  entityId?: string;
  sceneId?: string;
  frameId?: string;
}

interface ReferencePickerModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (selections: ReferenceSelection[]) => void;
  selected?: string[];
  filterTypes?: string[];
  title?: string;
}

const TYPE_LABELS: Record<string, string> = {
  entity: "Characters & Locations",
  scene: "Scenes",
  frame: "Frames",
};

const TYPE_ORDER = ["entity", "scene", "frame"];

export default function ReferencePickerModal({
  projectId,
  open,
  onClose,
  onSelect,
  selected: initialSelected = [],
  filterTypes,
  title,
}: ReferencePickerModalProps) {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set(initialSelected));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedUrls(new Set(initialSelected));
    fetch(`${API_BASE}/api/narrative/visual/reference-library/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setItems(data.items || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const filtered = useMemo(() => {
    let result = items;
    if (filterTypes?.length) {
      result = result.filter((item) => filterTypes.includes(item.type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((item) => item.label.toLowerCase().includes(q));
    }
    return result;
  }, [items, search, filterTypes]);

  const grouped = useMemo(() => {
    const groups: Record<string, ReferenceItem[]> = {};
    for (const item of filtered) {
      const key = item.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [filtered]);

  const toggle = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleConfirm = () => {
    const urlSet = selectedUrls;
    const selections: ReferenceSelection[] = items
      .filter((item) => urlSet.has(item.url))
      .map(({ url, label, type, entityId, sceneId, frameId }) => ({ url, label, type, entityId, sceneId, frameId }));
    onSelect(selections);
    onClose();
  };

  const resolveUrl = (url: string) => {
    if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
    return `${API_BASE}${url}`;
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-3xl max-h-[80vh] bg-gray-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-400" />
              {title || "Reference Images"}
            </h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name..."
                className="w-full pl-9 pr-4 py-2 bg-white/5 rounded-xl text-sm text-gray-300 border border-white/10 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Loading images...</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500 text-sm">No images found</div>
            ) : (
              TYPE_ORDER.filter((t) => grouped[t]?.length).map((type) => (
                <div key={type}>
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                    {TYPE_LABELS[type] || type}
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {grouped[type].map((item, i) => {
                      const isSelected = selectedUrls.has(item.url);
                      return (
                        <button
                          key={`${item.url}-${i}`}
                          onClick={() => toggle(item.url)}
                          className={cn(
                            "relative aspect-square rounded-xl overflow-hidden border-2 transition-all group",
                            isSelected
                              ? "border-purple-500 ring-2 ring-purple-500/30"
                              : "border-white/10 hover:border-white/30"
                          )}
                        >
                          <img
                            src={resolveUrl(item.url)}
                            alt={item.label}
                            className="w-full h-full object-cover"
                          />
                          {/* Selection checkmark */}
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          {/* Label overlay */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                            <span className="text-[10px] text-white/90 line-clamp-1">{item.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-gray-900/80">
            <span className="text-sm text-gray-400">
              {selectedUrls.size} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedUrls(new Set())}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
              >
                Clear
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg"
              >
                Use Selected
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
