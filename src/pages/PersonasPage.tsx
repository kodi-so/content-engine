import { useAction, useMutation, useQuery } from "convex/react";
import {
  ImagePlus,
  Mic,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { BrandId, CreativeAssetDoc, CreativeAssetId, PersonaDoc, PersonaId, PersonaType } from "../types";
import { Field, Page, Select, TextArea } from "../components/ui";

type AssetRole = "source" | "generated" | "voice";

type PersonaFormState = {
  name: string;
  personaType: PersonaType;
  description: string;
  identityPrompt: string;
  visualConstraintsText: string;
  sourceAssetIds: string[];
  generatedAssetIds: string[];
  voiceAssetIds: string[];
  usageNotes: string;
};

const personaTypeOptions: Array<{ value: PersonaType; label: string }> = [
  { value: "ai_influencer", label: "AI influencer" },
  { value: "ugc_actor", label: "UGC actor" },
  { value: "transformation_identity", label: "Transformation identity" },
  { value: "mascot", label: "Mascot" },
  { value: "spokesperson", label: "Spokesperson" },
  { value: "customer_avatar", label: "Customer avatar" },
  { value: "other", label: "Other" },
];

const emptyPersonaForm: PersonaFormState = {
  name: "",
  personaType: "ai_influencer",
  description: "",
  identityPrompt: "",
  visualConstraintsText: "",
  sourceAssetIds: [],
  generatedAssetIds: [],
  voiceAssetIds: [],
  usageNotes: "",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function formFromPersona(persona: PersonaDoc): PersonaFormState {
  return {
    name: persona.name,
    personaType: persona.personaType,
    description: persona.description ?? "",
    identityPrompt: persona.identityPrompt,
    visualConstraintsText: persona.visualConstraints?.join("\n") ?? "",
    sourceAssetIds: persona.sourceAssetIds.map(String),
    generatedAssetIds: persona.generatedAssetIds.map(String),
    voiceAssetIds: persona.voiceAssetIds.map(String),
    usageNotes: persona.usageNotes ?? "",
  };
}

function constraintsFromText(value: string) {
  const constraints = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return constraints.length ? constraints : undefined;
}

function assetIdsForRole(form: PersonaFormState, role: AssetRole) {
  if (role === "generated") return form.generatedAssetIds;
  if (role === "voice") return form.voiceAssetIds;
  return form.sourceAssetIds;
}

function roleLabel(role: AssetRole) {
  if (role === "generated") return "Generated";
  if (role === "voice") return "Voice";
  return "Source";
}

function assetPreview(asset: CreativeAssetDoc) {
  if (asset.mediaType === "image") {
    return <img src={asset.storageUrl} alt="" />;
  }
  if (asset.mediaType === "video") {
    return <video src={asset.storageUrl} muted playsInline />;
  }
  if (asset.mediaType === "audio") {
    return (
      <span className="grid h-full place-items-center text-[var(--color-primary-strong)]">
        <Mic size={26} />
      </span>
    );
  }
  return (
    <span className="grid h-full place-items-center text-[var(--color-primary-strong)]">
      <ImagePlus size={26} />
    </span>
  );
}

function describeAsset(asset: CreativeAssetDoc) {
  return `${asset.assetKind.replace(/_/g, " ")} · ${asset.mediaType}`;
}

export function PersonasPage() {
  const brands = useQuery(api.accounts.brands.list);
  const [brandId, setBrandId] = useState("");
  const personas = useQuery(
    api.accounts.personas.list,
    brandId ? { brandId: brandId as BrandId } : "skip"
  );
  const creativeAssets = useQuery(
    api.accounts.creativeAssets.list,
    brandId ? { brandId: brandId as BrandId } : "skip"
  );
  const createPersona = useMutation(api.accounts.personas.create);
  const updatePersona = useMutation(api.accounts.personas.update);
  const deletePersona = useMutation(api.accounts.personas.remove);
  const createCreativeAsset = useMutation(api.accounts.creativeAssets.create);
  const uploadBase64Image = useAction(api.storage.files.uploadBase64Image);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaFormState>(emptyPersonaForm);
  const [status, setStatus] = useState("");
  const [uploadRole, setUploadRole] = useState<AssetRole>("source");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const selectedPersona = useMemo(
    () => personas?.find((persona) => String(persona._id) === selectedPersonaId) ?? null,
    [personas, selectedPersonaId]
  );
  const isNewPersona = selectedPersonaId === "new";
  const assetsById = useMemo(
    () => new Map((creativeAssets ?? []).map((asset) => [String(asset._id), asset])),
    [creativeAssets]
  );
  const sourceAssets = useMemo(
    () => creativeAssets?.filter((asset) => asset.mediaType !== "audio") ?? [],
    [creativeAssets]
  );
  const voiceAssets = useMemo(
    () =>
      creativeAssets?.filter(
        (asset) => asset.mediaType === "audio" || asset.assetKind === "voice"
      ) ?? [],
    [creativeAssets]
  );
  const generatedPreviewAssets = form.generatedAssetIds
    .map((assetId) => assetsById.get(assetId))
    .filter((asset): asset is CreativeAssetDoc => Boolean(asset));

  useEffect(() => {
    if (!brandId && brands?.[0]) {
      setBrandId(String(brands[0]._id));
    }
  }, [brandId, brands]);

  useEffect(() => {
    if (!personas) return;
    if (selectedPersonaId === "new") return;
    if (selectedPersonaId && personas.some((persona) => String(persona._id) === selectedPersonaId)) {
      return;
    }
    setSelectedPersonaId(personas[0] ? String(personas[0]._id) : "new");
  }, [personas, selectedPersonaId]);

  useEffect(() => {
    if (selectedPersona) {
      setForm(formFromPersona(selectedPersona));
      return;
    }
    if (selectedPersonaId === "new") {
      setForm(emptyPersonaForm);
    }
  }, [selectedPersona, selectedPersonaId]);

  const updateForm = (patch: Partial<PersonaFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setStatus("");
  };

  const setAssetIdsForRole = (role: AssetRole, ids: string[]) => {
    if (role === "generated") updateForm({ generatedAssetIds: ids });
    else if (role === "voice") updateForm({ voiceAssetIds: ids });
    else updateForm({ sourceAssetIds: ids });
  };

  const toggleAsset = (role: AssetRole, assetId: string) => {
    const currentIds = assetIdsForRole(form, role);
    setAssetIdsForRole(
      role,
      currentIds.includes(assetId)
        ? currentIds.filter((currentId) => currentId !== assetId)
        : [...currentIds, assetId]
    );
  };

  const savePersona = async (event: FormEvent) => {
    event.preventDefault();
    if (!brandId || !form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      personaType: form.personaType,
      description: form.description.trim() || undefined,
      identityPrompt: form.identityPrompt.trim() || undefined,
      visualConstraints: constraintsFromText(form.visualConstraintsText),
      sourceAssetIds: form.sourceAssetIds as CreativeAssetId[],
      generatedAssetIds: form.generatedAssetIds as CreativeAssetId[],
      voiceAssetIds: form.voiceAssetIds as CreativeAssetId[],
      usageNotes: form.usageNotes.trim() || undefined,
    };

    setStatus("Saving persona");
    try {
      if (isNewPersona || !selectedPersona) {
        const personaId = await createPersona({
          brandId: brandId as BrandId,
          ...payload,
        });
        setSelectedPersonaId(String(personaId));
      } else {
        await updatePersona({
          id: selectedPersona._id as PersonaId,
          ...payload,
        });
      }
      setStatus("Persona saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Persona save failed");
    }
  };

  const removePersona = async () => {
    if (!selectedPersona) return;
    if (!window.confirm(`Delete "${selectedPersona.name}"? Attached creative assets will stay in the library.`)) {
      return;
    }

    setStatus("Deleting persona");
    try {
      await deletePersona({ id: selectedPersona._id as PersonaId });
      setSelectedPersonaId(null);
      setStatus("Persona deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleUploadFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadFile(event.target.files?.[0] ?? null);
  };

  const uploadAndAttachAsset = async () => {
    if (!brandId || !uploadFile || !uploadName.trim()) return;

    setStatus("Uploading creative asset");
    try {
      const storageUrl = await uploadBase64Image({
        base64Data: await readFileAsDataUrl(uploadFile),
        filename: uploadFile.name,
      });
      const assetId = await createCreativeAsset({
        brandId: brandId as BrandId,
        name: uploadName.trim(),
        assetKind: uploadRole === "voice" ? "voice" : "person",
        storageUrl,
        mimeType: uploadFile.type || undefined,
      });
      setAssetIdsForRole(uploadRole, [...assetIdsForRole(form, uploadRole), String(assetId)]);
      setUploadName("");
      setUploadFile(null);
      setStatus(`${roleLabel(uploadRole)} asset attached`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const renderAssetPicker = (role: AssetRole, assets: CreativeAssetDoc[]) => {
    const selectedIds = assetIdsForRole(form, role);

    return (
      <section className="grid min-w-0 gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
        <div className="section-toolbar">
          <div>
            <h3 className="m-0 text-[0.95rem] font-[680]">{roleLabel(role)} assets</h3>
            <p className="muted">
              {role === "voice"
                ? "Voice references for TTS, lip sync, or narration nodes."
                : role === "generated"
                  ? "Approved generated looks that can be reused in workflow media nodes."
                  : "Original references that define the identity or transformation state."}
            </p>
          </div>
          <span className="entity-eyebrow">{selectedIds.length} selected</span>
        </div>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(10rem,100%),1fr))] gap-[var(--space-3)]">
          {assets.map((asset) => {
            const selected = selectedIds.includes(String(asset._id));
            return (
              <button
                className={[
                  "grid min-w-0 cursor-pointer gap-[var(--space-2)] rounded-[var(--radius-md)] border bg-[var(--color-surface-raised)] p-[var(--space-2)] text-left text-[var(--color-ink)] transition",
                  selected
                    ? "border-[var(--color-primary)] shadow-[var(--focus-ring)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
                ].join(" ")}
                key={asset._id}
                type="button"
                onClick={() => toggleAsset(role, String(asset._id))}
              >
                <div className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-tinted)] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
                  {assetPreview(asset)}
                </div>
                <strong className="min-w-0 text-[0.86rem] font-[650] leading-[1.2] [overflow-wrap:anywhere]">
                  {asset.name}
                </strong>
                <span className="muted text-[0.72rem] leading-[1.15]">{describeAsset(asset)}</span>
              </button>
            );
          })}
          {assets.length === 0 && (
            <div className="empty-state min-h-[8rem]">No matching creative assets yet.</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <Page title="Personas" description="Reusable identities for UGC characters, mascots, spokespeople, and transformation concepts.">
      <div className="grid min-w-0 gap-[var(--space-4)] xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="panel content-start">
          <div className="section-toolbar">
            <h2>Persona List</h2>
            <button
              className="secondary-button !min-w-0 !px-[var(--space-3)]"
              type="button"
              onClick={() => setSelectedPersonaId("new")}
              title="New persona"
            >
              <Plus size={16} />
            </button>
          </div>
          <Select label="Brand" value={brandId} onChange={(value) => {
            setBrandId(value);
            setSelectedPersonaId(null);
          }}>
            <option value="">Select brand</option>
            {brands?.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.name}
              </option>
            ))}
          </Select>
          <div className="grid gap-[var(--space-2)]">
            {!personas && brandId && <p className="muted">Loading personas...</p>}
            {personas?.length === 0 && (
              <div className="empty-state min-h-[8rem]">No personas for this brand yet.</div>
            )}
            {personas?.map((persona) => {
              const selected = String(persona._id) === selectedPersonaId;
              return (
                <button
                  className={[
                    "grid min-w-0 gap-[var(--space-1)] rounded-[var(--radius-md)] border p-[var(--space-3)] text-left transition",
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)]",
                  ].join(" ")}
                  key={persona._id}
                  type="button"
                  onClick={() => setSelectedPersonaId(String(persona._id))}
                >
                  <span className="entity-eyebrow">{persona.personaType.replace(/_/g, " ")}</span>
                  <strong className="min-w-0 [overflow-wrap:anywhere]">{persona.name}</strong>
                  <span className="muted text-[0.78rem]">
                    {persona.sourceAssetIds.length + persona.generatedAssetIds.length + persona.voiceAssetIds.length} assets
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <form className="panel content-start" onSubmit={savePersona}>
          <div className="section-toolbar">
            <div>
              <h2>{isNewPersona ? "New Persona" : selectedPersona?.name ?? "Persona Details"}</h2>
              <p className="muted">Profile instructions and attached media are what workflow nodes consume.</p>
            </div>
            <div className="button-row">
              {selectedPersona && (
                <button className="danger-button" type="button" onClick={() => void removePersona()}>
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
              <button className="primary-button" disabled={!brandId || !form.name.trim()} type="submit">
                <Save size={16} />
                Save persona
              </button>
            </div>
          </div>

          <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(value) => updateForm({ name: value })} placeholder="Fitness transformation woman" />
            <Select
              label="Type"
              value={form.personaType}
              onChange={(value) => updateForm({ personaType: value as PersonaType })}
            >
              {personaTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <TextArea
              label="Description"
              value={form.description}
              onChange={(value) => updateForm({ description: value })}
              placeholder="A consistent fictional UGC identity for before/after wellness content."
              rows={3}
            />
            <TextArea
              label="Usage notes"
              value={form.usageNotes}
              onChange={(value) => updateForm({ usageNotes: value })}
              placeholder="Use for casual selfie-style short-form videos. Avoid studio polish."
              rows={3}
            />
          </div>

          <TextArea
            label="Identity prompt"
            value={form.identityPrompt}
            onChange={(value) => updateForm({ identityPrompt: value })}
            placeholder="25-year-old woman, medium olive skin tone, long dark hair, warm brown eyes, natural everyday appearance..."
            rows={5}
          />
          <TextArea
            label="Visual constraints"
            value={form.visualConstraintsText}
            onChange={(value) => updateForm({ visualConstraintsText: value })}
            placeholder={"One constraint per line\nNatural skin texture\nSpecific phone camera\nNo stock photo lighting"}
            rows={4}
          />

          <section className="grid min-w-0 gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <div className="section-toolbar">
              <div>
                <h3 className="m-0 text-[0.95rem] font-[680]">Upload and attach</h3>
                <p className="muted">Create a creative asset and attach it to this persona in one step.</p>
              </div>
            </div>
            <div className="grid min-w-0 gap-[var(--space-3)] lg:grid-cols-[12rem_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end">
              <Select label="Attach as" value={uploadRole} onChange={(value) => setUploadRole(value as AssetRole)}>
                <option value="source">Source</option>
                <option value="generated">Generated</option>
                <option value="voice">Voice</option>
              </Select>
              <Field label="Asset name" value={uploadName} onChange={setUploadName} placeholder="Before selfie reference" />
              <label className="field">
                <span>File</span>
                <input
                  accept={uploadRole === "voice" ? "audio/*" : "image/*,video/*"}
                  type="file"
                  onChange={handleUploadFileChange}
                />
              </label>
              <button
                className="secondary-button"
                disabled={!brandId || !uploadName.trim() || !uploadFile}
                type="button"
                onClick={() => void uploadAndAttachAsset()}
              >
                <ImagePlus size={16} />
                Attach
              </button>
            </div>
          </section>

          {renderAssetPicker("source", sourceAssets)}
          {renderAssetPicker("generated", sourceAssets)}
          {renderAssetPicker("voice", voiceAssets)}

          <section className="grid min-w-0 gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <div className="section-toolbar">
              <div>
                <h3 className="m-0 text-[0.95rem] font-[680]">Generated image view</h3>
                <p className="muted">Selected generated assets are the reusable look set for this persona.</p>
              </div>
              <span className="entity-eyebrow">{generatedPreviewAssets.length} images</span>
            </div>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-[var(--space-3)]">
              {generatedPreviewAssets.map((asset) => (
                <figure className="m-0 grid gap-[var(--space-2)]" key={asset._id}>
                  <div className="aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-tinted)] [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
                    {assetPreview(asset)}
                  </div>
                  <figcaption className="muted text-[0.78rem] leading-[1.2] [overflow-wrap:anywhere]">
                    {asset.name}
                  </figcaption>
                </figure>
              ))}
              {generatedPreviewAssets.length === 0 && (
                <div className="empty-state min-h-[8rem]">No generated assets selected.</div>
              )}
            </div>
          </section>

          {status && <p className="muted">{status}</p>}
        </form>
      </div>
    </Page>
  );
}
