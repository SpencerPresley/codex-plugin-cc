import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createBrokerEndpoint, parseBrokerEndpoint } from "../plugins/codex/scripts/lib/broker-endpoint.mjs";
import { isBrokerSessionUsable, loadBrokerSession } from "../plugins/codex/scripts/lib/broker-lifecycle.mjs";
import { resolveStateDir } from "../plugins/codex/scripts/lib/state.mjs";

test("createBrokerEndpoint uses Unix sockets on non-Windows platforms", () => {
  const endpoint = createBrokerEndpoint("/tmp/cxc-12345", "darwin");
  assert.equal(endpoint, "unix:/tmp/cxc-12345/broker.sock");
  assert.deepEqual(parseBrokerEndpoint(endpoint), {
    kind: "unix",
    path: "/tmp/cxc-12345/broker.sock"
  });
});

test("createBrokerEndpoint uses named pipes on Windows", () => {
  const endpoint = createBrokerEndpoint("C:\\\\Temp\\\\cxc-12345", "win32");
  assert.equal(endpoint, "pipe:\\\\.\\pipe\\cxc-12345-codex-app-server");
  assert.deepEqual(parseBrokerEndpoint(endpoint), {
    kind: "pipe",
    path: "\\\\.\\pipe\\cxc-12345-codex-app-server"
  });
});

test("isBrokerSessionUsable rejects a record whose process is gone", () => {
  const session = { pid: 4242, endpoint: "unix:/tmp/cxc-gone/broker.sock" };
  const usable = isBrokerSessionUsable(session, {
    signalImpl: () => {
      const error = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    },
    existsImpl: () => true
  });
  assert.equal(usable, false);
});

test("isBrokerSessionUsable rejects a live pid whose socket is gone", () => {
  // The pid was recycled by an unrelated process, so the signal succeeds while
  // nothing is listening.
  const session = { pid: 4242, endpoint: "unix:/tmp/cxc-gone/broker.sock" };
  assert.equal(
    isBrokerSessionUsable(session, { signalImpl: () => {}, existsImpl: () => false }),
    false
  );
});

test("isBrokerSessionUsable keeps a record it cannot disprove", () => {
  const session = { pid: 4242, endpoint: "unix:/tmp/cxc-live/broker.sock" };
  assert.equal(
    isBrokerSessionUsable(session, { signalImpl: () => {}, existsImpl: () => true }),
    true
  );
  // EPERM means the pid exists but is owned by someone else — not death.
  assert.equal(
    isBrokerSessionUsable(session, {
      signalImpl: () => {
        const error = new Error("operation not permitted");
        error.code = "EPERM";
        throw error;
      },
      existsImpl: () => true
    }),
    true
  );
});

test("loadBrokerSession deletes a stale record instead of reporting it", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cxc-load-"));
  const stateDir = resolveStateDir(workspace);
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, "broker.json");
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ pid: 4242, endpoint: "unix:/tmp/cxc-gone/broker.sock" })
  );

  const loaded = loadBrokerSession(workspace, {
    signalImpl: () => {
      const error = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    },
    existsImpl: () => false
  });

  assert.equal(loaded, null);
  assert.equal(fs.existsSync(stateFile), false, "a stale record should be cleared, not left to fail again");
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});
