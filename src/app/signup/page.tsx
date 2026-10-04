"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import GoogleButton from "@/components/auth/GoogleButton";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Unable to create account.");
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Build a personalized JEE Main study plan in minutes."
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#0284C7]">
            Log in
          </Link>
        </span>
      }
    >
      <div className="space-y-4">
        <GoogleButton />
        <div className="flex items-center gap-3 text-xs text-[#94A3B8]">
          <div className="h-px flex-1 bg-slate-200" />
          OR
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun Sharma" />
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[#EF4444]">{error}</p>}

          <Button type="submit" fullWidth loading={loading}>
            Create Account
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
