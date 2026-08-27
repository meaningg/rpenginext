import type { AgentTask, LlmMessage } from "@rpengineext/contracts";

import { TOOL_IDS } from "./constants.ts";
import { ProbeInputSchema, type ProbeInput } from "./schema.ts";

/**
 * Builds LLM messages for the scene probe task.
 *
 * The probe is the single judge of scene state: continuation, progress,
 * stall, recycling severity and conclusion need. The prompt is deliberately
 * outcome-neutral: it never pushes toward conflict, enemies or chases, and
 * instructs the model to escalate urgency only from observed repetition.
 *
 * @param task - agent task (input carries the probe payload)
 */
export function buildProbeMessages(task: AgentTask): readonly LlmMessage[] {
  const parsed = ProbeInputSchema.safeParse(task.input);
  const input: ProbeInput = parsed.success
    ? parsed.data
    : {
        userText: String(task.input?.userText ?? ""),
        prose: String(task.input?.prose ?? ""),
        currentScene: null,
        history: [],
      };

  const system = [
    "You are the SCENE DIRECTOR for a turn-based interactive fiction engine. Your only job: judge the STATE OF THE CURRENT SCENE from the evidence (recent player actions and narrative prose) and report it via the report_scene tool.",
    "",
    "SCENE TYPES (all equally valid — pick what the evidence actually is, never force a genre):",
    "social, exploration, confrontation, negotiation, mystery, travel, preparation, downtime, ceremony, discovery, conflict, other.",
    "",
    "Judgment rules:",
    "- sameScene: true only if the latest turn continues the scene described in currentScene. If currentScene is null, sameScene must be false. sameScene: false ONLY when a genuinely new scene began (new location, participants or goal) — a new beat of the same scene (escalation, twist, approach, or a change of pose/sub-step within the same engagement) is NOT a scene change.",
    "- Scene ids are assigned by the ENGINE; never invent scene ids — there is no sceneId field in the tool.",
    "- progress (0..1): how close the scene is to a natural conclusion (0 = just started, 1 = concluded). If progress is already >= 0.9, prefer concluding the scene within 1-2 turns rather than extending it; as soon as a definitive outcome happens, report resolved: true.",
    "- stall: true if the world outcome repeats an already-played beat (the same threat recurs, the same obstacle re-blocks progress, the situation is unchanged).",
    "- repeat: true if the player action re-attempts the previous beat.",
    "- loop (none|soft|hard): recycling severity. soft = a beat repeated once or twice; hard = several turns of recycling with no progress.",
    "- urgency (0|1|2|3): 0 = fine; 1 = approaching peak; 2 = the scene is exhausted, conclude within 1-2 turns; 3 = the scene has been recycling for several turns, conclusion is MANDATORY on the next turn. Escalate ONLY from actual repetition of beats/outcomes — never from the scene's genre, tone or your taste.",
    "- resolved: true only if the latest turn actually concluded the scene with a definitive outcome.",
    "- resolutionHint: provide ONLY when the scene calls for conclusion (urgency >= 2) AND you see a natural way to end THIS scene in its actual context. Never invent conflict, enemies or chases; neutral examples: a conversation reaches an agreement, a locked door turns out to have a key nearby, the road ends at a fork. If nothing natural, null.",
    "- Trust the evidence, not guesses: never report transitions or resolutions that did not happen.",
    "",
    `Call the tool ${TOOL_IDS.reportScene} ONCE with your full verdict, then output JSON: {"reported": true}.`,
    "No narration text, no commentary.",
  ].join("\n");

  const user = {
    taskType: "scene_controller.probe",
    userText: input.userText,
    prose: input.prose,
    currentScene: input.currentScene,
    history: input.history,
  };

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user, null, 2) },
  ];
}