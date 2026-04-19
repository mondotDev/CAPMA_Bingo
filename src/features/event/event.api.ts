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
import type { EventConfig, EventSquare, EventSquareTileType } from "./event.types";

const REQUIRED_BOARD_SIZE = 5;
const REQUIRED_SQUARE_COUNT = REQUIRED_BOARD_SIZE * REQUIRED_BOARD_SIZE;
const LEGACY_BOARD_SIZE = 4;
const LEGACY_SQUARE_COUNT = LEGACY_BOARD_SIZE * LEGACY_BOARD_SIZE;
const PLACEHOLDER_DETAIL = "Add Expo activity details";
const PLACEHOLDER_LABEL_PREFIX = "Square ";
const ALLOWED_EVENT_SQUARE_KEYS = [
  "id",
  "label",
  "detail",
  "order",
  "shortLabel",
  "boardLine1",
  "boardLine2",
  "logoUrl",
  "tileType",
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
  boardLine1?: unknown;
  boardLine2?: unknown;
  detail?: unknown;
  logoUrl?: unknown;
  tileType?: unknown;
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
  boardLine1?: string;
  boardLine2?: string;
  detail: string;
  logoUrl?: string;
  tileType?: EventSquareTileType;
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
      boardLine1: "Square",
      boardLine2: String(order),
      detail: PLACEHOLDER_DETAIL,
      logoUrl: undefined,
      tileType: "custom",
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

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferTileType(
  tileType: unknown,
  boardLine1?: string,
  shortLabel?: string,
): EventSquareTileType {
  if (tileType === "booth" || tileType === "custom") {
    return tileType;
  }

  const normalizedBoardLine1 = boardLine1?.trim().toUpperCase();
  const normalizedShortLabel = shortLabel?.trim().toUpperCase();

  if (normalizedBoardLine1 === "BOOTH" || normalizedShortLabel === "BOOTH") {
    return "booth";
  }

  return "custom";
}

function splitBoardLabel(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { boardLine1: undefined, boardLine2: undefined };
  }

  const words = trimmedValue.split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return { boardLine1: trimmedValue, boardLine2: undefined };
  }

  const midpoint = Math.ceil(words.length / 2);

  return {
    boardLine1: words.slice(0, midpoint).join(" "),
    boardLine2: words.slice(midpoint).join(" "),
  };
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
    const { boardLine1, boardLine2 } = splitBoardLabel(label);

    if (!label) {
      return null;
    }

    return {
      id: "",
      label,
      shortLabel: label,
        boardLine1,
        boardLine2,
        detail: label,
        logoUrl: undefined,
        tileType: inferTileType(undefined, boardLine1, label),
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
  const boardLine1 =
    normalizeOptionalString(candidate.boardLine1)
    ?? normalizeOptionalString(candidate.labelLine1);
  const boardLine2 =
    normalizeOptionalString(candidate.boardLine2)
    ?? normalizeOptionalString(candidate.labelLine2);
  const fallbackBoardLines =
    boardLine1 || boardLine2
      ? {
          boardLine1,
          boardLine2,
        }
      : splitBoardLabel(
          (typeof candidate.shortLabel === "string" ? candidate.shortLabel.trim() : "") || label,
        );
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
      boardLine1: fallbackBoardLines.boardLine1,
      boardLine2: fallbackBoardLines.boardLine2,
      detail: detail || label,
      logoUrl: normalizeOptionalString(candidate.logoUrl),
      tileType: inferTileType(candidate.tileType, fallbackBoardLines.boardLine1, label),
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
      boardLine1: rawSquare.boardLine1?.trim() || undefined,
      boardLine2: rawSquare.boardLine2?.trim() || undefined,
      detail: rawSquare.detail.trim() || rawSquare.label.trim(),
      logoUrl: rawSquare.logoUrl?.trim() || undefined,
      tileType: rawSquare.tileType ?? inferTileType(undefined, rawSquare.boardLine1, rawSquare.shortLabel),
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
      || (square.boardLine1 !== undefined && !square.boardLine1)
        || (square.boardLine2 !== undefined && !square.boardLine2)
        || !square.detail
        || (square.logoUrl !== undefined && !square.logoUrl)
        || (square.tileType !== undefined && square.tileType !== "booth" && square.tileType !== "custom")
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
      || (square.boardLine1 !== undefined && !square.boardLine1)
        || (square.boardLine2 !== undefined && !square.boardLine2)
        || !square.detail
        || (square.logoUrl !== undefined && !square.logoUrl)
        || (square.tileType !== undefined && square.tileType !== "booth" && square.tileType !== "custom")
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
      boardLine1: square.boardLine1?.trim() || undefined,
      boardLine2: square.boardLine2?.trim() || undefined,
      detail: square.detail.trim() || square.label.trim(),
      logoUrl: square.logoUrl?.trim() || undefined,
      tileType: square.tileType ?? inferTileType(undefined, square.boardLine1, square.shortLabel),
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
    const label = square.label.trim();
    const boardLine1 = square.boardLine1?.trim() || "";
    const boardLine2 = square.boardLine2?.trim() || "";
    const detail = square.detail.trim() || label;
    const logoUrl = normalizeOptionalString(square.logoUrl);
    const tileType = square.tileType === "booth" ? "booth" : "custom";
    const category = normalizeCategory(square.category);

    if (!label) {
      throw new Error("Every tile needs a popup title before saving.");
    }

    return {
      id: square.id.trim() || getSeedSquare(index + 1).id,
      label,
      detail,
      order: index + 1,
        ...(boardLine1 ? { boardLine1 } : {}),
        ...(boardLine2 ? { boardLine2 } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(tileType ? { tileType } : {}),
        ...(category ? { category } : {}),
        };
      });
  const invalidSquares = nextSquares
    .map((square, index) => ({
      index,
      valid:
        typeof square.id === "string"
        && square.id.trim().length > 0
        && typeof square.label === "string"
        && square.label.trim().length > 0
        && typeof square.detail === "string"
        && square.detail.trim().length > 0
        && square.order === index + 1
        && (!("boardLine1" in square)
          || (typeof square.boardLine1 === "string" && square.boardLine1.trim().length > 0))
        && (!("boardLine2" in square)
          || (typeof square.boardLine2 === "string" && square.boardLine2.trim().length > 0))
        && (!("logoUrl" in square)
          || (typeof square.logoUrl === "string" && square.logoUrl.trim().length > 0))
        && (!("tileType" in square)
          || square.tileType === "booth"
          || square.tileType === "custom")
        && (!("category" in square)
          || (typeof square.category === "string" && square.category.trim().length > 0))
        && Object.keys(square).every((key) =>
          ALLOWED_EVENT_SQUARE_KEYS.includes(key as (typeof ALLOWED_EVENT_SQUARE_KEYS)[number]),
        ),
    }))
    .filter((entry) => !entry.valid);
  if (invalidSquares.length > 0) {
    throw new Error(`Square ${invalidSquares[0].index + 1} is missing required save data.`);
  }

  await updateDoc(doc(db, "events", eventId), {
    boardSize: REQUIRED_BOARD_SIZE,
    squares: nextSquares,
  });
}
