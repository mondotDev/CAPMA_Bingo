import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
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

function getEntryDocRef(eventId: string, normalizedEmail: string) {
  return doc(db, "events", eventId, "entries", normalizedEmail);
}

function getCurrentOwnerUid() {
  const ownerUid = auth.currentUser?.uid;

  if (!ownerUid) {
    throw new Error("Anonymous sign-in is required before creating a CAPMA Bingo entry.");
  }

  return ownerUid;
}

function isFirestorePermissionDenied(error: unknown) {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "permission-denied"
  );
}

function getDuplicateEntryError() {
  return new Error("That email already has a CAPMA Bingo entry for this event.");
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
  const normalizedEntryEmail = normalizeEmail(
    data.normalizedEmail ?? data.emailKey ?? data.email ?? id,
  );

  return {
    id,
    eventId: data.eventId ?? "",
    ownerUid: data.ownerUid ?? "",
    emailKey: normalizedEntryEmail,
    name: data.name ?? "",
    company: data.company ?? "",
    email: data.email ?? normalizedEntryEmail,
    normalizedEmail: normalizedEntryEmail,
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

function sortEntries(entries: EntryRecord[]) {
  return [...entries].sort((firstEntry, secondEntry) => {
    if (firstEntry.completed !== secondEntry.completed) {
      return firstEntry.completed ? -1 : 1;
    }

    return firstEntry.name.localeCompare(secondEntry.name);
  });
}

async function getEntryByEmailKey(
  eventId: string,
  normalizedEmail: string,
): Promise<EntryRecord | null> {
  console.info("[board] load start", { eventId, normalizedEmail });

  try {
    const entryData = await runTransaction(db, async (transaction) => {
      const entryRef = getEntryDocRef(eventId, normalizedEmail);
      const snapshot = await transaction.get(entryRef);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.data() as EntryDocument;
    });

    if (!entryData) {
      console.info("[board] load success", { eventId, normalizedEmail, source: "missing" });
      return null;
    }

    console.info("[board] load success", { eventId, normalizedEmail, source: "direct" });
    return mapEntryRecord(normalizedEmail, entryData);
  } catch (error) {
    console.error("[board] load failure", error);

    if (isFirestorePermissionDenied(error)) {
      throw getDuplicateEntryError();
    }

    throw error;
  }
}

export async function createOrLoadEntry(
  eventId: string,
  values: EntryFormValues,
): Promise<EntryRecord> {
  const normalizedEmail = normalizeEmail(values.email);
  const ownerUid = getCurrentOwnerUid();
  const trimmedEmail = values.email.trim();
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();
  const existingEntry = await getEntryByEmailKey(eventId, normalizedEmail);

  if (existingEntry) {
    return existingEntry;
  }

  const entryRef = getEntryDocRef(eventId, normalizedEmail);

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(entryRef);

      if (snapshot.exists()) {
        const existingEntryData = snapshot.data() as EntryDocument;

        if (existingEntryData.ownerUid === ownerUid) {
          return;
        }

        throw getDuplicateEntryError();
      }

      transaction.set(entryRef, {
        eventId,
        ownerUid,
        emailKey: normalizedEmail,
        email: trimmedEmail,
        normalizedEmail,
        name: trimmedName,
        company: trimmedCompany,
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
      });
    });

    const createdOrExistingEntry = await getEntryByEmailKey(eventId, normalizedEmail);

    if (!createdOrExistingEntry) {
      throw new Error("We could not load your CAPMA Bingo entry.");
    }

    console.info("[board] load success", { eventId, normalizedEmail, source: "created" });
    return createdOrExistingEntry;
  } catch (error) {
    console.error("[board] load failure", error);

    if (isFirestorePermissionDenied(error)) {
      throw getDuplicateEntryError();
    }

    throw error instanceof Error
      ? error
      : new Error("We could not create your CAPMA Bingo entry.");
  }
}

export async function getEntryByEmail(
  eventId: string,
  email: string,
): Promise<EntryRecord | null> {
  return getEntryByEmailKey(eventId, normalizeEmail(email));
}

export async function getEntriesByEventId(eventId: string): Promise<EntryRecord[]> {
  const entriesQuery = query(collection(db, "events", eventId, "entries"));
  const snapshot = await getDocs(entriesQuery);

  return sortEntries(
    snapshot.docs.map((entryDocument) =>
      mapEntryRecord(entryDocument.id, entryDocument.data() as EntryDocument),
    ),
  );
}

export async function lockWinners(
  eventId: string,
  entryIds: string[],
  adminEmail: string,
): Promise<void> {
  if (entryIds.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  entryIds.forEach((entryId) => {
    batch.update(getEntryDocRef(eventId, entryId), {
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
  entryId: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(getEntryDocRef(eventId, entryId));
  await batch.commit();
}

export async function updateEntryByAdmin(
  entry: EntryRecord,
  values: AdminEntryUpdateValues,
): Promise<EntryRecord> {
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();
  const trimmedEmail = values.email.trim();
  const nextNormalizedEmail = normalizeEmail(trimmedEmail);
  const currentEntryRef = getEntryDocRef(entry.eventId, entry.id);
  const nextEntryRef = getEntryDocRef(entry.eventId, nextNormalizedEmail);

  await runTransaction(db, async (transaction) => {
    const currentEntrySnapshot = await transaction.get(currentEntryRef);

    if (!currentEntrySnapshot.exists()) {
      throw new Error("That entry no longer exists.");
    }

    if (currentEntryRef.path !== nextEntryRef.path) {
      const nextEntrySnapshot = await transaction.get(nextEntryRef);

      if (nextEntrySnapshot.exists()) {
        throw new Error("Another entry already exists for that event and email.");
      }
    }

    const currentData = currentEntrySnapshot.data() as EntryDocument;
    const nextPayload: EntryDocument = {
      ...currentData,
      name: trimmedName,
      company: trimmedCompany,
      email: trimmedEmail,
      normalizedEmail: nextNormalizedEmail,
      emailKey: nextNormalizedEmail,
      updatedAt: serverTimestamp() as never,
    };

    transaction.set(nextEntryRef, nextPayload);

    if (currentEntryRef.path !== nextEntryRef.path) {
      transaction.delete(currentEntryRef);
    }
  });

  return {
    ...entry,
    id: nextNormalizedEmail,
    name: trimmedName,
    company: trimmedCompany,
    email: trimmedEmail,
    normalizedEmail: nextNormalizedEmail,
    emailKey: nextNormalizedEmail,
  };
}

export async function saveMarkedSquares(
  eventId: string,
  entryId: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = getEntryDocRef(eventId, entryId);
  console.info("[board] save start", { eventId, entryId, markedSquareIds });

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
    console.info("[board] save success", { eventId, entryId });
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
  entryId: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = getEntryDocRef(eventId, entryId);
  console.info("[board] save start", { eventId, entryId, completion: true });

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
    console.info("[board] save success", { eventId, entryId, completion: true });
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
