const Database = require('better-sqlite3');
const db = new Database('./data/coral_adventures.db');
try {
  const params = db.prepare("SELECT * FROM business_parameters ORDER BY category, parameter").all();
  console.log("Success! Found", params.length, "parameters.");
} catch(err) {
  console.error("Error:", err);
}
