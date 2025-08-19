export function cn(...args: Array<string | false | undefined>) {
  return args.filter(Boolean).join(" ");
}
