import assert from "node:assert/strict";
import vm from "node:vm";
import {
  CONTENT_ENGINE_APP_PROTOCOL_VERSION,
  contentEngineAppResource,
} from "../../../convex/mcp/appResource";

type MessageListener = (event: { data: unknown; source: unknown }) => void;

class FakeElement {
  className = "";
  hidden = false;
  innerHTML = "";
  textContent = "";

  querySelectorAll() {
    return [];
  }
}

const resource = contentEngineAppResource();
const html = resource.contents[0].text;
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Content Engine app resource must contain an executable script");

const elements = new Map<string, FakeElement>();
const element = (id: string) => {
  const current = elements.get(id) ?? new FakeElement();
  elements.set(id, current);
  return current;
};
const listeners: MessageListener[] = [];
const sentMessages: Array<Record<string, unknown>> = [];
let dispatchMessage: (data: unknown) => void = () => undefined;
const parent = {
  postMessage(message: Record<string, unknown>) {
    sentMessages.push(message);
    if (message.method === "ui/initialize") {
      queueMicrotask(() => dispatchMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          hostCapabilities: { serverTools: {} },
          hostContext: { theme: "dark" },
          hostInfo: { name: "codex-test-host", version: "1.0.0" },
          protocolVersion: CONTENT_ENGINE_APP_PROTOCOL_VERSION,
        },
      }));
    }
    if (message.method === "ui/notifications/initialized") {
      queueMicrotask(() => {
        dispatchMessage({
          jsonrpc: "2.0",
          method: "ui/notifications/tool-input",
          params: { arguments: { threadId: "thread-sara" } },
        });
        dispatchMessage({
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: {
            content: [{ type: "text", text: "Content Engine run completed." }],
            structuredContent: {
              run: {
                id: "thread-sara",
                state: "completed",
                title: "Sara Fitness review draft",
              },
              commands: [{ id: "command-1", status: "succeeded" }],
              artifacts: [{
                id: "artifact-1",
                type: "scene_spec",
                title: "Things that made the gym less awkward",
                data: { text: "things that made the gym feel way less awkward" },
                contentEngineUrl: "http://localhost:5173/library?artifactId=artifact-1",
              }],
            },
          },
        });
      });
    }
  },
};
const windowObject = {
  addEventListener(type: string, listener: MessageListener) {
    if (type === "message") listeners.push(listener);
  },
  openai: undefined,
  parent,
};
dispatchMessage = (data) => {
  for (const listener of listeners) listener({ data, source: parent });
};

vm.runInNewContext(script, {
  URL,
  clearTimeout: () => undefined,
  console,
  document: { getElementById: element },
  setTimeout: () => 1,
  window: windowObject,
});

await new Promise<void>((resolve) => setImmediate(resolve));
await new Promise<void>((resolve) => setImmediate(resolve));

const initialize = sentMessages.find((message) => message.method === "ui/initialize");
assert.ok(initialize, "App must initialize the MCP Apps bridge");
assert.deepEqual(JSON.parse(JSON.stringify(initialize.params)), {
  protocolVersion: CONTENT_ENGINE_APP_PROTOCOL_VERSION,
  appInfo: { name: "content-engine-run", version: "1.0.0" },
  appCapabilities: {},
});
assert.ok(
  sentMessages.some((message) => message.method === "ui/notifications/initialized"),
  "App must notify the host after initialization"
);
assert.equal(element("title").textContent, "Sara Fitness review draft");
assert.match(element("status").innerHTML, /completed/);
assert.match(element("stage").innerHTML, /things that made the gym feel way less awkward/);
assert.match(element("stage").innerHTML, /document-text/);
assert.equal(element("count").textContent, "1 artifact");

console.log("MCP app bridge delivered and rendered a text artifact.");
