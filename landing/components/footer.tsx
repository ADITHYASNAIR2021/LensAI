"use client";
import { Eye, Twitter, Github } from "lucide-react";

const footerLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Documentation", href: "https://docs.lensai.dev" },
  { label: "GitHub", href: "https://github.com/lensai-dev" },
  { label: "Status", href: "https://status.lensai.dev" },
];

const socialLinks = [
  {
    label: "Twitter / X",
    href: "https://twitter.com/lensai_dev",
    Icon: Twitter,
  },
  {
    label: "GitHub",
    href: "https://github.com/lensai-dev",
    Icon: Github,
  },
];

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(30,45,74,0.6)",
        background: "rgba(8,11,20,0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Main footer content */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "60px 24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "48px",
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "32px",
          }}
        >
          {/* Logo + tagline */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <a
              href="#"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 16px rgba(124,58,237,0.35)",
                }}
              >
                <Eye size={18} color="white" />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-syne)",
                  fontWeight: 700,
                  fontSize: "1.2rem",
                  color: "#F8FAFC",
                  letterSpacing: "-0.02em",
                }}
              >
                LensAI
              </span>
            </a>
            <p
              style={{
                color: "#94A3B8",
                fontSize: "0.875rem",
                maxWidth: "220px",
                lineHeight: 1.55,
              }}
            >
              The AI layer for your eyes. Understand anything on screen, instantly.
            </p>
          </div>

          {/* Center links */}
          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 24px",
              alignItems: "center",
              maxWidth: "480px",
            }}
            aria-label="Footer navigation"
          >
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  color: "#94A3B8",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  transition: "color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "#94A3B8";
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Social links */}
          <div
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            {socialLinks.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "rgba(15,22,41,0.8)",
                  border: "1px solid #1E2D4A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#94A3B8",
                  transition: "all 0.2s ease",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.color = "#F8FAFC";
                  el.style.borderColor = "rgba(124,58,237,0.4)";
                  el.style.background = "rgba(124,58,237,0.1)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.color = "#94A3B8";
                  el.style.borderColor = "#1E2D4A";
                  el.style.background = "rgba(15,22,41,0.8)";
                }}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            paddingTop: "24px",
            borderTop: "1px solid rgba(30,45,74,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          {/* Copyright */}
          <p
            style={{
              color: "#94A3B8",
              fontSize: "0.82rem",
            }}
          >
            &copy; 2026 LensAI. Built with{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontWeight: 600,
              }}
            >
              NVIDIA NIM
            </span>
            .
          </p>

          {/* Trust badges */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["GDPR Compliant", "Zero Retention", "Open Source"].map(
              (badge) => (
                <span
                  key={badge}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "100px",
                    background: "rgba(15,22,41,0.8)",
                    border: "1px solid #1E2D4A",
                    color: "#94A3B8",
                    fontSize: "0.72rem",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#06B6D4",
                      display: "inline-block",
                      boxShadow: "0 0 6px rgba(6,182,212,0.5)",
                    }}
                  />
                  {badge}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
