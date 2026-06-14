import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate de autenticación (en Next 16 el middleware se llama "proxy").
// Verificación rápida por presencia de cookie de sesión; la validación real
// (sesión vigente en BD) la hace requireUser() en cada página protegida.
const PUBLIC_EXACT = new Set([
  "/login",
  "/registro",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("session");

  if (!hasSession && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Aplica a todo excepto assets estáticos y el favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
