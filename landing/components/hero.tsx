"use client";

import { motion } from "framer-motion";
import { Play, Chrome, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

function BrowserMockup() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "820px",
        margin: "0 auto",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid rgba(30,45,74,0.9)",
        boxShadow:
          "0 0 80px rgba(124,58,237,0.15), 0 40px 100px rgba(0,0,0,0.6)",
        background: "#0F1629",
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          height: "44px",
          background: "#111827",
          borderBottom: "1px solid #1E2D4A",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: "8px",
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: "6px" }}>
          {["#FF5F57", "#FFBD2E", "#27C840"].map((color, i) => (
            <div
              key={i}
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: color,
                opacity: 0.8,
              }}
            />
          ))}
        </div>
        {/* Address bar */}
        <div
          style={{
            flex: 1,
            maxWidth: "360px",
            margin: "0 auto",
            height: "26px",
            borderRadius: "6px",
            background: "#1A2240",
            border: "1px solid #1E2D4A",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#27C840",
              opacity: 0.7,
            }}
          />
          <span
            style={{
              color: "#94A3B8",
              fontSize: "0.7rem",
              fontFamily: "monospace",
            }}
          >
            github.com/vercel/next.js/blob/main/packages
          </span>
        </div>
      </div>

      {/* Content area */}
      <div style={{ display: "flex", height: "340px" }}>
        {/* Main page area */}
        <div
          style={{
            flex: 1,
            padding: "20px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Simulated code content */}
          <div
            style={{
              background: "#0D1117",
              borderRadius: "10px",
              padding: "16px",
              height: "100%",
              fontFamily: "monospace",
              fontSize: "0.72rem",
              lineHeight: "1.6",
              color: "#94A3B8",
              overflow: "hidden",
            }}
          >
            <div style={{ color: "#7C3AED", marginBottom: "4px" }}>
              // app/api/analyze/route.ts
            </div>
            <div>
              <span style={{ color: "#06B6D4" }}>import</span>
              <span style={{ color: "#F8FAFC" }}> {"{ NextRequest }"} </span>
              <span style={{ color: "#06B6D4" }}>from</span>
              <span style={{ color: "#A3E635" }}>
                {" "}
                &apos;next/server&apos;
              </span>
            </div>
            <div>
              <span style={{ color: "#06B6D4" }}>import</span>
              <span style={{ color: "#F8FAFC" }}> NvidiaClient </span>
              <span style={{ color: "#06B6D4" }}>from</span>
              <span style={{ color: "#A3E635" }}>
                {" "}
                &apos;@nvidia/nim-sdk&apos;
              </span>
            </div>
            <br />
            <div>
              <span style={{ color: "#06B6D4" }}>const</span>
              <span style={{ color: "#F8FAFC" }}> client = </span>
              <span style={{ color: "#A855F7" }}>new</span>
              <span style={{ color: "#F8FAFC" }}> NvidiaClient()</span>
            </div>
            <br />
            <div>
              <span style={{ color: "#06B6D4" }}>export async function</span>
              <span style={{ color: "#22D3EE" }}> POST</span>
              <span style={{ color: "#F8FAFC" }}>(req: </span>
              <span style={{ color: "#A855F7" }}>NextRequest</span>
              <span style={{ color: "#F8FAFC" }}>) {"{"}</span>
            </div>
            <div style={{ paddingLeft: "16px" }}>
              <span style={{ color: "#06B6D4" }}>const</span>
              <span style={{ color: "#F8FAFC" }}>
                {" "}
                {"{ image, mode }"} = await req.
              </span>
              <span style={{ color: "#22D3EE" }}>json</span>
              <span style={{ color: "#F8FAFC" }}>()</span>
            </div>
            <div style={{ paddingLeft: "16px" }}>
              <span style={{ color: "#7C3AED" }}>// O(n) complexity issue</span>
            </div>
            <div style={{ paddingLeft: "16px" }}>
              <span style={{ color: "#06B6D4" }}>const</span>
              <span style={{ color: "#F8FAFC" }}> stream = client.messages.</span>
              <span style={{ color: "#22D3EE" }}>stream</span>
              <span style={{ color: "#F8FAFC" }}>{"({"}</span>
            </div>
            <div style={{ paddingLeft: "32px" }}>
              <span style={{ color: "#94A3B8" }}>model: </span>
              <span style={{ color: "#A3E635" }}>
                &apos;claude-opus-4-5&apos;
              </span>
              <span style={{ color: "#F8FAFC" }}>,</span>
            </div>
            <div style={{ paddingLeft: "32px" }}>
              <span style={{ color: "#94A3B8" }}>max_tokens: </span>
              <span style={{ color: "#FB923C" }}>4096</span>
              <span style={{ color: "#F8FAFC" }}>,</span>
            </div>
            <div style={{ paddingLeft: "16px" }}>
              <span style={{ color: "#F8FAFC" }}>{"});"}</span>
            </div>
            <div>
              <span style={{ color: "#F8FAFC" }}>{"}"}</span>
            </div>
          </div>

          {/* Selection overlay effect */}
          <div
            style={{
              position: "absolute",
              top: "60px",
              left: "28px",
              right: "28px",
              height: "80px",
              border: "2px solid rgba(124,58,237,0.7)",
              borderRadius: "6px",
              background: "rgba(124,58,237,0.08)",
              boxShadow: "0 0 20px rgba(124,58,237,0.2)",
              pointerEvents: "none",
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
                  width: "8px",
                  height: "8px",
                  background: "#7C3AED",
                  borderRadius: "2px",
                  ...pos,
                }}
              />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div
          style={{
            width: "260px",
            borderLeft: "1px solid #1E2D4A",
            background: "#0F1629",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid #1E2D4A",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="4"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "var(--font-syne)",
                fontWeight: 700,
                fontSize: "0.8rem",
                color: "#F8FAFC",
              }}
            >
              LensAI
            </span>
            <div
              style={{
                marginLeft: "auto",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#27C840",
                boxShadow: "0 0 6px rgba(39,200,64,0.6)",
              }}
            />
          </div>

          {/* Analysis output */}
          <div
            style={{
              padding: "12px",
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {/* Mode badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "100px",
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.3)",
                fontSize: "0.65rem",
                color: "#A855F7",
                fontWeight: 600,
                width: "fit-content",
              }}
            >
              <span>⚡</span> Code Analysis
            </div>

            {/* Analysis text lines */}
            {[
              {
                color: "#F8FAFC",
                text: "Found 2 issues in selected code",
                bold: true,
              },
              { color: "#94A3B8", text: "", height: 4 },
              {
                color: "#FBBF24",
                text: "⚠ Performance Issue",
                bold: true,
                size: "0.7rem",
              },
              {
                color: "#94A3B8",
                text: "Line 8: Missing await on stream — this will cause unhandled rejection in edge runtime.",
                size: "0.65rem",
              },
              { color: "#94A3B8", text: "", height: 6 },
              {
                color: "#06B6D4",
                text: "✓ Suggested Fix",
                bold: true,
                size: "0.7rem",
              },
              {
                color: "#94A3B8",
                text: "Add error boundary + use ReadableStream for SSE. Complexity: O(1).",
                size: "0.65rem",
              },
              { color: "#94A3B8", text: "", height: 6 },
              {
                color: "#A855F7",
                text: "Confidence: 98.4%",
                size: "0.65rem",
                bold: true,
              },
            ].map((item, i) =>
              item.height ? (
                <div key={i} style={{ height: item.height }} />
              ) : (
                <p
                  key={i}
                  style={{
                    color: item.color,
                    fontSize: item.size || "0.72rem",
                    fontWeight: item.bold ? 600 : 400,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {item.text}
                </p>
              )
            )}

            {/* Follow up input */}
            <div
              style={{
                marginTop: "auto",
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(26,34,64,0.8)",
                border: "1px solid #1E2D4A",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  color: "#94A3B8",
                  fontSize: "0.65rem",
                  flex: 1,
                }}
              >
                Ask a follow-up...
              </span>
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "6px",
                  background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ArrowRight size={10} color="white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// All random values pre-seeded — no Math.random() at render time (prevents hydration mismatch)
const particles = [
  { x: "10%", y: "20%", size: 4, delay: 0,   color: "#7C3AED", duration: 4.2 },
  { x: "85%", y: "15%", size: 3, delay: 0.8, color: "#06B6D4", duration: 5.1 },
  { x: "75%", y: "70%", size: 5, delay: 1.5, color: "#7C3AED", duration: 6.0 },
  { x: "20%", y: "75%", size: 3, delay: 2.1, color: "#06B6D4", duration: 4.7 },
  { x: "50%", y: "8%",  size: 4, delay: 0.4, color: "#7C3AED", duration: 5.5 },
  { x: "92%", y: "50%", size: 6, delay: 1.0, color: "#06B6D4", duration: 4.9 },
  { x: "5%",  y: "50%", size: 3, delay: 1.8, color: "#7C3AED", duration: 6.3 },
  { x: "60%", y: "85%", size: 4, delay: 0.6, color: "#06B6D4", duration: 5.2 },
];

function FloatingParticle({
  x, y, size, delay, color, duration,
}: {
  x: string; y: string; size: number; delay: number; color: string; duration: number;
}) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity: 0.15,
        filter: "blur(1px)",
      }}
      animate={{ y: [0, -20, 0], opacity: [0.1, 0.25, 0.1] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export default function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "100px 24px 80px",
        overflow: "hidden",
      }}
    >
      {/* Grid background */}
      <div
        className="grid-bg radial-fade"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />

      {/* Gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "20%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "15%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "900px",
          width: "100%",
          textAlign: "center",
          margin: "0 auto",
        }}
      >
        {/* Announcement badge */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "100px",
            background: "rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.3)",
            marginBottom: "28px",
          }}
        >
          <span style={{ fontSize: "0.7rem" }}>⚡</span>
          <span
            style={{
              color: "#A855F7",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            Now powered by NVIDIA NIM — 12 specialized AI models
          </span>
          <ArrowRight size={12} style={{ color: "#A855F7" }} />
        </motion.div>

        {/* Headline */}
        <motion.h1
          custom={0.1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-syne)",
            fontWeight: 800,
            fontSize: "clamp(2.8rem, 7vw, 5rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            marginBottom: "24px",
            color: "#F8FAFC",
          }}
        >
          See the Web.
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #A855F7 0%, #06B6D4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Understand Everything.
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          custom={0.2}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            color: "#94A3B8",
            fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
            lineHeight: 1.65,
            maxWidth: "580px",
            margin: "0 auto 36px",
          }}
        >
          LensAI is the AI layer for your eyes. Select any region on screen
          and get instant expert analysis — code review, translation, diagram
          breakdown, and more. Powered by NVIDIA NIM.
        </motion.p>

        {/* CTAs */}
        <motion.div
          custom={0.3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "28px",
          }}
        >
          <Button size="lg" style={{ gap: "8px" }}>
            <Chrome size={18} />
            Add to Chrome — Free
          </Button>
          <Button
            variant="outline"
            size="lg"
            style={{
              borderColor: "rgba(30,45,74,0.9)",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "rgba(124,58,237,0.2)",
                border: "1px solid rgba(124,58,237,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Play size={10} fill="currentColor" style={{ color: "#A855F7" }} />
            </div>
            Watch 60s Demo
          </Button>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          custom={0.4}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
            flexWrap: "wrap",
            marginBottom: "64px",
          }}
        >
          {[
            "Free to start",
            "No account required",
            "12,400+ users",
          ].map((badge) => (
            <span
              key={badge}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#94A3B8",
                fontSize: "0.82rem",
              }}
            >
              <span
                style={{
                  color: "#06B6D4",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                }}
              >
                ✓
              </span>
              {badge}
            </span>
          ))}
        </motion.div>

        {/* Browser mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.9,
            delay: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <BrowserMockup />
        </motion.div>
      </div>
    </section>
  );
}
