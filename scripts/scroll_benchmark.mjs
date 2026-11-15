import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBenchmark() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,900",
    "http://localhost:3000/"
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch("http://127.0.0.1:9222/json/list");
        const list = await res.json();
        const page = list.find((p) => p.type === "page");
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) {
      throw new Error("Could not connect to Chrome DevTools port 9222");
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function sendCommand(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener("message", handler);
            resolve(data.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Enable Page and Runtime
    await sendCommand("Page.enable");
    await sendCommand("Runtime.enable");

    // Navigate and wait for load
    await sendCommand("Page.navigate", { url: "http://localhost:3000/" });
    await sleep(3000);

    // Scroll benchmark evaluation script
    const benchScript = `
      new Promise((resolve) => {
        const journey = document.querySelector("#journey");
        const roster = document.querySelector("#team-roster");
        if (!journey || !roster) {
          return resolve({ error: "journey or roster section not found" });
        }

        const startY = journey.getBoundingClientRect().top + window.scrollY;
        const endY = roster.getBoundingClientRect().top + window.scrollY;
        const distance = endY - startY;

        window.scrollTo(0, startY);

        const totalFrames = 120;
        let currentFrame = 0;
        let lastTime = performance.now();
        const deltas = [];

        function step(now) {
          const delta = now - lastTime;
          lastTime = now;
          if (currentFrame > 0) {
            deltas.push(delta);
          }
          currentFrame++;

          const progress = currentFrame / totalFrames;
          window.scrollTo(0, startY + distance * progress);

          if (currentFrame < totalFrames) {
            requestAnimationFrame(step);
          } else {
            deltas.sort((a, b) => a - b);
            const sum = deltas.reduce((acc, d) => acc + d, 0);
            const avg = sum / deltas.length;
            const median = deltas[Math.floor(deltas.length / 2)];
            const p95 = deltas[Math.floor(deltas.length * 0.95)];
            const max = deltas[deltas.length - 1];
            const over16 = deltas.filter((d) => d > 16.7).length;
            const over20 = deltas.filter((d) => d > 20.0).length;
            const fps = Math.round(1000 / avg);

            resolve({
              framesSampled: deltas.length,
              avgFrameTimeMs: Number(avg.toFixed(2)),
              medianFrameTimeMs: Number(median.toFixed(2)),
              p95FrameTimeMs: Number(p95.toFixed(2)),
              maxFrameTimeMs: Number(max.toFixed(2)),
              framesOver16ms: over16,
              framesOver20ms: over20,
              approxFps: fps
            });
          }
        }

        requestAnimationFrame(step);
      });
    `;

    const evalResult = await sendCommand("Runtime.evaluate", {
      expression: benchScript,
      awaitPromise: true,
      returnByValue: true
    });

    ws.close();
    return evalResult.result.value;
  } finally {
    chrome.kill();
  }
}

runBenchmark().then((res) => {
  console.log(JSON.stringify(res, null, 2));
}).catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
