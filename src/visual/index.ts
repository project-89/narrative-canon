/**
 * Visual generation — image + portrait rendering for the studio.
 *
 * NOTE ON SCOPE: this barrel is a convenience surface only. The API server
 * imports the individual modules directly (`../visual/image-generator`, etc.),
 * so adding a file here does not put it in the server's path.
 *
 * The panel/comic-page composers (`panel-generator`, `comic-composer`,
 * `scene-director`) used to be exported here. They were the FIRST comic
 * pipeline and now live in `prototypes/timeline-warfare/src/visual/` — the
 * studio's comic rendering is `compose_comic` (whole-page NB2 generation) in
 * the API server, not this composer.
 */

export * from "./types";
export * from "./image-generator";
export * from "./render-prompt";
export * from "./entity-portrait-generator";

// Re-export main classes for convenience
export { ImageGenerator } from "./image-generator";
export { EntityPortraitGenerator } from "./entity-portrait-generator";

// Camera angle text builder
export * from "./camera-text";

// Re-export types
export type { Panel } from "./types";
