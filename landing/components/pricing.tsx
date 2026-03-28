"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const plans = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Everything you need to get started",
    features: [
      "5 scans per day",
      "2 follow-up questions",
      "7-day history",
      "Basic analysis modes",
      "Chrome extension",
    ],
    cta: "Get Started Free",
    ctaVariant: "outline" as const,
    featured: false,
    borderColor: "#1E2D4A",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 12,
    annualPrice: 9,
    annualTotal: 108,
    description: "For power users who need unlimited access",
    features: [
      "Unlimited scans",
      "10 follow-up questions",
      "30-day history",
      "Knowledge Graph",
      "Export (Markdown, JSON, PDF)",
      "Learning Paths",
      "AR Translation Overlay",
      "All analysis modes",
      "Priority processing",
    ],
    cta: "Start Free Trial",
    ctaVariant: "default" as const,
    featured: true,
    badge: "Most Popular",
    borderColor: "#7C3AED",
  },
  {
    id: "team",
    name: "Team",
    monthlyPrice: 49,
    annualPrice: 49,
    seats: 5,
    description: "For teams that learn and build together",
    features: [
      "Everything in Pro",
      "Shared knowledge graphs",
      "Admin dashboard",
      "Priority support (< 4h response)",
      "SSO / SAML",
      "REST API access",
      "5 seats included",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
    featured: false,
    borderColor: "#1E2D4A",
  },
];

