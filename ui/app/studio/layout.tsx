"use client";

import { LightboxProvider } from "@/components/studio/ImageLightbox";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <LightboxProvider>{children}</LightboxProvider>;
}
