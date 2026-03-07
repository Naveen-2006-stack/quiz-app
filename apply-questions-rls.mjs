import pg from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;

const client = new pg.Client({ connectionString });

async function run() {
    if (!connectionString) {
        console.error("Missing SUPABASE_DB_URL environment variable.");
        process.exit(1);
    }

    try {
        await client.connect();
        console.log("Connected to Supabase DB");

        const policies = [
            {
                name: "Anyone can read questions",
                sql: `CREATE POLICY "Anyone can read questions" ON questions FOR SELECT USING (true);`
            },
            {
                name: "Teachers can insert questions",
                sql: `CREATE POLICY "Teachers can insert questions" ON questions
          FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid())
          );`
            },
            {
                name: "Teachers can update questions",
                sql: `CREATE POLICY "Teachers can update questions" ON questions
          FOR UPDATE USING (
            EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid())
          );`
            },
            {
                name: "Teachers can delete questions",
                sql: `CREATE POLICY "Teachers can delete questions" ON questions
          FOR DELETE USING (
            EXISTS (SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid())
          );`
            }
        ];

        for (const policy of policies) {
            try {
                await client.query(policy.sql);
                console.log(`✓ Applied: ${policy.name}`);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    console.log(`✓ Already exists: ${policy.name}`);
                } else {
                    console.error(`✗ Error applying "${policy.name}":`, err.message);
                }
            }
        }

        console.log("\nDone!");
    } catch (err) {
        console.error("Connection error:", err);
    } finally {
        await client.end();
    }
}

run();
