import { SignIn } from "@clerk/nextjs";
import { Zap } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00ff88]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center mb-4">
            <Zap className="w-7 h-7 text-[#00ff88]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">JACBuilds AutoPilot</h1>
          <p className="text-sm text-[#6b7280] mt-1.5 text-center">
            Your AI sales team, running 24/7.
          </p>
        </div>

        {/* Clerk SignIn */}
        <SignIn
          appearance={{
            variables: {
              colorBackground: "#1a1d2e",
              colorInputBackground: "#0f1117",
              colorInputText: "#ffffff",
              colorText: "#ffffff",
              colorTextSecondary: "#6b7280",
              colorPrimary: "#00ff88",
              colorDanger: "#ef4444",
              borderRadius: "0.75rem",
              fontFamily: "inherit",
            },
            elements: {
              card: {
                backgroundColor: "#1a1d2e",
                border: "1px solid #2a2d3e",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                borderRadius: "1rem",
              },
              headerTitle: { color: "#ffffff", fontWeight: "800" },
              headerSubtitle: { color: "#6b7280" },
              formButtonPrimary: {
                backgroundColor: "#00ff88",
                color: "#0f1117",
                fontWeight: "700",
                "&:hover": { backgroundColor: "#00cc70" },
              },
              formFieldInput: {
                backgroundColor: "#0f1117",
                border: "1px solid #2a2d3e",
                color: "#ffffff",
                "&:focus": { borderColor: "rgba(0,255,136,0.5)" },
              },
              formFieldLabel: { color: "#6b7280" },
              identityPreviewText: { color: "#ffffff" },
              identityPreviewEditButtonIcon: { color: "#00ff88" },
              footerActionLink: { color: "#00ff88" },
              dividerLine: { backgroundColor: "#2a2d3e" },
              dividerText: { color: "#6b7280" },
              socialButtonsBlockButton: {
                backgroundColor: "#0f1117",
                border: "1px solid #2a2d3e",
                color: "#ffffff",
                "&:hover": { borderColor: "#6b7280" },
              },
              socialButtonsBlockButtonText: { color: "#ffffff" },
            },
          }}
          fallbackRedirectUrl="/dashboard"
          signUpUrl="/signup"
        />

        {/* Tagline */}
        <p className="text-xs text-[#6b7280] mt-6 text-center">
          Trusted by 500+ service businesses to fill their calendars on autopilot.
        </p>
      </div>
    </div>
  );
}
