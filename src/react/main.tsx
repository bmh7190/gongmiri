import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeI18n } from "./i18n";

const start = async () => {
  await initializeI18n();
  const root = document.getElementById("app");
  if (!root) throw new Error("App root was not found.");
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

void start();
