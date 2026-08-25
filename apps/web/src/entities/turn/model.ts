/**
 * Published narrative passage for a turn.
 */
export interface Passage {
  readonly id: string;
  readonly turnId: string;
  readonly prose: string;
  readonly visibleState?: Record<string, unknown>;
}

export interface TurnResultCommitted {
  readonly status: "committed";
  readonly turnId: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly passage: Passage;
  readonly warnings?: string[];
}

export interface TurnResultRejected {
  readonly status: "rejected";
  readonly turnId: string;
  readonly sessionId: string;
  readonly failure: { readonly code: string; readonly message: string };
  readonly warnings?: string[];
}

export type TurnResult = TurnResultCommitted | TurnResultRejected;

export type AsyncTurnAccepted = {
  readonly mode: "async";
  readonly turnId: string;
  readonly sessionId: string;
};
