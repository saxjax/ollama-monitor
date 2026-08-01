import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCopilotCapture } from "./copilot-capture.mjs";

test("captures only new Copilot CLI turns and clears its private local copy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "copilot-capture-"));
  const dataDir = path.join(root, "data");
  const sessionsRoot = path.join(root, "sessions");
  const sessionDir = path.join(sessionsRoot, "session-1");
  const eventsPath = path.join(sessionDir, "events.jsonl");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(eventsPath, `${JSON.stringify({ type: "user.message", id: "old", timestamp: "2026-01-01T00:00:00Z", data: { content: "old", interactionId: "old-i" } })}\n`);

  const changes = [];
  const capture = await createCopilotCapture({ dataDir, sessionsRoot, vscodeRoots: [], pollMs: 60_000, onChange: (...args) => changes.push(args) });
  assert.deepEqual(capture.snapshot(), { active: [], history: [] });

  const events = [
    { type: "system.message", id: "sys1", timestamp: "2026-01-02T00:00:00Z", data: { role: "system", content: "exact CLI system and tool context", interactionId: "i1" } },
    { type: "user.message", id: "u1", timestamp: "2026-01-02T00:00:00Z", data: { content: "full prompt", transformedContent: "exact transformed CLI user input", interactionId: "i1" } },
    { type: "assistant.turn_start", id: "s1", timestamp: "2026-01-02T00:00:01Z", data: { interactionId: "i1", model: "gpt-test" } },
    { type: "tool.execution_start", id: "t1", timestamp: "2026-01-02T00:00:02Z", data: { interactionId: "i1", toolCallId: "tool-1", toolName: "shell", arguments: { command: "pwd" } } },
    { type: "tool.execution_complete", id: "t2", timestamp: "2026-01-02T00:00:03Z", data: { interactionId: "i1", toolCallId: "tool-1", success: true, result: "/tmp" } },
    { type: "assistant.message", id: "a1", timestamp: "2026-01-02T00:00:04Z", data: { interactionId: "i1", content: "full response", reasoningText: "reasoning", outputTokens: 12, model: "gpt-test" } },
    { type: "assistant.turn_end", id: "e1", timestamp: "2026-01-02T00:00:05Z", data: { interactionId: "i1" } },
    { type: "assistant.turn_start", id: "s2", timestamp: "2026-01-02T00:00:06Z", data: { interactionId: "i1", turnId: "2", model: "gpt-test" } },
    { type: "assistant.message", id: "a2", timestamp: "2026-01-02T00:00:07Z", data: { interactionId: "i1", content: "second agent round", outputTokens: 16, model: "gpt-test" } },
    { type: "assistant.turn_end", id: "e2", timestamp: "2026-01-02T00:00:08Z", data: { interactionId: "i1", turnId: "2" } },
    { type: "system.message", id: "sys2", timestamp: "2026-01-02T00:01:00Z", data: { role: "system", content: "exact next-turn system context", interactionId: "i2" } },
    { type: "user.message", id: "u2", timestamp: "2026-01-02T00:01:01Z", data: { content: "continue", transformedContent: "exact transformed continuation", interactionId: "i2" } },
  ];
  await writeFile(eventsPath, `${await readFile(eventsPath, "utf8")}${events.map(JSON.stringify).join("\n")}\n`);
  await capture.poll();

  const item = capture.snapshot().history[0];
  assert.match(item.prompt, /old/);
  assert.match(item.prompt, /exact CLI system and tool context/);
  assert.match(item.prompt, /exact transformed CLI user input/);
  assert.equal(item.submittedPrompt, "full prompt");
  assert.equal(item.inputContextStatus, "reconstructed");
  assert.equal(item.inputContext.system.content, "exact CLI system and tool context");
  const continued = capture.snapshot().active[0];
  assert.match(continued.prompt, /full prompt/);
  assert.match(continued.prompt, /full response/);
  assert.match(continued.prompt, /second agent round/);
  assert.match(continued.prompt, /TOOL shell/);
  assert.match(continued.prompt, /exact transformed continuation/);
  assert.match(item.response, /full response/);
  assert.match(item.response, /TOOL shell · INPUT/);
  assert.match(item.response, /\/tmp/);
  assert.equal(item.thinking, "reasoning");
  assert.equal(item.model, "gpt-test");
  assert.equal(item.status, "complete");
  assert.equal(changes[0][0], "started");
  assert.equal((await stat(capture.logPath)).mode & 0o777, 0o600);

  await capture.clear();
  assert.deepEqual(capture.snapshot(), { active: [], history: [] });
  await assert.rejects(stat(capture.logPath), { code: "ENOENT" });
  capture.close();
});

