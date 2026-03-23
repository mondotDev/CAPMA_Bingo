import {
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type {
  AdminEntryUpdateValues,
  EntryFormValues,
  EntryRecord,
  EntrySaveResult,
} from "./entry.types";

type EntryDocument = {
  eventId?: string;
  ownerUid?: string;
  emailKey?: string;
  name?: string;
  company?: string;
  email?: string;
  normalizedEmail?: string;
  selectedSquares?: string[];
  markedSquareIds?: string[];
  completed?: boolean;
  completedAt?: Timestamp | null;
  prizeEntryEligible?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  winnerLocked?: boolean;
  winnerLockedAt?: Timestamp | null;
  winnerLockedBy?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildEntryId(eventId: string, normalizedEmail: string) {
  return `${eventId}_${normalizedEmail}`;
}

function getEntryDocRef(eventId: string, ownerUid: string) {
  return doc(db, "events", eventId, "entries", ownerUid);
}

function getEmailIndexRef(eventId: string, emailKey: string) {
  return doc(db, "events", eventId, "emailIndex", emailKey);
}

function toDate(value: Timestamp | null | undefined) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function mapEntryRecord(id: string, data: EntryDocument): EntryRecord {
  const selectedSquares = Array.isArray(data.selectedSquares)
    ? data.selectedSquares
    : Array.isArray(data.markedSquareIds)
      ? data.markedSquareIds
      : [];

  return {
    id,
    eventId: data.eventId ?? "",
    ownerUid: data.ownerUid ?? id,
    emailKey: data.emailKey ?? data.normalizedEmail ?? data.email ?? "",
    name: data.name ?? "",
    company: data.company ?? "",
    email: data.email ?? "",
    normalizedEmail: data.normalizedEmail ?? "",
    selectedSquares,
    markedSquareIds: selectedSquares,
    completed: Boolean(data.completed),
    completedAt: toDate(data.completedAt),
    prizeEntryEligible: Boolean(data.prizeEntryEligible),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    winnerLocked: Boolean(data.winnerLocked),
    winnerLockedAt: toDate(data.winnerLockedAt),
    winnerLockedBy: data.winnerLockedBy ?? "",
  };
}

export async function createOrLoadEntry(
  eventId: string,
  ownerUid: string,
  values: EntryFormValues,
): Promise<EntryRecord> {
  const emailKey = normalizeEmail(values.email);
  const entryRef = getEntryDocRef(eventId, ownerUid);
  console.info("[board] load start", { eventId, ownerUid });
  try {
    const createdOrLoadedEntry = await runTransaction(db, async (transaction) => {
      const existingEntry = await transaction.get(entryRef);

      if (existingEntry.exists()) {
        return mapEntryRecord(ownerUid, existingEntry.data() as EntryDocument);
      }

      const emailIndexRef = getEmailIndexRef(eventId, emailKey);
      const emailIndexSnapshot = await transaction.get(emailIndexRef);

      if (emailIndexSnapshot.exists()) {
        const indexData = emailIndexSnapshot.data() as { ownerUid?: string };

        if (indexData.ownerUid && indexData.ownerUid !== ownerUid) {
          throw new Error("That email already has a board for this event.");
        }
      }

      const payload = {
        eventId,
        ownerUid,
        emailKey,
        name: values.name.trim(),
        company: values.company.trim(),
        email: emailKey,
        normalizedEmail: emailKey,
        selectedSquares: [],
        markedSquareIds: [],
        completed: false,
        completedAt: null,
        prizeEntryEligible: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        winnerLocked: false,
        winnerLockedAt: null,
        winnerLockedBy: "",
      };

      transaction.set(entryRef, payload);
      transaction.set(emailIndexRef, {
        ownerUid,
        createdAt: serverTimestamp(),
      });

      return {
        id: ownerUid,
        ...payload,
        createdAt: null,
        updatedAt: null,
      };
    });

    console.info("[board] load success", { eventId, ownerUid, source: "existing-or-created" });
    return createdOrLoadedEntry;
  } catch (error) {
    console.error("[board] load failure", error);
    throw error instanceof Error
      ? error
      : new Error("We could not create your CAPMA Bingo entry.");
  }
}

export async function getEntryById(
  eventId: string,
  ownerUid: string,
): Promise<EntryRecord | null> {
  console.info("[board] load start", { eventId, ownerUid });

  try {
    const entryRef = getEntryDocRef(eventId, ownerUid);
    const entrySnapshot = await getDoc(entryRef);

    if (!entrySnapshot.exists()) {
      console.info("[board] load success", { eventId, ownerUid, source: "missing" });
      return null;
    }

    console.info("[board] load success", { eventId, ownerUid, source: "direct" });
    return mapEntryRecord(ownerUid, entrySnapshot.data() as EntryDocument);
  } catch (error) {
    console.error("[board] load failure", error);
    throw error;
  }
}

export async function getEntriesByEventId(eventId: string): Promise<EntryRecord[]> {
  const entriesQuery = query(
    collection(db, "events", eventId, "entries"),
  );
  const snapshot = await getDocs(entriesQuery);

  return snapshot.docs
    .map((entryDocument) =>
      mapEntryRecord(entryDocument.id, entryDocument.data() as EntryDocument),
    )
    .sort((firstEntry, secondEntry) => {
      if (firstEntry.completed !== secondEntry.completed) {
        return firstEntry.completed ? -1 : 1;
      }

      return firstEntry.name.localeCompare(secondEntry.name);
    });
}

export async function lockWinners(
  eventId: string,
  ownerUids: string[],
  adminEmail: string,
): Promise<void> {
  if (ownerUids.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  ownerUids.forEach((ownerUid) => {
    batch.update(getEntryDocRef(eventId, ownerUid), {
      winnerLocked: true,
      winnerLockedAt: serverTimestamp(),
      winnerLockedBy: adminEmail,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function deleteEntryById(
  eventId: string,
  ownerUid: string,
  emailKey: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(getEntryDocRef(eventId, ownerUid));
  batch.delete(getEmailIndexRef(eventId, emailKey));
  await batch.commit();
}

export async function updateEntryByAdmin(
  entry: EntryRecord,
  values: AdminEntryUpdateValues,
): Promise<EntryRecord> {
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();
  const nextEmailKey = normalizeEmail(values.email);
  const entryRef = getEntryDocRef(entry.eventId, entry.ownerUid);

  await runTransaction(db, async (transaction) => {
    const currentEntrySnapshot = await transaction.get(entryRef);

    if (!currentEntrySnapshot.exists()) {
      throw new Error("That entry no longer exists.");
    }

    if (nextEmailKey !== entry.emailKey) {
      const nextEmailIndexRef = getEmailIndexRef(entry.eventId, nextEmailKey);
      const nextEmailIndexSnapshot = await transaction.get(nextEmailIndexRef);

      if (nextEmailIndexSnapshot.exists()) {
        const indexData = nextEmailIndexSnapshot.data() as { ownerUid?: string };

        if (indexData.ownerUid && indexData.ownerUid !== entry.ownerUid) {
          throw new Error("Another entry already exists for that event and email.");
        }
      }

      transaction.set(nextEmailIndexRef, {
        ownerUid: entry.ownerUid,
        createdAt: serverTimestamp(),
      });
      transaction.delete(getEmailIndexRef(entry.eventId, entry.emailKey));
    }

    transaction.update(entryRef, {
      name: trimmedName,
      company: trimmedCompany,
      email: nextEmailKey,
      normalizedEmail: nextEmailKey,
      emailKey: nextEmailKey,
      updatedAt: serverTimestamp(),
    });
  });

  return {
    ...entry,
    name: trimmedName,
    company: trimmedCompany,
    email: nextEmailKey,
    normalizedEmail: nextEmailKey,
    emailKey: nextEmailKey,
  };
}

export async function saveMarkedSquares(
  eventId: string,
  ownerUid: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = getEntryDocRef(eventId, ownerUid);
  console.info("[board] save start", { eventId, ownerUid, markedSquareIds });

  try {
    await setDoc(
      entryRef,
      {
        selectedSquares: markedSquareIds,
        markedSquareIds,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.info("[board] save success", { eventId, ownerUid });
  } catch (error) {
    console.error("[board] save failure", error);
    throw error;
  }

  return {
    completed: false,
    completedAt: null,
    prizeEntryEligible: false,
  };
}

export async function submitCompletedEntry(
  eventId: string,
  ownerUid: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = getEntryDocRef(eventId, ownerUid);
  console.info("[board] save start", { eventId, ownerUid, completion: true });

  try {
    await setDoc(
      entryRef,
      {
        selectedSquares: markedSquareIds,
        markedSquareIds,
        completed: true,
        completedAt: serverTimestamp(),
        prizeEntryEligible: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.info("[board] save success", { eventId, ownerUid, completion: true });
  } catch (error) {
    console.error("[board] save failure", error);
    throw error;
  }

  return {
    completed: true,
    completedAt: new Date(),
    prizeEntryEligible: true,
  };
}
