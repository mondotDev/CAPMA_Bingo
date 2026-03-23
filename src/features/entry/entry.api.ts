import {
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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
  name?: string;
  company?: string;
  email?: string;
  normalizedEmail?: string;
  markedSquareIds?: string[];
  completed?: boolean;
  completedAt?: Timestamp | null;
  prizeEntryEligible?: boolean;
  createdAt?: Timestamp | null;
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

function toDate(value: Timestamp | null | undefined) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function mapEntryRecord(id: string, data: EntryDocument): EntryRecord {
  return {
    id,
    eventId: data.eventId ?? "",
    name: data.name ?? "",
    company: data.company ?? "",
    email: data.email ?? "",
    normalizedEmail: data.normalizedEmail ?? "",
    markedSquareIds: Array.isArray(data.markedSquareIds) ? data.markedSquareIds : [],
    completed: Boolean(data.completed),
    completedAt: toDate(data.completedAt),
    prizeEntryEligible: Boolean(data.prizeEntryEligible),
    createdAt: toDate(data.createdAt),
    winnerLocked: Boolean(data.winnerLocked),
    winnerLockedAt: toDate(data.winnerLockedAt),
    winnerLockedBy: data.winnerLockedBy ?? "",
  };
}

export async function createOrLoadEntry(
  eventId: string,
  values: EntryFormValues,
): Promise<EntryRecord> {
  const normalizedEmail = normalizeEmail(values.email);
  const entryId = buildEntryId(eventId, normalizedEmail);
  const entryRef = doc(db, "entries", entryId);
  const existingEntry = await getDoc(entryRef);

  if (existingEntry.exists()) {
    return mapEntryRecord(entryId, existingEntry.data() as EntryDocument);
  }

  const payload = {
    eventId,
    name: values.name.trim(),
    company: values.company.trim(),
    email: values.email.trim(),
    normalizedEmail,
    markedSquareIds: [],
    completed: false,
    completedAt: null,
    prizeEntryEligible: false,
    createdAt: serverTimestamp(),
    winnerLocked: false,
    winnerLockedAt: null,
    winnerLockedBy: "",
  };

  try {
    await setDoc(entryRef, payload);
  } catch {
    const retryEntry = await getDoc(entryRef);

    if (retryEntry.exists()) {
      return mapEntryRecord(entryId, retryEntry.data() as EntryDocument);
    }

    throw new Error("We could not create your CAPMA Bingo entry.");
  }

  return {
    id: entryId,
    ...payload,
    createdAt: null,
  };
}

export async function getEntryById(entryId: string): Promise<EntryRecord | null> {
  const entryRef = doc(db, "entries", entryId);
  const entrySnapshot = await getDoc(entryRef);

  if (!entrySnapshot.exists()) {
    return null;
  }

  return mapEntryRecord(entryId, entrySnapshot.data() as EntryDocument);
}

export async function getEntriesByEventId(eventId: string): Promise<EntryRecord[]> {
  const entriesQuery = query(
    collection(db, "entries"),
    where("eventId", "==", eventId),
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
  entryIds: string[],
  adminEmail: string,
): Promise<void> {
  if (entryIds.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  entryIds.forEach((entryId) => {
    batch.update(doc(db, "entries", entryId), {
      winnerLocked: true,
      winnerLockedAt: serverTimestamp(),
      winnerLockedBy: adminEmail,
    });
  });

  await batch.commit();
}

export async function deleteEntryById(entryId: string): Promise<void> {
  await deleteDoc(doc(db, "entries", entryId));
}

export async function updateEntryByAdmin(
  entry: EntryRecord,
  values: AdminEntryUpdateValues,
): Promise<EntryRecord> {
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();
  const trimmedEmail = values.email.trim();
  const nextNormalizedEmail = normalizeEmail(trimmedEmail);
  const nextEntryId = buildEntryId(entry.eventId, nextNormalizedEmail);

  const nextPayload = {
    eventId: entry.eventId,
    name: trimmedName,
    company: trimmedCompany,
    email: trimmedEmail,
    normalizedEmail: nextNormalizedEmail,
    markedSquareIds: entry.markedSquareIds,
    completed: entry.completed,
    completedAt: entry.completedAt,
    prizeEntryEligible: entry.prizeEntryEligible,
    createdAt: entry.createdAt,
    winnerLocked: entry.winnerLocked,
    winnerLockedAt: entry.winnerLockedAt,
    winnerLockedBy: entry.winnerLockedBy,
  };

  if (nextEntryId === entry.id) {
    await updateDoc(doc(db, "entries", entry.id), {
      name: trimmedName,
      company: trimmedCompany,
      email: trimmedEmail,
      normalizedEmail: nextNormalizedEmail,
    });

    return {
      ...entry,
      name: trimmedName,
      company: trimmedCompany,
      email: trimmedEmail,
      normalizedEmail: nextNormalizedEmail,
    };
  }

  const existingTarget = await getDoc(doc(db, "entries", nextEntryId));

  if (existingTarget.exists()) {
    throw new Error("Another entry already exists for that event and email.");
  }

  const batch = writeBatch(db);
  batch.set(doc(db, "entries", nextEntryId), nextPayload);
  batch.delete(doc(db, "entries", entry.id));
  await batch.commit();

  return {
    ...entry,
    id: nextEntryId,
    name: trimmedName,
    company: trimmedCompany,
    email: trimmedEmail,
    normalizedEmail: nextNormalizedEmail,
  };
}

export async function saveMarkedSquares(
  entryId: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = doc(db, "entries", entryId);

  await updateDoc(entryRef, {
    markedSquareIds,
  });

  return {
    completed: false,
    completedAt: null,
    prizeEntryEligible: false,
  };
}

export async function submitCompletedEntry(
  entryId: string,
  markedSquareIds: string[],
): Promise<EntrySaveResult> {
  const entryRef = doc(db, "entries", entryId);

  await updateDoc(entryRef, {
    markedSquareIds,
    completed: true,
    completedAt: serverTimestamp(),
    prizeEntryEligible: true,
  });

  return {
    completed: true,
    completedAt: new Date(),
    prizeEntryEligible: true,
  };
}
