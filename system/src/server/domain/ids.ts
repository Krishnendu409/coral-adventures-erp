type Database = any;

// Entity prefixes for the CA-XXX-YYYY-NNNNNN (yearly) / CA-XXX-NNNNNN
// (permanent) ID scheme. One id_sequences row per sequence key.
export const ID_PREFIX = {
  vessel: "VES",
  route: "RTE",
  cruiseType: "CRT",
  crew: "CRW",
  channel: "CHN",
  item: "ITM",
  trip: "TRP",
  customer: "CUS",
  booking: "BKG",
  payment: "PAY",
  expense: "EXP",
  maintenance: "MNT",
  event: "EVT",
  campaign: "CMP",
  lead: "LED",
  feedback: "FBK",
  complaint: "CPT",
  importBatch: "IMP",
  user: "USR",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

interface NextIdOptions {
  /** Reset the counter every calendar year (e.g. trips, bookings, payments). */
  yearly?: boolean;
  /** Required when yearly is true. */
  year?: number;
  padLength?: number;
}

/**
 * Allocates the next ID for a given prefix, atomically incrementing
 * id_sequences. Must be called from inside the same db.transaction() as the
 * row insert it names, so a rolled-back import never burns/reuses an ID.
 */
export function nextId(db: Database, prefix: IdPrefix, options: NextIdOptions = {}): string {
  const { yearly = false, year, padLength = 6 } = options;
  if (yearly && !year) {
    throw new Error(`nextId: year is required for yearly sequence '${prefix}'`);
  }

  const sequenceKey = yearly ? `${prefix}-${year}` : prefix;

  const row = db
    .prepare("SELECT next_value FROM id_sequences WHERE sequence_key = ?")
    .get(sequenceKey) as { next_value: number } | undefined;

  const current = row ? row.next_value : 1;

  if (row) {
    db.prepare("UPDATE id_sequences SET next_value = ? WHERE sequence_key = ?").run(current + 1, sequenceKey);
  } else {
    db.prepare("INSERT INTO id_sequences (sequence_key, next_value) VALUES (?, ?)").run(sequenceKey, current + 1);
  }

  const padded = String(current).padStart(padLength, "0");
  return yearly ? `CA-${prefix}-${year}-${padded}` : `CA-${prefix}-${padded}`;
}
