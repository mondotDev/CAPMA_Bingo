import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { devSquares } from "../../config/devSquares";
import { db } from "../../lib/firebase";
import type { EventConfig, EventSquare } from "./event.types";

type EventDocument = Partial<EventConfig> & {
  eventId?: string;
  name?: string;
  isActive?: boolean;
  boardSize?: number;
  submissionOpen?: boolean;
  squares?: EventSquare[];
};

function normalizeSquares(squares: unknown, boardSize: number): EventSquare[] {
  if (!Array.isArray(squares) || squares.length === 0) {
    return devSquares;
  }

  const validSquares = squares
    .filter((square): square is EventSquare => {
      return Boolean(
        square &&
          typeof square === "object" &&
          "id" in square &&
          "labelLine1" in square &&
          "labelLine2" in square &&
          "order" in square,
      );
    })
    .map((square) => ({
      id: String(square.id),
      labelLine1: String(square.labelLine1),
      labelLine2: String(square.labelLine2),
      order: Number(square.order),
    }))
    .sort((firstSquare, secondSquare) => firstSquare.order - secondSquare.order);

  const expectedSquareCount = boardSize * boardSize;

  return validSquares.length === expectedSquareCount ? validSquares : devSquares;
}

export async function loadActiveEvent(): Promise<EventConfig> {
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

  const boardSize = Number(data.boardSize ?? 3);

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
