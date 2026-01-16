import { Id } from "../../../convex/_generated/dataModel";

// Text element - individual text block on a slide (like Canva text layers)
export interface TextElement {
  id: string; // Unique ID for this text element
  content: string; // The text content
  position: {
    x: number; // X position of center as percentage (0-100)
    y: number; // Y position of center as percentage (0-100)
  };
  size: {
    width: number; // Width as percentage of slide (0-100)
    height: number; // Height as percentage of slide (0-100)
  };
  fontSize: number; // Font size in pixels
  fontColor?: string; // Defaults to white
  fontWeight?: number; // 400, 700, etc. Defaults to 700
  textAlign?: "left" | "center" | "right"; // Defaults to center
}

// Slide with flexible text elements (like Canva)
export interface Slide {
  // Image fields (required)
  imageUrl: string;
  imagePrompt?: string;

  // Text elements - array of independently positioned/styled text blocks
  textElements?: TextElement[];

  // Display options
  overlay?: boolean; // Dark overlay for text readability
}

// Helper to get all text from a slide (for simple display/search)
export function getSlideDisplayText(slide: Slide): string {
  if (!slide.textElements || slide.textElements.length === 0) {
    return "";
  }
  return slide.textElements.map(el => el.content).join("\n\n");
}

// Slideshow-level config (per-element styling is now in textElements)
export interface ContentConfig {
  aspectRatio?: "1:1" | "4:5" | "9:16";
}

export interface CarouselContent {
  type: string;
  slides?: Slide[];
  texts?: string[];
  mediaUrls?: string[];
  config?: ContentConfig;
}

export interface InputParams {
  topic?: string;
  slideCount?: number;
  customPrompt?: string;
  variables?: any;
}

export interface ContentItem {
  _id: Id<"content">;
  _creationTime: number;
  productId?: Id<"products">;
  accountId?: Id<"accounts">;
  inputParams: InputParams;
  content: CarouselContent;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  _id: Id<"products">;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AspectRatio = "1:1" | "4:5" | "9:16";
