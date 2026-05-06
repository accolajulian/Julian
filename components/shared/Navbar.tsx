"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "How It Works", href: "#how-it-works" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    if (href.startsWith("#")) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[#0f1117]/90 backdrop-blur-md border-b border-[#2a2d3e]"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Zap className="w-5 h-5 text-[#00ff88] group-hover:animate-pulse" fill="#00ff88" />
            <span className="font-bold text-white text-sm sm:text-base tracking-tight">
              JACBuilds <span className="text-[#00ff88]">AutoPilot</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="text-sm text-[#6b7280] hover:text-white transition-colors duration-200 cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="#"
              className="text-sm text-[#6b7280] hover:text-white transition-colors duration-200 px-4 py-2 rounded-lg border border-transparent hover:border-[#2a2d3e]"
            >
              Login
            </Link>
            <Link
              href="#"
              className="text-sm font-semibold bg-[#00ff88] text-[#0f1117] px-4 py-2 rounded-lg hover:bg-[#00ff88]/90 transition-colors duration-200"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-[#6b7280] hover:text-white transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down nav */}
      <div
        className={cn(
          "md:hidden overflow-hidden transition-all duration-300 bg-[#0f1117]/95 backdrop-blur-md border-b border-[#2a2d3e]",
          mobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-4 pt-2 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNavClick(link.href)}
              className="text-sm text-[#6b7280] hover:text-white transition-colors py-3 text-left border-b border-[#2a2d3e] last:border-0"
            >
              {link.label}
            </button>
          ))}
          <div className="flex flex-col gap-2 pt-3">
            <Link
              href="#"
              className="text-sm text-center text-white border border-[#2a2d3e] py-2.5 rounded-lg hover:border-[#00ff88]/40 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Login
            </Link>
            <Link
              href="#"
              className="text-sm font-semibold text-center bg-[#00ff88] text-[#0f1117] py-2.5 rounded-lg hover:bg-[#00ff88]/90 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
