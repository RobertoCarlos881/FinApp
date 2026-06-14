"use client";

import { useEffect } from "react";

// Registra el service worker en el cliente (habilita la PWA / instalación).
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
