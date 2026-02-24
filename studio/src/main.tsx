import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Auto-reload when the service worker updates so users always get the latest build
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
