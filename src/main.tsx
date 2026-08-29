import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { router } from "./routes";
import "./index.css";

// autoUpdate mode reloads the page itself once a new build's worker takes
// control; our job is only to *check* often enough. The load-time check alone
// rarely fires on phones — iOS keeps the PWA alive for days — so also check
// whenever the app returns to the foreground (plus an hourly backstop).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (document.visibilityState === "visible") void registration.update();
    };
    document.addEventListener("visibilitychange", check);
    setInterval(check, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
