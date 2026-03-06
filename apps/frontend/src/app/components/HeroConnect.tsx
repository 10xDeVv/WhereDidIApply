"use client";

import React from "react";
import { Mail } from "lucide-react";

const HeroConnect = React.memo(function HeroConnect({
  onConnect,
  error,
}: {
  onConnect: () => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center space-y-8">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center">
          <span className="text-lime-400 text-2xl font-bold">W</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-100">WhereDidIApply</h1>
      </div>

      {/* Tagline */}
      <p className="text-zinc-400 text-lg max-w-md">
        Scan your Gmail to automatically track every job application you&apos;ve sent.
        Your emails never leave your browser.
      </p>

      {/* Connect button */}
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-900 font-semibold px-6 py-3 text-base transition-colors shadow-lg shadow-lime-500/20"
      >
        <Mail className="h-5 w-5" />
        Connect Gmail
      </button>

      {/* Privacy note */}
      <p className="text-xs text-zinc-600 max-w-sm">
        We only request <span className="text-zinc-400">read-only</span> access.
        Emails are processed locally in your browser and sent to our parser — nothing is stored on any server.
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-400 max-w-md">
          {error}
        </div>
      )}
    </div>
  );
});

export default HeroConnect;
