# Executive Reports Generation Design

## Overview
The goal is to generate "company-grade" executive summary reports in three formats: PDF, DOCX, and CSV. These reports will be filterable by timeframe (monthly, yearly, custom dates) and will include the company logo, polished layouts (Portrait orientation), data tables, and high-density visual representations (KPIs).

## Data Flow & Architecture

1.  **Frontend Interface**:
    *   A clean download interface allowing the user to select the date range (e.g., "This Month", "Last Year", "Custom Range") and the desired format (PDF, DOCX, CSV).
    *   The frontend makes a request to `GET /api/downloads/executive-report?startDate=X&endDate=Y&format=Z`.

2.  **Backend Data Aggregation**:
    *   A single data aggregation service fetches required metrics (Financial revenue, NPS scores, Maintenance logs, passenger counts) filtered by the requested date range.

3.  **Document Generation Modules**:
    *   **PDF Generation**: Use `@react-pdf/renderer` on the server (`renderToStream`). This allows us to use React components to declaratively build a stunning, branded PDF layout with the company logo and formatted data tables.
    *   **DOCX Generation**: Use the `docx` npm package. This library allows robust server-side generation of native Word documents, complete with headers, footers, company logo images, and styled tables.
    *   **CSV Generation**: Map the aggregated data into flat rows and use native Node.js streams or `json2csv` to output a raw data dump.

## Visual Design (Portrait Layout)
Both the PDF and DOCX will share a consistent, branded aesthetic:
*   **Header**: Company logo on the left, "Executive Summary Report" and date range on the right.
*   **KPI Section**: A grid or side-by-side textual representation of key metrics (Total Revenue, Total Trips, Avg NPS) at the top.
*   **Data Sections**: Cleanly styled tables breaking down the data by operational category.
*   **Footer**: Page numbers and generation timestamp.

## Implementation Steps
1.  Install dependencies: `@react-pdf/renderer` (PDF) and `docx` (Word).
2.  Implement the data aggregation query in the backend.
3.  Create the PDF React Template.
4.  Create the DOCX builder function.
5.  Create the CSV mapping function.
6.  Wire up the API route to serve the corresponding binary stream with correct MIME types.
7.  Add the UI controls to the `downloads` or `reports` page.
