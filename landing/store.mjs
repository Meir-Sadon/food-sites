import pg from 'pg';

// Leads live in Postgres (Neon). Without LEAD_DATABASE_URL leads are only mailed and logged.
export function createStore(url) {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }, max: 3 });
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS leads (
        id serial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
        name text NOT NULL, phone text NOT NULL, business_name text, business_type text, website text,
        business_size text, notes text, variant text, source text, status text NOT NULL DEFAULT 'new')`);
    },
    async insert(l) {
      const r = await pool.query(
        `INSERT INTO leads (name, phone, business_name, business_type, website, business_size, notes, variant, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [l.name, l.phone, l.businessName, l.businessType, l.website, l.businessSize, l.notes, l.variant, l.source],
      );
      return r.rows[0].id;
    },
  };
}
