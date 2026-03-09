/**
 * Visual Generation Pipeline
 *
 * Consciousness technology for transforming narrative structures
 * into visual media - bridging story to image, enabling comic
 * and video generation from narrative canon.
 */

export * from "./types";
export * from "./image-generator";
export * from "./entity-portrait-generator";
export * from "./panel-generator";
export * from "./comic-composer";
export * from "./scene-director";

// Re-export main classes for convenience
export { ImageGenerator } from "./image-generator";
export { EntityPortraitGenerator } from "./entity-portrait-generator";
export { PanelGenerator } from "./panel-generator";
export type { TextOverlay, EnhancedPanel } from "./panel-generator";
export { ComicComposer } from "./comic-composer";
export { SceneDirector } from "./scene-director";
export type { DirectedScene, DirectorContext } from "./scene-director";

// Camera angle text builder
export * from "./camera-text";

// Re-export types
export type { Panel } from "./types";
