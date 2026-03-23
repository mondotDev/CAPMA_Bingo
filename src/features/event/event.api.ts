import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { EventConfig, EventSquare } from "./event.types";

const REQUIRED_BOARD_SIZE = 4;
const REQUIRED_SQUARE_COUNT = REQUIRED_BOARD_SIZE * REQUIRED_BOARD_SIZE;

type EventDocument = Partial<EventConfig> & {
  eventId?: string;
  name?: string;
  isActive?: boolean;
  boardSize?: number;
  submissionOpen?: boolean;
  squares?: EventSquare[];
};

type RawSquare = {
  id: string;
  labelLine1: string;
  labelLine2: string;
  labelLine3: string;
  order: number;
  index: number;
};

function getSeedSquare(order: number): EventSquare {
  return {
    id: `square-${String(order).padStart(2, "0")}`,
    labelLine1: "",
    labelLine2: "",
    labelLine3: "",
    order,
  };
}

function toRawSquares(squares: unknown): RawSquare[] {
  if (!Array.isArray(squares)) {
    return [];
  }

  return squares
    .filter((square) => Boolean(square && typeof square === "object"))
    .map((square, index) => {
      const candidate = square as Partial<EventSquare>;
      const parsedOrder = Number(candidate.order);

      return {
        id: typeof candidate.id === "string" ? candidate.id.trim() : "",
        labelLine1:
          typeof candidate.labelLine1 === "string" ? candidate.labelLine1.trim() : "",
        labelLine2:
          typeof candidate.labelLine2 === "string" ? candidate.labelLine2.trim() : "",
        labelLine3:
          typeof candidate.labelLine3 === "string" ? candidate.labelLine3.trim() : "",
        order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
        index,
      };
    });
}

function normalizeSquares(squares: unknown, boardSize: number): EventSquare[] {
  if (boardSize !== REQUIRED_BOARD_SIZE) {
    throw new Error("Active CAPMA event must be configured as a 4x4 board.");
  }

  if (!Array.isArray(squares) || squares.length !== REQUIRED_SQUARE_COUNT) {
    throw new Error("Active CAPMA event must include exactly 16 bingo squares.");
  }

  const validSquares = toRawSquares(squares)
    .map((square) => ({
      id: square.id,
      labelLine1: square.labelLine1,
      labelLine2: square.labelLine2,
      labelLine3: square.labelLine3 || undefined,
      order: square.order,
    }))
    .sort((firstSquare, secondSquare) => firstSquare.order - secondSquare.order);

  const hasInvalidSquare = validSquares.some(
    (square) =>
      !square.id ||
      !square.labelLine1 ||
      !square.labelLine2 ||
      !Number.isFinite(square.order),
  );

  if (hasInvalidSquare || validSquares.length !== REQUIRED_SQUARE_COUNT) {
    throw new Error("Active CAPMA event squares are incomplete for a 4x4 board.");
  }

  return validSquares;
}

function normalizeSquaresForAdmin(squares: unknown): EventSquare[] {
  const rawSquares = toRawSquares(squares).sort(
    (firstSquare, secondSquare) =>
      firstSquare.order - secondSquare.order || firstSquare.index - secondSquare.index,
  );
  const editableSquares = Array.from({ length: REQUIRED_SQUARE_COUNT }, (_, index) =>
    getSeedSquare(index + 1),
  );
  const usedOrders = new Set<number>();

  rawSquares.forEach((square) => {
    const candidateOrder =
      square.order >= 1 && square.order <= REQUIRED_SQUARE_COUNT && !usedOrders.has(square.order)
        ? square.order
        : editableSquares.find((candidate) => !usedOrders.has(candidate.order))?.order;

    if (!candidateOrder) {
      return;
    }

    usedOrders.add(candidateOrder);
    editableSquares[candidateOrder - 1] = {
      id: square.id || getSeedSquare(candidateOrder).id,
      labelLine1: square.labelLine1,
      labelLine2: square.labelLine2,
      labelLine3: square.labelLine3 || "",
      order: candidateOrder,
    };
  });

  return editableSquares;
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

export async function loadActiveEvent(): Promise<EventConfig> {
  const { data, eventDocument } = await getActiveEventDocument();
  const boardSize = Number(data.boardSize ?? REQUIRED_BOARD_SIZE);

  return {
    eventId: data.eventId ?? eventDocument.id,
    name: data.name ?? "CAPMA Event",
    isActive: Boolean(data.isActive),
    boardSize,
    submissionOpen: Boolean(data.submissionOpen ?? false),
    theme: data.theme,
    onboarding: data.onboarding,
    completionMessage: data.completionMessage,
    squares: normalizeSquares(data.squares, boardSize),
  };
}

export async function loadActiveEventForAdmin(): Promise<EventConfig> {
  const { data, eventDocument } = await getActiveEventDocument();

  return {
    eventId: data.eventId ?? eventDocument.id,
    name: data.name ?? "CAPMA Event",
    isActive: Boolean(data.isActive),
    boardSize: REQUIRED_BOARD_SIZE,
    submissionOpen: Boolean(data.submissionOpen ?? false),
    theme: data.theme,
    onboarding: data.onboarding,
    completionMessage: data.completionMessage,
    squares: normalizeSquaresForAdmin(data.squares),
  };
}

export async function updateActiveEventSquares(eventId: string, squares: EventSquare[]) {
  if (squares.length !== REQUIRED_SQUARE_COUNT) {
    throw new Error("Save requires exactly 16 bingo squares.");
  }

  const nextSquares = squares.map((square, index) => {
    const labelLine1 = square.labelLine1.trim();
    const labelLine2 = square.labelLine2.trim();
    const labelLine3 = square.labelLine3?.trim() ?? "";

    if (!labelLine1 || !labelLine2) {
      throw new Error("Every tile needs both line 1 and line 2 before saving.");
    }

    return {
      id: square.id.trim() || getSeedSquare(index + 1).id,
      labelLine1,
      labelLine2,
      labelLine3,
      order: index + 1,
    };
  });

  await updateDoc(doc(db, "events", eventId), {
    boardSize: REQUIRED_BOARD_SIZE,
    squares: nextSquares,
  });
}
