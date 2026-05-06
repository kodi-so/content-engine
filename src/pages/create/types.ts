import type { ChangeEvent, FormEvent } from "react";
import type { CanonicalSlideshowSlide } from "../../types";
import type {
  BrandAssetDoc,
  BrandDoc,
  ContentRequestDoc,
  SlideshowDoc,
  SocialAccountDoc,
} from "./viewTypes";

export type RequestedRenderingMode =
  | "background_plus_overlay"
  | "full_graphic_generation";

export type ReferenceComposer = "upload" | "ai" | null;

export type GeneratedReferencePreview = {
  storageUrl: string;
  prompt: string;
};

export type CreativePlan = {
  title?: string;
  renderingMode?: string;
  visualSystem?: string;
  creativeBrief?: string;
  hook?: string;
  caption?: string;
  strategy?: {
    narrativePattern?: string;
    targetSlideCount?: number;
    reasoning?: string;
    visualStyle?: string;
    tone?: string;
  };
  slides?: Array<{
    slideId?: string;
    purpose?: string;
    role?: string;
    backgroundPrompt?: string;
    finalImagePrompt?: string;
    visibleText?: string;
    textBlocks?: Array<{ role?: string; text?: string; items?: string[] }>;
  }>;
};

export type SlideTextUpdate = {
  primaryText: string;
  secondaryText?: string;
  bullets: string[];
};

export type CreatePageData = {
  brands?: BrandDoc[];
  brandAccounts: SocialAccountDoc[];
  brandAssets?: BrandAssetDoc[];
  contentRequests?: ContentRequestDoc[];
  activeRequest?: ContentRequestDoc;
  activeSlideshow?: SlideshowDoc;
  plan?: CreativePlan;
  isWorking: boolean;
};

export type CreateFormState = {
  selectedBrandId: string;
  socialAccountId: string;
  prompt: string;
  requestedRenderingMode: RequestedRenderingMode;
  selectedReferenceIds: string[];
  assetName: string;
  assetFile: File | null;
  aiAssetName: string;
  aiAssetPrompt: string;
  aiPreview: GeneratedReferencePreview | null;
  isGeneratingReference: boolean;
  referenceComposer: ReferenceComposer;
};

export type CreateFormActions = {
  setBrandId: (value: string) => void;
  setSocialAccountId: (value: string) => void;
  setPrompt: (value: string) => void;
  setRequestedRenderingMode: (value: RequestedRenderingMode) => void;
  setAssetName: (value: string) => void;
  setAiAssetName: (value: string) => void;
  setAiAssetPrompt: (value: string) => void;
  setReferenceComposer: (
    value: ReferenceComposer | ((current: ReferenceComposer) => ReferenceComposer)
  ) => void;
  toggleReference: (assetId: string) => void;
  handleAssetFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleCreateAsset: () => Promise<void>;
  handleGenerateReferencePreview: () => Promise<void>;
  handleSaveGeneratedReference: () => Promise<void>;
  handleRejectGeneratedReference: () => Promise<void>;
  handleSubmit: (event: FormEvent) => Promise<void>;
};

export type PreviewActions = {
  revisionPrompt: string;
  setRevisionPrompt: (value: string) => void;
  handleRevise: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleDiscard: () => Promise<void>;
  handleDeleteSlide: (slide: CanonicalSlideshowSlide) => Promise<void>;
  handleDuplicateSlide: (slide: CanonicalSlideshowSlide) => Promise<void>;
  handleMoveSlide: (
    slide: CanonicalSlideshowSlide,
    direction: "left" | "right"
  ) => Promise<void>;
  handleUpdateSlideText: (
    slide: CanonicalSlideshowSlide,
    args: SlideTextUpdate
  ) => Promise<void>;
};
