import { useAction, useMutation, useQuery } from "convex/react";
import { Plus, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { EntityGrid, Field, FormPanel, Page, Select } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { PUBLISHING_PROVIDER_ROUTES } from "../lib/publishingRouting";
import type { BrandId, Platform, PublishingProvider } from "../types";

export function AccountsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const brands = useQuery(api.accounts.brands.list, workspaceArgs);
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const upsertAccount = useMutation(api.accounts.socialAccounts.upsertManual);
  const syncProviderAccounts = useAction(api.accounts.socialAccounts.syncProviderAccounts);
  const [brandId, setBrandId] = useState("");
  const [provider, setProvider] = useState<PublishingProvider>("postiz");
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [username, setUsername] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) return;

    await upsertAccount({
      ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      brandId: brandId ? (brandId as BrandId) : undefined,
      provider,
      platform,
      externalAccountId: `${provider}:${platform}:${username.trim()}`,
      username: username.trim(),
      capabilities: ["publish", "schedule", "analytics"],
    });
    setUsername("");
  };

  const handleSync = async () => {
    setSyncStatus("Syncing");
    try {
      const result = await syncProviderAccounts({
        provider: "postiz",
        ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
        brandId: brandId ? (brandId as BrandId) : undefined,
      });
      setSyncStatus(`Synced ${result.synced} accounts`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Sync failed");
    }
  };

  return (
    <Page
      title="Social Accounts"
      description={`Provider-backed accounts for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <FormPanel title="Add Provider Account" onSubmit={handleSubmit}>
        <Select label="Brand" value={brandId} onChange={setBrandId}>
          <option value="">Unassigned</option>
          {brands?.map((brand) => (
            <option key={brand._id} value={brand._id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select
          label="Provider"
          value={provider}
          onChange={(value) => setProvider(value as PublishingProvider)}
        >
          {PUBLISHING_PROVIDER_ROUTES.map((route) => (
            <option key={route.provider} value={route.provider}>
              {route.label}
            </option>
          ))}
        </Select>
        <Select
          label="Platform"
          value={platform}
          onChange={(value) => setPlatform(value as Platform)}
        >
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="x">X</option>
          <option value="linkedin">LinkedIn</option>
        </Select>
        <Field label="Username" value={username} onChange={setUsername} placeholder="@account" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          Add account
        </button>
        <button className="secondary-button" type="button" onClick={() => void handleSync()}>
          <RefreshCw size={16} />
          Sync Postiz
        </button>
        {syncStatus && <p className="muted">{syncStatus}</p>}
      </FormPanel>

      <EntityGrid
        empty="No social accounts connected yet."
        items={accounts?.map((account) => ({
          id: account._id,
          title: account.username,
          eyebrow: `${account.platform} via ${account.provider}`,
          body: account.capabilities?.join(", ") || "Capabilities will sync from the provider.",
          meta: account.status,
        }))}
      />
    </Page>
  );
}
