import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Plus, Edit2, Trash2, X, Check, Package, Link, Unlink, ExternalLink } from "lucide-react";

type Tab = "general" | "products" | "account" | "billing";

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "account" || tab === "general" || tab === "products" || tab === "billing") {
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
