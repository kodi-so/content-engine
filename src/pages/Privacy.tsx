export default function Privacy() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "3rem",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
          Privacy Policy
        </h1>
        <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
          Last updated: January 10, 2026
        </p>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            1. Information We Collect
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            When you use Content Engine, we collect information you provide directly to us,
            including your name, email address, and any content you create using our platform.
            We also collect information automatically when you use our services, such as your
            IP address, browser type, and usage patterns.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            2. How We Use Your Information
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            We use the information we collect to provide, maintain, and improve our services,
            to communicate with you about your account and our services, and to personalize
            your experience. We may also use the information for research and analytics purposes.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            3. Information Sharing
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            We do not sell your personal information. We may share your information with
            third-party service providers who assist us in operating our platform, such as
            cloud hosting providers and authentication services. We may also share information
            when required by law or to protect our rights.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            4. Data Security
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            We implement appropriate technical and organizational measures to protect your
            personal information against unauthorized access, alteration, disclosure, or
            destruction. However, no method of transmission over the Internet is 100% secure.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            5. Your Rights
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            You have the right to access, correct, or delete your personal information.
            You may also request a copy of your data or ask us to restrict processing.
            To exercise these rights, please contact us at privacy@content-engine.dev.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            6. Cookies
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            We use cookies and similar technologies to maintain your session, remember your
            preferences, and analyze how our services are used. You can control cookies
            through your browser settings.
          </p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            7. Changes to This Policy
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            We may update this privacy policy from time to time. We will notify you of any
            changes by posting the new policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            8. Contact Us
          </h2>
          <p style={{ color: "#374151", lineHeight: 1.7 }}>
            If you have any questions about this Privacy Policy, please contact us at
            privacy@content-engine.dev.
          </p>
        </section>

        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid #e5e7eb" }}>
          <a
            href="/"
            style={{
              color: "#3b82f6",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            &larr; Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
