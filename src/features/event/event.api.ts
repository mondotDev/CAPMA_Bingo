import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import type { EventConfig, EventSquare } from "./event.types";

const REQUIRED_BOARD_SIZE = 5;
const REQUIRED_SQUARE_COUNT = REQUIRED_BOARD_SIZE * REQUIRED_BOARD_SIZE;
const LEGACY_BOARD_SIZE = 4;
const LEGACY_SQUARE_COUNT = LEGACY_BOARD_SIZE * LEGACY_BOARD_SIZE;
const MAX_LABEL_LENGTH = 20;
const PLACEHOLDER_DETAIL = "Add Expo activity details";
const PLACEHOLDER_LABEL_PREFIX = "Square ";
const ALLOWED_EVENT_SQUARE_KEYS = [
  "id",
  "label",
  "detail",
  "order",
  "shortLabel",
  "category",
] as const;

type EventDocument = Partial<EventConfig> & {
  eventId?: string;
  name?: string;
  isActive?: boolean;
  boardSize?: number;
  submissionOpen?: boolean;
  squares?: unknown;
};

type LegacySquareDocument = {
  id?: unknown;
  label?: unknown;
  shortLabel?: unknown;
  detail?: unknown;
  category?: unknown;
  points?: unknown;
  order?: unknown;
  labelLine1?: unknown;
  labelLine2?: unknown;
  labelLine3?: unknown;
};

type RawSquare = {
  id: string;
  label: string;
  shortLabel?: string;
  detail: string;
  category?: string;
  points: number;
  order: number;
  index: number;
};

function getSeedSquare(order: number): EventSquare {
  return {
    id: `square-${String(order).padStart(2, "0")}`,
    label: `${PLACEHOLDER_LABEL_PREFIX}${order}`,
    shortLabel: `${PLACEHOLDER_LABEL_PREFIX}${order}`,
    detail: PLACEHOLDER_DETAIL,
    category: undefined,
    points: 1,
    order,
  };
}

