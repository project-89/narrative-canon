/**
 * ComicComposer - Compose panels into comic pages
 *
 * Takes generated panels and arranges them into comic page layouts.
 * Uses AI-based composition for natural panel arrangements.
 */

import { Interaction } from "../../../../src/types";
import {
  ImageGenerator,
  ImageGeneratorConfig,
  ReferenceImage,
} from "../../../../src/visual/image-generator";
import { Panel, ComicPage, PageLayout, GeneratedImage, VisualStyle } from "../../../../src/visual/types";
import * as fs from "fs";
import * as path from "path";

const isTestEnv = process.env.NODE_ENV === "test";
const log = (...args: unknown[]) => {
  if (!isTestEnv) console.log(...args);
};

export interface ComicComposerConfig extends ImageGeneratorConfig {
  /** Directory to save composed pages */
  pageDir?: string;
  /** Default page layout */
  defaultLayout?: PageLayout;
  /** Page dimensions (width x height) */
  pageDimensions?: { width: number; height: number };
}

export interface PageCompositionOptions {
  /** Page number for this composition */
  pageNumber: number;
  /** Layout to use */
  layout?: PageLayout;
  /** Include panel borders */
  includeBorders?: boolean;
  /** Include gutter space between panels */
  gutterSpace?: number;
  /** Page title/header text */
  headerText?: string;
}

export class ComicComposer {
  private imageGen: ImageGenerator;
  private pageDir: string;
  private defaultLayout: PageLayout;
  private pageDimensions: { width: number; height: number };

  constructor(config: ComicComposerConfig) {
    this.imageGen = new ImageGenerator(config);
    this.pageDir = config.pageDir || "./generated-images/pages";
    this.defaultLayout = config.defaultLayout || "2x2";
    this.pageDimensions = config.pageDimensions || { width: 1536, height: 2048 };

    if (!fs.existsSync(this.pageDir)) {
      fs.mkdirSync(this.pageDir, { recursive: true });
    }
  }

  /**
   * Compose panels into a single comic page
   */
  async composePage(
    panels: Panel[],
    options: PageCompositionOptions
  ): Promise<ComicPage> {
    const layout = options.layout || this.defaultLayout;
    log(`📑 Composing page ${options.pageNumber} with ${layout} layout`);
    log(`   Panels: ${panels.length}`);

    // Build panel references
    const panelRefs = this.buildPanelReferences(panels);

    // Generate composed page using AI
    const prompt = this.buildCompositionPrompt(panels, layout, options);
    const composedImage = await this.imageGen.generateImage(prompt, panelRefs);

    // Save to file
    const filename = `page_${String(options.pageNumber).padStart(3, "0")}`;
    await this.imageGen.saveImage(composedImage, filename);

    return {
      pageNumber: options.pageNumber,
      layout,
      panels,
      composedImage,
    };
  }

  /**
   * Compose multiple pages from a sequence of panels
   */
  async composeSequence(
    panels: Panel[],
    options?: {
      startPage?: number;
      panelsPerPage?: number;
      autoLayout?: boolean;
    }
  ): Promise<ComicPage[]> {
    const startPage = options?.startPage || 1;
    const panelsPerPage = options?.panelsPerPage || 4;
    const autoLayout = options?.autoLayout ?? true;

    const pages: ComicPage[] = [];
    let currentPage = startPage;

    // Group panels into pages
    for (let i = 0; i < panels.length; i += panelsPerPage) {
      const pagePanels = panels.slice(i, i + panelsPerPage);

      // Determine optimal layout for these panels
      const layout = autoLayout
        ? this.determineOptimalLayout(pagePanels)
        : this.defaultLayout;

      try {
        const page = await this.composePage(pagePanels, {
          pageNumber: currentPage,
          layout,
        });
        pages.push(page);
      } catch (error: any) {
        log(`⚠️ Failed to compose page ${currentPage}: ${error.message}`);
      }

      currentPage++;
    }

    return pages;
  }

  /**
   * Create a splash page (single full-page panel)
   */
  async createSplashPage(
    panel: Panel,
    pageNumber: number,
    title?: string
  ): Promise<ComicPage> {
    return this.composePage([panel], {
      pageNumber,
      layout: "splash",
      headerText: title,
    });
  }

