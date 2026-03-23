import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
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

type EmailIndexDocument = {
  ownerUid?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getEntryDocRef(eventId: string, entryId: string) {
  return doc(db, "events", eventId, "entries", entryId);
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
  const normalizedEntryEmail = normalizeEmail(
    data.emailKey ?? data.normalizedEmail ?? data.email ?? id,
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

function dedupeEntries(entries: EntryRecord[]) {
  const dedupedEntries = new Map<string, EntryRecord>();

  entries.forEach((entry) => {
    const dedupeKey = entry.emailKey || normalizeEmail(entry.email || entry.id);
    const currentEntry = dedupedEntries.get(dedupeKey);
    const prefersCurrentShape = entry.id === entry.emailKey;
    const currentIsCurrentShape = currentEntry?.id === currentEntry?.emailKey;

    if (!currentEntry || (!currentIsCurrentShape && prefersCurrentShape)) {
      dedupedEntries.set(dedupeKey, entry);
    }
  });

  return sortEntries(Array.from(dedupedEntries.values()));
}

async function fetchLegacyOwnerUid(eventId: string, emailKey: string) {
  const emailIndexSnapshot = await getDoc(getEmailIndexRef(eventId, emailKey));

  if (!emailIndexSnapshot.exists()) {
    return null;
  }

  const indexData = emailIndexSnapshot.data() as EmailIndexDocument;
  return indexData.ownerUid && indexData.ownerUid !== emailKey ? indexData.ownerUid : null;
}

async function migrateLegacyEntryIfNeeded(
  eventId: string,
  emailKey: string,
  values?: EntryFormValues,
): Promise<EntryRecord | null> {
  const legacyOwnerUid = await fetchLegacyOwnerUid(eventId, emailKey);

  if (!legacyOwnerUid) {
    return null;
  }

  console.info("[board] legacy load start", { eventId, emailKey, legacyOwnerUid });

  await runTransaction(db, async (transaction) => {
    const nextEntryRef = getEntryDocRef(eventId, emailKey);
    const emailIndexRef = getEmailIndexRef(eventId, emailKey);
    const nextEntrySnapshot = await transaction.get(nextEntryRef);

    if (nextEntrySnapshot.exists()) {
      transaction.delete(emailIndexRef);
      return;
    }

    const legacyEntryRef = getEntryDocRef(eventId, legacyOwnerUid);
    const legacyEntrySnapshot = await transaction.get(legacyEntryRef);

    if (!legacyEntrySnapshot.exists()) {
      return;
    }

    const legacyData = legacyEntrySnapshot.data() as EntryDocument;
    const migratedPayload: EntryDocument = {
      ...legacyData,
      eventId,
      emailKey,
      normalizedEmail: emailKey,
      email: values?.email.trim() ?? legacyData.email ?? emailKey,
      name: values?.name.trim() || legacyData.name || "",
      company: values?.company.trim() || legacyData.company || "",
      updatedAt: serverTimestamp() as never,
    };

    transaction.set(nextEntryRef, migratedPayload);
    transaction.delete(emailIndexRef);
  });

  const migratedSnapshot = await getDoc(getEntryDocRef(eventId, emailKey));

  if (!migratedSnapshot.exists()) {
    console.info("[board] legacy load success", {
      eventId,
      emailKey,
      source: "legacy-missing",
    });
    return null;
  }

  console.info("[board] legacy load success", {
    eventId,
    emailKey,
    source: "legacy-migrated",
  });
  return mapEntryRecord(emailKey, migratedSnapshot.data() as EntryDocument);
}

async function getEntryByEmailKey(
  eventId: string,
  emailKey: string,
  values?: EntryFormValues,
): Promise<EntryRecord | null> {
  console.info("[board] load start", { eventId, emailKey });

  const nextEntryRef = getEntryDocRef(eventId, emailKey);
  const nextEntrySnapshot = await getDoc(nextEntryRef);

  if (nextEntrySnapshot.exists()) {
    console.info("[board] load success", { eventId, emailKey, source: "direct" });
    return mapEntryRecord(emailKey, nextEntrySnapshot.data() as EntryDocument);
  }

  const migratedEntry = await migrateLegacyEntryIfNeeded(eventId, emailKey, values);

  if (migratedEntry) {
    return migratedEntry;
  }

  console.info("[board] load success", { eventId, emailKey, source: "missing" });
  return null;
}

export async function createOrLoadEntry(
  eventId: string,
  values: EntryFormValues,
): Promise<EntryRecord> {
  const emailKey = normalizeEmail(values.email);
  const existingEntry = await getEntryByEmailKey(eventId, emailKey, values);

  if (existingEntry) {
    return existingEntry;
  }

  const entryRef = getEntryDocRef(eventId, emailKey);
  const trimmedEmail = values.email.trim();
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(entryRef);

      if (snapshot.exists()) {
        return;
      }

      transaction.set(entryRef, {
        eventId,
        emailKey,
        email: trimmedEmail,
        normalizedEmail: emailKey,
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

    console.info("[board] load success", { eventId, emailKey, source: "created" });
    return {
      id: emailKey,
      eventId,
      ownerUid: "",
      emailKey,
      name: trimmedName,
      company: trimmedCompany,
      email: trimmedEmail,
      normalizedEmail: emailKey,
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
  } catch (error) {
    console.error("[board] load failure", error);
    throw error instanceof Error
      ? error
      : new Error("We could not create your CAPMA Bingo entry.");
  }
}

export async function getEntryByEmail(
  eventId: string,
  email: string,
): Promise<EntryRecord | null> {
  try {
    return await getEntryByEmailKey(eventId, normalizeEmail(email));
  } catch (error) {
    console.error("[board] load failure", error);
    throw error;
  }
}

export async function getEntriesByEventId(eventId: string): Promise<EntryRecord[]> {
  const entriesQuery = query(collection(db, "events", eventId, "entries"));
  const snapshot = await getDocs(entriesQuery);

  return dedupeEntries(
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
  emailKey: string,
  ownerUid?: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(getEntryDocRef(eventId, entryId));
  batch.delete(getEmailIndexRef(eventId, emailKey));

  if (ownerUid && ownerUid !== entryId) {
    batch.delete(getEntryDocRef(eventId, ownerUid));
  }

  await batch.commit();
}

export async function updateEntryByAdmin(
  entry: EntryRecord,
  values: AdminEntryUpdateValues,
): Promise<EntryRecord> {
  const trimmedName = values.name.trim();
  const trimmedCompany = values.company.trim();
  const trimmedEmail = values.email.trim();
  const nextEmailKey = normalizeEmail(trimmedEmail);
  const currentEntryRef = getEntryDocRef(entry.eventId, entry.id);
  const nextEntryRef = getEntryDocRef(entry.eventId, nextEmailKey);
  const currentEmailIndexRef = getEmailIndexRef(entry.eventId, entry.emailKey);
  const nextEmailIndexRef = getEmailIndexRef(entry.eventId, nextEmailKey);

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

    const nextEmailIndexSnapshot = await transaction.get(nextEmailIndexRef);

    if (nextEmailIndexSnapshot.exists()) {
      const indexData = nextEmailIndexSnapshot.data() as EmailIndexDocument;
      const matchesCurrentEntry =
        indexData.ownerUid === entry.id || indexData.ownerUid === entry.ownerUid;

      if (!matchesCurrentEntry) {
        throw new Error("Another entry already exists for that event and email.");
      }
    }

    const currentData = currentEntrySnapshot.data() as EntryDocument;
    const nextPayload: EntryDocument = {
      ...currentData,
      name: trimmedName,
      company: trimmedCompany,
      email: trimmedEmail,
      normalizedEmail: nextEmailKey,
      emailKey: nextEmailKey,
      updatedAt: serverTimestamp() as never,
    };

    transaction.set(nextEntryRef, nextPayload);
    transaction.delete(currentEmailIndexRef);
    transaction.delete(nextEmailIndexRef);

    if (currentEntryRef.path !== nextEntryRef.path) {
      transaction.delete(currentEntryRef);
    }
  });

  return {
    ...entry,
    id: nextEmailKey,
    name: trimmedName,
    company: trimmedCompany,
    email: trimmedEmail,
    normalizedEmail: nextEmailKey,
    emailKey: nextEmailKey,
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
