import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { stageLabel, COPY } from "../../../shared/config/copy.ts";
import {
  createMessageId,
  loadTranscript,
  saveTranscript,
  type ChatMessage,
} from "../../../shared/lib/chat-transcript.ts";
import { extractStreamingProse } from "../../../shared/lib/extract-streaming-prose.ts";
import {
  ensurePlayer,
  getSession,
  openSessionEvents,
  renameSession,
  saveSession,
  submitAction,
  type Passage,
  type PlayerCredentials,
  type SessionView,
} from "../../../shared/api/client.ts";
import {
  isInternalPassageProse,
  isPlayerTurnKind,
} from "../lib/passage.ts";

const NARRATIVE_TASK = "narrative.write";
const DIALOGUE_PREFS_KEY = "rp.ui.dialogueOpen";
const WIDE_MQ = "(min-width: 1280px)";

export interface UseSessionPlayResult {
  readonly session: SessionView | null;
  readonly messages: ChatMessage[];
  readonly hydrated: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly stageHint: string | null;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly dialogueOpen: boolean;
  readonly setDialogueOpen: (open: boolean) => void;
  readonly highlightId: string | null;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly submit: () => Promise<void>;
  readonly save: () => Promise<{ revision: number } | null>;
  readonly rename: (title: string) => Promise<void>;
  readonly onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly focusMessage: (id: string) => void;
  readonly clearError: () => void;
  readonly showTyping: boolean;
}

/**
 * Session play controller: hydrate, SSE stream, submit, save, rename.
 *
 * @param sessionId - route session id
 */
