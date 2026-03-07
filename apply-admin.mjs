import pg from 'pg';
import fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

const client = new pg.Client({
  connectionString,
});

async function run() {
  if (!connectionString) {
    console.error("Missing SUPABASE_DB_URL environment variable.");
    process.exit(1);
  }

  try {
    await client.connect();
    console.log("Connected to Supabase DB");

    const sql = fs.readFileSync('supabase/add_admin_and_rls.sql', 'utf8');
    
    // Execute the schema file
    console.log("Applying RLS and Admin Schema...");
    await client.query(sql);
    console.log("Schema applied successfully.");

    // Update the user to admin
    console.log("Elevating quizsrm@gmail.com to admin...");
    const res = await client.query(`
      UPDATE public.profiles 
      SET role = 'admin' 
      WHERE id IN (
        SELECT id FROM auth.users WHERE email = 'quizsrm@gmail.com'
      );
    `);
    
    if (res.rowCount > 0) {
      console.log(`Successfully elevated quizsrm@gmail.com to Admin!`);
    } else {
      console.log(`User quizsrm@gmail.com not found in the database yet. Please make sure to login first, then run this script again!`);
    }

  } catch (err) {
    console.error("Error applying schema:", err);
  } finally {
    await client.end();
  }
}

run();
