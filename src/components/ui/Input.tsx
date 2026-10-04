import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className = "", id, ...props }, ref) => {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[#0F172A]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] ${
          error ? "border-[#EF4444]" : "border-slate-200"
        } ${className}`}
        {...props}
      />
      {hint && !error && <p className="mt-1 text-xs text-[#64748B]">{hint}</p>}
      {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
    </div>
  );
});
Input.displayName = "Input";

export default Input;
