// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamProvider } from "./contexts/TeamContext";
import { UnitPreferencesProvider } from "@/contexts/UnitPreferencesContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <TeamProvider>
        <BrowserRouter>
          <UnitPreferencesProvider>
            <App />
          </UnitPreferencesProvider>
        </BrowserRouter>
      </TeamProvider>
    </AuthProvider>
  </React.StrictMode>
);