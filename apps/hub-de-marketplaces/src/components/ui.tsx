import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { LISTING_STATUS, ORDER_STATUS, labelOf, type Tone } from "@/lib/hub/labels";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonStyles = cva(
  "inline-flex h-11 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "border-fg bg-fg text-bg hover:bg-transparent hover:text-fg",
        ghost: "border-line bg-transparent text-fg hover:border-line-strong",
        quiet: "border-transparent bg-transparent text-muted hover:text-fg",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

export function Button({
  variant,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant }), className)} {...props} />;
}

export const fieldClass =
  "mt-2 h-11 w-full border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-muted";

export function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input className={fieldClass} value={value} type={type} onChange={(event) => onChange(event.target.value)} />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <textarea
        className="mt-2 min-h-28 w-full border border-line bg-bg px-3 py-3 text-sm text-fg outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

const toneClass: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  mute: "text-muted",
};

export function ToneText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("text-xs", toneClass[tone])}>{children}</span>;
}

export function Page({
  title,
  lede,
  actions,
  children,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-6 pb-24 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-fg">{title}</h1>
          {lede ? <p className="mt-2 max-w-xl text-sm text-muted">{lede}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-sans text-sm text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LoadingLine() {
  return <p className="text-sm text-muted">Lendo a operação…</p>;
}

export function ErrorLine({ message }: { message: string }) {
  return <p className="text-sm text-danger">{message}</p>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto border border-line">{children}</div>;
}

export const th = "whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-muted";
export const td = "whitespace-nowrap px-3 py-3 align-middle text-sm text-fg";

export function listingLabel(status: string) {
  return labelOf(LISTING_STATUS, status);
}

export function orderLabel(status: string) {
  return labelOf(ORDER_STATUS, status);
}
