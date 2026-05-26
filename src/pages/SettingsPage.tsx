import { ChecklistItem, Page, Panel } from "../components/ui";

export function SettingsPage() {
  return (
    <Page title="Settings" description="Provider configuration will move here as adapters come online.">
      <div className="two-column">
        <Panel title="Publishing Providers">
          <ChecklistItem done label="Postiz selected as first adapter" />
          <ChecklistItem label="Post Bridge spike pending" />
          <ChecklistItem done label="BulkAPIs excluded from posting" />
        </Panel>
        <Panel title="Model Providers">
          <ChecklistItem done label="Gemini remains available through adapter" />
          <ChecklistItem label="fal.ai adapter pending" />
          <ChecklistItem label="OpenRouter adapter pending" />
        </Panel>
      </div>
    </Page>
  );
}
