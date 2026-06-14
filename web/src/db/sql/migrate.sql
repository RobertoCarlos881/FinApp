-- Migraciones IDEMPOTENTES (seguras de correr en cada arranque, en cualquier
-- base, sin borrar datos). Se ejecuta tanto en local (PGlite) como en Neon.

-- Autenticación
CREATE TABLE IF NOT EXISTS app_user (
  id            SERIAL PRIMARY KEY,
  household_id  INTEGER REFERENCES household(id),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  person_id     INTEGER REFERENCES person(id),
  totp_secret   TEXT,
  totp_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- #1 Sueldo: base del monto ('per_payment' = por pago, 'monthly' = total del mes).
ALTER TABLE income_source ADD COLUMN IF NOT EXISTS expected_basis TEXT NOT NULL DEFAULT 'per_payment';

-- #4 Tarjetas: quitar el requisito de nombre único por persona, para poder tener
-- varias tarjetas del mismo banco (Oro, Débito, etc.) diferenciadas por nombre+banco.
ALTER TABLE account DROP CONSTRAINT IF EXISTS account_household_id_person_id_name_key;

-- #6 Gastos recurrentes: monto base en fixed_expense + override por mes.
ALTER TABLE fixed_expense ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS fixed_expense_month (
  id               SERIAL PRIMARY KEY,
  fixed_expense_id INTEGER NOT NULL REFERENCES fixed_expense(id) ON DELETE CASCADE,
  period           DATE    NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  UNIQUE (fixed_expense_id, period)
);

-- #7 Tarjetas de crédito: historial de fecha de corte (cambia con el tiempo).
CREATE TABLE IF NOT EXISTS account_cutoff (
  id             SERIAL PRIMARY KEY,
  account_id     INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  effective_from DATE    NOT NULL,
  cutoff_day     SMALLINT NOT NULL CHECK (cutoff_day BETWEEN 1 AND 31),
  UNIQUE (account_id, effective_from)
);
