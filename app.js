const state = {
  proxyEnabled: true,
  proxyMode: "Smart",
  proxyEndpoint: window.location.host || "localhost:8443",
  bootedAt: Date.now(),
};

const body = document.body;
const boot = document.getElementById("boot");
const proxyToggles = document.querySelectorAll("[data-proxy-toggle]");
const proxyModes = document.querySelectorAll("[data-proxy-mode]");
const proxyEndpoint = document.querySelector("[data-proxy-endpoint]");
const proxyLabel = document.querySelector("[data-proxy-label]");
const proxySub = document.querySelector("[data-proxy-sub]");
const timeEl = document.querySelector("[data-time]");
const controlToggle = document.querySelector("[data-control-toggle]");
const controlCenter = document.querySelector("[data-control-center]");
const logEl = document.querySelector("[data-log]");
const runTest = document.querySelector("[data-run-test]");
const browserForm = document.querySelector("[data-browser-form]");
const browserInput = document.querySelector("[data-browser-input]");
const browserStatus = document.querySelector("[data-browser-status]");
const browserOutput = document.querySelector("[data-browser-output]");
const tunnelForm = document.querySelector("[data-tunnel-form]");
const tunnelInput = document.querySelector("[data-tunnel-input]");
const tunnelStatus = document.querySelector("[data-tunnel-status]");
const tunnelOutput = document.querySelector("[data-tunnel-output]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const metricProxy = document.querySelector("[data-metric-proxy]");
const metricLatency = document.querySelector("[data-metric-latency]");
const metricUptime = document.querySelector("[data-metric-uptime]");

const windows = new Map();
document.querySelectorAll(".window").forEach((win) => {
  windows.set(win.dataset.app, win);
});

let zIndex = 25;
let logLines = [];
let dragState = null;

const pad = (value) => String(value).padStart(2, "0");

const formatTime = (date) =>
  date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatUptime = () => {
  const diff = Math.floor((Date.now() - state.bootedAt) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const updateTime = () => {
  if (!timeEl) return;
  timeEl.textContent = formatTime(new Date());
};

const log = (message) => {
  const stamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  logLines = [`[${stamp}] ${message}`, ...logLines].slice(0, 8);
  logEl.textContent = logLines.join("\n");
};

const setProxyEnabled = (enabled) => {
  state.proxyEnabled = enabled;
  proxyToggles.forEach((toggle) => {
    toggle.checked = enabled;
  });
  body.classList.toggle("proxy-off", !enabled);
  proxyLabel.textContent = enabled ? "Proxy On" : "Proxy Off";
  proxySub.textContent = enabled ? "Smart routing enabled" : "Proxy paused";
  metricProxy.textContent = enabled ? "Enabled" : "Paused";
  log(enabled ? "Proxy shield enabled." : "Proxy shield paused.");
};

const setProxyMode = (mode) => {
  state.proxyMode = mode;
  proxyModes.forEach((select) => {
    select.value = mode;
  });
  log(`Routing mode set to ${mode}.`);
};

const setProxyEndpoint = (endpoint) => {
  state.proxyEndpoint = endpoint;
  if (proxyEndpoint) {
    proxyEndpoint.value = endpoint;
  }
  log(`Endpoint updated to ${endpoint}.`);
};

const setTheme = (isDark) => {
  body.classList.toggle("theme-dark", isDark);
  if (themeToggle) {
    themeToggle.checked = isDark;
  }
  try {
    localStorage.setItem("sfos-theme", isDark ? "dark" : "light");
  } catch (error) {
    // Ignore storage errors.
  }
};

const focusWindow = (win) => {
  if (!win) return;
  zIndex += 1;
  win.style.zIndex = zIndex;
};

const showWindow = (appId) => {
  const win = windows.get(appId);
  if (!win) return;
  win.classList.remove("is-hidden");
  focusWindow(win);
};

const hideWindow = (appId) => {
  const win = windows.get(appId);
  if (!win) return;
  win.classList.add("is-hidden");
};

const simulateRequest = (label) => {
  const hop = state.proxyEnabled
    ? `via ${state.proxyEndpoint} (${state.proxyMode})`
    : "direct connection";
  const latency = state.proxyEnabled ? 420 : 260;
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ hop, latency: latency + Math.round(Math.random() * 80) });
    }, latency);
  }).then((result) => {
    metricLatency.textContent = `${result.latency} ms`;
    log(`${label} completed ${result.hop}.`);
    return result;
  });
};

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => showWindow(button.dataset.open));
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => hideWindow(button.dataset.close));
});

