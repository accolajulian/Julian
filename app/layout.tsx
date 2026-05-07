import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "react-hot-toast";
import "./globals.css";

// ─── Fonts ────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: "LeadMey | Your AI Sales Team",
    template: "%s | LeadMey",
  },
  description:
    "LeadMey is your AI-powered outbound sales engine. " +
    "Automatically call leads, qualify prospects, and book meetings — " +
    "24/7, without lifting a finger.",
  keywords: [
    "AI sales",
    "automated calling",
    "lead generation",
    "sales automation",
    "outbound calls",
    "AI SDR",
  ],
  authors: [{ name: "LeadMey" }],
  creator: "LeadMey",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "LeadMey | Your AI Sales Team",
    description:
      "Automate your outbound sales with AI-powered calling, qualification, and booking.",
    siteName: "LeadMey",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadMey | Your AI Sales Team",
    description:
      "Automate your outbound sales with AI-powered calling, qualification, and booking.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1117",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

// Detect whether Clerk keys are real (not placeholder REPLACE_ME values).
// Without real keys Clerk throws on initialization, which would break public
// pages for developers who haven't configured Clerk yet.
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const hasValidClerkKey =
  clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")
    ? !clerkKey.includes("REPLACE_ME")
    : false;

// Passthrough wrapper used when Clerk is not yet configured
function MaybeClerkProvider({ children }: { children: React.ReactNode }) {
  if (!hasValidClerkKey) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#00ff88",
          colorBackground: "#0f1117",
          colorInputBackground: "#1a1d2e",
          colorInputText: "#ffffff",
          colorText: "#ffffff",
          colorTextSecondary: "#6b7280",
          colorNeutral: "#2a2d3e",
          borderRadius: "0.5rem",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
        elements: {
          card: "bg-card border border-border shadow-2xl",
          headerTitle: "text-foreground font-bold",
          headerSubtitle: "text-muted",
          formButtonPrimary:
            "bg-accent hover:bg-accent/90 text-background font-semibold",
          formFieldInput:
            "bg-card border-border text-foreground placeholder:text-muted",
          footerActionLink: "text-accent hover:text-accent/80",
          identityPreviewText: "text-foreground",
          identityPreviewEditButton: "text-accent",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <MaybeClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} dark`}
        suppressHydrationWarning
      >
        <body className="min-h-screen bg-background text-foreground font-sans antialiased">
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "#1a1d2e",
                color: "#ffffff",
                border: "1px solid #2a2d3e",
                borderRadius: "0.5rem",
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                fontSize: "0.875rem",
              },
              success: {
                iconTheme: { primary: "#00ff88", secondary: "#1a1d2e" },
                style: {
                  background: "#1a1d2e",
                  color: "#ffffff",
                  border: "1px solid rgba(0, 255, 136, 0.3)",
                },
              },
              error: {
                iconTheme: { primary: "#ff4d4f", secondary: "#1a1d2e" },
                style: {
                  background: "#1a1d2e",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 77, 79, 0.3)",
                },
              },
            }}
          />
        </body>
      </html>
    </MaybeClerkProvider>
  );
}
