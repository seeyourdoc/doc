// Remembers when a patient last had their chat open, so we don't email them about messages they can already see.
// In memory (single server instance).
const seen = new Map();

export function touchPatient(roomId) {
  seen.set(roomId, Date.now());
  if (seen.size > 5000) {
    const cut = Date.now() - 3600e3;
    for (const [k, v] of seen) if (v < cut) seen.delete(k);
  }
}

export const isPatientOnline = (roomId, ms = 20000) => Date.now() - (seen.get(roomId) || 0) < ms;
