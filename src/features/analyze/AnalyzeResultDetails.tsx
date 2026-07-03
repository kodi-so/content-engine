import {
  AlertCircle,
  AudioLines,
  Clipboard,
  Eye,
  ExternalLink,
  FileText,
  HelpCircle,
  Images,
  Layers3,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { LoadingSignal, LoadingState } from "../../components/ui";
import { JobStatusIcon } from "./AnalyzeJobList";
import { ReferenceBriefPanel } from "./ReferenceBriefPanel";
import {
  formatDateTime,
  sourceLabel,
  statusClass,
  statusLabel,
  textOrFallback,
  type AnalysisJob,
  type AnalysisQuestion,
  type AnalysisResult,
  type Scene,
  type SlideAnalysis,
} from "./analyzeModel";
import { referenceBriefFromResult } from "./referenceBriefModel";

function SourceReference({ job }: { job: AnalysisJob }) {
  const sourceUrl = job.sourceUrl?.trim();
  const sourceName = sourceLabel(job);

  return (
    <div className="mt-[var(--space-4)] grid gap-[var(--space-1)] border-t border-[var(--color-border)] pt-[var(--space-3)]">
      <span className="text-[0.74rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
        Source
      </span>
      {sourceUrl ? (
        <a
          className="inline-flex min-w-0 items-center gap-[var(--space-2)] text-[0.88rem] font-[720] leading-[1.45] text-[var(--color-accent-strong)] underline-offset-4 hover:underline"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          <span className="min-w-0 break-all">{sourceUrl}</span>
          <ExternalLink size={14} className="shrink-0" />
        </a>
      ) : (
        <span className="text-[0.88rem] font-[720] text-[var(--color-ink)]">
          {sourceName}
        </span>
      )}
      {job.sourceType === "upload" && job.fileName ? (
        <span className="text-[0.78rem] leading-[1.45] text-[var(--color-muted)]">
          Uploaded file: {job.fileName}
        </span>
      ) : null}
    </div>
  );
}

function ListSection({
  empty = "Nothing detected.",
  items,
}: {
  empty?: string;
  items?: string[];
}) {
  const rows = items?.filter((item) => item.trim()) ?? [];
  if (!rows.length) {
    return <p className="m-0 text-[0.86rem] leading-[1.55] text-[var(--color-muted)]">{empty}</p>;
  }

  return (
    <ul className="m-0 grid list-none gap-[var(--space-2)] p-0">
      {rows.map((item, index) => (
        <li
          className="grid grid-cols-[1.35rem_minmax(0,1fr)] gap-[var(--space-2)] text-[0.88rem] leading-[1.5] text-[var(--color-ink)]"
          key={`${item}-${index}`}
        >
          <span className="mt-[0.34rem] size-1.5 rounded-full bg-[var(--color-primary)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function AnalysisSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: typeof FileText;
  title: string;
}) {
  return (
    <section className="border-t border-[var(--color-border)] py-[var(--space-5)]">
      <div className="mb-[var(--space-3)] flex items-center gap-[var(--space-2)]">
        <Icon size={17} className="text-[var(--color-primary)]" strokeWidth={1.9} />
        <h2 className="m-0 text-[1rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function TextPanel({ children }: { children: ReactNode }) {
  return (
    <div className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] text-[0.88rem] leading-[1.58] text-[var(--color-ink)]">
      {children}
    </div>
  );
}

function SceneBreakdown({ scenes }: { scenes?: Scene[] }) {
  const rows = scenes?.filter((scene) =>
    [scene.description, scene.visualNotes, scene.audioNotes, scene.creatorPurpose].some(Boolean)
  ) ?? [];

  if (!rows.length) {
    return <p className="m-0 text-[0.86rem] text-[var(--color-muted)]">No scene breakdown returned.</p>;
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
      {rows.map((scene, index) => (
        <div
          className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)] first:border-t-0 md:grid-cols-[5rem_minmax(0,1fr)]"
          key={`${scene.timestamp}-${index}`}
        >
          <div className="text-[0.78rem] font-[820] text-[var(--color-primary)]">
            {scene.timestamp || `Beat ${index + 1}`}
          </div>
          <div className="grid gap-[var(--space-2)]">
            <p className="m-0 text-[0.92rem] font-[720] leading-[1.45] text-[var(--color-ink)]">
              {textOrFallback(scene.description)}
            </p>
            <div className="grid gap-[var(--space-1)] text-[0.82rem] leading-[1.45] text-[var(--color-muted)]">
              {scene.visualNotes ? <span>Visual: {scene.visualNotes}</span> : null}
              {scene.audioNotes ? <span>Audio: {scene.audioNotes}</span> : null}
              {scene.creatorPurpose ? <span>Purpose: {scene.creatorPurpose}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function cleanRows(items?: string[]) {
  return items?.filter((item) => item.trim()) ?? [];
}

function SlideDetailRow({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;

  return (
    <div className="grid gap-[0.18rem]">
      <span className="text-[0.72rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
        {label}
      </span>
      <span className="text-[0.86rem] leading-[1.5] text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}

function SlideAnalysisSection({ slides }: { slides?: SlideAnalysis[] }) {
  const rows = slides?.filter((slide) =>
    [
      slide.imageDescription,
      slide.textLayout,
      slide.visualStyle,
      slide.creatorPurpose,
      slide.audioNotes,
      ...(slide.visibleText ?? []),
      ...(slide.subjects ?? []),
    ].some(Boolean)
  ) ?? [];

  if (!rows.length) return null;

  return (
    <AnalysisSection icon={Images} title="Slides">
      <div className="grid gap-[var(--space-3)]">
        {rows.map((slide, index) => {
          const visibleText = cleanRows(slide.visibleText);
          const subjects = cleanRows(slide.subjects);

          return (
            <article
              className="grid gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)]"
              key={`${slide.index ?? index + 1}-${slide.imageDescription ?? index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
                <h3 className="m-0 text-[0.96rem] font-[820] leading-[1.3] text-[var(--color-ink)]">
                  Slide {slide.index ?? index + 1}
                </h3>
                {visibleText.length ? (
                  <span className="rounded-full border border-[var(--color-border)] px-[var(--space-2)] py-[0.18rem] text-[0.72rem] font-[760] text-[var(--color-muted)]">
                    {visibleText.length} text {visibleText.length === 1 ? "item" : "items"}
                  </span>
                ) : null}
              </div>

              <p className="m-0 text-[0.9rem] leading-[1.55] text-[var(--color-ink)]">
                {textOrFallback(slide.imageDescription, "No image description returned.")}
              </p>

              {visibleText.length ? (
                <div>
                  <span className="mb-[var(--space-2)] block text-[0.72rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    Visible Text
                  </span>
                  <ListSection items={visibleText} />
                </div>
              ) : null}

              <div className="grid gap-[var(--space-3)] md:grid-cols-2">
                <SlideDetailRow label="Text layout" value={slide.textLayout} />
                <SlideDetailRow label="Visual style" value={slide.visualStyle} />
                <SlideDetailRow label="Purpose" value={slide.creatorPurpose} />
                <SlideDetailRow label="Audio" value={slide.audioNotes} />
              </div>

              {subjects.length ? (
                <div>
                  <span className="mb-[var(--space-2)] block text-[0.72rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    Subjects
                  </span>
                  <ListSection items={subjects} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </AnalysisSection>
  );
}

function CompletedAnalysis({
  isAsking,
  onQuestionChange,
  onSubmitQuestion,
  question,
  result,
  sortedQuestions,
}: {
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSubmitQuestion: (event: FormEvent) => void;
  question: string;
  result: AnalysisResult;
  sortedQuestions: AnalysisQuestion[];
}) {
  const referenceBrief = referenceBriefFromResult(result);

  return (
    <>
      <ReferenceBriefPanel brief={referenceBrief} summary={result.summary} />

      <AnalysisSection icon={FileText} title="Transcript">
        <TextPanel>
          {textOrFallback(result.transcript?.text, "No transcript detected.")}
        </TextPanel>
        {result.transcript?.confidenceNotes ? (
          <p className="m-0 mt-[var(--space-2)] text-[0.82rem] leading-[1.5] text-[var(--color-muted)]">
            {result.transcript.confidenceNotes}
          </p>
        ) : null}
      </AnalysisSection>

      <AnalysisSection icon={Eye} title="Visual read">
        <div className="grid gap-[var(--space-3)] lg:grid-cols-2">
          <TextPanel>{textOrFallback(result.visuals?.style)}</TextPanel>
          <TextPanel>{textOrFallback(result.visuals?.cameraAndEditing)}</TextPanel>
        </div>
        <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] lg:grid-cols-2">
          <div>
            <h3 className="m-0 mb-[var(--space-2)] text-[0.82rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
              Subjects
            </h3>
            <ListSection items={result.visuals?.subjects} />
          </div>
          <div>
            <h3 className="m-0 mb-[var(--space-2)] text-[0.82rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
              On-screen text
            </h3>
            <ListSection items={result.visuals?.onScreenText} />
          </div>
        </div>
      </AnalysisSection>

      <SlideAnalysisSection slides={result.slideshow?.slides} />

      <AnalysisSection icon={Layers3} title="Scenes">
        <SceneBreakdown scenes={result.visuals?.sceneBreakdown} />
      </AnalysisSection>

      <AnalysisSection icon={AudioLines} title="Audio">
        <div className="grid gap-[var(--space-3)] lg:grid-cols-2">
          <TextPanel>{textOrFallback(result.audio?.speechDelivery)}</TextPanel>
          <TextPanel>{textOrFallback(result.audio?.musicAndSound)}</TextPanel>
        </div>
        <div className="mt-[var(--space-4)]">
          <ListSection items={result.audio?.extractableNotes} />
        </div>
      </AnalysisSection>

      <AnalysisSection icon={Sparkles} title="Creative pattern">
        <div className="grid gap-[var(--space-4)]">
          <TextPanel>{textOrFallback(result.creativeAnalysis?.hook)}</TextPanel>
          <div className="grid gap-[var(--space-4)] lg:grid-cols-2">
            <div>
              <h3 className="m-0 mb-[var(--space-2)] text-[0.82rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                Structure
              </h3>
              <ListSection items={result.creativeAnalysis?.structure} />
            </div>
            <div>
              <h3 className="m-0 mb-[var(--space-2)] text-[0.82rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                Why it works
              </h3>
              <ListSection items={result.creativeAnalysis?.whyItWorks} />
            </div>
          </div>
        </div>
      </AnalysisSection>

      <AnalysisSection icon={Clipboard} title="Reusable pattern">
        <div className="grid gap-[var(--space-3)]">
          <TextPanel>{textOrFallback(result.reuseBrief?.copyablePattern)}</TextPanel>
          <TextPanel>{textOrFallback(result.reuseBrief?.scriptTemplate)}</TextPanel>
          <div>
            <h3 className="m-0 mb-[var(--space-2)] text-[0.82rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
              Shot list
            </h3>
            <ListSection items={result.reuseBrief?.shotList} />
          </div>
        </div>
      </AnalysisSection>

      <AnalysisSection icon={MessageSquare} title="Ask about this source">
        <form
          className="grid gap-[var(--space-3)] sm:grid-cols-[minmax(0,1fr)_10rem]"
          onSubmit={onSubmitQuestion}
        >
          <input
            className="min-h-[2.85rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] text-[0.92rem] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
            placeholder="Ask about a scene, hook, frame, or edit..."
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
          />
          <button
            className="primary-button"
            disabled={isAsking || !question.trim()}
            type="submit"
          >
            {isAsking ? <LoadingSignal label="Asking" size="sm" /> : <HelpCircle size={16} />}
            Ask
          </button>
        </form>

        <div className="mt-[var(--space-4)] grid gap-[var(--space-3)]">
          {sortedQuestions.length === 0 ? (
            <p className="m-0 text-[0.86rem] text-[var(--color-muted)]">
              No questions yet.
            </p>
          ) : (
            sortedQuestions.map((item) => (
              <div
                className="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)]"
                key={item._id}
              >
                <p className="m-0 text-[0.88rem] font-[760] text-[var(--color-ink)]">
                  {item.question}
                </p>
                {item.status === "running" ? (
                  <LoadingSignal label="Answering" showLabel size="sm" />
                ) : item.status === "failed" ? (
                  <p className="m-0 text-[0.84rem] text-[oklch(52%_0.18_25)]">
                    {item.errorMessage ?? "Question failed."}
                  </p>
                ) : (
                  <p className="m-0 whitespace-pre-wrap text-[0.86rem] leading-[1.55] text-[var(--color-muted)]">
                    {item.answer}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </AnalysisSection>
    </>
  );
}

export function AnalyzeResultDetails({
  isAsking,
  onQuestionChange,
  onSubmitQuestion,
  question,
  result,
  selectedJob,
  sortedQuestions,
}: {
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSubmitQuestion: (event: FormEvent) => void;
  question: string;
  result: AnalysisResult;
  selectedJob: AnalysisJob;
  sortedQuestions: AnalysisQuestion[];
}) {
  return (
    <div className="min-w-0">
      <header className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
        <div className="flex flex-wrap items-start justify-between gap-[var(--space-3)]">
          <div className="min-w-0">
            <div className={`mb-[var(--space-2)] inline-flex items-center gap-[var(--space-2)] text-[0.78rem] font-[820] uppercase tracking-[0.06em] ${statusClass(selectedJob.status)}`}>
              <JobStatusIcon status={selectedJob.status} />
              {statusLabel(selectedJob.status)}
            </div>
            <h2 className="m-0 break-words text-[1.65rem] font-[860] leading-[1.12] text-[var(--color-ink)]">
              {selectedJob.title ?? sourceLabel(selectedJob)}
            </h2>
            <p className="mt-[var(--space-2)] max-w-[52rem] text-[0.94rem] leading-[1.58] text-[var(--color-muted)]">
              {selectedJob.summary ?? "Analysis is being prepared."}
            </p>
            <SourceReference job={selectedJob} />
          </div>
        </div>

        <div className="mt-[var(--space-4)] grid gap-[var(--space-2)] text-[0.78rem] font-[700] text-[var(--color-muted)] sm:grid-cols-3">
          <span>{sourceLabel(selectedJob)}</span>
          <span>{selectedJob.model}</span>
          <span>{formatDateTime(selectedJob.completedAt ?? selectedJob.startedAt ?? selectedJob.createdAt)}</span>
        </div>
      </header>

      {selectedJob.status === "queued" || selectedJob.status === "running" ? (
        <LoadingState
          className="mt-[var(--space-5)]"
          detail="Gemini is reading the transcript, frames, scenes, and audio cues."
          title={selectedJob.status === "queued" ? "Queued" : "Analyzing source"}
        />
      ) : null}

      {selectedJob.status === "failed" ? (
        <div className="mt-[var(--space-5)] rounded-[var(--radius-sm)] border border-[oklch(70%_0.16_25_/_0.35)] bg-[oklch(98%_0.025_25)] p-[var(--space-4)]">
          <div className="flex items-start gap-[var(--space-3)]">
            <AlertCircle size={19} className="mt-[0.1rem] text-[oklch(50%_0.18_25)]" />
            <div className="min-w-0">
              <h3 className="m-0 text-[0.98rem] font-[820] text-[var(--color-ink)]">
                Analysis failed
              </h3>
              <p className="m-0 mt-[0.35rem] text-[0.88rem] leading-[1.55] text-[var(--color-muted)]">
                {selectedJob.errorMessage ?? "The source could not be analyzed."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {selectedJob.status === "completed" ? (
        <CompletedAnalysis
          isAsking={isAsking}
          onQuestionChange={onQuestionChange}
          onSubmitQuestion={onSubmitQuestion}
          question={question}
          result={result}
          sortedQuestions={sortedQuestions}
        />
      ) : null}
    </div>
  );
}
