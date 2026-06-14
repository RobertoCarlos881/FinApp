-- =============================================================================
--  FinApp — Esquema de base de datos (PostgreSQL / PGlite)
--
--  MULTI-HOGAR: cada "household" (hogar) es un espacio aislado. TODOS los datos
--  llevan household_id y las consultas filtran por el hogar del usuario en sesión.
--  Quien se registra sin invitación crea un hogar nuevo y no ve datos de otros.
--
--  Convención: identificadores en inglés, comentarios en español.
--  "period" = primer día del mes (DATE). Montos NUMERIC(12,2) en MXN.
--  La base arranca VACÍA: no se siembra ningún dato.
-- =============================================================================

DROP TABLE IF EXISTS scheduled_payment      CASCADE;
DROP TABLE IF EXISTS debt                   CASCADE;
DROP TABLE IF EXISTS settlement             CASCADE;
DROP TABLE IF EXISTS transaction_split      CASCADE;
DROP TABLE IF EXISTS transaction            CASCADE;
DROP TABLE IF EXISTS budget                 CASCADE;
DROP TABLE IF EXISTS installment_plan       CASCADE;
DROP TABLE IF EXISTS fixed_expense_version  CASCADE;
DROP TABLE IF EXISTS fixed_expense          CASCADE;
DROP TABLE IF EXISTS category_split_default CASCADE;
DROP TABLE IF EXISTS category               CASCADE;
DROP TABLE IF EXISTS income                 CASCADE;
DROP TABLE IF EXISTS income_source          CASCADE;
DROP TABLE IF EXISTS account                CASCADE;
DROP TABLE IF EXISTS person                 CASCADE;
DROP TABLE IF EXISTS household              CASCADE;


