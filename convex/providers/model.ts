import { unsupportedProviderOperation } from "./errors";

export type ModelProviderName =
  | "bulkapis"
  | "gemini"
  | "fal"
  | "openrouter"
  | "manual";

export type AsyncJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ModelProviderCapabilities {
  text: boolean;
  structured: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  lipsync: boolean;
  videoRender: boolean;
  asyncJobs: boolean;
}

export interface ModelTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ModelInvocationMetadata {
  provider: ModelProviderName;
  model: string;
  usage?: ModelTokenUsage;
  costUsd?: number;
  [key: string]: unknown;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TextResponseFormat {
  type: "text" | "json_object";
}

export interface GenerateTextInput {
  prompt?: string;
  systemPrompt?: string;
  messages?: ModelMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: TextResponseFormat;
  metadata?: Record<string, unknown>;
}

export interface GenerateTextResult {
  text: string;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GenerateStructuredInput<T = unknown>
  extends Omit<GenerateTextInput, "responseFormat"> {
  parser?: (text: string) => T;
  schema?: unknown;
  schemaName?: string;
}

export interface GenerateStructuredResult<T = unknown> {
  object: T;
  text: string;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface ReferenceAsset {
  base64Data?: string;
  url?: string;
  mimeType: string;
  description?: string;
}

export interface GenerateImageInput {
  prompt: string;
  model?: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | string;
  count?: number;
  referenceImages?: ReferenceAsset[];
  metadata?: Record<string, unknown>;
}

export interface GeneratedAsset {
  mimeType: string;
  data: string;
  url?: string;
}

export interface GenerateImageResult {
  images: GeneratedAsset[];
  jobId?: string;
  status?: AsyncJobStatus;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GenerateVideoInput {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  referenceImages?: ReferenceAsset[];
  metadata?: Record<string, unknown>;
}

export interface GenerateVideoResult {
  jobId: string;
  status: AsyncJobStatus;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GenerateAudioInput {
  text: string;
  model?: string;
  mode?: string;
  voiceReferenceAudios?: ReferenceAsset[];
  metadata?: Record<string, unknown>;
}

export interface GenerateAudioResult {
  audios: GeneratedAsset[];
  jobId?: string;
  status?: AsyncJobStatus;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GenerateLipsyncInput {
  audio: ReferenceAsset;
  image?: ReferenceAsset;
  video?: ReferenceAsset;
  model?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateLipsyncResult {
  jobId: string;
  status: AsyncJobStatus;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GenerateVideoRenderInput {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  knowledgeBase?: string;
  mediaAssets?: ReferenceAsset[];
  aspectRatio?: string;
  width?: number;
  height?: number;
  fps?: number;
  maxDurationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerateVideoRenderResult {
  jobId: string;
  status: AsyncJobStatus;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface GetJobStatusInput {
  jobId: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface GetJobStatusResult {
  jobId: string;
  status: AsyncJobStatus;
  text?: string;
  assets?: GeneratedAsset[];
  errorMessage?: string;
  metadata: ModelInvocationMetadata;
  raw?: unknown;
}

export interface ModelProvider {
  readonly provider: ModelProviderName;
  readonly displayName: string;
  readonly capabilities: ModelProviderCapabilities;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<GenerateStructuredResult<T>>;
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
  generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult>;
  generateAudio(input: GenerateAudioInput): Promise<GenerateAudioResult>;
  generateLipsync(input: GenerateLipsyncInput): Promise<GenerateLipsyncResult>;
  generateVideoRender(input: GenerateVideoRenderInput): Promise<GenerateVideoRenderResult>;
  getJobStatus(input: GetJobStatusInput): Promise<GetJobStatusResult>;
}

const modelProviders = new Map<ModelProviderName, ModelProvider>();

export function registerModelProvider(provider: ModelProvider): void {
  modelProviders.set(provider.provider, provider);
}

export function getModelProvider(providerName: ModelProviderName): ModelProvider {
  const provider = modelProviders.get(providerName);
  if (!provider) {
    throw unsupportedProviderOperation(
      "model",
      providerName,
      "load_provider",
      `${providerName} model adapter has not been registered yet`
    );
  }

  return provider;
}

export function listRegisteredModelProviders(): ModelProviderName[] {
  return Array.from(modelProviders.keys());
}
