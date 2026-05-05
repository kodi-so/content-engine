import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { EntityGrid, Field, FormPanel, Page } from "../components/ui";

export function BrandsPage() {
  const brands = useQuery(api.accounts.brands.list);
  const createBrand = useMutation(api.accounts.brands.create);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [voice, setVoice] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    await createBrand({
      name: name.trim(),
      niche: niche.trim() || undefined,
      voice: voice.trim() || undefined,
    });
    setName("");
    setNiche("");
    setVoice("");
  };

  return (
    <Page title="Brands" description="Define the memory and strategy that each account runs on.">
      <FormPanel title="Create Brand" onSubmit={handleSubmit}>
        <Field label="Name" value={name} onChange={setName} placeholder="Habit Lab" />
        <Field label="Niche" value={niche} onChange={setNiche} placeholder="Self-improvement for busy founders" />
        <Field label="Voice" value={voice} onChange={setVoice} placeholder="Clear, practical, slightly contrarian" />
        <button className="primary-button" type="submit">
          <Plus size={16} />
          Create brand
        </button>
      </FormPanel>

      <EntityGrid
        empty="No brands yet."
        items={brands?.map((brand) => ({
          id: brand._id,
          title: brand.name,
          eyebrow: brand.niche || "No niche set",
          body: brand.voice || brand.description || "Brand strategy is ready to be filled in.",
          meta: brand.isActive ? "Active" : "Paused",
        }))}
      />
    </Page>
  );
}