function PricingCard({
  plan,
  isAnnual,
  index,
}: {
  plan: (typeof plans)[0];
  isAnnual: boolean;
  index: number;
}) {
  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
  const isFeatured = plan.featured;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.6,
        delay: index * 0.12,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      style={{
        position: "relative",
        borderRadius: "24px",
        padding: "2px",
        background: isFeatured
          ? "linear-gradient(135deg, #7C3AED, #06B6D4)"
          : "transparent",
        border: isFeatured ? "none" : `1px solid ${plan.borderColor}`,
        transform: isFeatured ? "scale(1.03)" : "scale(1)",
        zIndex: isFeatured ? 2 : 1,
        boxShadow: isFeatured ? "0 0 60px rgba(124,58,237,0.25)" : "none",
      }}
    >
      <div
        style={{
          borderRadius: "22px",
          padding: "32px",
          background: isFeatured ? "#0F1629" : "rgba(15,22,41,0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "0",
        }}
      >
        {/* Badge */}
        {plan.badge && (
          <div style={{ marginBottom: "16px" }}>
            <Badge
              style={{
                background: "rgba(124,58,237,0.2)",
                border: "1px solid rgba(124,58,237,0.4)",
                color: "#A855F7",
              }}
            >
              {plan.badge}
            </Badge>
          </div>
        )}

        {/* Plan name */}
        <div style={{ marginBottom: "8px" }}>
          <h3
            style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 700,
              fontSize: "1.2rem",
              color: "#F8FAFC",
              letterSpacing: "-0.02em",
            }}
          >
            {plan.name}
          </h3>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "0.85rem",
              marginTop: "4px",
            }}
          >
            {plan.description}
          </p>
        </div>

        {/* Price */}
        <div
          style={{
            margin: "24px 0",
            paddingBottom: "24px",
            borderBottom: "1px solid rgba(30,45,74,0.7)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "4px",
              lineHeight: 1,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-syne)",
                fontWeight: 800,
                fontSize: "2.8rem",
                color: "#F8FAFC",
                letterSpacing: "-0.04em",
              }}
            >
              {price === 0 ? "Free" : `$${price}`}
            </span>
            {price > 0 && (
              <span
                style={{
                  color: "#94A3B8",
                  fontSize: "0.9rem",
                  paddingBottom: "6px",
                }}
              >
                /mo
                {plan.seats ? ` · ${plan.seats} seats` : ""}
              </span>
            )}
          </div>

          {/* Annual billing note */}
          {isAnnual && plan.annualTotal && (
            <p
              style={{
                color: "#94A3B8",
                fontSize: "0.78rem",
                marginTop: "6px",
              }}
            >
              Billed ${plan.annualTotal}/year — save $
              {(plan.monthlyPrice - plan.annualPrice) * 12}/year
            </p>
          )}
          {!isAnnual && plan.annualPrice > 0 && (
            <p
              style={{
                color: "#06B6D4",
                fontSize: "0.78rem",
                marginTop: "6px",
              }}
            >
              Save ${(plan.monthlyPrice - plan.annualPrice) * 12}/year with
              annual billing
            </p>
          )}
        </div>

        {/* Features */}
        <ul
          style={{
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginBottom: "32px",
            flex: 1,
          }}
        >
          {plan.features.map((feature) => (
            <li
              key={feature}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: isFeatured
                    ? "rgba(124,58,237,0.2)"
                    : "rgba(6,182,212,0.1)",
                  border: isFeatured
                    ? "1px solid rgba(124,58,237,0.4)"
                    : "1px solid rgba(6,182,212,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                <Check
                  size={10}
                  style={{ color: isFeatured ? "#A855F7" : "#06B6D4" }}
                  strokeWidth={3}
                />
              </div>
              <span
                style={{ color: "#94A3B8", fontSize: "0.88rem", lineHeight: 1.5 }}
              >
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        {isFeatured ? (
          <button
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
              border: "none",
              color: "white",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "opacity 0.2s, transform 0.1s",
              boxShadow: "0 0 24px rgba(124,58,237,0.4)",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.opacity = "1";
            }}
          >
            {plan.cta}
          </button>
        ) : (
          <button
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              background: "transparent",
              border: "1px solid #1E2D4A",
              color: "#F8FAFC",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              const el = e.target as HTMLButtonElement;
              el.style.background = "rgba(255,255,255,0.04)";
              el.style.borderColor = "rgba(124,58,237,0.4)";
            }}
            onMouseLeave={(e) => {
              const el = e.target as HTMLButtonElement;
              el.style.background = "transparent";
              el.style.borderColor = "#1E2D4A";
            }}
          >
            {plan.cta}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" style={{ padding: "100px 24px", position: "relative" }}>
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "700px",
          height: "400px",
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(124,58,237,0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: "1100px", margin: "0 auto", position: "relative" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: "52px" }}
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
              Pricing
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
            Simple, transparent{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #A855F7, #06B6D4)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              pricing
            </span>
          </h2>
          <p
            style={{
              color: "#94A3B8",
              fontSize: "1.05rem",
              maxWidth: "440px",
              margin: "0 auto 36px",
              lineHeight: 1.6,
            }}
          >
            Start free forever. Upgrade when you need more power.
          </p>

          {/* Billing toggle */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              padding: "4px",
              borderRadius: "100px",
              background: "rgba(15,22,41,0.8)",
              border: "1px solid #1E2D4A",
            }}
          >
            <button
              onClick={() => setIsAnnual(false)}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                transition: "all 0.2s ease",
                background: !isAnnual ? "rgba(124,58,237,0.3)" : "transparent",
                color: !isAnnual ? "#F8FAFC" : "#94A3B8",
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: isAnnual ? "rgba(124,58,237,0.3)" : "transparent",
                color: isAnnual ? "#F8FAFC" : "#94A3B8",
              }}
            >
              Annual
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: "100px",
                  background: "rgba(6,182,212,0.15)",
                  border: "1px solid rgba(6,182,212,0.3)",
                  color: "#06B6D4",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                }}
              >
                Save 25%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            alignItems: "center",
          }}
        >
          {plans.map((plan, index) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              isAnnual={isAnnual}
              index={index}
            />
          ))}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            textAlign: "center",
            color: "#94A3B8",
            fontSize: "0.875rem",
            marginTop: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: "rgba(6,182,212,0.15)",
              border: "1px solid rgba(6,182,212,0.3)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={10} style={{ color: "#06B6D4" }} strokeWidth={3} />
          </span>
          14-day free trial on Pro. No credit card required.
        </motion.p>
      </div>
    </section>
  );
}