document.querySelectorAll("[data-minimize]").forEach((button) => {
  button.addEventListener("click", () => hideWindow(button.dataset.minimize));
});

document.querySelectorAll(".window").forEach((win) => {
  win.addEventListener("pointerdown", () => focusWindow(win));
});

document.querySelectorAll(".window__titlebar").forEach((bar) => {
  bar.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 960px)").matches) return;
    const win = bar.closest(".window");
    if (!win) return;
    dragState = {
      win,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: win.offsetLeft,
      originY: win.offsetTop,
    };
    bar.setPointerCapture(event.pointerId);
    win.style.cursor = "grabbing";
  });

  bar.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    dragState.win.style.left = `${dragState.originX + dx}px`;
    dragState.win.style.top = `${dragState.originY + dy}px`;
  });

  bar.addEventListener("pointerup", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState.win.style.cursor = "grab";
    dragState = null;
  });
});

proxyToggles.forEach((toggle) => {
  toggle.addEventListener("change", (event) => {
    setProxyEnabled(event.target.checked);
  });
});

proxyModes.forEach((select) => {
  select.addEventListener("change", (event) => {
    setProxyMode(event.target.value);
  });
});

if (proxyEndpoint) {
  proxyEndpoint.addEventListener("change", (event) => {
    setProxyEndpoint(event.target.value.trim() || state.proxyEndpoint);
  });
}

if (runTest) {
  runTest.addEventListener("click", () => {
    log("Handshake initiated.");
    simulateRequest("Handshake");
  });
}

if (browserForm) {
  browserForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = browserInput.value.trim() || "https://sfos.local";
    browserStatus.textContent = "Connecting...";
    browserOutput.textContent = `Resolving ${url}`;
    simulateRequest("Browser").then((result) => {
      browserStatus.textContent = "Live session";
      browserOutput.textContent = `Loaded ${url} ${result.hop}.`;
    });
  });
}

if (tunnelForm) {
  tunnelForm.addEventListener("submit", (event) => {
    event.preventDefault();
    let url = tunnelInput.value.trim() || "https://example.com";
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    tunnelStatus.textContent = "Building tunnel...";
    tunnelOutput.textContent = `Establishing proxy chain for ${url}...`;

    simulateRequest("Tunnel negotiation").then((firstHop) => {
      const chain = state.proxyEnabled
        ? `Ingress → ${state.proxyEndpoint} → Exit region`
        : "Direct exit (no proxy chain)";

      tunnelStatus.textContent = "Tunnel active";
      tunnelOutput.textContent = [
        `Tunneled session for ${url}`,
        `Path: ${chain}`,
        `Observed latency: ${firstHop.latency} ms`,
        "",
        `A real view of this page has been opened via the sfOS proxy in a new tab.`,
      ].join("\n");

      const proxyUrl = `/proxy?target=${encodeURIComponent(url)}`;
      window.open(proxyUrl, "_blank", "noopener");
    });
  });
}

if (controlToggle) {
  controlToggle.addEventListener("click", () => {
    controlCenter.classList.toggle("is-open");
  });
}

if (controlCenter && controlToggle) {
  document.addEventListener("click", (event) => {
    if (!controlCenter.contains(event.target) && !controlToggle.contains(event.target)) {
      controlCenter.classList.remove("is-open");
    }
  });
}

if (themeToggle) {
  const storedTheme = (() => {
    try {
      return localStorage.getItem("sfos-theme");
    } catch (error) {
      return null;
    }
  })();
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialDark = storedTheme ? storedTheme === "dark" : prefersDark;
  setTheme(initialDark);
  themeToggle.addEventListener("change", (event) => {
    setTheme(event.target.checked);
  });
}

setProxyEnabled(state.proxyEnabled);
setProxyMode(state.proxyMode);
updateTime();
setInterval(updateTime, 60000);
setInterval(() => {
  metricUptime.textContent = formatUptime();
}, 1000);

if (boot) {
  setTimeout(() => {
    boot.remove();
  }, 1800);
}
