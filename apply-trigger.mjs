import pg from 'pg';
import fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL environment variable.");
    process.exit(1);
  }

  try {
    await client.connect();
    console.log("Connected to Supabase DB via IPv4 Pooler successfully!");

    // Apply the Student Trigger logic
    const triggerSql = fs.readFileSync('supabase/default_student_trigger.sql', 'utf8');
    console.log("Applying Student Role Triggers...");
    await client.query(triggerSql);
    console.log("✅ Trigger Schema applied successfully.");

    // Apply the Admin & RLS logic just to be 100% sure everything from Phase 8 is there
    const adminSql = fs.readFileSync('supabase/fix_admin_update_rls.sql', 'utf8');
    console.log("Applying RLS update fix...");
    await client.query(adminSql);
    console.log("✅ Fixed RLS Recursion policies successfully.");

  } catch (err) {
    console.error("❌ Error applying schema:", err);
  } finally {
    await client.end();
  }
}

run();
