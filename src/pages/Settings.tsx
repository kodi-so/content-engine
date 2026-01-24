import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Plus, Edit2, Trash2, X, Check, Package, Link, Unlink, ExternalLink, Image, Upload, Sparkles, Loader } from "lucide-react";

type Tab = "general" | "products" | "images" | "account" | "billing";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "account" || tab === "general" || tab === "products" || tab === "images" || tab === "billing") {
      return tab;
    }
    return "products";
  });
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Handle OAuth callback params
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "tiktok_connected") {
      setNotification({ type: "success", message: "TikTok account connected successfully!" });
      // Clean up URL params
      searchParams.delete("success");
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    } else if (error) {
      setNotification({ type: "error", message: `Connection failed: ${error}` });
      searchParams.delete("error");
      searchParams.delete("tab");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div>
      {/* Notification Banner */}
      {notification && (
        <div
          className={`alert ${notification.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          {notification.message}
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account and application settings</p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          General
        </button>
        <button
          className={`tab ${activeTab === "products" ? "active" : ""}`}
          onClick={() => setActiveTab("products")}
        >
          Products
        </button>
        <button
          className={`tab ${activeTab === "images" ? "active" : ""}`}
          onClick={() => setActiveTab("images")}
        >
          Images
        </button>
        <button
          className={`tab ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          Account
        </button>
        <button
          className={`tab ${activeTab === "billing" ? "active" : ""}`}
          onClick={() => setActiveTab("billing")}
        >
          Billing
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "general" && <GeneralTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "images" && <ImagesTab />}
      {activeTab === "account" && <AccountTab />}
      {activeTab === "billing" && <BillingTab />}
    </div>
  );
}

function GeneralTab() {
  return (
    <div className="card">
      <h2>General Settings</h2>
      <div className="empty-state" style={{ padding: "3rem" }}>
        <p style={{ fontSize: "1rem", color: "#9ca3af" }}>Coming soon...</p>
      </div>
    </div>
  );
}

function ProductsTab() {
  const products = useQuery(api.products.list);
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const removeProduct = useMutation(api.products.remove);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Id<"products"> | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenModal = (productId?: Id<"products">) => {
    if (productId) {
      const product = products?.find((p) => p._id === productId);
      if (product) {
        setEditingProduct(productId);
        setFormData({
          name: product.name,
          description: product.description || "",
        });
      }
    } else {
      setEditingProduct(null);
      setFormData({ name: "", description: "" });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({ name: "", description: "" });
    setError(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Product name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (editingProduct) {
        await updateProduct({
          id: editingProduct,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        });
      } else {
        await createProduct({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        });
      }
      handleCloseModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (productId: Id<"products">) => {
    if (confirm("Are you sure you want to delete this product? This cannot be undone.")) {
      try {
        await removeProduct({ id: productId });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete product");
      }
    }
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: 0 }}>Products</h2>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            Add Product
          </button>
        </div>

        {!products || products.length === 0 ? (
          <div className="empty-state">
            <Package size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
            <h3>No products yet</h3>
            <p>Products help organize your content by brand or business</p>
            <button className="btn btn-primary btn-sm" onClick={() => handleOpenModal()}>
              <Plus size={14} />
              Create First Product
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {products.map((product) => (
              <div
                key={product._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                    {product.name}
                  </div>
                  {product.description && (
                    <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      {product.description}
                    </div>
                  )}
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                    {product.isActive ? (
                      <span className="badge badge-ready">Active</span>
                    ) : (
                      <span className="badge badge-pending">Inactive</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleOpenModal(product._id)}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(product._id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? "Edit Product" : "Add Product"}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g., My App, My Brand"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isSaving}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="textarea"
                placeholder="Brief description of your product..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSaving}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {editingProduct ? "Update" : "Create"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccountTab() {
  const accounts = useQuery(api.accounts.list);
  const createOAuthState = useMutation(api.accounts.createOAuthState);
  const removeAccount = useMutation(api.accounts.remove);
  const [isConnecting, setIsConnecting] = useState(false);

  const tiktokAccounts = accounts?.filter((a) => a.platform === "tiktok") || [];

  const handleConnectTikTok = async () => {
    setIsConnecting(true);
    try {
      // Create OAuth state
      const state = await createOAuthState({
        platform: "tiktok",
        redirectUrl: window.location.href,
      });

      // Build TikTok OAuth URL
      const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY;
      const redirectUri = `${import.meta.env.VITE_CONVEX_SITE_URL}/auth/tiktok/callback`;

      // TikTok OAuth scopes
      const scopes = [
        "user.info.basic",
        "user.info.profile",
        "user.info.stats",
        "video.list",
        "video.publish",
        "video.upload",
      ].join(",");

      const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
      authUrl.searchParams.set("client_key", clientKey);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);
      // Force TikTok to show full authorization screen instead of auto-approving
      // This allows users to log out and sign in with a different account
      authUrl.searchParams.set("disable_auto_auth", "1");

      // Redirect to TikTok
      window.location.href = authUrl.toString();
    } catch (err) {
      console.error("Failed to initiate TikTok OAuth:", err);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: Id<"accounts">) => {
    if (confirm("Are you sure you want to disconnect this TikTok account?")) {
      try {
        await removeAccount({ id: accountId });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to disconnect account");
      }
    }
  };

  return (
    <div className="card">
      <h2>Connected Accounts</h2>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
        Connect your social media accounts to publish content directly from Content Engine.
      </p>

      {/* TikTok Section */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"
                fill="#fff"
              />
            </svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem" }}>TikTok</h3>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
              Post videos and view analytics
            </p>
          </div>
        </div>

        {tiktokAccounts.length === 0 ? (
          <button
            className="btn btn-primary"
            onClick={handleConnectTikTok}
            disabled={isConnecting}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            {isConnecting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                Connecting...
              </>
            ) : (
              <>
                <Link size={16} />
                Connect TikTok Account
              </>
            )}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {tiktokAccounts.map((account) => (
              <div
                key={account._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {account.avatarUrl ? (
                    <img
                      src={account.avatarUrl}
                      alt={account.displayName || account.username}
                      style={{ width: "40px", height: "40px", borderRadius: "50%" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        color: "#6b7280",
                      }}
                    >
                      {(account.displayName || account.username)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {account.displayName || account.username}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      @{account.username}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="badge badge-ready">Connected</span>
                  <a
                    href={`https://www.tiktok.com/@${account.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-secondary"
                    title="View on TikTok"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDisconnect(account._id)}
                    title="Disconnect"
                  >
                    <Unlink size={14} />
                  </button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: "0.75rem" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleConnectTikTok}
                disabled={isConnecting}
              >
                <Plus size={14} />
                Add Another Account
              </button>
              <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.5rem", maxWidth: "400px" }}>
                To connect a different account, log out of TikTok in your browser first or use an incognito window.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Future: Instagram, Twitter sections */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "1.5rem", marginTop: "1rem" }}>
        <h3 style={{ fontSize: "1rem", color: "#9ca3af", marginBottom: "0.5rem" }}>Coming Soon</h3>
        <p style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
          Instagram and Twitter integrations are in development.
        </p>
      </div>
    </div>
  );
}

type ImageType = "character" | "person" | "logo" | "style";

const imageTypeLabels: Record<ImageType, string> = {
  character: "Character/Mascot",
  person: "Person/Face",
  logo: "Logo",
  style: "Style Reference",
};

type ModalMode = "upload" | "generate";

function ImagesTab() {
  const images = useQuery(api.referenceImages.list);
  const addImage = useMutation(api.referenceImages.add);
  const updateImage = useMutation(api.referenceImages.update);
  const removeImage = useMutation(api.referenceImages.remove);
  const uploadBase64Image = useAction(api.storage.uploadBase64Image);
  const generateImage = useAction(api.referenceImages.generateImage);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("upload");
  const [editingImage, setEditingImage] = useState<Id<"referenceImages"> | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "character" as ImageType,
    description: "",
  });
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenModal = (imageId?: Id<"referenceImages">, mode: ModalMode = "upload") => {
    if (imageId) {
      const image = images?.find((img) => img._id === imageId);
      if (image) {
        setEditingImage(imageId);
        setFormData({
          name: image.name,
          type: image.type as ImageType,
          description: image.description || "",
        });
        setPreviewUrl(image.storageUrl);
        setModalMode("upload"); // Editing is always upload mode
      }
    } else {
      setEditingImage(null);
      setFormData({ name: "", type: "character", description: "" });
      setPreviewUrl(null);
      setSelectedFile(null);
      setGeneratePrompt("");
      setModalMode(mode);
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingImage(null);
    setFormData({ name: "", type: "character", description: "" });
    setPreviewUrl(null);
    setSelectedFile(null);
    setGeneratePrompt("");
    setError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    // Validation differs by mode
    if (modalMode === "upload" || editingImage) {
      if (!formData.name.trim()) {
        setError("Name is required");
        return;
      }
    }

    if (!editingImage) {
      if (modalMode === "upload" && !selectedFile) {
        setError("Please select an image");
        return;
      }
      if (modalMode === "generate" && !generatePrompt.trim()) {
        setError("Please describe the character you want to generate");
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      if (editingImage) {
        // Update existing image metadata
        await updateImage({
          id: editingImage,
          name: formData.name.trim(),
          type: formData.type,
          description: formData.description.trim() || undefined,
        });
      } else if (modalMode === "generate") {
        // Generate image with AI - use prompt as both name and description
        const promptText = generatePrompt.trim();
        // Create a short name from the first few words of the prompt
        const autoName = promptText.split(/\s+/).slice(0, 4).join(" ") + (promptText.split(/\s+/).length > 4 ? "..." : "");

        const result = await generateImage({
          prompt: promptText,
          name: autoName,
          type: "character", // Default to character for AI generated
          description: promptText, // Use full prompt as description for reference
        });

        if (!result.success) {
          setError(result.error || "Failed to generate image");
          setIsSaving(false);
          return;
        }
      } else {
        // Upload new image
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile!);
        });

        // Upload to storage
        const storageUrl = await uploadBase64Image({ base64Data });

        // Save reference image record
        await addImage({
          storageUrl,
          name: formData.name.trim(),
          type: formData.type,
          description: formData.description.trim() || undefined,
        });
      }
      handleCloseModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save image");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (imageId: Id<"referenceImages">) => {
    if (confirm("Are you sure you want to delete this image? This cannot be undone.")) {
      try {
        await removeImage({ id: imageId });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete image");
      }
    }
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Reference Images</h2>
            <p style={{ color: "#6b7280", marginTop: "0.25rem", marginBottom: 0 }}>
              Upload or generate images to use as references for consistent visual identity.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-secondary" onClick={() => handleOpenModal(undefined, "upload")}>
              <Upload size={16} />
              Upload
            </button>
            <button className="btn btn-primary" onClick={() => handleOpenModal(undefined, "generate")}>
              <Sparkles size={16} />
              Generate with AI
            </button>
          </div>
        </div>

        {!images || images.length === 0 ? (
          <div className="empty-state">
            <Image size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
            <h3>No reference images yet</h3>
            <p>Upload or generate character mascots, logos, or style references to maintain consistent branding.</p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenModal(undefined, "upload")}>
                <Upload size={14} />
                Upload
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenModal(undefined, "generate")}>
                <Sparkles size={14} />
                Generate with AI
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
            {images.map((image) => (
              <div
                key={image._id}
                style={{
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    aspectRatio: "1",
                    background: "#e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={image.storageUrl}
                    alt={image.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <div style={{ padding: "0.75rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                    {image.name}
                  </div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <span
                      className="badge"
                      style={{
                        background: "#e0e7ff",
                        color: "#4338ca",
                        fontSize: "0.7rem",
                      }}
                    >
                      {imageTypeLabels[image.type as ImageType]}
                    </span>
                  </div>
                  {image.description && (
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.5rem" }}>
                      {image.description.length > 60
                        ? image.description.substring(0, 60) + "..."
                        : image.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleOpenModal(image._id)}
                      title="Edit"
                      style={{ flex: 1 }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(image._id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Upload/Edit/Generate Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>
                {editingImage
                  ? "Edit Image"
                  : modalMode === "generate"
                    ? "Generate Reference Image"
                    : "Upload Reference Image"}
              </h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            {/* Mode Toggle (only when creating new) */}
            {!editingImage && (
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button
                  className={`btn btn-sm ${modalMode === "upload" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setModalMode("upload")}
                  disabled={isSaving}
                  style={{ flex: 1 }}
                >
                  <Upload size={14} />
                  Upload
                </button>
                <button
                  className={`btn btn-sm ${modalMode === "generate" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setModalMode("generate")}
                  disabled={isSaving}
                  style={{ flex: 1 }}
                >
                  <Sparkles size={14} />
                  Generate with AI
                </button>
              </div>
            )}

            {/* Upload Mode: Image Preview / Upload Area */}
            {!editingImage && modalMode === "upload" && (
              <div style={{ marginBottom: "1rem" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                {previewUrl ? (
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "8px",
                      overflow: "hidden",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{ width: "100%", maxHeight: "200px", objectFit: "contain", background: "#f3f4f6" }}
                    />
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ position: "absolute", bottom: "0.5rem", right: "0.5rem" }}
                      disabled={isSaving}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed #e5e7eb",
                      borderRadius: "8px",
                      padding: "2rem",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "#f9fafb",
                    }}
                  >
                    <Upload size={32} style={{ color: "#9ca3af", marginBottom: "0.5rem" }} />
                    <div style={{ color: "#6b7280" }}>Click to select an image</div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                      PNG, JPG up to 5MB
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generate Mode: AI Prompt */}
            {!editingImage && modalMode === "generate" && (
              <div className="form-group">
                <label className="form-label">Describe your character</label>
                <textarea
                  className="textarea"
                  placeholder="Example: A friendly blue cartoon mascot with a muscular build and confident smile, wearing gym clothes. Simple, clean design with bold outlines."
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  disabled={isSaving}
                  rows={4}
                  style={{ minHeight: "100px" }}
                />
              </div>
            )}

            {editingImage && previewUrl && (
              <div style={{ marginBottom: "1rem" }}>
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    width: "100%",
                    maxHeight: "150px",
                    objectFit: "contain",
                    background: "#f3f4f6",
                    borderRadius: "8px",
                  }}
                />
              </div>
            )}

            {/* Show form fields for upload mode and edit mode, but not generate mode */}
            {(modalMode === "upload" || editingImage) && (
              <>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Blue Bro, Main Logo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={isSaving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select
                    className="input"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as ImageType })}
                    disabled={isSaving}
                  >
                    <option value="character">Character/Mascot</option>
                    <option value="person">Person/Face</option>
                    <option value="logo">Logo</option>
                    <option value="style">Style Reference</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Instructions (optional)</label>
                  <textarea
                    className="textarea"
                    placeholder="e.g., Blue Bro is a muscular blue character. Always show confident body language."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={isSaving}
                    rows={3}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                    Describe how this image should be used when generating slideshows.
                  </p>
                </div>
              </>
            )}

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader size={16} className="spinner" />
                    {editingImage ? "Saving..." : modalMode === "generate" ? "Generating..." : "Uploading..."}
                  </>
                ) : (
                  <>
                    {modalMode === "generate" && !editingImage ? <Sparkles size={16} /> : <Check size={16} />}
                    {editingImage ? "Update" : modalMode === "generate" ? "Generate" : "Upload"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BillingTab() {
  return (
    <div className="card">
      <h2>Billing & Subscription</h2>
      <div className="empty-state" style={{ padding: "3rem" }}>
        <p style={{ fontSize: "1rem", color: "#9ca3af" }}>Coming soon...</p>
      </div>
    </div>
  );
}
