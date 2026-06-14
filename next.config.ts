import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae WASM y un bundle de FS; debe quedar fuera del empaquetado del
  // servidor para que se cargue como módulo nativo de Node.
  serverExternalPackages: ["@electric-sql/pglite", "@node-rs/argon2"],
};

export default nextConfig;
