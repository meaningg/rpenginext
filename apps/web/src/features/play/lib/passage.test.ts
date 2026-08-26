import { describe, expect, test } from "bun:test";

import {
  isInternalPassageProse,
  isPlayerTurnKind,
  parseNarrativeBlocks,
  splitNarrativeParagraphs,
} from "./passage.ts";

describe("passage helpers", () => {
  test("detects internal markers", () => {
    expect(isInternalPassageProse("(system) sync")).toBe(true);
    expect(isInternalPassageProse("(restore) checkpoint")).toBe(true);
    expect(isInternalPassageProse("A quiet street.")).toBe(false);
  });

  test("player turn kinds", () => {
    expect(isPlayerTurnKind(undefined)).toBe(true);
    expect(isPlayerTurnKind("player")).toBe(true);
    expect(isPlayerTurnKind("system")).toBe(false);
  });

  test("splits paragraphs by blank lines", () => {
    expect(splitNarrativeParagraphs("One.\n\nTwo.")).toEqual(["One.", "Two."]);
  });

  test("splits before dialogue dashes after sentence end", () => {
    const input =
      "Ты киваешь. Ветер треплет плащ. — Я в таверну, — говорит он и шагает к двери.";
    const parts = splitNarrativeParagraphs(input);
    expect(parts.length).toBe(2);
    expect(parts[0]).toContain("плащ.");
    expect(parts[1]?.startsWith("—")).toBe(true);
  });

  test("soft-splits dense narration into sentence groups", () => {
    const input = [
      "Улица пустеет на глазах, будто кто-то выключил весь квартал разом.",
      "Фонари мигают жёлтым и оставляют на лужах рваные блики.",
      "Где-то лает собака, и эхо катается между мокрыми стенами дворов.",
      "Ты слышишь шаги за спиной, но не оборачиваешься сразу — рано.",
      "Воздух пахнет мокрым камнем, ржавчиной и дешёвым табаком.",
      "Вдалеке хлопает дверь, потом снова тишина, плотная и тяжёлая.",
    ].join(" ");
    expect(input.length).toBeGreaterThan(280);
    const parts = splitNarrativeParagraphs(input);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ")).toContain("табаком");
  });

  test("marks pure dialogue paragraphs as speech blocks", () => {
    const blocks = parseNarrativeBlocks("Ты входишь в зал.\n\n— Садись.");
    expect(blocks[0]?.role).toBe("narration");
    expect(blocks[1]?.role).toBe("speech");
    expect(blocks[1]?.spans.every((s) => s.kind === "speech")).toBe(true);
  });

  test("keeps mixed dialogue+narration blocks plain with speech spans", () => {
    const blocks = parseNarrativeBlocks(
      "— Садись, — бросает бармен. — Пиво ещё тёплое.",
    );
    // "бармен. — Пиво" splits the paragraph: attribution half stays plain,
    // the attribution-less dialogue line keeps the speech plaque.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]?.role).toBe("narration");
    expect(blocks[1]?.role).toBe("speech");
    const speech = blocks
      .flatMap((b) => b.spans)
      .filter((s) => s.kind === "speech")
      .map((s) => s.text);
    expect(speech).toEqual(["— Садись, —", "— Пиво ещё тёплое."]);
  });

  test("keeps guillemet dialogue with inner dashes intact", () => {
    const blocks = parseNarrativeBlocks(
      "«Ты часто здесь бываешь? — спросил он. — Лицо знакомое». Мию хихикнула.",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.role).toBe("narration");
    const speech = blocks[0]?.spans.find((s) => s.kind === "speech");
    expect(speech?.text).toBe(
      "«Ты часто здесь бываешь? — спросил он. — Лицо знакомое»",
    );
  });

  test("highlights dash run and leaves trailing narration plain", () => {
    const blocks = parseNarrativeBlocks(
      "Она махнула рукой. — Это лейтенант Кейл с «Исполнителя», а это Лира, она только что вернулась с Набу». Лейтенант кивнул тебе.",
    );
    expect(blocks[0]?.role).toBe("narration");
    const spans = blocks.flatMap((b) => b.spans);
    const speech = spans.filter((s) => s.kind === "speech").map((s) => s.text);
    expect(speech).toEqual([
      "— Это лейтенант Кейл с «Исполнителя», а это Лира, она только что вернулась с Набу»",
    ]);
    const tail = spans
      .filter((s) => s.kind === "text")
      .map((s) => s.text)
      .join("");
    expect(tail).toContain("Лейтенант кивнул тебе.");
  });

  test("keeps parenthetical dashes as plain narration", () => {
    const blocks = parseNarrativeBlocks(
      "Несколько посетителей — в основном контрабандисты — поднимают головы.",
    );
    expect(blocks[0]?.role).toBe("narration");
    expect(blocks[0]?.spans.every((s) => s.kind === "text")).toBe(true);
  });

  test("keeps attribution after guillemet plain", () => {
    const blocks = parseNarrativeBlocks("«Конечно», — ответила она.");
    expect(blocks[0]?.role).toBe("narration");
    expect(blocks[0]?.spans.map((s) => s.kind)).toEqual(["speech", "text"]);
  });

  test("highlights guillemet speech inside narration", () => {
    const blocks = parseNarrativeBlocks(
      'Он пожал плечами: «Дела сами себя не сделают». Потом ушёл.',
    );
    expect(blocks).toHaveLength(1);
    const kinds = blocks[0]?.spans.map((s) => s.kind) ?? [];
    expect(kinds).toContain("speech");
    const speech = blocks[0]?.spans.find((s) => s.kind === "speech");
    expect(speech?.text).toBe("«Дела сами себя не сделают»");
  });

  test("highlights emphasis markers", () => {
    const blocks = parseNarrativeBlocks("Ты думаешь: *это ловушка*.");
    const emphasis = blocks[0]?.spans.find((s) => s.kind === "emphasis");
    expect(emphasis?.text).toBe("это ловушка");
  });
});
