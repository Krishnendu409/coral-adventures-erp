# Architecture and GitHub Readiness Design

## Goal
To improve the backend file architecture of the application so that it is fully self-contained, adheres to 12-Factor App configuration principles, and is ready for open-source/GitHub distribution without leaking sensitive data.

## Current State
Currently, the application relies on a `data/` folder that lives outside the main `webapp/` repository root. This means cloning the repository results in a broken environment out-of-the-box, as the operational paths (database, incoming, archive) fail to resolve cleanly.

## Proposed Architecture

### 1. Unified Directory Structure
- The `data/` folder will be moved **inside** the `webapp/` directory (`webapp/data/`).
- This directory will act as the "base" folder for all file I/O operations (SQLite databases, Excel imports/exports, logs, archives).

### 2. Environment-Driven Configuration (12-Factor)
- `src/server/config/paths.ts` will be updated to respect a `DATA_DIR` environment variable.
- **Fallback:** If `DATA_DIR` is not provided (e.g., local development), it will automatically fall back to `path.join(process.cwd(), 'data')`.
- This gives us the best of both worlds: zero-configuration for local GitHub clones, but full flexibility for production deployments to map data to external volumes.

### 3. Git Hygiene and Safety
- We will update `webapp/.gitignore` to ignore everything inside the `data/` folder EXCEPT for a `.keep` file.
- `data/*`
- `!data/.keep`
- This ensures the folder structure is preserved in GitHub, but absolutely no synthetic data, real data, or SQLite databases will be accidentally committed.

### 4. GitHub Readiness (Documentation)
- A robust `README.md` will be written to explain:
  - What the project is (Coral Adventures ERP).
  - Prerequisites (Node.js).
  - Setup instructions (`npm install`, `npm run db:migrate`, `npm run db:seed`).
  - How the import/export engine works locally via the `data/incoming` folder.

## Verification
- Clone or copy the repo to a new location.
- Run `npm install` and `npm run db:migrate`.
- Verify the `data/` folder dynamically structures itself and the app starts without path errors.
