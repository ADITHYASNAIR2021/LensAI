"use client";

import { motion } from "framer-motion";
import {
  Brain,
  GitCompare,
  Network,
  Globe,
  Code2,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Visual Understanding",
    description:
      "Select any screen region, get expert-level analysis in seconds. Powered by NVIDIA NIM with 12 specialized AI models across 10 content categories.",
    gradient: "135deg, #7C3AED, #A855F7",
    glow: "rgba(124,58,237,0.3)",
  },
  {
    icon: GitCompare,
    title: "Multi-Region Comparison",
    description:
      "Compare two screenshots side-by-side with AI-generated diff and insights. Activate with Ctrl+Shift+C for instant visual diffs.",
    gradient: "135deg, #06B6D4, #22D3EE",
    glow: "rgba(6,182,212,0.3)",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description:
      "Every scan connects. Watch your personal intelligence map grow with interactive D3 force visualization and cosine similarity links.",
    gradient: "135deg, #A855F7, #06B6D4",
    glow: "rgba(168,85,247,0.3)",
  },
  {
    icon: Globe,
    title: "Translation AR Overlay",
    description:
      "See translations inline on the page — no tab switching, no copy-paste. AI renders translated text directly over the original.",
    gradient: "135deg, #06B6D4, #7C3AED",
    glow: "rgba(6,182,212,0.25)",
  },
  {
    icon: Code2,
    title: "Code Deep Analysis",
    description:
      "Bugs, optimizations, complexity scores, and dependency graphs in one click. Supports 40+ languages with line-level precision.",
    gradient: "135deg, #7C3AED, #06B6D4",
    glow: "rgba(124,58,237,0.25)",
  },
  {
    icon: Zap,
    title: "Smart Caching",
    description:
      "30-40% faster repeat analyses with SHA-256 content hashing and Redis-backed cache. Your most-viewed content loads instantly.",
    gradient: "135deg, #FBBF24, #F59E0B",
    glow: "rgba(251,191,36,0.2)",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.55,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{ y: -4 }}
      style={{
        padding: "28px",
        borderRadius: "20px",
        background: "rgba(15, 22, 41, 0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid #1E2D4A",
        cursor: "default",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "rgba(124,58,237,0.4)";
        el.style.boxShadow = `0 0 30px ${feature.glow}`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "#1E2D4A";
        el.style.boxShadow = "none";
      }}
    >
      {/* Subtle top gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: `linear-gradient(${feature.gradient})`,
          opacity: 0.6,
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "14px",
          background: `linear-gradient(${feature.gradient})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "18px",
          boxShadow: `0 4px 16px ${feature.glow}`,
        }}
      >
        <Icon size={22} color="white" />
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: "var(--font-syne)",
          fontWeight: 700,
          fontSize: "1.05rem",
          color: "#F8FAFC",
          marginBottom: "10px",
          letterSpacing: "-0.01em",
        }}
      >
        {feature.title}
      </h3>

      {/* Description */}
      <p
        style={{
          color: "#94A3B8",
          fontSize: "0.88rem",
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        {feature.description}
      </p>
    </motion.div>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      style={{ padding: "100px 24px", position: "relative" }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "64px" }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 14px",
              borderRadius: "100px",
              background: "rgba(124,58,237,0.12)",
              border: "1px solid rgba(124,58,237,0.3)",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                color: "#A855F7",
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Features
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 800,
              fontSize: "clamp(2rem, 4vw, 2.8rem)",
              color: "#F8FAFC",
              letterSpacing: "-0.03em",
              marginBottom: "16px",
              lineHeight: 1.1,
            }}
          >
            Everything you need to{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              understand the web
            </span>
          </h2>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "1.05rem",
              maxWidth: "520px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            10 revolutionary features engineered for developers, designers,
            researchers, and anyone who learns visually.
          </p>
        </motion.div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
