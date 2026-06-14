"use server";

import { getDb } from "@/db/client";
import { redirect } from "next/navigation";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getSessionUser,
  newTotpSecret,
  newInviteCode,
  verifyTotp,
} from "@/lib/auth";

/**
 * Registro. Dos caminos:
 *   - Con invitación (campo "invite"): el usuario se une a ESE hogar.
 *   - Sin invitación: crea un hogar NUEVO (aislado), opcionalmente para compartir.
 */
export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const invite = String(formData.get("invite") || "").trim();
  const householdName = String(formData.get("householdName") || "").trim();
  const mode = String(formData.get("mode") || "individual"); // 'individual' | 'shared'
  const splitMode = mode === "shared" ? "shared" : "individual";

  const back = (msg: string) =>
    redirect(
      "/registro?error=" + encodeURIComponent(msg) + (invite ? "&invite=" + encodeURIComponent(invite) : ""),
    );

  if (!name || !email || password.length < 8) {
    back("Completa los campos (contraseña de 8+ caracteres).");
  }

  const db = await getDb();
  const exists = await db.query("SELECT 1 FROM app_user WHERE email = $1", [email]);
  if (exists.rows.length > 0) back("Ya existe una cuenta con ese correo. Inicia sesión.");

  // Resolver el hogar destino.
  let householdId: number;
  let joined = false;
  if (invite) {
    const h = await db.query<{ id: number }>("SELECT id FROM household WHERE invite_code = $1", [invite]);
    if (h.rows.length === 0) back("La invitación no es válida o expiró.");
    householdId = h.rows[0].id;
    joined = true;
  } else {
    const hn = householdName || `Hogar de ${name}`;
    const h = await db.query<{ id: number }>(
      "INSERT INTO household (name, invite_code, split_mode) VALUES ($1, $2, $3) RETURNING id",
      [hn, newInviteCode(), splitMode],
    );
    householdId = h.rows[0].id;
  }

  // Crear la persona (miembro) con el nombre del registro.
  const p = await db.query<{ id: number }>(
    "INSERT INTO person (household_id, name) VALUES ($1, $2) RETURNING id",
    [householdId, name],
  );

  const passwordHash = await hashPassword(password);
  const ins = await db.query<{ id: number }>(
    `INSERT INTO app_user (household_id, email, name, password_hash, person_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [householdId, email, name, passwordHash, p.rows[0].id],
  );
  await createSession(ins.rows[0].id);

  // Hogar nuevo -> a /hogar (invitar + ajustes). Unido -> directo a 2FA.
  if (!joined) redirect("/hogar?nuevo=1");
  redirect("/2fa");
}

/** Login: contraseña y, si el usuario tiene 2FA activo, código de 6 dígitos. */
export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const code = String(formData.get("code") || "");

  const fail = (msg: string) =>
    redirect("/login?error=" + encodeURIComponent(msg) + (email ? "&email=" + encodeURIComponent(email) : ""));

  const db = await getDb();
  const r = await db.query<Record<string, unknown>>(
    "SELECT id, password_hash, totp_enabled, totp_secret FROM app_user WHERE email = $1",
    [email],
  );
  if (r.rows.length === 0) fail("Correo o contraseña incorrectos.");
  const u = r.rows[0];

  const okPw = await verifyPassword(String(u.password_hash), password);
  if (!okPw) fail("Correo o contraseña incorrectos.");

  if (u.totp_enabled) {
    if (!code) redirect("/login?need2fa=1&email=" + encodeURIComponent(email));
    if (!verifyTotp(String(u.totp_secret), code))
      redirect("/login?need2fa=1&email=" + encodeURIComponent(email) + "&error=" + encodeURIComponent("Código incorrecto."));
  }

  await createSession(Number(u.id));
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Genera y guarda el secreto TOTP (paso 1 de activar 2FA). */
export async function start2fa() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.query("UPDATE app_user SET totp_secret = $2 WHERE id = $1", [user!.id, newTotpSecret()]);
  redirect("/2fa");
}

/** Verifica el código y activa 2FA (paso 2). */
export async function enable2fa(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") || "");
  const db = await getDb();
  const r = await db.query<{ totp_secret: string | null }>(
    "SELECT totp_secret FROM app_user WHERE id = $1",
    [user!.id],
  );
  const secret = r.rows[0]?.totp_secret;
  if (!secret || !verifyTotp(secret, code)) {
    redirect("/2fa?error=" + encodeURIComponent("Código incorrecto, intenta de nuevo."));
  }
  await db.query("UPDATE app_user SET totp_enabled = TRUE WHERE id = $1", [user!.id]);
  redirect("/?ok=2fa");
}

/** Desactiva 2FA. */
export async function disable2fa() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.query(
    "UPDATE app_user SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1",
    [user!.id],
  );
  redirect("/2fa");
}