for (const edition of ["vscode", "vscode-insiders"]) {
  test(`captures full new ${edition} Copilot chat journals`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), `${edition}-capture-`));
    const dataDir = path.join(root, "data");
    const workspaceRoot = path.join(root, "workspaceStorage");
    const chatDir = path.join(workspaceRoot, "workspace-1", "chatSessions");
    const journal = path.join(chatDir, "chat-1.jsonl");
    await mkdir(chatDir, { recursive: true });
    await writeFile(journal, `${JSON.stringify({ kind: 0, v: {
      sessionId: "chat-1",
      requests: [],
      inputState: { selectedModel: { identifier: "copilot-test", metadata: { maxInputTokens: 128_000 } } },
    } })}\n`);

    const capture = await createCopilotCapture({
      dataDir,
      sessionsRoot: path.join(root, "missing-cli"),
      vscodeRoots: [{ edition, root: workspaceRoot }],
      pollMs: 60_000,
    });
    const request = {
      requestId: "request-1",
      timestamp: Date.now() + 10,
      modelId: "copilot-test",
      message: { text: "complete editor prompt" },
      variableData: { variables: [{ name: "selection", value: "full selected context" }] },
      response: [],
      modelState: { value: 1 },
    };
    await appendFile(journal, `${JSON.stringify({ kind: 2, k: ["requests"], v: [request] })}\n`);
    await capture.poll();
    assert.equal(capture.snapshot().active[0].prompt.includes("full selected context"), true);
    assert.equal(capture.snapshot().active[0].source, edition);

    await appendFile(journal, [
      { kind: 2, k: ["requests", 0, "response"], v: [
        { value: "complete editor response" },
        { kind: "thinking", value: "editor reasoning" },
        { kind: "toolInvocationSerialized", toolCallId: "tool-1", toolId: "terminal", invocationMessage: "run tests", resultDetails: "tests passed", isComplete: true },
      ] },
      { kind: 1, k: ["requests", 0, "promptTokens"], v: 42 },
      { kind: 1, k: ["requests", 0, "completionTokens"], v: 17 },
      { kind: 1, k: ["requests", 0, "elapsedMs"], v: 5000 },
      { kind: 1, k: ["requests", 0, "result"], v: { metadata: {
        promptTokens: 42,
        outputTokens: 17,
        renderedGlobalContext: [{ type: "system", text: "exact system context" }],
        renderedUserMessage: [{ type: "user", text: "exact rendered user input" }],
      } } },
      { kind: 1, k: ["requests", 0, "modelState"], v: { value: 2, completedAt: Date.parse("2026-02-01T10:00:05Z") } },
    ].map(JSON.stringify).join("\n") + "\n");
    await capture.poll();

    const item = capture.snapshot().history[0];
    assert.equal(item.response.includes("complete editor response"), true);
    assert.equal(item.response.includes("tests passed"), true);
    assert.equal(item.thinking, "editor reasoning");
    assert.equal(item.metrics.promptTokens, 42);
    assert.equal(item.metrics.outputTokens, 17);
    assert.equal(item.metrics.contextWindow, 128_000);
    assert.equal(item.metrics.totalDurationNs, 5_000_000_000);
    assert.equal(item.inputContextStatus, "client-rendered");
    assert.match(item.prompt, /exact system context/);
    assert.match(item.prompt, /exact rendered user input/);
    assert.equal(item.inputContext.global[0].text, "exact system context");
    assert.equal(item.status, "complete");
    capture.close();
  });
}
