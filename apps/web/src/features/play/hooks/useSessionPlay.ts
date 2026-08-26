import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { ensurePlayer } from "../../../entities/player/api.ts";
import type { PlayerCredentials } from "../../../entities/player/model.ts";
import {
  getSession,
  renameSession,
  saveSession,
} from "../../../entities/session/api.ts";
import type { SessionView } from "../../../entities/session/model.ts";
import {
  openSessionEvents,
  submitAction,
} from "../../../entities/turn/api.ts";
import type { Passage } from "../../../entities/turn/model.ts";
import { stageLabel, COPY } from "../../../shared/config/copy.ts";
import {
  createMessageId,
  loadTranscript,
  saveTranscript,
  type ChatMessage,
} from "../../../shared/lib/chat-transcript.ts";
import { toUserMessage } from "../../../shared/lib/errors.ts";
import { extractStreamingProse } from "../../../shared/lib/extract-streaming-prose.ts";
import { isEnterKey } from "../../../shared/lib/hotkeys.ts";
import {
  isInternalPassageProse,
  isPlayerTurnKind,
} from "../lib/passage.ts";

const NARRATIVE_TASK = "narrative.write";
/** localStorage key: right play inspector visibility (legacy name kept for compat). */
const INSPECTOR_PREFS_KEY = "rp.ui.dialogueOpen";
const WIDE_MQ = "(min-width: 1280px)";
/** Soft stall hint when a turn stays busy without stream progress. */
const STALL_MS = 18_000;

import type { InspectorTab } from "../ui/PlayInspector.tsx";

