import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Zap,
  Layers,
  Sparkles,
  ArrowRight,
  Play,
  Image,
  Wand2,
  Download,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function Landing() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff" }}>
      {/* Header */}
      <header
        style={{
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto",
          position: "sticky",
          top: 0,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(8px)",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={20} color="#ffffff" />
          </div>
          <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>
            Content Engine
          </span>
        </div>
        {isSignedIn ? (
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "0.625rem 1.25rem",
              backgroundColor: "#111827",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Go to Dashboard
            <ArrowRight size={16} />
          </button>
        ) : (
          <SignInButton mode="modal" forceRedirectUrl="/dashboard">
            <button
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "#111827",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Sign in
              <ArrowRight size={16} />
            </button>
          </SignInButton>
        )}
      </header>

      {/* Hero */}
      <main
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "5rem 2rem 4rem",
          textAlign: "center",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#f0f9ff",
            borderRadius: "100px",
            marginBottom: "1.5rem",
            border: "1px solid #bae6fd",
          }}
        >
          <Sparkles size={14} color="#0ea5e9" />
          <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#0369a1" }}>
            Powered by AI
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 800,
            color: "#111827",
            lineHeight: 1.1,
            marginBottom: "1.5rem",
            letterSpacing: "-0.03em",
          }}
        >
          Create viral carousels
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            in seconds
          </span>
        </h1>
        <p
          style={{
            fontSize: "1.25rem",
            color: "#6b7280",
            marginBottom: "2rem",
            lineHeight: 1.7,
            maxWidth: "600px",
            margin: "0 auto 2rem",
          }}
        >
          Turn any idea into stunning social media slideshows. AI generates the
          text, creates matching visuals, and you're ready to post.
        </p>

        {/* CTA Buttons */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: "3rem",
          }}
        >
          {isSignedIn ? (
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                padding: "1rem 2rem",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                fontSize: "1.125rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.75rem",
                boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(59, 130, 246, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 14px rgba(59, 130, 246, 0.4)";
              }}
            >
              Go to Dashboard
              <ArrowRight size={20} />
            </button>
          ) : (
            <>
              <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                <button
                  style={{
                    padding: "1rem 2rem",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 6px 20px rgba(59, 130, 246, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 14px rgba(59, 130, 246, 0.4)";
                  }}
                >
                  Get Started Free
                  <ArrowRight size={20} />
                </button>
              </SignInButton>
              <button
                onClick={() => {
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "1rem 2rem",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#d1d5db";
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                <Play size={20} fill="#374151" />
                See How It Works
              </button>
            </>
          )}
        </div>
      </main>

      {/* Preview/Demo Section */}
      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "2rem 2rem 4rem",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            borderRadius: "24px",
            padding: "2rem",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}
        >
          {/* Mock UI Preview */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "1.5rem",
              alignItems: "start",
            }}
          >
            {/* Left: Input */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#6b7280",
                  marginBottom: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Your Prompt
              </div>
              <div
                style={{
                  backgroundColor: "#f9fafb",
                  borderRadius: "12px",
                  padding: "1rem",
                  fontSize: "0.875rem",
                  color: "#374151",
                  lineHeight: 1.6,
                  marginBottom: "1rem",
                  border: "1px solid #e5e7eb",
                }}
              >
                "5 tips for staying productive while working from home"
              </div>
              <div
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <Wand2 size={16} />
                Generate
              </div>
            </div>

            {/* Right: Preview carousel */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                overflowX: "auto",
                paddingBottom: "0.5rem",
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    minWidth: "160px",
                    aspectRatio: "4/5",
                    background: `linear-gradient(135deg, ${
                      i === 1
                        ? "#3b82f6, #1d4ed8"
                        : i === 2
                          ? "#8b5cf6, #6d28d9"
                          : i === 3
                            ? "#06b6d4, #0891b2"
                            : "#10b981, #059669"
                    })`,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "1rem",
                    textAlign: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    opacity: i === 1 ? 1 : 0.7,
                    transform: i === 1 ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  {i === 1 && "Tip #1: Create a dedicated workspace"}
                  {i === 2 && "Tip #2: Set clear boundaries"}
                  {i === 3 && "Tip #3: Take regular breaks"}
                  {i === 4 && "Tip #4: Stay connected"}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "4rem 2rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "0.75rem",
            }}
          >
            How it works
          </h2>
          <p style={{ color: "#6b7280", fontSize: "1.125rem" }}>
            Three simple steps to create scroll-stopping content
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2rem",
          }}
        >
          {[
            {
              step: "1",
              icon: Wand2,
              title: "Describe Your Idea",
              description:
                "Enter a topic or prompt. Be as specific or general as you'd like.",
              color: "#3b82f6",
            },
            {
              step: "2",
              icon: Image,
              title: "AI Generates Content",
              description:
                "Our AI creates compelling text and unique images for each slide.",
              color: "#8b5cf6",
            },
            {
              step: "3",
              icon: Download,
              title: "Export & Post",
              description:
                "Download your slides and share directly to TikTok, Instagram, or anywhere.",
              color: "#10b981",
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                position: "relative",
                padding: "2rem",
                backgroundColor: "#ffffff",
                borderRadius: "20px",
                border: "1px solid #e5e7eb",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.boxShadow = `0 8px 24px ${item.color}20`;
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "-12px",
                  left: "1.5rem",
                  width: "24px",
                  height: "24px",
                  backgroundColor: item.color,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {item.step}
              </div>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  backgroundColor: `${item.color}15`,
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <item.icon size={28} color={item.color} />
              </div>
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: "0.5rem",
                }}
              >
                {item.title}
              </h3>
              <p
                style={{ fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6 }}
              >
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        style={{
          backgroundColor: "#f9fafb",
          padding: "4rem 2rem",
          marginTop: "2rem",
        }}
      >
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: "#111827",
                marginBottom: "0.75rem",
              }}
            >
              Everything you need
            </h2>
            <p style={{ color: "#6b7280", fontSize: "1.125rem" }}>
              Powerful features to create content that converts
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1.5rem",
            }}
          >
            {[
              {
                icon: Sparkles,
                title: "AI-Powered Text",
                description: "Smart copy that engages and converts",
              },
              {
                icon: Image,
                title: "Custom Images",
                description: "Unique visuals generated for each slide",
              },
              {
                icon: Layers,
                title: "Multiple Formats",
                description: "1:1, 4:5, and 9:16 aspect ratios",
              },
              {
                icon: Wand2,
                title: "One-Click Regenerate",
                description: "Don't like an image? Regenerate it instantly",
              },
              {
                icon: Download,
                title: "Easy Export",
                description: "Download as high-quality PNG images",
              },
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Full carousels in under 30 seconds",
              },
            ].map((feature, i) => (
              <div
                key={i}
                style={{
                  padding: "1.5rem",
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <feature.icon size={20} color="#3b82f6" />
                </div>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "#111827",
                    marginBottom: "0.375rem",
                  }}
                >
                  {feature.title}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "5rem 2rem",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "2.5rem",
            fontWeight: 700,
            color: "#111827",
            marginBottom: "1rem",
          }}
        >
          Ready to create?
        </h2>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#6b7280",
            marginBottom: "2rem",
          }}
        >
          Join creators who are saving hours on content creation
        </p>
        {isSignedIn ? (
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "1rem 2.5rem",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              fontSize: "1.125rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.75rem",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 6px 20px rgba(59, 130, 246, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 14px rgba(59, 130, 246, 0.4)";
            }}
          >
            Go to Dashboard
            <ArrowRight size={20} />
          </button>
        ) : (
          <SignInButton mode="modal" forceRedirectUrl="/dashboard">
            <button
              style={{
                padding: "1rem 2.5rem",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                fontSize: "1.125rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.75rem",
                boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(59, 130, 246, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 14px rgba(59, 130, 246, 0.4)";
              }}
            >
              Start Creating Now
              <ArrowRight size={20} />
            </button>
          </SignInButton>
        )}
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "2rem",
          textAlign: "center",
          color: "#9ca3af",
          fontSize: "0.875rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Zap size={16} color="#3b82f6" />
          <span style={{ fontWeight: 600, color: "#6b7280" }}>Content Engine</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginBottom: "1rem" }}>
          <a
            href="/privacy"
            style={{
              color: "#6b7280",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#3b82f6")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            style={{
              color: "#6b7280",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#3b82f6")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
          >
            Terms of Service
          </a>
        </div>
        <p>&copy; {new Date().getFullYear()} Content Engine. All rights reserved.</p>
      </footer>
    </div>
  );
}
