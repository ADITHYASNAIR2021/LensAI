"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What AI model powers LensAI?",
    answer:
      "NVIDIA NIM powers LensAI with 12 specialized models: Qwen3 Coder 480B for code analysis, DeepSeek V3.2 for deep reasoning, Llama 3.2 90B Vision for screenshots, Mistral Large 675B for maximum quality, and more. Task-routed with automatic fallback chains for 99.9% uptime.",
  },
  {
    question: "Does LensAI store my screenshots?",
    answer:
      "Never. Screenshots are processed entirely in-memory and discarded immediately after analysis. Zero retention policy. Your screen content never touches disk on our servers, and we're fully GDPR compliant.",
  },
  {
    question: "Does it work on all websites?",
    answer:
      "Yes — any page Chrome can render, including PDFs opened in Chrome, local files, and pages behind authentication. The only exceptions are the Chrome Web Store itself and a handful of other extension pages restricted by Chrome's security model.",
  },
  {
    question: "What are the keyboard shortcuts?",
    answer:
      "Ctrl+Shift+L activates selection mode for custom region analysis. Ctrl+Shift+C starts comparison mode to compare two regions side-by-side. Ctrl+Shift+F runs a full-page scan. All shortcuts are customizable in the extension settings.",
  },
  {
    question: "Is there an API?",
    answer:
      "Yes. Team plan includes full REST API access with OpenAPI docs at /api/v1/docs. Build integrations with your own tools, automate batch analysis, or embed LensAI's analysis capabilities in your own applications.",
  },
  {
    question: "How accurate is the content classification?",
    answer:
      "97.3% on our benchmark set of 10,000 screenshots across 9 content categories — code, diagrams, charts, text, UI elements, mathematical content, maps, tables, and mixed media. We continuously improve accuracy with each model update.",
  },
  {
    question: "Can I export my knowledge graph?",
    answer:
      "Absolutely — Markdown (compatible with any notes app), Notion-compatible JSON, Obsidian vault format with backlink support, and PDF with interactive graph visualization. Pro and Team plans include all export formats.",
  },
  {
    question: "Is my data private?",
    answer:
      "Fully. GDPR and CCPA compliant, zero training on your data, zero third-party sharing. All transmission is TLS 1.3 encrypted. Team plan includes a self-hosted backend option for maximum data sovereignty — your data never leaves your infrastructure.",
  },
];

export default function Faq() {
  return (
    <section id="faq" style={{ padding: "100px 24px", position: "relative" }}>
      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: "10%",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(6,182,212,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          transform: "translateY(-50%)",
        }}
      />

      <div
        style={{ maxWidth: "760px", margin: "0 auto", position: "relative" }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "56px" }}
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
              FAQ
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
            Frequently asked{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              questions
            </span>
          </h2>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "1.05rem",
              lineHeight: 1.6,
            }}
          >
            Everything you need to know about LensAI. Can&apos;t find the answer
            you&apos;re looking for?{" "}
            <a
              href="mailto:hello@lensai.dev"
              style={{ color: "#A855F7", textDecoration: "none" }}
            >
              Reach out to our team.
            </a>
          </p>
        </motion.div>

        {/* Accordion */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Accordion type="single" collapsible>
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            marginTop: "48px",
            padding: "32px",
            borderRadius: "20px",
            background: "rgba(15,22,41,0.6)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid #1E2D4A",
            textAlign: "center",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 700,
              fontSize: "1.3rem",
              color: "#F8FAFC",
              marginBottom: "10px",
              letterSpacing: "-0.02em",
            }}
          >
            Still have questions?
          </h3>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "0.9rem",
              marginBottom: "20px",
              lineHeight: 1.6,
            }}
          >
            Our team typically responds within 2 hours. We&apos;re also active
            in our Discord community.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href="mailto:hello@lensai.dev"
              style={{
                padding: "10px 24px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
                color: "white",
                fontWeight: 600,
                fontSize: "0.9rem",
                textDecoration: "none",
                boxShadow: "0 0 20px rgba(124,58,237,0.3)",
                transition: "opacity 0.2s",
              }}
            >
              Email Us
            </a>
            <a
              href="https://discord.gg/lensai"
              style={{
                padding: "10px 24px",
                borderRadius: "10px",
                background: "transparent",
                border: "1px solid #1E2D4A",
                color: "#F8FAFC",
                fontWeight: 600,
                fontSize: "0.9rem",
                textDecoration: "none",
                transition: "border-color 0.2s",
              }}
            >
              Join Discord
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