-- =============================================================================
-- 0. HOGAR (tenant). El espacio aislado al que pertenecen usuarios y datos.
--    invite_code: token para el enlace de invitación (/registro?invite=...).
-- =============================================================================
CREATE TABLE household (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    invite_code   TEXT UNIQUE,
    -- Manejo de gastos del hogar:
    --   'individual' -> cada gasto es de UNA persona (no se divide).
    --   'shared'     -> se puede dividir entre miembros.
    split_mode    TEXT NOT NULL DEFAULT 'individual'
                       CHECK (split_mode IN ('individual','shared')),
    -- Reparto por defecto al dividir (modo 'shared'):
    --   'equal'   -> partes iguales.
    --   'percent' -> según person.default_pct.
    default_split TEXT NOT NULL DEFAULT 'equal'
                       CHECK (default_split IN ('equal','percent')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- 1. PERSONAS (miembros del hogar). Un hogar puede tener varias.
-- =============================================================================
CREATE TABLE person (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES household(id),
    name         TEXT    NOT NULL,
    color        TEXT,
    default_pct  NUMERIC(5,2),  -- % por defecto al dividir por porcentajes
    active       BOOLEAN NOT NULL DEFAULT TRUE
);


-- =============================================================================
-- 2. CUENTAS Y TARJETAS  ("¿con qué se pagó?")
-- =============================================================================
CREATE TABLE account (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER  NOT NULL REFERENCES household(id),
    person_id    INTEGER  NOT NULL REFERENCES person(id),
    name         TEXT     NOT NULL,
    bank         TEXT,
    kind         TEXT     NOT NULL DEFAULT 'credit_card'
                          CHECK (kind IN ('credit_card','debit','cash')),
    cutoff_day   SMALLINT CHECK (cutoff_day BETWEEN 1 AND 31),
    due_day      SMALLINT CHECK (due_day BETWEEN 1 AND 31),
    active       BOOLEAN  NOT NULL DEFAULT TRUE
    -- Sin nombre único: se permiten varias tarjetas (Oro, Débito…) diferenciadas
    -- por nombre + banco.
);


-- =============================================================================
-- 3. FUENTES DE INGRESO (los "trabajos")
-- =============================================================================
CREATE TABLE income_source (
    id              SERIAL PRIMARY KEY,
    household_id    INTEGER NOT NULL REFERENCES household(id),
    person_id       INTEGER NOT NULL REFERENCES person(id),
    name            TEXT    NOT NULL,
    -- Frecuencia de pago: 'weekly' (semanal), 'biweekly' (quincenal), 'monthly'.
    frequency       TEXT    NOT NULL DEFAULT 'biweekly'
                            CHECK (frequency IN ('weekly','biweekly','monthly')),
    -- Base del monto: 'per_payment' (por pago) o 'monthly' (total del mes).
    expected_basis  TEXT    NOT NULL DEFAULT 'per_payment'
                            CHECK (expected_basis IN ('per_payment','monthly')),
    expected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (household_id, person_id, name)
);


-- =============================================================================
-- 4. INGRESO REAL POR PAGO DEL MES
--    "slot" = índice del pago dentro del mes según la frecuencia del trabajo:
--      mensual  -> 1 pago (slot 1)
--      quincenal-> 2 pagos (slots 1 y 2)
--      semanal  -> 1 pago por semana del mes (slots 1..N)
-- =============================================================================
CREATE TABLE income (
    id               SERIAL PRIMARY KEY,
    household_id     INTEGER  NOT NULL REFERENCES household(id),
    income_source_id INTEGER  NOT NULL REFERENCES income_source(id),
    period           DATE     NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
    slot             SMALLINT NOT NULL DEFAULT 1 CHECK (slot >= 1),
    amount           NUMERIC(12,2) NOT NULL,
    received_date    DATE,
    note             TEXT,
    CONSTRAINT income_uq UNIQUE (income_source_id, period, slot)
);


-- =============================================================================
-- 5. CATEGORÍAS (editables)
--    budget_mode: 'cap' (tope que se descuenta), 'planned', 'tracking'.
-- =============================================================================
CREATE TABLE category (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES household(id),
    name         TEXT    NOT NULL,
    budget_mode  TEXT    NOT NULL DEFAULT 'tracking'
                         CHECK (budget_mode IN ('cap','planned','tracking')),
    color        TEXT,
    icon         TEXT,
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    active       BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (household_id, name)
);


-- =============================================================================
-- 5b. REPARTO POR DEFECTO POR CATEGORÍA (versionado, opcional)
-- =============================================================================
CREATE TABLE category_split_default (
    id             SERIAL PRIMARY KEY,
    household_id   INTEGER NOT NULL REFERENCES household(id),
    category_id    INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    person_id      INTEGER NOT NULL REFERENCES person(id),
    pct            NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
    effective_from DATE NOT NULL CHECK (EXTRACT(DAY FROM effective_from) = 1),
    UNIQUE (category_id, person_id, effective_from)
);


-- =============================================================================
-- 6. GASTOS FIJOS RECURRENTES (plantillas) + historial de monto
-- =============================================================================
CREATE TABLE fixed_expense (
    id                 SERIAL PRIMARY KEY,
    household_id       INTEGER NOT NULL REFERENCES household(id),
    category_id        INTEGER NOT NULL REFERENCES category(id),
    name               TEXT    NOT NULL,
    default_account_id INTEGER REFERENCES account(id),
    default_owner_id   INTEGER REFERENCES person(id),
    default_split_pct  NUMERIC(5,2),
    start_period       DATE    NOT NULL CHECK (EXTRACT(DAY FROM start_period) = 1),
    end_period         DATE    CHECK (end_period IS NULL OR EXTRACT(DAY FROM end_period) = 1),
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    note               TEXT
);

CREATE TABLE fixed_expense_version (
    id               SERIAL PRIMARY KEY,
    fixed_expense_id INTEGER NOT NULL REFERENCES fixed_expense(id) ON DELETE CASCADE,
    effective_from   DATE    NOT NULL CHECK (EXTRACT(DAY FROM effective_from) = 1),
    amount           NUMERIC(12,2) NOT NULL,
    UNIQUE (fixed_expense_id, effective_from)
);


-- =============================================================================
-- 7. MESES SIN INTERESES (planes a plazos con "cuándo termina")
-- =============================================================================
CREATE TABLE installment_plan (
    id                SERIAL PRIMARY KEY,
    household_id      INTEGER NOT NULL REFERENCES household(id),
    category_id       INTEGER REFERENCES category(id),
    name              TEXT    NOT NULL,
    account_id        INTEGER REFERENCES account(id),
    owner_id          INTEGER REFERENCES person(id),
    split_pct         NUMERIC(5,2),
    purchase_date     DATE,
    total_amount      NUMERIC(12,2),
    monthly_amount    NUMERIC(12,2) NOT NULL,
    first_period      DATE    NOT NULL CHECK (EXTRACT(DAY FROM first_period) = 1),
    end_period        DATE    NOT NULL CHECK (EXTRACT(DAY FROM end_period) = 1),
    note              TEXT,
    CHECK (end_period >= first_period)
);


-- =============================================================================
-- 8. PRESUPUESTO MENSUAL POR CATEGORÍA
-- =============================================================================
CREATE TABLE budget (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES household(id),
    category_id  INTEGER NOT NULL REFERENCES category(id),
    period       DATE    NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
    amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    note         TEXT,
    UNIQUE (category_id, period)
);


-- =============================================================================
-- 9. MOVIMIENTOS / GASTOS
-- =============================================================================
CREATE TABLE transaction (
    id                      SERIAL PRIMARY KEY,
    household_id            INTEGER NOT NULL REFERENCES household(id),
    date                    DATE    NOT NULL,
    period                  DATE    NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
    category_id             INTEGER NOT NULL REFERENCES category(id),
    account_id              INTEGER REFERENCES account(id),
    amount                  NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    description             TEXT,
    source_fixed_expense_id INTEGER REFERENCES fixed_expense(id),
    source_installment_id   INTEGER REFERENCES installment_plan(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transaction_household ON transaction(household_id, period);
CREATE INDEX idx_transaction_category  ON transaction(category_id, period);


-- =============================================================================
-- 10. DIVISIÓN DE RESPONSABILIDAD ("¿a quién le toca?")
--     La suma de los splits = transaction.amount. Aislado vía la transacción.
-- =============================================================================
CREATE TABLE transaction_split (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transaction(id) ON DELETE CASCADE,
    person_id      INTEGER NOT NULL REFERENCES person(id),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    UNIQUE (transaction_id, person_id)
);
CREATE INDEX idx_split_person ON transaction_split(person_id);


-- =============================================================================
-- 11. AJUSTES / LIQUIDACIONES ENTRE PERSONAS
-- =============================================================================
CREATE TABLE settlement (
    id             SERIAL PRIMARY KEY,
    household_id   INTEGER NOT NULL REFERENCES household(id),
    period         DATE    CHECK (period IS NULL OR EXTRACT(DAY FROM period) = 1),
    from_person_id INTEGER NOT NULL REFERENCES person(id),
    to_person_id   INTEGER NOT NULL REFERENCES person(id),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    settled        BOOLEAN NOT NULL DEFAULT FALSE,
    settled_date   DATE,
    note           TEXT,
    CHECK (from_person_id <> to_person_id)
);


-- =============================================================================
-- 12. DEUDAS Y DINERO POR RECUPERAR
-- =============================================================================
CREATE TABLE debt (
    id            SERIAL PRIMARY KEY,
    household_id  INTEGER NOT NULL REFERENCES household(id),
    person_id     INTEGER NOT NULL REFERENCES person(id),
    direction     TEXT    NOT NULL CHECK (direction IN ('payable','receivable')),
    counterparty  TEXT    NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    paid_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- 13. PAGOS PROGRAMADOS (SAT y obligaciones con vencimiento)
-- =============================================================================
CREATE TABLE scheduled_payment (
    id           SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES household(id),
    person_id    INTEGER REFERENCES person(id),
    concept      TEXT    NOT NULL,
    amount       NUMERIC(12,2) NOT NULL,
    due_date     DATE,
    paid         BOOLEAN NOT NULL DEFAULT FALSE,
    paid_date    DATE,
    note         TEXT
);