export function useSessionPlay(sessionId: string): UseSessionPlayResult {
  const [player, setPlayer] = useState<PlayerCredentials | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [stageHint, setStageHint] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dialogueOpen, setDialogueOpenState] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const lastPassageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const rawDraftRef = useRef("");
  const finalizedTurnRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const wide =
      typeof window !== "undefined" && window.matchMedia(WIDE_MQ).matches;
    const stored = loadDialoguePref();
    setDialogueOpenState(stored ?? wide);
  }, []);

  const setDialogueOpen = useCallback((open: boolean) => {
    setDialogueOpenState(open);
    try {
      localStorage.setItem(DIALOGUE_PREFS_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const commitMessages = useCallback(
    (next: ChatMessage[]) => {
      messagesRef.current = next;
      setMessages(next);
      if (sessionId) saveTranscript(sessionId, next);
    },
    [sessionId],
  );

  const upsertStreamingAssistant = useCallback((prose: string) => {
    if (!prose) return;
    setMessages((prev) => {
      const streamId = streamMsgIdRef.current;
      if (streamId) {
        const next = prev.map((m) =>
          m.id === streamId ? { ...m, content: prose, streaming: true } : m,
        );
        messagesRef.current = next;
        return next;
      }
      const id = createMessageId("stream");
      streamMsgIdRef.current = id;
      const next = [
        ...prev.filter((m) => !m.streaming),
        {
          id,
          role: "assistant" as const,
          content: prose,
          createdAt: new Date().toISOString(),
          streaming: true,
        },
      ];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const appendStreamDelta = useCallback(
    (delta: string) => {
      if (!delta || finalizedTurnRef.current) return;
      rawDraftRef.current += delta;
      const prose = extractStreamingProse(rawDraftRef.current);
      if (prose) {
        setStageHint(null);
        upsertStreamingAssistant(prose);
      }
    },
    [upsertStreamingAssistant],
  );

  const finalizeAssistant = useCallback(
    (prose: string, passageId?: string) => {
      if (!prose.trim()) return;
      if (isInternalPassageProse(prose)) return;

      if (passageId && lastPassageIdRef.current === passageId) {
        const cleaned = messagesRef.current.filter((m) => !m.streaming);
        commitMessages(cleaned);
        streamMsgIdRef.current = null;
        rawDraftRef.current = "";
        return;
      }
      if (passageId) {
        lastPassageIdRef.current = passageId;
      }

      const prev = messagesRef.current;
      const streamId = streamMsgIdRef.current;
      let next: ChatMessage[];

      if (streamId && prev.some((m) => m.id === streamId)) {
        next = prev.map((m) =>
          m.id === streamId
            ? {
                id: m.id,
                role: "assistant" as const,
                content: prose,
                createdAt: m.createdAt,
              }
            : m,
        );
      } else {
        const lastAssistant = [...prev]
          .reverse()
          .find((m) => m.role === "assistant" && !m.streaming);
        if (lastAssistant && lastAssistant.content === prose) {
          next = prev.filter((m) => !m.streaming);
        } else {
          next = [
            ...prev.filter((m) => !m.streaming),
            {
              id: createMessageId("asst"),
              role: "assistant",
              content: prose,
              createdAt: new Date().toISOString(),
            },
          ];
        }
      }

      streamMsgIdRef.current = null;
      rawDraftRef.current = "";
      finalizedTurnRef.current = true;
      commitMessages(next);
    },
    [commitMessages],
  );

  const load = useCallback(async () => {
    const p = await ensurePlayer();
    setPlayer(p);
    const view = await getSession(p, sessionId);
    setSession(view);

    const stored = loadTranscript(sessionId).filter(
      (m) => !isInternalPassageProse(m.content),
    );
    if (stored.length > 0) {
      messagesRef.current = stored;
      setMessages(stored);
      saveTranscript(sessionId, stored);
      lastPassageIdRef.current = view.passage?.id ?? null;
    } else if (
      view.passage?.prose &&
      !isInternalPassageProse(view.passage.prose)
    ) {
      const seed: ChatMessage = {
        id: createMessageId("open"),
        role: "assistant",
        content: view.passage.prose,
        createdAt: new Date().toISOString(),
      };
      messagesRef.current = [seed];
      setMessages([seed]);
      saveTranscript(sessionId, [seed]);
      lastPassageIdRef.current = view.passage.id;
    } else {
      messagesRef.current = [];
      setMessages([]);
    }
    setHydrated(true);
  }, [sessionId]);

  useEffect(() => {
    setHydrated(false);
    setMessages([]);
    messagesRef.current = [];
    rawDraftRef.current = "";
    setBusy(false);
    setError(null);
    setStageHint(null);
    streamMsgIdRef.current = null;
    lastPassageIdRef.current = null;
    finalizedTurnRef.current = false;
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  useEffect(() => {
    if (!player || !sessionId) return;

    const close = openSessionEvents(player, sessionId, (_eventName, payload) => {
      const data = payload as {
        type?: string;
        event?: {
          type: string;
          stage?: string;
          phase?: string;
          text?: string;
          taskType?: string;
          turnKind?: string;
          passage?: Passage;
          failure?: { message: string };
        };
      };

      if (data.type !== "engine" || !data.event) return;
      const ev = data.event;
      const playerFacingTurn = isPlayerTurnKind(ev.turnKind);

      if (ev.type === "turn.started") {
        if (!playerFacingTurn) return;
        setBusy(true);
        rawDraftRef.current = "";
        finalizedTurnRef.current = false;
        setError(null);
        setStageHint(COPY.stages.thinking);
        streamMsgIdRef.current = null;
      }

      if (ev.type === "turn.stage" && playerFacingTurn) {
        const label = stageLabel(ev.stage, ev.phase);
        if (label) setStageHint(label);
      }

      if (ev.type === "agent.task.started" && ev.taskType === NARRATIVE_TASK) {
        setStageHint(COPY.stages.writing);
      }

      if (
        ev.type === "llm.stream.delta" &&
        typeof ev.text === "string" &&
        (!ev.taskType || ev.taskType === NARRATIVE_TASK)
      ) {
        setBusy(true);
        appendStreamDelta(ev.text);
      }

      if (ev.type === "passage.published" && ev.passage) {
        if (!isInternalPassageProse(ev.passage.prose)) {
          finalizeAssistant(ev.passage.prose, ev.passage.id);
        }
      }

      if (ev.type === "turn.committed") {
        if (!playerFacingTurn) {
          void getSession(player, sessionId)
            .then((view) => setSession(view))
            .catch(() => undefined);
          return;
        }
        setBusy(false);
        setStageHint(null);
        void getSession(player, sessionId)
          .then((view) => {
            setSession(view);
            if (
              view.passage?.prose &&
              !isInternalPassageProse(view.passage.prose)
            ) {
              finalizeAssistant(view.passage.prose, view.passage.id);
            }
          })
          .catch(() => undefined);
      }

      if (ev.type === "turn.rejected") {
        if (!playerFacingTurn) return;
        rawDraftRef.current = "";
        finalizedTurnRef.current = true;
        setBusy(false);
        setStageHint(null);
        streamMsgIdRef.current = null;
        setError(ev.failure?.message ?? COPY.common.error);
        setMessages((prev) => {
          const next = prev.filter((m) => !m.streaming);
          messagesRef.current = next;
          return next;
        });
      }
    });

    return close;
  }, [player, sessionId, appendStreamDelta, finalizeAssistant]);

  const submit = useCallback(async () => {
    if (!player || !text.trim() || busy) return;
    const content = text.trim();
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setBusy(true);
    setError(null);
    rawDraftRef.current = "";
    finalizedTurnRef.current = false;
    setStageHint(COPY.stages.sending);
    streamMsgIdRef.current = null;

    const userMsg: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    commitMessages([
      ...messagesRef.current.filter((m) => !m.streaming),
      userMsg,
    ]);

    try {
      const result = await submitAction(
        player,
        sessionId,
        { text: content },
        false,
      );
      if ("status" in result && result.status === "committed") {
        if (!isInternalPassageProse(result.passage.prose)) {
          finalizeAssistant(result.passage.prose, result.passage.id);
        }
        setBusy(false);
        setStageHint(null);
      } else if ("status" in result && result.status === "rejected") {
        setError(result.failure.message);
        setBusy(false);
        setStageHint(null);
      }
    } catch (err) {
      setBusy(false);
      setStageHint(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inputRef.current?.focus();
    }
  }, [player, text, busy, sessionId, commitMessages, finalizeAssistant]);

  const save = useCallback(async () => {
    if (!player) return null;
    const saved = await saveSession(player, sessionId);
    return { revision: saved.revision };
  }, [player, sessionId]);

  const rename = useCallback(
    async (title: string) => {
      if (!player) return;
      const next = await renameSession(player, sessionId, title);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              title: next.title,
              updatedAt: next.updatedAt,
            }
          : prev,
      );
    },
    [player, sessionId],
  );

  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const focusMessage = useCallback((id: string) => {
    setHighlightId(id);
    window.setTimeout(() => setHighlightId(null), 1200);
    const el = document.getElementById(`turn-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const showTyping = busy && !messages.some((m) => m.streaming);

  return {
    session,
    messages,
    hydrated,
    busy,
    error,
    stageHint,
    text,
    setText,
    dialogueOpen,
    setDialogueOpen,
    highlightId,
    inputRef,
    submit,
    save,
    rename,
    onComposerKeyDown,
    focusMessage,
    clearError: () => setError(null),
    showTyping,
  };
}

function loadDialoguePref(): boolean | null {
  try {
    const raw = localStorage.getItem(DIALOGUE_PREFS_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}
