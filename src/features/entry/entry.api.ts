import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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

class EntryLookupPermissionError extends Error {
  constructor() {
    super("We could not verify your CAPMA Bingo entry yet.");
    this.name = "EntryLookupPermissionError";
  }
}

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

function getEntryLookupError() {
  return new Error("We could not load your CAPMA Bingo entry right now.");
}

function getEntryCreateError() {
  return new Error("We could not create your CAPMA Bingo entry right now.");
}

function getEntryReclaimError() {
  return new Error("We could not continue your CAPMA Bingo board on this device right now.");
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
      console.info("[board] load result", {
        eventId,
        normalizedEmail,
        source: "permission-denied",
      });
      throw new EntryLookupPermissionError();
    }

    console.info("[board] load result", {
      eventId,
      normalizedEmail,
      source: "error",
    });
    throw error;
  }
}

async function reclaimEntryOwnership(
  eventId: string,
  normalizedEmail: string,
  ownerUid: string,
) {
  const entryRef = getEntryDocRef(eventId, normalizedEmail);

  console.info("[board] reclaim attempt", {
    eventId,
    normalizedEmail,
    ownerUid,
  });

  try {
    await updateDoc(entryRef, {
      ownerUid,
      updatedAt: serverTimestamp(),
    });
    console.info("[board] reclaim success", {
      eventId,
      normalizedEmail,
      ownerUid,
    });
  } catch (error) {
    console.error("[board] reclaim failure", error);
    console.info("[board] reclaim blocked", {
      eventId,
      normalizedEmail,
      ownerUid,
      permissionDenied: isFirestorePermissionDenied(error),
    });
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
  console.info("[board] entry create start", {
    eventId,
    normalizedEmail,
    ownerUid,
  });
  let lookupWasPermissionDenied = false;

  try {
    const existingEntry = await getEntryByEmailKey(eventId, normalizedEmail);

    if (existingEntry) {
      console.info("[board] entry create resolved", {
        eventId,
        normalizedEmail,
        ownerUid,
        source: "existing",
      });
      return existingEntry;
    }
  } catch (error) {
    if (error instanceof EntryLookupPermissionError) {
      lookupWasPermissionDenied = true;
      console.info("[board] entry existing inaccessible", {
        eventId,
        normalizedEmail,
        ownerUid,
        reason: "permission-denied",
      });

      try {
        await reclaimEntryOwnership(eventId, normalizedEmail, ownerUid);
        const reclaimedEntry = await getEntryByEmailKey(eventId, normalizedEmail);

        if (!reclaimedEntry) {
          throw getEntryReclaimError();
        }

        console.info("[board] entry create resolved", {
          eventId,
          normalizedEmail,
          ownerUid,
          source: "reclaimed",
        });
        return reclaimedEntry;
      } catch (reclaimError) {
        if (isFirestorePermissionDenied(reclaimError)) {
          throw getEntryReclaimError();
        }

        throw reclaimError instanceof Error ? reclaimError : getEntryReclaimError();
      }
    } else {
      throw error instanceof Error ? error : getEntryLookupError();
    }
  }

  const entryRef = getEntryDocRef(eventId, normalizedEmail);
  const createPayload: EntryDocument = {
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
    createdAt: serverTimestamp() as never,
    updatedAt: serverTimestamp() as never,
    winnerLocked: false,
    winnerLockedAt: null,
    winnerLockedBy: "",
  };

  try {
    console.info("[board] entry create attempt", {
      eventId,
      normalizedEmail,
      ownerUid,
      source: lookupWasPermissionDenied ? "after-inconclusive-lookup" : "after-missing-lookup",
    });
    await setDoc(entryRef, createPayload);

    const createdOrExistingEntry = await getEntryByEmailKey(eventId, normalizedEmail);

    if (!createdOrExistingEntry) {
      return {
        id: normalizedEmail,
        eventId,
        ownerUid,
        emailKey: normalizedEmail,
        name: trimmedName,
        company: trimmedCompany,
        email: trimmedEmail,
        normalizedEmail,
        selectedSquares: [],
        markedSquareIds: [],
        completed: false,
        completedAt: null,
        prizeEntryEligible: false,
        createdAt: null,
        updatedAt: null,
        winnerLocked: false,
        winnerLockedAt: null,
        winnerLockedBy: "",
      };
    }

    console.info("[board] entry create resolved", {
      eventId,
      normalizedEmail,
      ownerUid,
      source: "created",
    });
    return createdOrExistingEntry;
  } catch (error) {
    console.error("[board] load failure", error);

    if (isFirestorePermissionDenied(error)) {
      throw getEntryCreateError();
    }

    throw error instanceof Error
      ? error
      : getEntryCreateError();
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
