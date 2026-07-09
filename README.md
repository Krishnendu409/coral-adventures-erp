# 🐠 Coral Adventures — Business Intelligence Platform

A fully integrated ERP and operational dashboard for **Coral Adventures**, a cruise and snorkeling tour operator in Malpe Beach, Udupi, Karnataka.

This platform helps the CEO:
- Track every trip, booking, and revenue figure in real-time
- Import post-trip Excel sheets to automatically update all dashboards
- Get AI-powered business insights by chatting with Gemini AI
- Generate pricing recommendations based on historical occupancy data

---

## 📁 Folder Structure

Everything you interact with daily lives in the root folder:

| Folder | Purpose |
|--------|---------|
| `incoming/` | **Drop filled Excel files here** to be imported. Create one sub-folder per trip named with the Trip ID (e.g. `CA-TRP-2026-000001/`). |
| `generated/` | Blank Excel templates appear here after you click "Generate Templates" in the dashboard. |
| `reports/` | PDF and CSV reports exported from the system land here. |
| `exports/` | Other data exports appear here. |
| `data/` | *(Internal)* SQLite database, logs, backups, and archive. Do not touch. |
| `src/` | The Next.js application source code. |

---

## 🚀 Getting Started

### Step 1 — Install

Run the following command in the root folder:
```bash
npm install
```

> ⏱️ First-time install takes ~3-5 minutes. After that it's instant.

---

### Step 2 — Configure Gemini AI *(optional but recommended)*

The platform has an **AI Chief of Staff** chat assistant powered by Google Gemini. To enable it:

1. **Get a free Gemini API key:**
   - Go to 👉 **https://aistudio.google.com/app/apikey**
   - Sign in with your Google account
   - Click **"Create API Key"**
   - Copy the key (it looks like `AIzaSy...`)

2. **Add the key to the system:**
   - Create a file named `.env` at the root of the project (copy from `.env.example` if available)
   - Find the line: `GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key_here`
   - Replace `your_gemini_api_key_here` with your actual key
   - Save the file

3. **Restart the platform** (re-run `npm run dev` or `npm start`)

> 💡 The platform works completely without Gemini — only the AI chat widget will be unavailable.

---

### Step 3 — Start

Run the following command to start the application:

```bash
npm run dev
```

The dashboard opens at:

```
http://localhost:3000
```

---

## 📊 Dashboard Pages

| Page | What it shows |
|------|--------------|
| **Executive** | CEO overview: revenue, occupancy, bookings, health score |
| **Financial** | Detailed P&L, revenue vs. expenses, payment breakdowns |
| **Operations** | Trips, fleet status, fuel, weather, and turnaround times |
| **Marketing** | Channel performance, lead conversion, customer acquisition |
| **Customers** | Customer segments, repeat rates, cities, and satisfaction |
| **Maintenance** | Maintenance schedule, costs, and vessel health score |
| **Inventory** | Stock levels, consumption trends, reorder alerts |
| **Forecasting** | Revenue predictions, occupancy forecasts, seasonal trends |
| **Pricing AI** | Historical trend analysis and surge/discount recommendations |
| **Settings** | Business assumptions, base prices, and system parameters |

---

## 📥 How to Import Trip Data

After every trip, your staff fills in Excel workbooks. Here's how to get that data into the system:

### Option A — Web Interface (Recommended)
1. Open the dashboard at `http://localhost:3000`
2. Click **Import Trips** in the sidebar
3. Click **"Generate Templates"** to create blank Excel files for today's trips (they appear in `generated/`)
4. Staff fill in the Excel files
5. Place filled files inside `incoming/<TripID>/` folder
6. Click **"Run Import"** — the dashboard updates instantly

### Option B — Manual Folder Drop
1. Create a folder in `incoming/` named with the Trip ID (e.g., `incoming/CA-TRP-2026-000042/`)
2. Place the filled Excel files inside that folder
3. Go to `http://localhost:3000/import` and click **"Run Import"**

