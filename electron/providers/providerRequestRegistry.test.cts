import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { requestHttpJson } from "./httpJson.cjs";
import {
  activeProviderRequestCount,
  beginProviderRequest,
  cancelActiveProviderRequests,
  endProviderRequest,
  enterProviderRequestScope,
  leaveProviderRequestScope,
} from "./providerRequestRegistry.cjs";

describe("providerRequestRegistry", () => {
  it("cancels an in-flight HTTP provider request on explicit user cancel", async () => {
    const server = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }, 5_000);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/cancel-me`;
    const payload = JSON.stringify({ ping: "pong" });

    const inflight = requestHttpJson(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      },
      10_000,
      { attempt: 1, requestId: "cancel-test-1" },
    );
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(activeProviderRequestCount() >= 1);
    const cancelled = cancelActiveProviderRequests("user_cancel");
    assert.ok(cancelled >= 1);
    await assert.rejects(inflight, /cancelled by user/i);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("aborts only the matching generation scope", async () => {
    let otherAborted = false;
    let targetAborted = false;
    enterProviderRequestScope("gf-keep");
    beginProviderRequest({
      id: "other",
      kind: "http_json",
      attempt: 1,
      abort: () => {
        otherAborted = true;
      },
    });
    leaveProviderRequestScope("gf-keep");
    enterProviderRequestScope("gf-stop");
    beginProviderRequest({
      id: "target",
      kind: "http_json",
      attempt: 1,
      abort: () => {
        targetAborted = true;
      },
    });
    leaveProviderRequestScope("gf-stop");
    const cancelled = cancelActiveProviderRequests("user_cancel", "gf-stop");
    assert.equal(cancelled, 1);
    assert.equal(targetAborted, true);
    assert.equal(otherAborted, false);
    endProviderRequest("other");
  });

  it("is safe to cancel the same scope more than once", () => {
    beginProviderRequest({
      id: "repeat",
      kind: "http_json",
      attempt: 1,
      scope: "gf-repeat",
      abort: () => undefined,
    });
    assert.equal(cancelActiveProviderRequests("user_cancel", "gf-repeat"), 1);
    assert.equal(cancelActiveProviderRequests("user_cancel", "gf-repeat"), 0);
  });
});
