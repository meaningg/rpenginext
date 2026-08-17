import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Link, useParams } from "react-router-dom";

import {
  createMessageId,
  loadTranscript,
  saveTranscript,
  type ChatMessage,
} from "../../shared/lib/chat-transcript.ts";
import { extractStreamingProse } from "../../shared/lib/extract-streaming-prose.ts";
import {
  ensurePlayer,
  getSession,
  openSessionEvents,
  saveSession,
  submitAction,
  type Passage,
  type PlayerCredentials,
  type SessionView,
} from "../../shared/api/client.ts";

const NARRATIVE_TASK = "narrative.write";

/**
 * Chat-style play surface with SSE narrative streaming (prose-only draft).
 */
export function SessionPage() {
  const { sessionId = "" } = useParams();
  const [player, setPlayer] = useState<PlayerCredentials | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [stageHint, setStageHint] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const lastPassageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const rawDraftRef = useRef("");
  const finalizedTurnRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

    const stored = loadTranscript(sessionId);
    if (stored.length > 0) {
      messagesRef.current = stored;
      setMessages(stored);
      lastPassageIdRef.current = view.passage?.id ?? null;
    } else if (view.passage?.prose) {
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
          passage?: Passage;
          failure?: { message: string };
        };
      };

      if (data.type !== "engine" || !data.event) return;
      const ev = data.event;

      if (ev.type === "turn.started") {
        setBusy(true);
        rawDraftRef.current = "";
        finalizedTurnRef.current = false;
        setError(null);
        setStageHint("Thinking…");
        streamMsgIdRef.current = null;
      }

      if (ev.type === "turn.stage") {
        const label = humanStage(ev.stage, ev.phase);
        if (label) setStageHint(label);
      }

      if (ev.type === "agent.task.started" && ev.taskType === NARRATIVE_TASK) {
        setStageHint("Writing…");
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
        finalizeAssistant(ev.passage.prose, ev.passage.id);
      }

      if (ev.type === "turn.committed") {
        setBusy(false);
        setStageHint(null);
        void getSession(player, sessionId)
          .then((view) => {
            setSession(view);
            if (view.passage?.prose) {
              finalizeAssistant(view.passage.prose, view.passage.id);
            }
          })
          .catch(() => undefined);
      }

      if (ev.type === "turn.rejected") {
        rawDraftRef.current = "";
        finalizedTurnRef.current = true;
        setBusy(false);
        setStageHint(null);
        streamMsgIdRef.current = null;
        setError(ev.failure?.message ?? "Turn rejected");
        setMessages((prev) => {
          const next = prev.filter((m) => !m.streaming);
          messagesRef.current = next;
          return next;
        });
      }
    });

    return close;
  }, [player, sessionId, appendStreamDelta, finalizeAssistant]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, stageHint]);

  const onSubmitText = async () => {
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
    setStageHint("Sending…");
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
        finalizeAssistant(result.passage.prose, result.passage.id);
        setBusy(false);
        setStageHint(null);
      } else if ("status" in result && result.status === "rejected") {
        setError(result.failure.message);
        setBusy(false);
        setStageHint(null);
      }
      // async 202: SSE finishes the turn
    } catch (err) {
      setBusy(false);
      setStageHint(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inputRef.current?.focus();
    }
  };

  const onSave = async () => {
    if (!player) return;
    try {
      const saved = await saveSession(player, sessionId);
      setStatus(`Saved · rev ${saved.revision}`);
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSubmitText();
    }
  };

  const showTyping = busy && !messages.some((m) => m.streaming);

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[28rem] flex-col">
      <header className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Link to="/sessions" className="hover:text-violet-300">
              Sessions
            </Link>
            <span aria-hidden>·</span>
            <span className="truncate font-mono text-[11px] text-zinc-600">
              {sessionId}
            </span>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-50">
            {session?.title ?? "Session"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status ? (
            <span className="hidden text-xs text-emerald-400/90 sm:inline">
              {status}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void onSave()}
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-zinc-200 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white"
          >
            Save
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_80px_-32px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <div
          ref={scrollerRef}
          className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5"
        >
          {!hydrated ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Loading story…
            </p>
          ) : messages.length === 0 && !showTyping ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-zinc-400">The page is blank.</p>
              <p className="text-xs text-zinc-600">
                Type an action below to begin.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))
          )}

          {showTyping ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-white/8 bg-zinc-900/90 px-4 py-3 text-sm text-zinc-400 shadow-lg shadow-black/20">
                <span className="mr-2 inline-flex gap-1 align-middle">
                  <span className="typing-dot" />
                  <span className="typing-dot animation-delay-150" />
                  <span className="typing-dot animation-delay-300" />
                </span>
                {stageHint ?? "Writing the next moment…"}
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/8 bg-zinc-950/80 p-3 backdrop-blur-md sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 p-2 shadow-inner shadow-black/30 focus-within:border-violet-400/40 focus-within:ring-2 focus-within:ring-violet-500/20">
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
              }}
              onKeyDown={onComposerKeyDown}
              disabled={busy || !hydrated}
              placeholder="What do you do?"
              className="max-h-36 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || !text.trim() || !hydrated}
              onClick={() => void onSubmitText()}
              className="mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
              aria-label="Send action"
            >
              <SendIcon />
            </button>
          </div>
          <p className="mt-2 px-1 text-[11px] text-zinc-600">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { readonly message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-lg shadow-violet-950/40">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[min(100%,42rem)] rounded-2xl rounded-bl-md border border-white/8 bg-zinc-900/90 px-4 py-3 shadow-lg shadow-black/25">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-violet-300/70">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400/80" />
          Narrator
          {message.streaming ? (
            <span className="normal-case tracking-normal text-zinc-500">
              streaming
            </span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap font-serif text-[16px] leading-8 text-zinc-100">
          {message.content}
          {message.streaming ? (
            <span className="ml-0.5 inline-block h-[1.05em] w-0.5 animate-pulse bg-violet-300 align-[-0.15em]" />
          ) : null}
        </p>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.5 12h15m0 0-6.75-6.75M19.5 12l-6.75 6.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function humanStage(stage?: string, phase?: string): string | null {
  if (!stage || phase === "finished") return null;
  const map: Record<string, string> = {
    normalize: "Reading your action…",
    intent: "Interpreting intent…",
    guard: "Checking rules…",
    plan: "Planning…",
    propose: "World updates…",
    validate: "Validating…",
    narrate: "Writing…",
    present: "Composing page…",
    commit: "Saving turn…",
  };
  return map[stage] ?? stage;
}
