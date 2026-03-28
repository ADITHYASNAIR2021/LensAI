"use client";

import { useState, useEffect } from "react";
import { Eye, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Docs", href: "https://docs.lensai.dev" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transition: "all 0.3s ease",
          background: scrolled
            ? "rgba(8, 11, 20, 0.85)"
            : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
          borderBottom: scrolled
            ? "1px solid rgba(30, 45, 74, 0.6)"
            : "1px solid transparent",
        }}
      >
        <nav
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
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
                boxShadow: "0 0 16px rgba(124,58,237,0.4)",
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

          {/* Desktop nav links */}
          <div
            className="hidden md:flex"
            style={{ alignItems: "center", gap: "2px" }}
          >
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  color: "#94A3B8",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  transition: "color 0.2s ease, background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "#F8FAFC";
                  (e.target as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "#94A3B8";
                  (e.target as HTMLAnchorElement).style.background =
                    "transparent";
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div
            className="hidden md:flex"
            style={{ alignItems: "center", gap: "12px" }}
          >
            <Button size="md">Add to Chrome — It&apos;s Free</Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="flex md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "8px",
            }}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              top: "64px",
              left: 0,
              right: 0,
              zIndex: 49,
              background: "rgba(8, 11, 20, 0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderBottom: "1px solid #1E2D4A",
              padding: "16px 24px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                marginBottom: "20px",
              }}
            >
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    color: "#94A3B8",
                    textDecoration: "none",
                    fontSize: "1rem",
                    fontWeight: 500,
                    padding: "12px 16px",
                    borderRadius: "10px",
                    transition: "all 0.2s ease",
                    display: "block",
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <Button size="lg" style={{ width: "100%" }}>
              Add to Chrome — It&apos;s Free
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
