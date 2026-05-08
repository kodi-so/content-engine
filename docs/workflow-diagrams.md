# Workflow Diagrams

Mermaid diagrams are text-based diagrams that render from Markdown. GitHub supports Mermaid in fenced code blocks, which makes these diagrams reviewable in PRs and easy to keep close to the code they describe.

Use this file as the living map for workflow and prompt-chain behavior. When the implementation changes, update the matching diagram in the same PR.

## Mermaid Conventions

- Use Mermaid for flows that are easier to understand visually than as prose.
- Prefer `flowchart` for product/workflow stages, `sequenceDiagram` for prompt/provider chains, and `stateDiagram-v2` for lifecycle/status transitions.
- Keep node labels short. Put implementation details in prose immediately above or below the diagram.
- Use stable system nouns: `Create UI`, `contentRequests`, `Planner`, `Image prompt writer`, `Image provider`, `artifacts`, and `slideshows`.
- Avoid lower-case `end` as a node label because Mermaid treats it as syntax.
- Use quoted labels when text contains punctuation.

## Create Slideshow Workflow

This is the high-level path for a one-off slideshow from the Create page. The content request is the job record; artifacts and slideshows are the durable outputs.

```mermaid
flowchart TD
  User["User prompt + brand + references"] --> CreateUI["Create UI"]
  CreateUI --> Request["contentRequests.createSlideshow"]
  Request --> Queue["Queued content request"]
  Queue --> Planner["Planner builds creative plan"]
  Planner --> PromptWriter["Image prompt writer creates per-slide prompts"]
  PromptWriter --> ImageProvider["Image provider generates slide images"]
  ImageProvider --> Artifacts["Create image artifacts"]
  Artifacts --> Slideshow["Create slideshow preview"]
  Slideshow --> Review["User reviews preview"]
  Review --> Save{"Save?"}
  Save -->|"Yes"| Library["Library saved slideshow + approved artifacts"]
  Save -->|"Revise"| Revision["reviseSlideshow queues a replacement preview"]
  Save -->|"Discard"| Cleanup["Discard request + cleanup preview artifacts"]
  Revision --> Queue
```

## Prompt Chain

This sequence diagram shows the current prompt chain for a Create slideshow request. The planner produces the structured plan first; the per-slide prompt writer then produces image-generation prompts using that plan.

```mermaid
sequenceDiagram
  actor User
  participant UI as Create UI
  participant Request as contentRequests
  participant Planner as Creative planner
  participant Writer as Image prompt writer
  participant Provider as Image provider
  participant Store as Artifact storage
  participant Preview as slideshows

  User->>UI: Submit rough content idea
  UI->>Request: createSlideshow(prompt, brand, references)
  Request->>Planner: Generate structured slideshow plan
  Planner-->>Request: title, brief, strategy, slide plan

  loop Each planned slide
    Request->>Writer: Write slide image prompt from plan + references
    Writer-->>Request: backgroundPrompt or finalImagePrompt
    Request->>Provider: Generate image from provider prompt
    Provider-->>Request: image asset or async job result
    Request->>Store: Store generated image artifact
  end

  Request->>Preview: Create slideshow preview spec
  Preview-->>UI: Render reviewable preview
```

## Content Request Status

The request status is the user-visible lifecycle for one-off creation. It also gives the UI enough information to show loading, preview, saved, failed, or discarded states.

```mermaid
stateDiagram-v2
  [*] --> Queued
  Queued --> Planning: execute starts
  Planning --> Generating: plan saved
  Generating --> Ready: preview created
  Generating --> Failed: provider or planner error
  Planning --> Failed: planner error
  Ready --> Saved: save
  Ready --> Queued: reviseSlideshow
  Ready --> Discarded: discard
  Failed --> Queued: retry or revise
  Saved --> [*]
  Discarded --> [*]
```

## Slide Image Prompt Editing

The Create preview supports editing the prompt for a single slide. Blurring the prompt editor persists prompt text only; regenerating creates a replacement image and removes the old slide image artifact.

```mermaid
flowchart TD
  OpenPrompt["Open edit image prompt"] --> EditPrompt["Rewrite prompt in one textarea"]
  EditPrompt --> Blur{"Blur editor?"}
  Blur -->|"Yes"| SavePrompt["Persist prompt to slideshow spec"]
  SavePrompt --> ContinueReview["Continue review"]
  EditPrompt --> Regenerate{"Regenerate slide image?"}
  Regenerate -->|"Yes"| GenerateImage["Generate new image from edited prompt"]
  GenerateImage --> StoreNew["Store new image artifact"]
  StoreNew --> PatchSlide["Patch slide image URL + source artifact"]
  PatchSlide --> DeleteOld["Delete replaced image artifact + storage"]
  DeleteOld --> ContinueReview
```

## Future Workflow Wrapper

Workflows should eventually wrap the same content creation engine instead of becoming a separate generation stack. This diagram is the intended direction, not necessarily the full current implementation.

```mermaid
flowchart LR
  Workflow["Workflow definition"] --> Run["Manual or scheduled run"]
  Run --> Strategy["Apply saved strategy + variation rules"]
  Strategy --> Request["Create content request"]
  Request --> Engine["Shared creation engine"]
  Engine --> Outputs["Artifacts + slideshow/video/text outputs"]
  Outputs --> Approval["Review + approval"]
  Approval --> Publish["Distribution plan + publishing provider"]
```

## References

- Mermaid docs: https://mermaid.js.org/intro/
- Mermaid flowchart syntax: https://mermaid.js.org/syntax/flowchart.html
- Mermaid sequence syntax: https://mermaid.js.org/syntax/sequenceDiagram.html
- GitHub Mermaid rendering: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
