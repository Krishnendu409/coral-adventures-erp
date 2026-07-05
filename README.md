# Coral Adventures ERP

A fully integrated ERP and operational dashboard for Coral Adventures, tracking trips, bookings, finances, maintenance, and inventory.

## Prerequisites
- Node.js 18+
- npm

## Setup & Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Initialize the Database:**
   This will run all migrations and set up an empty SQLite database in `data/database/`.
   ```bash
   npm run db:migrate
   ```

3. **(Optional) Seed Synthetic Data:**
   If you want to view the dashboards with populated dummy data for testing:
   ```bash
   npm run db:seed:synthetic
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Architecture
The system relies on a local `data/` folder for all file I/O operations (SQLite databases, Excel imports/exports). This directory is `.gitignore`d to prevent sensitive data leaks (except for `.keep` files to maintain structure). You can override this location in production by setting the `DATA_DIR` environment variable.