  /**
   * Create a chapter title page
   */
  async createTitlePage(
    chapterTitle: string,
    chapterNumber: number,
    backgroundPanel?: Panel
  ): Promise<ComicPage> {
    log(`📖 Creating title page for Chapter ${chapterNumber}`);

    const titlePrompt = `Comic book chapter title page.

Chapter ${chapterNumber}: ${chapterTitle}

Layout:
- Large, stylized chapter number
- Chapter title in dramatic typography
- ${backgroundPanel ? "Use the reference image as background, darkened/blurred" : "Abstract or thematic background"}
- Professional comic book quality
- Space for story to begin below`;

    const refs = backgroundPanel ? [this.panelToRef(backgroundPanel, "bg")] : [];
    const composedImage = await this.imageGen.generateImage(titlePrompt, refs);

    const filename = `title_chapter_${chapterNumber}`;
    await this.imageGen.saveImage(composedImage, filename);

    return {
      pageNumber: 0, // Title pages are numbered separately
      layout: "splash",
      panels: backgroundPanel ? [backgroundPanel] : [],
      composedImage,
    };
  }

  /**
   * Set visual style for composition
   */
  setStyle(style: Partial<VisualStyle>): void {
    this.imageGen.setStyle(style);
  }

  /**
   * Get layout information
   */
  getLayoutInfo(layout: PageLayout): {
    panelCount: number;
    description: string;
  } {
    const layouts: Record<PageLayout, { panelCount: number; description: string }> = {
      "2x2": { panelCount: 4, description: "Four equal panels in a 2x2 grid" },
      "3x1": { panelCount: 3, description: "Three horizontal panels stacked" },
      "1x3": { panelCount: 3, description: "Three vertical panels side by side" },
      "manga-5": { panelCount: 5, description: "Classic manga 5-panel layout" },
      splash: { panelCount: 1, description: "Single full-page panel" },
      custom: { panelCount: -1, description: "Custom panel arrangement" },
    };

    return layouts[layout];
  }

  // Private methods

  private buildPanelReferences(panels: Panel[]): ReferenceImage[] {
    return panels.map((panel, index) => this.panelToRef(panel, `panel_${index + 1}`));
  }

  private panelToRef(panel: Panel, id: string): ReferenceImage {
    return {
      id,
      data: panel.image.data,
      mimeType: panel.image.mimeType,
      description: `Panel: ${panel.visualBeat.substring(0, 50)}...`,
    };
  }

  private buildCompositionPrompt(
    panels: Panel[],
    layout: PageLayout,
    options: PageCompositionOptions
  ): string {
    const layoutDescription = this.getLayoutDescription(layout, panels.length);

    let prompt = `Comic book page composition.

Task: Arrange the ${panels.length} reference images as panels on a single comic page.

Layout: ${layoutDescription}

Requirements:
- Each reference image becomes one panel
- Maintain reading order (left to right, top to bottom, or right to left for manga)
- Add clean panel borders
${options.includeBorders !== false ? "- Include black panel borders (3-5px)" : ""}
${options.gutterSpace ? `- Gutter space between panels: ${options.gutterSpace}px` : "- Standard gutter spacing"}
- Professional comic book quality
- Panels should flow naturally for storytelling
${options.headerText ? `- Include page header: "${options.headerText}"` : ""}

Panel content (in order):`;

    panels.forEach((panel, index) => {
      prompt += `\nPanel ${index + 1}: ${panel.visualBeat.substring(0, 100)}`;
    });

    return prompt;
  }

  private getLayoutDescription(layout: PageLayout, panelCount: number): string {
    switch (layout) {
      case "2x2":
        return "2x2 grid - four equal panels. Top row: panels 1-2. Bottom row: panels 3-4.";
      case "3x1":
        return "Three horizontal strips. Top to bottom: panels 1, 2, 3.";
      case "1x3":
        return "Three vertical columns. Left to right: panels 1, 2, 3.";
      case "manga-5":
        return "Classic manga layout: large panel top-right, two small panels top-left, wide panel middle, two panels bottom.";
      case "splash":
        return "Single full-page splash image. Maximum impact.";
      case "custom":
        return `Custom arrangement for ${panelCount} panels. Optimize for visual flow and storytelling.`;
      default:
        return `Arrange ${panelCount} panels in a visually pleasing comic book layout.`;
    }
  }

  private determineOptimalLayout(panels: Panel[]): PageLayout {
    const count = panels.length;

    // Check for splash-worthy panels
    const hasPivotal = panels.some((p) => p.layoutHint === "full");
    if (count === 1 || hasPivotal) {
      return "splash";
    }

    // Check panel hints
    const wideCount = panels.filter((p) => p.layoutHint === "wide").length;
    const tallCount = panels.filter((p) => p.layoutHint === "tall").length;

    if (count === 3) {
      if (wideCount >= 2) return "3x1";
      if (tallCount >= 2) return "1x3";
      return "3x1"; // Default for 3 panels
    }

    if (count === 4) {
      return "2x2";
    }

    if (count === 5) {
      return "manga-5";
    }

    // For other counts, use custom
    return "custom";
  }
}

export default ComicComposer;
