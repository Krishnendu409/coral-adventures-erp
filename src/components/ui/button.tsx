import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-primary text-brand-primary-foreground hover:bg-gradient-to-r hover:from-orange-500 hover:to-maroon-700 hover:border-transparent transition-all shadow-xs",
  secondary:
    "bg-surface-raised text-foreground border border-border-default hover:bg-surface-sunken",
  outline:
    "bg-transparent text-foreground border border-border-default hover:bg-surface-sunken",
  ghost: "bg-transparent text-foreground hover:bg-surface-sunken",
  danger: "bg-danger text-neutral-0 hover:opacity-90 shadow-xs",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-4 text-sm gap-2 rounded-[var(--radius-md)]",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-[var(--radius-md)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

export function LinkButton({
  href,
  className,
  variant = "primary",
  size = "md",
  children,
}: {
  href: string;
  className?: string;
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </Link>
  );
}
