import React, { createContext, useContext, useState } from "react";

export type UnitPreferences = {
  temperature: "°C" | "K" | "°F";
  pressure: "Pa" | "Psi" | "kPa";
  speed: "m/s" | "cm/s" | "knots" | "mph";
  distance: "m" | "ft";
  concentration: "g/L" | "μg/L";
};

type Ctx = {
  unitPreferences: UnitPreferences;
  updatePreference: <K extends keyof UnitPreferences>(key: K, value: UnitPreferences[K]) => void;
};

const Ctx = createContext<Ctx | undefined>(undefined);

export function UnitPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [unitPreferences, setUnitPreferences] = useState<UnitPreferences>({
    temperature: "°C",
    pressure: "kPa",
    speed: "knots",
    distance: "m",
    concentration: "μg/L",
  });

  const updatePreference: Ctx["updatePreference"] = (key, value) =>
    setUnitPreferences((p) => ({ ...p, [key]: value }));

  return <Ctx.Provider value={{ unitPreferences, updatePreference }}>{children}</Ctx.Provider>;
}

export function useUnitPreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUnitPreferences must be used within UnitPreferencesProvider");
  return ctx;
}
