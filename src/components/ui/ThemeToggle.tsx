import { useEffect, useState } from "react";
import { Button } from "./button";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("theme") ?? "dark";
    setDark(saved === "dark");
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle theme">
    {dark ? "🌙" : "☀️"}
  </Button>;
}
