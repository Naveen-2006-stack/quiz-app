const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  if (!connectionString) {
    console.error('Missing SUPABASE_DB_URL environment variable.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to database');
    const schema = fs.readFileSync(path.join(__dirname, 'supabase', 'schema.sql'), 'utf-8');
    await client.query(schema);
    console.log('Schema applied successfully');
  } catch (error) {
    console.error('Error applying schema:', error);
  } finally {
    await client.end();
  }
}

run();
