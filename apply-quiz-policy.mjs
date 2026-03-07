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

    console.log("Adding INSERT permissions for Quizzes...");
    await client.query(`
      CREATE POLICY "Teachers can insert quizzes" ON quizzes
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    `);
    console.log("Policy added successfully.");
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log("Policy already exists. Good to go!");
    } else {
      console.error("Error applying policy:", err);
    }
  } finally {
    await client.end();
  }
}

run();