function normalizeCategory(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

function normalizePoints(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

function buildLegacyLabel(square: LegacySquareDocument) {
  return [square.labelLine1, square.labelLine2]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildLegacyDetail(square: LegacySquareDocument, fallbackLabel: string) {
  const detailLines = [square.labelLine1, square.labelLine2, square.labelLine3]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return detailLines.join(" ").trim() || fallbackLabel;
}

function toRawSquare(square: unknown, index: number): RawSquare | null {
  if (typeof square === "string") {
    const label = square.trim();

    if (!label) {
      return null;
    }

    return {
      id: "",
      label,
      shortLabel: label,
      detail: label,
      category: undefined,
      points: 1,
      order: index + 1,
      index,
    };
  }

  if (!square || typeof square !== "object") {
    return null;
  }

  const candidate = square as LegacySquareDocument;
  const label =
    (typeof candidate.label === "string" ? candidate.label.trim() : "") || buildLegacyLabel(candidate);

  if (!label) {
    return null;
  }

  const detail =
    (typeof candidate.detail === "string" ? candidate.detail.trim() : "")
    || buildLegacyDetail(candidate, label);
  const parsedOrder =
    typeof candidate.order === "number" && Number.isFinite(candidate.order)
      ? candidate.order
      : index + 1;

  return {
    id: typeof candidate.id === "string" ? candidate.id.trim() : "",
    label,
    shortLabel:
      typeof candidate.shortLabel === "string" && candidate.shortLabel.trim()
        ? candidate.shortLabel.trim()
        : undefined,
    detail: detail || label,
    category: normalizeCategory(candidate.category),
    points: normalizePoints(candidate.points),
    order: parsedOrder,
    index,
  };
}

function toRawSquares(squares: unknown) {
  if (!Array.isArray(squares)) {
    return [];
  }

  return squares
    .map((square, index) => toRawSquare(square, index))
    .filter((square): square is RawSquare => Boolean(square));
}

function normalizeSquare(rawSquare: RawSquare, order: number): EventSquare {
  return {
    id: rawSquare.id || getSeedSquare(order).id,
    label: rawSquare.label.trim(),
    shortLabel: rawSquare.shortLabel?.trim() || undefined,
    detail: rawSquare.detail.trim() || rawSquare.label.trim(),
    category: rawSquare.category,
    points: normalizePoints(rawSquare.points),
    order,
  };
}

function normalizeSquareCollection(squares: unknown) {
  return toRawSquares(squares)
    .sort((firstSquare, secondSquare) => firstSquare.order - secondSquare.order)
    .map((square, index) => normalizeSquare(square, index + 1));
}

function validateStrictSquares(boardSize: number, squares: EventSquare[]) {
  if (boardSize !== REQUIRED_BOARD_SIZE) {
    throw new Error("Active CAPMA event must be configured as a 5x5 board.");
  }

  if (squares.length !== REQUIRED_SQUARE_COUNT) {
    throw new Error("Active CAPMA event must include exactly 25 bingo squares.");
  }

  const hasInvalidSquare = squares.some(
    (square) =>
      !square.id
      || !square.label
      || (square.shortLabel !== undefined && !square.shortLabel)
      || !square.detail
      || square.label.length > MAX_LABEL_LENGTH
      || !Number.isFinite(square.points)
      || square.points <= 0,
  );

  if (hasInvalidSquare) {
    throw new Error(
      "Active CAPMA event squares are invalid. Each square needs a short label, popup detail, and valid id.",
    );
  }
}

function validateAdminSquares(boardSize: number, squares: EventSquare[]) {
  const isLegacyEvent =
    squares.length === LEGACY_SQUARE_COUNT
    && (boardSize === LEGACY_BOARD_SIZE || boardSize === REQUIRED_BOARD_SIZE);
  const isUpgradedEvent =
    squares.length === REQUIRED_SQUARE_COUNT && boardSize === REQUIRED_BOARD_SIZE;

  if (!isLegacyEvent && !isUpgradedEvent) {
    throw new Error(
      "Admin can only open events configured as 16-square legacy boards or 25-square upgraded boards.",
    );
  }

  const hasInvalidSquare = squares.some(
    (square) =>
      !square.id
      || !square.label
      || (square.shortLabel !== undefined && !square.shortLabel)
      || !square.detail
      || !Number.isFinite(square.points)
      || square.points <= 0,
  );

  if (hasInvalidSquare) {
    throw new Error(
      "Admin could not normalize the event squares. Each square needs readable label and detail text.",
    );
  }
}

async function getActiveEventDocument() {
  const eventsQuery = query(
    collection(db, "events"),
    where("isActive", "==", true),
    limit(1),
  );

  const snapshot = await getDocs(eventsQuery);

  if (snapshot.empty) {
    throw new Error("No active CAPMA event is configured in Firestore.");
  }

  const eventDocument = snapshot.docs[0];
  const data = eventDocument.data() as EventDocument;

  return { data, eventDocument };
}

export function expandSquaresToTwentyFive(squares: EventSquare[]) {
  const orderedSquares = [...squares]
    .sort((firstSquare, secondSquare) => firstSquare.order - secondSquare.order)
    .slice(0, LEGACY_SQUARE_COUNT)
    .map((square, index) => ({
      ...square,
      id: square.id.trim() || getSeedSquare(index + 1).id,
      label: square.label.trim(),
      shortLabel: square.shortLabel?.trim() || square.label.trim(),
      detail: square.detail.trim() || square.label.trim(),
      order: index + 1,
      points: normalizePoints(square.points),
    }));

  return Array.from({ length: REQUIRED_SQUARE_COUNT }, (_, index) => {
    if (index < orderedSquares.length) {
      return orderedSquares[index];
    }

    return getSeedSquare(index + 1);
  });
}

export async function loadActiveEvent(): Promise<EventConfig> {
  const { data, eventDocument } = await getActiveEventDocument();
  const boardSize = Number(data.boardSize ?? REQUIRED_BOARD_SIZE);
  const squares = normalizeSquareCollection(data.squares);

  validateStrictSquares(boardSize, squares);

  return {
    eventId: data.eventId ?? eventDocument.id,
    name: data.name ?? "CAPMA Event",
    isActive: Boolean(data.isActive),
    boardSize,
    submissionOpen: Boolean(data.submissionOpen ?? false),
    theme: data.theme,
    onboarding: data.onboarding,
    completionMessage: data.completionMessage,
    squares,
  };
}

export async function loadActiveEventForAdmin(): Promise<EventConfig> {
  const { data, eventDocument } = await getActiveEventDocument();
  const boardSize = Number(data.boardSize ?? REQUIRED_BOARD_SIZE);
  const squares = normalizeSquareCollection(data.squares);

  validateAdminSquares(boardSize, squares);

  return {
    eventId: data.eventId ?? eventDocument.id,
    name: data.name ?? "CAPMA Event",
    isActive: Boolean(data.isActive),
    boardSize,
    submissionOpen: Boolean(data.submissionOpen ?? false),
    theme: data.theme,
    onboarding: data.onboarding,
    completionMessage: data.completionMessage,
    squares,
    requiresSquareUpgrade: squares.length === LEGACY_SQUARE_COUNT,
  };
}

export async function updateActiveEventSquares(eventId: string, squares: EventSquare[]) {
  if (squares.length !== REQUIRED_SQUARE_COUNT) {
    throw new Error("Save requires exactly 25 bingo squares.");
  }

  const nextSquares = squares.map((square, index) => {
    const label = square.label.trim().toUpperCase();
    const shortLabel = square.shortLabel?.trim().toUpperCase() || "";
    const detail = square.detail.trim() || label;
    const category = normalizeCategory(square.category);

    if (!label) {
      throw new Error("Every tile needs a short board label before saving.");
    }

    if (label.length > MAX_LABEL_LENGTH) {
      throw new Error("Square labels must stay within 20 characters for the board.");
    }

    return {
      id: square.id.trim() || getSeedSquare(index + 1).id,
      label,
      detail,
      order: index + 1,
      ...(shortLabel ? { shortLabel } : {}),
      ...(category ? { category } : {}),
    };
  });

  const legacyDerivedSquare =
    nextSquares.find(
      (square) =>
        !square.label.startsWith(PLACEHOLDER_LABEL_PREFIX.toUpperCase())
        || square.detail !== PLACEHOLDER_DETAIL,
    ) ?? null;
  const placeholderSquare =
    nextSquares.find(
      (square) =>
        square.label.startsWith(PLACEHOLDER_LABEL_PREFIX.toUpperCase())
        && square.detail === PLACEHOLDER_DETAIL,
    ) ?? null;
  const invalidSquares = nextSquares
    .map((square, index) => ({
      index,
      square,
      keys: Object.keys(square),
      extraKeys: Object.keys(square).filter(
        (key) => !ALLOWED_EVENT_SQUARE_KEYS.includes(key as (typeof ALLOWED_EVENT_SQUARE_KEYS)[number]),
      ),
      valid:
        typeof square.id === "string"
        && square.id.trim().length > 0
        && typeof square.label === "string"
        && square.label.trim().length > 0
        && typeof square.detail === "string"
        && square.detail.trim().length > 0
        && square.order === index + 1
        && (!("shortLabel" in square)
          || (typeof square.shortLabel === "string" && square.shortLabel.trim().length > 0))
        && (!("category" in square)
          || (typeof square.category === "string" && square.category.trim().length > 0))
        && Object.keys(square).every((key) =>
          ALLOWED_EVENT_SQUARE_KEYS.includes(key as (typeof ALLOWED_EVENT_SQUARE_KEYS)[number]),
        ),
    }))
    .filter((entry) => !entry.valid);

  console.info("[admin:event-save] payload", {
    boardSize: REQUIRED_BOARD_SIZE,
    nextSquaresLength: nextSquares.length,
    sampleSquare: JSON.stringify(nextSquares[0] ?? null),
    firstSquareKeys: Object.keys(nextSquares[0] ?? {}),
    placeholderSquareKeys: Object.keys(nextSquares[16] ?? {}),
    legacyDerivedSquare: legacyDerivedSquare ? JSON.stringify(legacyDerivedSquare) : null,
    placeholderSquare: placeholderSquare ? JSON.stringify(placeholderSquare) : null,
    invalidSquareCount: invalidSquares.length,
    invalidSquares: invalidSquares.map((entry) => ({
      index: entry.index,
      keys: entry.keys,
      extraKeys: entry.extraKeys,
      shortLabelPresent: "shortLabel" in entry.square,
      shortLabelValue: "shortLabel" in entry.square ? entry.square.shortLabel : null,
      categoryPresent: "category" in entry.square,
      categoryValue: "category" in entry.square ? entry.square.category : null,
      square: JSON.stringify(entry.square),
    })),
    firestoreWrite: {
      method: "updateDoc",
      path: `events/${eventId}`,
      payloadKeys: ["boardSize", "squares"],
    },
    authUser: {
      uid: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      providerData:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          uid: provider.uid,
          email: provider.email ?? null,
        })) ?? [],
    },
  });

  await updateDoc(doc(db, "events", eventId), {
    boardSize: REQUIRED_BOARD_SIZE,
    squares: nextSquares,
  });
}
