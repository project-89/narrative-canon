/**
 * Types for Visual Generation Pipeline
 *
 * Consciousness technology that transforms narrative structures
 * into visual representations - bridging story to image.
 */

export interface GeneratedImage {
  /** Raw image data as Buffer */
  data: Buffer;
  /** MIME type of the image */
  mimeType: string;
  /** Prompt used to generate this image */
  prompt: string;
  /** Reference images used, if any */
  referenceCount: number;
  /** Generation timestamp */
  generatedAt: Date;
  /** Model used for generation */
  model: string;
}

export interface EntityPortrait {
  entityId: string;
  entityName: string;
  entityType: string;
  /** Main portrait image */
  portrait: GeneratedImage;
  /** Additional angle/expression variants */
  variants?: GeneratedImage[];
  /** Visual style description used */
  styleDescription: string;
}

export interface LocationShot {
  entityId: string;
  locationName: string;
  /** Establishing shot of the location */
  establishingShot: GeneratedImage;
  /** Time of day variants */
  timeVariants?: {
    day?: GeneratedImage;
    night?: GeneratedImage;
    dawn?: GeneratedImage;
    dusk?: GeneratedImage;
  };
}

export interface Panel {
  /** The interaction this panel depicts */
  interactionId: string;
  /** Generated panel image */
  image: GeneratedImage;
  /** Character references used */
  characterRefs: string[];
  /** Location reference used */
  locationRef?: string;
  /** Visual beat description used */
  visualBeat: string;
  /** Panel position hint for layout */
  layoutHint?: 'full' | 'half' | 'quarter' | 'wide' | 'tall';
}

export interface ComicPage {
  /** Page number */
  pageNumber: number;
  /** Layout type used */
  layout: PageLayout;
  /** Panels in reading order */
  panels: Panel[];
  /** Final composed page image */
  composedImage: GeneratedImage;
}

export type PageLayout =
  | '2x2'        // 4 equal panels
  | '3x1'        // 3 horizontal panels
  | '1x3'        // 3 vertical panels
  | 'manga-5'    // Classic manga 5-panel layout
  | 'splash'     // Single full-page image
  | 'custom';    // Custom arrangement

export interface VisualStyle {
  /** Art style */
  style: 'manga' | 'western-comic' | 'concept-art' | 'realistic' | 'anime';
  /** Color approach */
  coloring: 'full-color' | 'limited-palette' | 'black-white' | 'duotone';
  /** Line art style */
  linework: 'clean' | 'sketchy' | 'heavy' | 'minimal';
  /** Mood lighting */
  lighting: 'dramatic' | 'soft' | 'noir' | 'vibrant' | 'natural';
  /** Additional style notes */
  additionalNotes?: string;
}

export interface GenerationConfig {
  /** Visual style to use */
  style: VisualStyle;
  /** Output resolution */
  resolution: '1024x1024' | '1536x1536' | '2048x2048' | '4k';
  /** Number of generation attempts on failure */
  maxRetries: number;
  /** Whether to use thinking mode for better quality */
  useThinking: boolean;
}

export const DEFAULT_STYLE: VisualStyle = {
  style: 'manga',
  coloring: 'full-color',
  linework: 'clean',
  lighting: 'dramatic',
};

export const DEFAULT_CONFIG: GenerationConfig = {
  style: DEFAULT_STYLE,
  resolution: '1024x1024',
  maxRetries: 3,
  useThinking: true,
};
