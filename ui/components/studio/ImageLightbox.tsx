"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface LightboxState {
  openLightbox: (src: string, alt?: string) => void;
}

const LightboxContext = createContext<LightboxState | null>(null);

/**
 * Hook to open the lightbox from anywhere inside LightboxProvider.
 */
export function useLightbox(): LightboxState {
  const ctx = useContext(LightboxContext);
  if (!ctx) {
    // Graceful fallback so components work even outside provider
    return { openLightbox: () => {} };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider (wraps the studio page)
// ---------------------------------------------------------------------------

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");

  const openLightbox = useCallback((imgSrc: string, imgAlt?: string) => {
    setSrc(imgSrc);
    setAlt(imgAlt || "");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  return (
    <LightboxContext.Provider value={{ openLightbox }}>
      {children}

      {/* ---- Lightbox overlay ---- */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/90"
              onClick={close}
            />

            {/* Close button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 z-[71] p-2 rounded-full bg-black/50 text-white/70 hover:bg-black/70 hover:text-white transition-colors"
              aria-label="Close lightbox"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image */}
            <motion.img
              key={src}
              src={src}
              alt={alt}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative z-[71] max-w-[90vw] max-h-[85vh] object-contain rounded-lg select-none"
              draggable={false}
            />

            {/* Alt text caption */}
            {alt && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.1 }}
                className="relative z-[71] mt-3 text-sm text-gray-400 max-w-[70vw] text-center truncate"
              >
                {alt}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </LightboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ClickableImage — drop-in <img> replacement that opens the lightbox
// ---------------------------------------------------------------------------

interface ClickableImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Extra props forwarded to the underlying <img> */
  [key: string]: any;
}

export function ClickableImage({
  src,
  alt,
  className,
  ...rest
}: ClickableImageProps) {
  const { openLightbox } = useLightbox();

  return (
    <img
      src={src}
      alt={alt}
      className={cn(className, "cursor-zoom-in")}
      onClick={(e) => {
        e.stopPropagation();
        openLightbox(src, alt);
      }}
      {...rest}
    />
  );
}
