import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const result = await pool.query("select count(*) from bill_financials");
  console.log("Rows in bill_financials:", result.rows[0].count);
} catch (err) {
  console.error("Connection failed:", err.message);
} finally {
  await pool.end();
}