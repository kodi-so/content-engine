import { useUploadFile } from "@convex-dev/r2/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Eye,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingSignal, LoadingState, Page } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { JobRow } from "../features/analyze/AnalyzeJobList";
import { AnalyzeResultDetails } from "../features/analyze/AnalyzeResultDetails";
import {
  MAX_UPLOAD_BYTES,
  resultFromJob,
  sourcePlatformForUrl,
  type AnalysisQuestion,
  type SourceMode,
} from "../features/analyze/analyzeModel";

export function AnalyzePage() {
  const { activeWorkspaceId } = useWorkspace();
  const jobs = useQuery(
    api.analyze.videoAnalysis.list,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip"
  );
  const uploadFile = useUploadFile(api.storage.r2);
  const createFromUrl = useMutation(api.analyze.videoAnalysis.createFromUrl);
  const createFromUpload = useMutation(api.analyze.videoAnalysis.createFromUpload);
  const askQuestion = useAction(api.analyze.videoAnalysis.askQuestion);

  const [selectedJobId, setSelectedJobId] = useState<Id<"videoAnalysisJobs"> | null>(null);
  const selectedJob = useQuery(
    api.analyze.videoAnalysis.get,
    selectedJobId ? { id: selectedJobId } : "skip"
  );
  const questions = useQuery(
    api.analyze.videoAnalysis.listQuestions,
    selectedJobId ? { jobId: selectedJobId } : "skip"
  );

  const [sourceMode, setSourceMode] = useState<SourceMode>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [question, setQuestion] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const result = useMemo(() => resultFromJob(selectedJob), [selectedJob]);
  const sortedQuestions = useMemo(
    () => [...((questions ?? []) as AnalysisQuestion[])].sort((a, b) => a.createdAt - b.createdAt),
    [questions]
  );

  useEffect(() => {
    if (selectedJobId || !jobs?.length) return;
    setSelectedJobId(jobs[0]._id);
  }, [jobs, selectedJobId]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setStatusMessage("");
  };

  const submitAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId || isSubmitting) return;
    setIsSubmitting(true);
    setStatusMessage(sourceMode === "upload" ? "Uploading source..." : "Creating analysis...");

    try {
      if (sourceMode === "url") {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) throw new Error("Paste a video URL first.");
        const jobId = await createFromUrl({
          workspaceId: activeWorkspaceId,
          url: trimmedUrl,
          customPrompt: customPrompt.trim() || undefined,
        });
        setSelectedJobId(jobId);
        setStatusMessage("Analysis queued.");
      } else {
        if (!file) throw new Error("Choose a video or audio file first.");
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error("Choose a clip under 100 MB.");
        }
        const storageKey = await uploadFile(file);
        const jobId = await createFromUpload({
          workspaceId: activeWorkspaceId,
          storageKey,
          fileName: file.name,
          mimeType: file.type || undefined,
          byteLength: file.size,
          customPrompt: customPrompt.trim() || undefined,
          sourceUrl: url.trim() || undefined,
          sourcePlatform: url.trim() ? sourcePlatformForUrl(url.trim()) : "unknown",
        });
        setSelectedJobId(jobId);
        setStatusMessage("Analysis queued.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Analysis failed to start.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!selectedJob || !trimmedQuestion || isAsking) return;
    setIsAsking(true);
    setQuestion("");
    try {
      await askQuestion({
        jobId: selectedJob._id,
        question: trimmedQuestion,
      });
      setStatusMessage("Answered.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Question failed.");
    } finally {
      setIsAsking(false);
    }
  };

  const pastedUrlPlatform = url.trim() ? sourcePlatformForUrl(url.trim()) : "unknown";
  const socialUrl =
    sourceMode === "url" &&
    ["tiktok", "instagram", "facebook"].includes(pastedUrlPlatform);
  const unsupportedUrl =
    sourceMode === "url" &&
    url.trim() &&
    pastedUrlPlatform === "unknown";

  return (
    <Page
      title="Analyze"
      description="Paste a TikTok, Instagram, Facebook, YouTube, or direct media link, or upload a source clip."
    >
      <div className="grid gap-[var(--space-6)] xl:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-[var(--space-5)]">
          <form
            className="grid gap-[var(--space-4)] border-t border-[var(--color-border)] pt-[var(--space-4)]"
            onSubmit={submitAnalysis}
          >
            <div className="inline-grid grid-cols-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.2rem]">
              {(["url", "upload"] as SourceMode[]).map((item) => (
                <button
                  className={[
                    "inline-flex min-h-[2.35rem] items-center justify-center gap-[var(--space-2)] rounded-[calc(var(--radius-sm)-0.15rem)] px-[var(--space-3)] text-[0.84rem] font-[760] transition",
                    sourceMode === item
                      ? "bg-[var(--color-ink)] text-[var(--color-page)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]",
                  ].join(" ")}
                  key={item}
                  type="button"
                  onClick={() => setSourceMode(item)}
                >
                  {item === "url" ? <LinkIcon size={15} /> : <Upload size={15} />}
                  {item === "url" ? "Paste URL" : "Upload"}
                </button>
              ))}
            </div>

            {sourceMode === "url" ? (
              <label className="grid gap-[var(--space-2)]">
                <span className="text-[0.78rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                  Video URL
                </span>
                <input
                  className="min-h-[2.85rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] text-[0.92rem] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)]"
                  placeholder="Paste a video link"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
                {socialUrl ? (
                  <span className="text-[0.78rem] leading-[1.45] text-[var(--color-muted)]">
                    Social links use the media resolver first, then Analyze reads transcript, frames, scenes, and audio cues.
                  </span>
                ) : unsupportedUrl ? (
                  <span className="text-[0.78rem] leading-[1.45] text-[var(--color-muted)]">
                    Direct URL analysis supports TikTok, Instagram, Facebook, YouTube, and direct video or audio file links. Upload this source for full analysis.
                  </span>
                ) : null}
              </label>
            ) : (
              <div className="grid gap-[var(--space-3)]">
                <label className="grid gap-[var(--space-2)]">
                  <span className="text-[0.78rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    Source file
                  </span>
                  <span className="grid min-h-[7rem] cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-page-quiet)] px-[var(--space-4)] py-[var(--space-5)] text-center transition hover:border-[var(--color-accent)]">
                    <input
                      accept="video/*,audio/*"
                      className="sr-only"
                      type="file"
                      onChange={handleFileChange}
                    />
                    <span className="grid justify-items-center gap-[var(--space-2)]">
                      <Upload size={20} className="text-[var(--color-primary)]" />
                      <span className="text-[0.9rem] font-[760] text-[var(--color-ink)]">
                        {file ? file.name : "Choose a video or audio file"}
                      </span>
                      <span className="text-[0.78rem] text-[var(--color-muted)]">
                        MP4, MOV, WebM, MP3, WAV, M4A under 100 MB
                      </span>
                    </span>
                  </span>
                </label>
                <label className="grid gap-[var(--space-2)]">
                  <span className="text-[0.78rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    Original URL
                  </span>
                  <input
                    className="min-h-[2.7rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] text-[0.9rem] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                    placeholder="Optional source link from TikTok, Instagram, Facebook, YouTube..."
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </label>
              </div>
            )}

            <label className="grid gap-[var(--space-2)]">
              <span className="text-[0.78rem] font-[780] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                Focus
              </span>
              <textarea
                className="min-h-[6rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[0.9rem] leading-[1.5] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                placeholder="Optional: tell Analyze what to pay extra attention to..."
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
              />
            </label>

            <button
              className="primary-button min-h-[2.85rem]"
              disabled={isSubmitting || !activeWorkspaceId}
              type="submit"
            >
              {isSubmitting ? <LoadingSignal label="Starting analysis" size="sm" /> : <Sparkles size={16} />}
              Analyze source
            </button>

            {statusMessage ? (
              <p className="m-0 text-[0.82rem] font-[650] leading-[1.45] text-[var(--color-accent-strong)]">
                {statusMessage}
              </p>
            ) : null}
          </form>

          <section className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between gap-[var(--space-3)] bg-[var(--color-surface-muted)] px-[var(--space-3)] py-[var(--space-2)]">
              <h2 className="m-0 text-[0.78rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                Recent analyses
              </h2>
              <RefreshCw size={14} className="text-[var(--color-muted)]" />
            </div>
            {jobs === undefined ? (
              <LoadingState compact className="rounded-none border-0" title="Loading analyses" />
            ) : jobs.length === 0 ? (
              <div className="px-[var(--space-3)] py-[var(--space-4)] text-[0.88rem] leading-[1.5] text-[var(--color-muted)]">
                No analyses yet.
              </div>
            ) : (
              jobs.map((job) => (
                <JobRow
                  active={job._id === selectedJobId}
                  job={job}
                  key={job._id}
                  onClick={() => setSelectedJobId(job._id)}
                />
              ))
            )}
          </section>
        </div>

        <section className="min-w-0">
          {!selectedJobId ? (
            <div className="grid min-h-[32rem] place-items-center border-t border-[var(--color-border)] pt-[var(--space-6)] text-center">
              <div className="grid max-w-[28rem] justify-items-center gap-[var(--space-3)]">
                <Eye size={28} className="text-[var(--color-primary)]" />
                <h2 className="m-0 text-[1.15rem] font-[820] text-[var(--color-ink)]">
                  Add a reference source
                </h2>
                <p className="m-0 text-[0.9rem] leading-[1.55] text-[var(--color-muted)]">
                  Paste a TikTok, Instagram, Facebook, YouTube, or direct media link, or upload a source clip.
                </p>
              </div>
            </div>
          ) : selectedJob === undefined ? (
            <LoadingState detail="Fetching the selected analysis." title="Loading analysis" />
          ) : !selectedJob ? (
            <LoadingState detail="The selected analysis could not be found." title="Analysis unavailable" />
          ) : (
            <AnalyzeResultDetails
              isAsking={isAsking}
              onQuestionChange={setQuestion}
              onSubmitQuestion={(event) => {
                void submitQuestion(event);
              }}
              question={question}
              result={result}
              selectedJob={selectedJob}
              sortedQuestions={sortedQuestions}
            />
          )}
        </section>
      </div>
    </Page>
  );
}
