import "server-only";
import { getDb } from "@/db/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import * as OTPAuth from "otpauth";

const COOKIE = "session";
const SESSION_DAYS = 30;
const ISSUER = "FinApp";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  personId: number | null;
  householdId: number | null;
  totpEnabled: boolean;
};

// ----------------------------- Contraseñas (argon2id) -----------------------------
export function hashPassword(pw: string): Promise<string> {
  return hash(pw); // @node-rs/argon2 usa argon2id por defecto
}
export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

// ----------------------------- Sesiones -----------------------------
export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = await getDb();
  await db.query(
    `INSERT INTO session (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expires.toISOString()],
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query(`DELETE FROM session WHERE token = $1`, [token]);
  }
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const r = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.email, u.name, u.person_id, u.household_id, u.totp_enabled
       FROM session s JOIN app_user u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  if (r.rows.length === 0) return null;
  const x = r.rows[0];

  // Sesión deslizante: si la sesión ya "envejeció" más de un día, renueva su
  // vencimiento a 30 días. Así, mientras se use la app, no caduca; si se
  // abandona, expira tras 30 días de inactividad. (Evita escribir en cada request.)
  await db.query(
    `UPDATE session SET expires_at = now() + interval '${SESSION_DAYS} days'
      WHERE token = $1 AND expires_at < now() + interval '${SESSION_DAYS - 1} days'`,
    [token],
  );
  return {
    id: Number(x.id),
    email: String(x.email),
    name: String(x.name),
    personId: x.person_id != null ? Number(x.person_id) : null,
    householdId: x.household_id != null ? Number(x.household_id) : null,
    totpEnabled: Boolean(x.totp_enabled),
  };
}

/** Exige sesión válida; si no, manda a /login. Devuelve el usuario. */
export async function requireUser(): Promise<AuthUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

/** Hogar (tenant) del usuario en sesión. Todas las consultas filtran por él. */
export async function getHouseholdId(): Promise<number> {
  const u = await requireUser();
  if (u.householdId == null) redirect("/login");
  return u.householdId!;
}

/** Genera un token de invitación (para el enlace /registro?invite=...). */
export function newInviteCode(): string {
  return randomBytes(9).toString("base64url"); // ~12 chars URL-safe
}

// ----------------------------- 2FA (TOTP) -----------------------------
function makeTotp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** URI otpauth:// para el código QR de Google Authenticator/Authy. */
export function totpUri(secretBase32: string, account: string): string {
  return makeTotp(secretBase32, account).toString();
}

/** Verifica un código de 6 dígitos (con ventana ±1 para tolerar desfase). */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return makeTotp(secretBase32, "x").validate({ token: clean, window: 1 }) !== null;
}