### Required Excel Files per Trip
| File | Required? | Contains |
|------|-----------|---------|
| `Captain.xlsx` | ✅ **Mandatory** | Departure/return times, weather, fuel |
| `Finance.xlsx` | ✅ **Mandatory** | Expenses (fuel, port fees, salaries) |
| `Reservations.xlsx` | Optional | Pre-bookings, tickets, payments |
| `Hospitality.xlsx` | Optional | Onboard sales, inventory consumed |
| `Maintenance.xlsx` | Optional | Any maintenance done on this trip |
| `Inventory.xlsx` | Optional | Stock restocking / waste recorded |
| `Feedback.xlsx` | Optional | Customer feedback and complaints |
| `Marketing.xlsx` | Optional | Leads captured, referrals, marketing notes |

---

## 🤖 AI Chief of Staff

Click the **✨ Coral AI** button (bottom-right of any page) to open the AI chat.

The AI can:
- Answer any business question using your actual data
- Run SQL queries on your database automatically
- Explain dashboard numbers
- Suggest pricing strategies
- Summarize weekly/monthly performance

**Example questions to try:**
- *"How many trips ran this month?"*
- *"What's our total revenue in the last 30 days?"*
- *"Which customer type books the most often?"*
- *"What was last week's average occupancy?"*
- *"Show me the top 5 revenue-generating days"*

> 🔒 The AI can only **read** data. It cannot modify, delete, or alter any records.

---

## 💰 Pricing Intelligence

Go to **Pricing AI** in the sidebar to see automated pricing recommendations:

- If occupancy is consistently **>85%** → recommends a **20% price surge**
- If occupancy is consistently **<50%** → recommends a **15% discount**
- Otherwise → recommends **stable pricing**

Recommendations are based on the last 30 days of imported trip data. The more data you import, the smarter it gets.

---

## 🧪 Testing the System

To run an end-to-end test with randomly generated trip data:

```bash
cd system
npm run test:e2e
```

This script will:
1. Create a realistic test trip with random bookings and passengers
2. Place the filled Excel files in `incoming/`
3. Trigger the import automatically
4. Report the result

> The dev server must be running (`npm run dev`) for the import step to work.

---

## 🔧 Developer Commands

Run from the root folder:

```bash
# Start development server (with hot reload)
npm run dev

# Build production version
npm run build

# Start production server
npm start

# Set up database schema
npm run db:migrate

# Seed reference data (vessel, routes, prices, channels)
npm run db:seed

# Run end-to-end test with dummy data
npm run test:e2e

# Run unit tests
npm test
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)

| Variable | Description | Required? |
|----------|-------------|-----------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini AI API key for the chat assistant | No (AI disabled without it) |

### Business Parameters (`Settings` page)

Configure these from the web dashboard at `/settings/assumptions`:
- Vessel capacity
- Base ticket prices (Standard, Premium, Charter)
- Fuel cost assumptions
- Salary and overhead rates
- Peak season months

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 in use | The app will automatically use port 3001. Check the terminal for the actual URL. |
| "AI is unavailable" | Add your Gemini API key to `system/.env.local` and restart. |
| Import fails | Check the import page for detailed error messages per file and sheet. |
| Database error | Run `npm run db:migrate` from the root folder to reset/update the schema. |
| Charts show no data | Use the Import page to ingest trip data, or run `npm run db:seed` for reference data. |
| Build fails | Delete `.next/` folder and run `npm run build` again. |

---

## 🔐 Security Notes

- All data stays **100% local** on your computer. Nothing is sent to any cloud except AI queries to Gemini.
- Gemini only receives the text of your chat messages and query results (no passwords, keys, or personal data).
- The AI is read-only — it cannot modify your database.
- Keep `.env` private. It is excluded from git via `.gitignore`.

---

## 📞 Support

This system was built specifically for Coral Adventures. For technical issues, contact the development team.

---

*Built with Next.js 16, SQLite, ExcelJS, Recharts, and Google Gemini AI.*
