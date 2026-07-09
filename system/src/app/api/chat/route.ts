import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { getDb } from '../../../server/db/client';
import { getConfig } from '../../../server/domain/settings/configRepository';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Check API key early and return a helpful error if missing
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: 'Gemini API key not configured. Please add GOOGLE_GENERATIVE_AI_API_KEY to your .env.local file. Get a free key at https://aistudio.google.com/app/apikey' },
      { status: 503 }
    );
  }

  const { messages } = await req.json();

  const businessName = getConfig("business_name") ?? "Coral Adventures";
  const portLabel = getConfig("vessel_port_label") ?? "Malpe Beach, Udupi, Karnataka, India";

  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages,
    system: `You are Coral AI, the intelligent Chief of Staff assistant for the CEO of ${businessName} — a premium cruise and snorkeling tour company in ${portLabel}.

You have full read access to the company's operational SQLite database. Use it proactively to answer business questions with real data.

## Your Capabilities
- Answer questions about bookings, revenue, trips, customers, and operations
- Run SQL SELECT queries to pull real-time business metrics
- Explain any part of the dashboard or system
- Provide pricing recommendations and business insights
- Summarize recent performance

## Your Personality
- Professional but warm. You speak to the CEO directly.
- Be concise — give insights, not raw data dumps
- Format numbers in Indian number system (₹1,23,456)
- Always translate raw SQL results into business insights

## Rules
- ONLY run SELECT queries. Never UPDATE, INSERT, DELETE, or DROP anything.
- If you cannot answer from the database, say so clearly.
- When uncertain, ask a clarifying question.

## Helpful Context
- The company runs trips from ${portLabel}
- Tickets are ₹500-750 per person for standard cruises
- Data is imported from Excel sheets after each trip
- The database tables include: trips, bookings, payments, expenses, customers, vessels, fuel_logs, weather_logs, maintenance_records, inventory_stock_movements, feedback, leads`,
    tools: {
      queryDatabase: tool({
        description: 'Run a read-only SELECT query against the SQLite database to answer business questions.',
        parameters: z.object({
          sql: z.string().describe('The SELECT SQL query to run. NEVER run UPDATE, INSERT, DELETE, or DROP.'),
        }),
        // @ts-ignore
        execute: async ({ sql }) => {
          try {
            const safeSql = sql.trim();
            if (!safeSql.toUpperCase().startsWith('SELECT')) {
              return { error: 'Only SELECT queries are allowed for safety.' };
            }
            const db = getDb();
            const results = db.prepare(safeSql).all();
            return { results: results.slice(0, 200), rowCount: results.length };
          } catch (error: any) {
            return { error: error.message };
          }
        },
      }),
      getSchema: tool({
        description: 'Get the SQLite database schema — all table names and their column definitions.',
        parameters: z.object({}),
        // @ts-ignore
        execute: async () => {
          const db = getDb();
          const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
          return { tables };
        }
      })
    },
  });

  return result.toUIMessageStreamResponse();
}
