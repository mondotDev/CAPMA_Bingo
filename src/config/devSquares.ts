import type { EventSquare } from "../features/event/event.types";

export const devSquares: EventSquare[] = [
  { id: "reg", labelLine1: "REG", labelLine2: "DESK", order: 1 },
  { id: "ceu", labelLine1: "CEU", labelLine2: "SESSION", order: 2 },
  { id: "ask", labelLine1: "ASK", labelLine2: "QUESTION", order: 3 },
  { id: "cardinal", labelLine1: "CARDINAL", labelLine2: "BOOTH", order: 4 },
  { id: "meet", labelLine1: "MEET", labelLine2: "NEW", order: 5 },
  { id: "bell", labelLine1: "BELL", labelLine2: "BOOTH", order: 6 },
  { id: "certus", labelLine1: "CERTUS", labelLine2: "BOOTH", order: 7 },
  { id: "keynote", labelLine1: "KEYNOTE", labelLine2: "SPEAKER", order: 8 },
  { id: "inzecto", labelLine1: "INZECTO", labelLine2: "BOOTH", order: 9 },
];
