# Architecture and GitHub Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the file paths and data directories so that the repository is completely self-contained and ready for GitHub deployment without leaking data.

**Architecture:** Move the external `data/` directory inside `webapp/`, configure `paths.ts` to respect environment variables while defaulting to the new local data directory, set up robust `.gitignore` rules, and write a setup README.

**Tech Stack:** Node.js, Git, TypeScript.

## Global Constraints

- No sensitive data or real database files must be committed.
- Directory structure (`data/incoming`, `data/archive`, etc.) must be preserved in Git via `.keep` files.
- Configuration must fall back gracefully so local developers don't need a `.env` file to start.

---

### Task 1: Migrate the Data Directory

**Files:**
- Create: `data/.keep`
- Create: `data/incoming/.keep`
- Create: `data/generated/.keep`
- Create: `data/archive/.keep`
- Create: `data/reports/.keep`
- Create: `data/exports/.keep`
- Create: `data/logs/.keep`
- Create: `data/backups/.keep`
- Create: `data/templates/.keep`
- Create: `data/database/.keep`
- Create: `data/configuration/.keep`

**Interfaces:**
- Consumes: Existing files in `../data`
- Produces: A new `webapp/data` directory containing the exact same files and folders.

- [ ] **Step 1: Move the existing data folder**

```bash
mv ../data ./data
```

- [ ] **Step 2: Create `.keep` files in all subdirectories**

```bash
mkdir -p data/incoming data/generated data/archive data/reports data/exports data/logs data/backups data/templates data/database data/configuration
touch data/.keep
touch data/incoming/.keep
touch data/generated/.keep
touch data/archive/.keep
touch data/reports/.keep
touch data/exports/.keep
touch data/logs/.keep
touch data/backups/.keep
touch data/templates/.keep
touch data/database/.keep
touch data/configuration/.keep
```

- [ ] **Step 3: Commit**

```bash
git add data/**/.keep
git commit -m "chore: migrate data directory and add keep files"
```

---

### Task 2: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: None
- Produces: Git rules that protect the `data/` folder.

- [ ] **Step 1: Write minimal implementation**

Append the following to `.gitignore`:

```text
# Data folders
/data/*
!/data/.keep
!/data/*/.keep
!/data/configuration/
```
*(Note: configuration files like templates might need to be checked in later depending on the setup, but for now we ignore the heavy data and database files while keeping the configuration templates if they are source code, wait, the `data/` folder holds the SQLite DB, we just want to ignore databases and excel files. Let's ignore `*.sqlite3`, `*.sqlite3-journal`, `*.xlsx`, `*.csv` in the data directory instead, or just ignore everything except `.keep`. Let's ignore everything except `.keep` for ultimate safety).*

Correct implementation for `.gitignore` step:
```text
# Local operational data
/data/*
!/data/.keep
!/data/incoming/.keep
!/data/generated/.keep
!/data/archive/.keep
!/data/reports/.keep
!/data/exports/.keep
!/data/logs/.keep
!/data/backups/.keep
!/data/templates/.keep
!/data/database/.keep
!/data/configuration/.keep
```

- [ ] **Step 2: Run test to verify**

Run: `git status`
Expected: The existing `data/database/coral_adventures.sqlite3` should NOT show up as an untracked file.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore sensitive operational data"
```

---

### Task 3: Update Path Configuration

**Files:**
- Modify: `src/server/config/paths.ts`

**Interfaces:**
- Consumes: `process.env.DATA_DIR`
- Produces: Correct absolute paths inside `webapp/data`.

- [ ] **Step 1: Write minimal implementation**

Update `src/server/config/paths.ts`:

```typescript
import path from "node:path";

// DATA_ROOT defaults to ./data relative to the webapp, but can be overridden by env vars
export const BUSINESS_ROOT = process.cwd();
export const DATA_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(BUSINESS_ROOT, "data");

export const PATHS = {
  incoming: path.join(DATA_ROOT, "incoming"),
  generated: path.join(DATA_ROOT, "generated"),
  archive: path.join(DATA_ROOT, "archive"),
  reports: path.join(DATA_ROOT, "reports"),
  exports: path.join(DATA_ROOT, "exports"),
  logs: path.join(DATA_ROOT, "logs"),
  backups: path.join(DATA_ROOT, "backups"),
  templates: path.join(DATA_ROOT, "templates"),
  database: path.join(DATA_ROOT, "database"),
  configuration: path.join(DATA_ROOT, "configuration"),
} as const;

export const DB_FILE = path.join(PATHS.database, "coral_adventures.sqlite3");

export const DOCS_BUSINESS_DIR = path.join(BUSINESS_ROOT, "docs", "superpowers");
```

- [ ] **Step 2: Run test to verify**

Run: `npx tsx -e "import { PATHS } from './src/server/config/paths'; console.log(PATHS.database);"`
Expected: Should print the absolute path to `webapp/data/database`.

- [ ] **Step 3: Commit**

```bash
git add src/server/config/paths.ts
git commit -m "refactor: configure paths to use internal data directory"
```

---

### Task 4: Write Setup README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: None
- Produces: A clean instruction manual for GitHub.

- [ ] **Step 1: Write minimal implementation**

Modify `README.md` to include:

```markdown
# Coral Adventures ERP

A fully integrated ERP and operational dashboard for Coral Adventures, tracking trips, bookings, finances, maintenance, and inventory.

## Prerequisites
- Node.js 18+
- npm

## Setup & Local Development

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Initialize the Database:**
   This will run all migrations and set up an empty SQLite database in `data/database/`.
   \`\`\`bash
   npm run db:migrate
   \`\`\`

3. **(Optional) Seed Synthetic Data:**
   If you want to view the dashboards with populated dummy data for testing:
   \`\`\`bash
   npm run db:seed:synthetic
   \`\`\`

4. **Start the Development Server:**
   \`\`\`bash
   npm run dev
   \`\`\`
   The app will be available at `http://localhost:3000`.

## Architecture
The system relies on a local `data/` folder for all file I/O operations (SQLite databases, Excel imports/exports). This directory is `.gitignore`d to prevent sensitive data leaks. You can override this location in production by setting the `DATA_DIR` environment variable.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add github setup instructions to readme"
```
