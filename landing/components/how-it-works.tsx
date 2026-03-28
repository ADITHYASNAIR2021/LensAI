"use client";

import { motion } from "framer-motion";
import { Download, MousePointer2, Sparkles } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Download,
    title: "Install",
    description:
      "Add LensAI to Chrome in 30 seconds. No account required to start — just click Add to Chrome and you're ready.",
    detail: "One-click install from Chrome Web Store",
    illustration: <InstallIllustration />,
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "Select",
    description:
      "Press Ctrl+Shift+L. Draw a box around anything — code, diagrams, charts, screenshots, or text in any language.",
    detail: "Ctrl+Shift+L to activate selection mode",
    illustration: <SelectIllustration />,
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Understand",
    description:
      "Get instant expert analysis. Ask follow-up questions. Save insights to your personal knowledge graph.",
    detail: "Results in under 1.2 seconds on average",
    illustration: <UnderstandIllustration />,
  },
];

function InstallIllustration() {
  return (
    <div
      style={{
        width: "100%",
        height: "120px",
        borderRadius: "12px",
        background: "rgba(26, 34, 64, 0.6)",
        border: "1px solid #1E2D4A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Chrome icon simplified */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "rgba(124,58,237,0.2)",
          border: "2px solid rgba(124,58,237,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4" fill="#A855F7" />
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#7C3AED"
            strokeWidth="2"
            fill="none"
          />
          <line
            x1="12"
            y1="3"
            x2="12"
            y2="8"
            stroke="#06B6D4"
            strokeWidth="2"
          />
          <line
            x1="20.4"
            y1="16.5"
            x2="16.1"
            y2="14"
            stroke="#06B6D4"
            strokeWidth="2"
          />
          <line
            x1="3.6"
            y1="16.5"
            x2="7.9"
            y2="14"
            stroke="#06B6D4"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div
          style={{
            height: "10px",
            width: "120px",
            borderRadius: "5px",
            background: "rgba(248,250,252,0.1)",
          }}
        />
        <div
          style={{
            height: "28px",
            width: "120px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "white", fontSize: "0.7rem", fontWeight: 600 }}>
            Add to Chrome
          </span>
        </div>
      </div>
    </div>
  );
}

function SelectIllustration() {
  return (
    <div
      style={{
        width: "100%",
        height: "120px",
        borderRadius: "12px",
        background: "rgba(26, 34, 64, 0.6)",
        border: "1px solid #1E2D4A",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Fake code lines */}
      <div style={{ padding: "12px" }}>
        {[90, 130, 70, 110, 55].map((w, i) => (
          <div
            key={i}
            style={{
              height: "8px",
              width: `${w}px`,
              borderRadius: "4px",
              background: "rgba(148,163,184,0.12)",
              marginBottom: "6px",
              marginLeft: i === 1 || i === 3 ? "16px" : "0",
            }}
          />
        ))}
      </div>
      {/* Selection box */}
      <div
        style={{
          position: "absolute",
          top: "18px",
          left: "12px",
          width: "140px",
          height: "54px",
          border: "2px solid rgba(124,58,237,0.7)",
          borderRadius: "4px",
          background: "rgba(124,58,237,0.08)",
          boxShadow: "0 0 12px rgba(124,58,237,0.2)",
        }}
      >
        {/* Corner handles */}
        {[
          { top: -3, left: -3 },
          { top: -3, right: -3 },
          { bottom: -3, left: -3 },
          { bottom: -3, right: -3 },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: "6px",
              height: "6px",
              background: "#7C3AED",
              borderRadius: "1px",
              ...pos,
            }}
          />
        ))}
      </div>
      {/* Keyboard hint */}
      <div
        style={{
          position: "absolute",
          bottom: "8px",
          right: "10px",
          display: "flex",
          gap: "3px",
        }}
      >
        {["Ctrl", "Shift", "L"].map((k) => (
          <span
            key={k}
            style={{
              padding: "2px 5px",
              borderRadius: "4px",
              background: "rgba(30,45,74,0.8)",
              border: "1px solid #1E2D4A",
              color: "#94A3B8",
              fontSize: "0.6rem",
              fontFamily: "monospace",
            }}
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnderstandIllustration() {
  return (
    <div
      style={{
        width: "100%",
        height: "120px",
        borderRadius: "12px",
        background: "rgba(26, 34, 64, 0.6)",
        border: "1px solid #1E2D4A",
        padding: "12px",
        overflow: "hidden",
      }}
    >
      {/* Analysis result mockup */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "5px",
            background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
          }}
        />
        <div
          style={{
            height: "8px",
            width: "60px",
            borderRadius: "4px",
            background: "rgba(168,85,247,0.3)",
          }}
        />
        <div
          style={{
            marginLeft: "auto",
            height: "8px",
            width: "40px",
            borderRadius: "4px",
            background: "rgba(6,182,212,0.2)",
          }}
        />
      </div>
      {[100, 120, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: "7px",
            width: `${w}px`,
            borderRadius: "3px",
            background: "rgba(148,163,184,0.15)",
            marginBottom: "5px",
          }}
        />
      ))}
      <div
        style={{
          marginTop: "8px",
          display: "flex",
          gap: "6px",
        }}
      >
        <div
          style={{
            height: "22px",
            flex: 1,
            borderRadius: "6px",
            background: "rgba(26,34,64,0.8)",
            border: "1px solid #1E2D4A",
          }}
        />
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
          }}
        />
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "100px 24px",
        position: "relative",
        background:
          "linear-gradient(180deg, transparent 0%, rgba(15,22,41,0.3) 50%, transparent 100%)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "72px" }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 14px",
              borderRadius: "100px",
              background: "rgba(6,182,212,0.1)",
              border: "1px solid rgba(6,182,212,0.25)",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                color: "#06B6D4",
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              How it works
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 800,
              fontSize: "clamp(2rem, 4vw, 2.8rem)",
              color: "#F8FAFC",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: "16px",
            }}
          >
            Up and running in{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              30 seconds
            </span>
          </h2>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "1.05rem",
              maxWidth: "480px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            No sign-up. No configuration. No learning curve. Just install,
            select, and understand.
          </p>
        </motion.div>

        {/* Steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            position: "relative",
          }}
        >
          {/* Connecting line (decorative) */}
          <div
            className="hidden lg:block"
            style={{
              position: "absolute",
              top: "64px",
              left: "calc(33.33% + 0px)",
              right: "calc(33.33% + 0px)",
              height: "2px",
              background:
                "linear-gradient(90deg, transparent, rgba(124,58,237,0.4), rgba(6,182,212,0.4), transparent)",
              zIndex: 0,
            }}
          />

          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.15,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                style={{
                  position: "relative",
                  zIndex: 1,
                  padding: "32px",
                  borderRadius: "20px",
                  background: "rgba(15, 22, 41, 0.7)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid #1E2D4A",
                }}
              >
                {/* Step number + icon row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    marginBottom: "24px",
                  }}
                >
                  {/* Big number circle */}
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.1))",
                      border: "1px solid rgba(124,58,237,0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-syne)",
                        fontWeight: 800,
                        fontSize: "1.1rem",
                        background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {step.number}
                    </span>
                  </div>
                  <div>
                    <h3
                      style={{
                        fontFamily: "var(--font-syne)",
                        fontWeight: 700,
                        fontSize: "1.3rem",
                        color: "#F8FAFC",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {step.title}
                    </h3>
                    <p
                      style={{
                        color: "#94A3B8",
                        fontSize: "0.75rem",
                        marginTop: "2px",
                      }}
                    >
                      {step.detail}
                    </p>
                  </div>
                </div>

                {/* Illustration */}
                <div style={{ marginBottom: "20px" }}>{step.illustration}</div>

                {/* Description */}
                <p
                  style={{
                    color: "#94A3B8",
                    fontSize: "0.9rem",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
