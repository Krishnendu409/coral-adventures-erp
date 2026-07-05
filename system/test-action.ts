import { updateBusinessParameter } from "./src/server/domain/settings/actions";
import { getDb } from "./src/server/db/client";

async function main() {
  const db = getDb();
  console.log("DB connected");

  try {
    const res = await updateBusinessParameter("A01", 155);
    console.log("Result:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}

main().catch(console.error);
