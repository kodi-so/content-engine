import { Page } from "../components/ui";
import { CreateSlideshowForm } from "./create/CreateSlideshowForm";
import { CreativePlanPanel } from "./create/CreativePlanPanel";
import { PreviewPanel } from "./create/PreviewPanel";
import { RecentRequestsPanel } from "./create/RecentRequestsPanel";
import { useCreateSlideshow } from "./create/useCreateSlideshow";

export function CreatePage() {
  const {
    data,
    form,
    formActions,
    previewActions,
    setSelectedRequestId,
    statusMessage,
  } = useCreateSlideshow();

  return (
    <Page title="Create" description="Turn a rough idea into a reviewable one-off slideshow.">
      <CreateSlideshowForm
        brands={data.brands}
        brandAccounts={data.brandAccounts}
        brandAssets={data.brandAssets}
        form={form}
        actions={formActions}
      />

      {statusMessage && <p className="muted">{statusMessage}</p>}

      <div className="grid items-start gap-[var(--space-4)] min-[901px]:grid-cols-2">
        <RecentRequestsPanel
          activeRequest={data.activeRequest}
          contentRequests={data.contentRequests}
          onSelectRequest={setSelectedRequestId}
        />
        <CreativePlanPanel activeRequest={data.activeRequest} plan={data.plan} />
      </div>

      <PreviewPanel
        activeRequest={data.activeRequest}
        activeSlideshow={data.activeSlideshow}
        isWorking={data.isWorking}
        plan={data.plan}
        actions={previewActions}
      />
    </Page>
  );
}
