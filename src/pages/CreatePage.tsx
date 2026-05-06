import { useLayoutEffect, useRef, useState } from "react";
import { Page } from "../components/ui";
import { CreateSlideshowForm } from "./create/CreateSlideshowForm";
import { CreativePlanPanel } from "./create/CreativePlanPanel";
import { PreviewPanel } from "./create/PreviewPanel";
import { RecentRequestsPanel } from "./create/RecentRequestsPanel";
import { useCreateSlideshow } from "./create/useCreateSlideshow";

export function CreatePage() {
  const creativePlanPanelRef = useRef<HTMLDivElement>(null);
  const [creativePlanHeight, setCreativePlanHeight] = useState<number>();
  const {
    data,
    form,
    formActions,
    previewActions,
    setSelectedRequestId,
    statusMessage,
  } = useCreateSlideshow();

  useLayoutEffect(() => {
    const creativePlanPanel = creativePlanPanelRef.current;
    if (!creativePlanPanel) return;

    const updateCreativePlanHeight = () => {
      setCreativePlanHeight(Math.ceil(creativePlanPanel.getBoundingClientRect().height));
    };

    updateCreativePlanHeight();

    const resizeObserver = new ResizeObserver(updateCreativePlanHeight);
    resizeObserver.observe(creativePlanPanel);
    return () => resizeObserver.disconnect();
  }, [data.activeRequest?._id, data.plan]);

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
          maxDesktopHeight={creativePlanHeight}
          onSelectRequest={setSelectedRequestId}
        />
        <div ref={creativePlanPanelRef} className="min-w-0">
          <CreativePlanPanel activeRequest={data.activeRequest} plan={data.plan} />
        </div>
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
