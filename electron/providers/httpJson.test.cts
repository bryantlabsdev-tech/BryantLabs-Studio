import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { jsonRequestBody } from "./sanitizePrompt.cjs";
import {
  encodeRequestBody,
  FIRST_BYTE_TIMEOUT_MS,
  requestHttpJson,
  setHttpJsonMetricsListener,
  shouldUseElectronNet,
  type RequestBodyTransportMetrics,
} from "./httpJson.cjs";

async function withServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Buffer,
    contentLength: number | null,
  ) => void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const rawCl = req.headers["content-length"];
      const contentLength =
        typeof rawCl === "string" ? Number(rawCl) : Array.isArray(rawCl) ? Number(rawCl[0]) : null;
      handler(req, res, body, contentLength);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/messages`;
  try {
    await run(url);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("requestHttpJson transport", () => {
  it("reports whether the current process is Electron", () => {
    assert.equal(shouldUseElectronNet(), Boolean(process.versions.electron));
  });

  it("uses Buffer.byteLength for Content-Length with UTF-8 multibyte content", async () => {
    const content = "任务管理器 ✅ ".repeat(200);
    const payload = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content }],
    });
    const expectedBytes = Buffer.byteLength(payload, "utf8");
    assert.notEqual(expectedBytes, payload.length);
    assert.equal(encodeRequestBody(payload)?.length, expectedBytes);

    let received = 0;
    let headerCl: number | null = null;
    await withServer(
      (_req, res, body, contentLength) => {
        received = body.length;
        headerCl = contentLength;
        assert.doesNotThrow(() => JSON.parse(body.toString("utf8")));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      },
      async (url) => {
        const response = await requestHttpJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          },
          10_000,
        );
        assert.equal(response.ok, true);
        assert.equal(received, expectedBytes);
        assert.equal(headerCl, expectedBytes);
        assert.equal(response.transport?.bytesWritten, expectedBytes);
        assert.equal(response.transport?.bodyFullyFlushed, true);
      },
    );
  });

  it("delivers JSON payloads larger than 17 KB intact on the first attempt", async () => {
    const content = "x".repeat(18_000);
    const payload = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      messages: [{ role: "user", content }],
    });
    const expectedBytes = Buffer.byteLength(payload, "utf8");
    assert.ok(expectedBytes > 17_000);

    const metrics: RequestBodyTransportMetrics[] = [];
    setHttpJsonMetricsListener((m) => metrics.push(m));
    try {
      await withServer(
        (_req, res, body, contentLength) => {
          assert.equal(body.length, expectedBytes);
          assert.equal(contentLength, expectedBytes);
          JSON.parse(body.toString("utf8"));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
        async (url) => {
          const response = await requestHttpJson(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            },
            10_000,
            { attempt: 1 },
          );
          assert.equal(response.ok, true);
          assert.equal(response.transport?.payloadByteLength, expectedBytes);
          assert.equal(response.transport?.bytesWritten, expectedBytes);
          assert.equal(response.transport?.truncationSource, "none");
          assert.ok(response.transport?.socketEvents.includes("socket_assigned"));
        },
      );
    } finally {
      setHttpJsonMetricsListener(null);
    }
    assert.ok(metrics.some((m) => m.bodyFullyFlushed && m.bytesWritten === expectedBytes));
  });

  it("records inbound response byte length when response JSON is truncated", async () => {
    await withServer(
      (_req, res, body, contentLength) => {
        assert.equal(body.length, Buffer.byteLength('{"x":1}', "utf8"));
        assert.equal(contentLength, body.length);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"truncated": ');
      },
      async (url) => {
        const response = await requestHttpJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"x":1}',
          },
          10_000,
          { attempt: 1 },
        );
        assert.equal(response.ok, true);
        assert.equal(
          response.transport?.responseByteLength,
          Buffer.byteLength('{"truncated": ', "utf8"),
        );
      },
    );
  });

  it("delivers chunked large bodies (>16 KiB write chunk) intact", async () => {
    const content = "y".repeat(40_000);
    const payload = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      messages: [{ role: "user", content }],
    });
    const expectedBytes = Buffer.byteLength(payload, "utf8");
    assert.ok(expectedBytes > 16 * 1024);

    await withServer(
      (_req, res, body, contentLength) => {
        assert.equal(body.length, expectedBytes);
        assert.equal(contentLength, expectedBytes);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      },
      async (url) => {
        const response = await requestHttpJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          },
          10_000,
        );
        assert.equal(response.ok, true);
        assert.equal(response.transport?.bytesWritten, expectedBytes);
      },
    );
  });

  it("gives each retry a fresh attempt metric and body buffer", async () => {
    let hits = 0;
    const payload = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: "retry-me" }],
    });
    const attempts: number[] = [];
    setHttpJsonMetricsListener((m) => {
      if (m.completed || m.aborted) attempts.push(m.attempt);
    });
    try {
      await withServer(
        (_req, res, body) => {
          hits += 1;
          if (hits === 1) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: {
                  message:
                    "The request body is not valid JSON: unexpected end of data: line 1 column 100 (char 99)",
                },
              }),
            );
            return;
          }
          assert.equal(body.length, Buffer.byteLength(payload, "utf8"));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ content: [{ type: "text", text: "ok" }] }));
        },
        async (url) => {
          const first = await requestHttpJson(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            },
            10_000,
            { attempt: 1 },
          );
          assert.equal(first.ok, false);
          const second = await requestHttpJson(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            },
            10_000,
            { attempt: 2 },
          );
          assert.equal(second.ok, true);
          assert.equal(second.transport?.attempt, 2);
        },
      );
    } finally {
      setHttpJsonMetricsListener(null);
    }
    assert.ok(attempts.includes(1));
    assert.ok(attempts.includes(2));
  });

  it("does not let a timed-out attempt cancel a later attempt", async () => {
    const payload = jsonRequestBody({
      model: "claude-opus-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: "timeout-then-ok" }],
    });
    let hits = 0;
    await withServer(
      (_req, res, body) => {
        hits += 1;
        if (hits === 1) {
          // Never respond — first attempt must time out on its own timer.
          return;
        }
        assert.equal(body.length, Buffer.byteLength(payload, "utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      },
      async (url) => {
        await assert.rejects(
          () =>
            requestHttpJson(
              url,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
              },
              200,
              { attempt: 1 },
            ),
          /first-byte timeout|timeout/i,
        );
        const second = await requestHttpJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          },
          5_000,
          { attempt: 2 },
        );
        assert.equal(second.ok, true);
        assert.equal(second.transport?.attempt, 2);
        assert.equal(second.transport?.aborted, false);
      },
    );
  });

  it("exposes FIRST_BYTE_TIMEOUT_MS for deadline coordination", () => {
    assert.equal(FIRST_BYTE_TIMEOUT_MS, 60_000);
  });

  it("completes the HTTP call even when diagnostics listeners throw", async () => {
    const { setTransportDiagnosticsListener, setTransportDiagnosticsBroadcast } =
      await import("./transportDiagnostics.cjs");
    setTransportDiagnosticsListener(() => {
      throw new Error("metrics listener boom");
    });
    setTransportDiagnosticsBroadcast(() => {
      throw new Error("broadcast boom");
    });
    try {
      const payload = jsonRequestBody({
        model: "claude-opus-4-6",
        max_tokens: 64,
        messages: [{ role: "user", content: "diag-isolation" }],
      });
      await withServer(
        (_req, res, body) => {
          assert.equal(body.length, Buffer.byteLength(payload, "utf8"));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
        async (url) => {
          const response = await requestHttpJson(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            },
            10_000,
            { attempt: 1 },
          );
          assert.equal(response.ok, true);
          assert.equal(response.transport?.completed, true);
        },
      );
    } finally {
      setTransportDiagnosticsListener(null);
      setTransportDiagnosticsBroadcast(null);
    }
  });
});
