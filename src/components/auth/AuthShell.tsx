import { ReactNode } from "react";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F7FBFF] px-5 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0284C7] text-2xl font-extrabold text-white shadow-lg shadow-sky-200">
          JF
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0F172A]">JEEFlow</h1>
        <p className="mt-1 text-sm text-[#64748B]">Plan Smart. Study Consistently.</p>
      </div>

      <div className="card w-full max-w-md p-6 sm:p-8">
        <h2 className="text-xl font-bold text-[#0F172A]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>

      {footer && <div className="mt-6 text-sm text-[#64748B]">{footer}</div>}
    </main>
  );
}
