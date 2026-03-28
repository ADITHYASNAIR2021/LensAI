"use client";
import { motion } from "framer-motion";

const companies = ["Vercel", "Stripe", "Linear", "Notion", "Figma"];

const stats = [
  { value: "12,400+", label: "Users" },
  { value: "2.1M", label: "Scans" },
  { value: "97.3%", label: "Accuracy" },
  { value: "< 1.2s", label: "Avg Speed" },
];

export default function SocialProof() {
  return (
    <section
      style={{
        padding: "60px 24px",
        borderTop: "1px solid rgba(30,45,74,0.5)",
        borderBottom: "1px solid rgba(30,45,74,0.5)",
        background:
          "linear-gradient(180deg, rgba(15,22,41,0.3) 0%, transparent 100%)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Label */}
        <p
          style={{
            textAlign: "center",
            color: "#94A3B8",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "32px",
          }}
        >
          Trusted by developers, designers, and researchers at
        </p>

        {/* Company logos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "48px",
            flexWrap: "wrap",
            marginBottom: "48px",
          }}
        >
          {companies.map((company) => (
            <span
              key={company}
              style={{
                fontFamily: "var(--font-syne)",
                fontWeight: 700,
                fontSize: "1.1rem",
                color: "rgba(148,163,184,0.45)",
                letterSpacing: "-0.02em",
                transition: "color 0.2s ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLSpanElement).style.color =
                  "rgba(148,163,184,0.8)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLSpanElement).style.color =
                  "rgba(148,163,184,0.45)";
              }}
            >
              {company}
            </span>
          ))}
        </div>

        {/* Divider with rating */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              height: "1px",
              flex: 1,
              maxWidth: "160px",
              background:
                "linear-gradient(90deg, transparent, rgba(30,45,74,0.8))",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "#FBBF24", fontSize: "1rem" }}>
              ★★★★★
            </span>
            <span
              style={{
                color: "#F8FAFC",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              4.9/5
            </span>
            <span style={{ color: "#94A3B8", fontSize: "0.85rem" }}>
              from 847 reviews
            </span>
          </div>
          <div
            style={{
              height: "1px",
              flex: 1,
              maxWidth: "160px",
              background:
                "linear-gradient(90deg, rgba(30,45,74,0.8), transparent)",
            }}
          />
        </div>

        {/* Stat pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {stats.map((stat, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "100px",
                background: "rgba(15, 22, 41, 0.8)",
                border: "1px solid #1E2D4A",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-syne)",
                  fontWeight: 700,
                  fontSize: "1rem",
                  background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  color: "#94A3B8",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
