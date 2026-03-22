import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type {
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

export async function saveMarkedSquares(
  entryId: string,
  markedSquareIds: string[],
  completed: boolean,
): Promise<EntrySaveResult> {
  const entryRef = doc(db, "entries", entryId);

  if (completed) {
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

  await updateDoc(entryRef, {
    markedSquareIds,
  });

  return {
    completed: false,
    completedAt: null,
    prizeEntryEligible: false,
  };
}