export interface UseSessionPlayResult {
  readonly session: SessionView | null;
  readonly messages: ChatMessage[];
  readonly hydrated: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly stageHint: string | null;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly panelOpen: boolean;
  readonly panelTab: InspectorTab;
  readonly setPanelTab: (tab: InspectorTab) => void;
  readonly openPanel: (tab: InspectorTab) => void;
  readonly closePanel: () => void;
  readonly highlightId: string | null;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly submit: () => Promise<void>;
  readonly save: () => Promise<{ revision: number } | null>;
  readonly rename: (title: string) => Promise<void>;
  readonly onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly focusMessage: (id: string) => void;
  readonly focusComposer: () => void;
  readonly applyExample: (example: string) => void;
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
  const [panelOpen, setPanelOpenState] = useState(false);
  const [panelTab, setPanelTabState] = useState<InspectorTab>("dialogue");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const lastPassageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const rawDraftRef = useRef("");
  const finalizedTurnRef = useRef(false);
  const pendingUserIdRef = useRef<string | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const wide =
      typeof window !== "undefined" && window.matchMedia(WIDE_MQ).matches;
    const stored = loadInspectorPref();
    setPanelOpenState(stored ?? wide);
  }, []);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current != null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const armStallTimer = useCallback(() => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      setStageHint((prev) => prev ?? COPY.play.stillWorking);
    }, STALL_MS);
  }, [clearStallTimer]);

  useEffect(() => () => clearStallTimer(), [clearStallTimer]);

  const persistPanelOpen = useCallback((open: boolean) => {
    try {
      localStorage.setItem(INSPECTOR_PREFS_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setPanelOpen = useCallback(
    (open: boolean) => {
      setPanelOpenState(open);
      persistPanelOpen(open);
    },
    [persistPanelOpen],
  );

  const openPanel = useCallback(
    (tab: InspectorTab) => {
      setPanelTabState(tab);
      setPanelOpenState(true);
      persistPanelOpen(true);
    },
    [persistPanelOpen],
  );

  const closePanel = useCallback(() => {
    setPanelOpenState(false);
    persistPanelOpen(false);
  }, [persistPanelOpen]);

  const resizeComposer = useCallback((value: string) => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (value) {
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }, []);

  const restoreComposer = useCallback(
    (value: string) => {
      setText(value);
      requestAnimationFrame(() => {
        resizeComposer(value);
        inputRef.current?.focus();
        const el = inputRef.current;
        if (el) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    },
    [resizeComposer],
  );

  /**
   * Reject path: drop streaming draft, remove pending user bubble, restore text.
   */
  const rejectPendingTurn = useCallback(
    (message: string) => {
      clearStallTimer();
      rawDraftRef.current = "";
      finalizedTurnRef.current = true;
      streamMsgIdRef.current = null;
      setBusy(false);
      setStageHint(null);
      setError(message);

      const pendingId = pendingUserIdRef.current;
      const pendingText = pendingTextRef.current;
      pendingUserIdRef.current = null;
      pendingTextRef.current = null;

      setMessages((prev) => {
        const next = prev.filter(
          (m) => !m.streaming && m.id !== pendingId,
        );
        messagesRef.current = next;
        if (sessionId) saveTranscript(sessionId, next);
        return next;
      });

      if (pendingText) {
        restoreComposer(pendingText);
      } else {
        inputRef.current?.focus();
      }
    },
    [clearStallTimer, restoreComposer, sessionId],
  );

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
        armStallTimer();
        upsertStreamingAssistant(prose);
      }
    },
    [armStallTimer, upsertStreamingAssistant],
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
      pendingUserIdRef.current = null;
      pendingTextRef.current = null;
      clearStallTimer();
      commitMessages(next);
    },
    [clearStallTimer, commitMessages],
  );

  const load = useCallback(async () => {
    try {
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
      setError(null);
    } catch (err) {
      setError(toUserMessage(err));
      setHydrated(true);
    }
  }, [sessionId]);

  useEffect(() => {
    setHydrated(false);
    setMessages([]);
    messagesRef.current = [];
    rawDraftRef.current = "";
    setBusy(false);
    setError(null);
    setStageHint(null);
    setText("");
    streamMsgIdRef.current = null;
    lastPassageIdRef.current = null;
    finalizedTurnRef.current = false;
    pendingUserIdRef.current = null;
    pendingTextRef.current = null;
    clearStallTimer();
    void load();
  }, [load, clearStallTimer]);

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
        armStallTimer();
      }

      if (ev.type === "turn.stage" && playerFacingTurn) {
        const label = stageLabel(ev.stage, ev.phase);
        if (label) {
          setStageHint(label);
          armStallTimer();
        }
      }

      if (ev.type === "agent.task.started" && ev.taskType === NARRATIVE_TASK) {
        setStageHint(COPY.stages.writing);
        armStallTimer();
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
        clearStallTimer();
        setBusy(false);
        setStageHint(null);
        pendingUserIdRef.current = null;
        pendingTextRef.current = null;
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
        const detail = ev.failure?.message?.trim();
        rejectPendingTurn(
          detail
            ? `${COPY.play.rejected} ${detail}`
            : COPY.play.rejected,
        );
      }
    });

    return close;
  }, [
    player,
    sessionId,
    appendStreamDelta,
    finalizeAssistant,
    armStallTimer,
    clearStallTimer,
    rejectPendingTurn,
  ]);

  const submit = useCallback(async () => {
    if (!player || !text.trim() || busy) return;
    const content = text.trim();
    setText("");
    resizeComposer("");
    setBusy(true);
    setError(null);
    rawDraftRef.current = "";
    finalizedTurnRef.current = false;
    setStageHint(COPY.stages.sending);
    streamMsgIdRef.current = null;
    armStallTimer();

    const userMsg: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    pendingUserIdRef.current = userMsg.id;
    pendingTextRef.current = content;
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
        clearStallTimer();
        setBusy(false);
        setStageHint(null);
        pendingUserIdRef.current = null;
        pendingTextRef.current = null;
      } else if ("status" in result && result.status === "rejected") {
        const detail = result.failure.message?.trim();
        rejectPendingTurn(
          detail
            ? `${COPY.play.rejected} ${detail}`
            : COPY.play.rejected,
        );
      }
    } catch (err) {
      rejectPendingTurn(toUserMessage(err));
    } finally {
      inputRef.current?.focus();
    }
  }, [
    player,
    text,
    busy,
    sessionId,
    commitMessages,
    finalizeAssistant,
    armStallTimer,
    clearStallTimer,
    rejectPendingTurn,
    resizeComposer,
  ]);

  const save = useCallback(async () => {
    if (!player) return null;
    try {
      const saved = await saveSession(player, sessionId);
      return { revision: saved.revision };
    } catch (err) {
      throw new Error(toUserMessage(err));
    }
  }, [player, sessionId]);

  const rename = useCallback(
    async (title: string) => {
      if (!player) return;
      try {
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
      } catch (err) {
        throw new Error(toUserMessage(err));
      }
    },
    [player, sessionId],
  );

  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const isMod = event.metaKey || event.ctrlKey;
      // Use physical Enter (code) so numpad / any layout behaves the same.
      if (isEnterKey(event) && (isMod || !event.shiftKey)) {
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

  const focusComposer = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const applyExample = useCallback(
    (example: string) => {
      if (busy) return;
      restoreComposer(example);
    },
    [busy, restoreComposer],
  );

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
    panelOpen,
    panelTab,
    setPanelTab: setPanelTabState,
    openPanel,
    closePanel,
    highlightId,
    inputRef,
    submit,
    save,
    rename,
    onComposerKeyDown,
    focusMessage,
    focusComposer,
    applyExample,
    clearError: () => setError(null),
    showTyping,
  };
}

function loadInspectorPref(): boolean | null {
  try {
    const raw = localStorage.getItem(INSPECTOR_PREFS_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}
