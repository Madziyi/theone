import { cn } from "./cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md";
};

export function Button({ className, variant="default", size="md", ...props }: Props) {
  const base = "inline-flex items-center justify-center rounded-xl font-medium shadow-soft transition ease-out-custom";
  const sizes = { sm: "h-9 px-3 text-sm", md: "h-10 px-4 text-sm" }[size];
  const variants = {
    default: "bg-primary text-white hover:opacity-90",
    ghost: "hover:bg-white/5",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-border hover:bg-white/5"
  }[variant];
  return <button className={cn(base, sizes, variants, className)} {...props} />;
}
