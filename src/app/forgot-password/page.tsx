"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setSent(true);
      setDevUrl(data.devResetUrl ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password?"
      subtitle="Enter your email and we'll help you reset it."
      footer={
        <Link href="/login" className="font-semibold text-[#0284C7]">
          Back to login
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-[#E0F2FE] px-3 py-2 text-sm text-[#0284C7]">
            If an account exists for that email, you can reset your password below.
          </p>
          {devUrl && (
            <Link href={devUrl} className="block w-full rounded-xl bg-[#0284C7] px-4 py-2.5 text-center text-sm font-semibold text-white">
              Continue to reset password
            </Link>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[#EF4444]">{error}</p>}
          <Button type="submit" fullWidth loading={loading}>
            Send Reset Link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
