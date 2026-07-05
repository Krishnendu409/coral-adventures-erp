const { getBusinessParameters, updateBusinessParameter } = require('./.next/server/app/api/settings/route.js'); 
// Wait, actions might not be compiled to CJS easily. 
// I'll just write a script using better-sqlite3 with the proper path to see if the table has the right columns.
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, '../data/database/coral_adventures.sqlite3');
const db = new Database(dbPath);

try {
  const params = db.prepare("SELECT * FROM business_parameters").all();
  console.log(params[0]);
} catch(err) {
  console.error(err);
}
