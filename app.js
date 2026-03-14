const state = {
  deoxyEnabled: true,
  deoxyMode: "Smart",
  deoxyEndpoint: window.location.host || "localhost:8443",
  bootedAt: Date.now(),
};

const body = document.body;
const boot = document.getElementById("boot");
const deoxyToggles = document.querySelectorAll("[data-deoxy-toggle]");
const deoxyModes = document.querySelectorAll("[data-deoxy-mode]");
const deoxyEndpoint = document.querySelector("[data-deoxy-endpoint]");
const deoxyLabel = document.querySelector("[data-deoxy-label]");
const deoxySub = document.querySelector("[data-deoxy-sub]");
const timeEl = document.querySelector("[data-time]");
const batteryEl = document.querySelector("[data-battery]");
const networkEl = document.querySelector("[data-network]");
const controlToggle = document.querySelector("[data-control-toggle]");
const controlCenter = document.querySelector("[data-control-center]");
const logEl = document.querySelector("[data-log]");
const runTest = document.querySelector("[data-run-test]");
const tunnelForm = document.querySelector("[data-tunnel-form]");
const tunnelInput = document.querySelector("[data-tunnel-input]");
const tunnelStatus = document.querySelector("[data-tunnel-status]");
const tunnelOutput = document.querySelector("[data-tunnel-output]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const calcDisplay = document.querySelector("[data-calc-display]");
const calcExpression = document.querySelector("[data-calc-expression]");
const calcInput = document.querySelector("[data-calc-input]");
const calcForm = document.querySelector("[data-calc-form]");
const calcKeys = document.querySelectorAll("[data-calc]");
const calcModeButtons = document.querySelectorAll("[data-calc-mode]");
const calcPanels = document.querySelectorAll("[data-calc-panel]");
const calculatorEl = document.querySelector(".calculator");
const angleButtons = document.querySelectorAll("[data-angle]");
const precisionSelect = document.querySelector("[data-precision]");
const graphForm = document.querySelector("[data-graph-form]");
const graphInput = document.querySelector("[data-graph-input]");
const graphMin = document.querySelector("[data-graph-min]");
const graphMax = document.querySelector("[data-graph-max]");
const graphStatus = document.querySelector("[data-graph-status]");
const graphSvg = document.querySelector("[data-graph-svg]");
const convertCategory = document.querySelector("[data-convert-category]");
const convertFrom = document.querySelector("[data-convert-from]");
const convertTo = document.querySelector("[data-convert-to]");
const convertInput = document.querySelector("[data-convert-input]");
const convertOutput = document.querySelector("[data-convert-output]");
const convertRate = document.querySelector("[data-convert-rate]");
const convertRateWrap = document.querySelector("[data-convert-rate-wrap]");
const convertRateLabel = document.querySelector("[data-convert-rate-label]");
const metricDeoxy = document.querySelector("[data-metric-deoxy]");
const metricLatency = document.querySelector("[data-metric-latency]");
const metricUptime = document.querySelector("[data-metric-uptime]");
const metricSession = document.querySelector("[data-metric-session]");

const windows = new Map();
document.querySelectorAll(".window").forEach((win) => {
  windows.set(win.dataset.app, win);
});

let zIndex = 25;
let logLines = [];
let dragState = null;
let resizeState = null;

const pad = (value) => String(value).padStart(2, "0");

const timeFormatter = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const formatTime = (date) => timeFormatter.format(date);

const formatUptime = () => {
  const diff = Math.floor((Date.now() - state.bootedAt) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const timeState = {
  baseEpochMs: Date.now(),
  basePerfMs: typeof performance !== "undefined" ? performance.now() : 0,
  source: "device",
};

const setTimeBase = (epochMs, source) => {
  timeState.baseEpochMs = epochMs;
  timeState.basePerfMs = typeof performance !== "undefined" ? performance.now() : 0;
  timeState.source = source;
};

const renderTime = () => {
  if (!timeEl) return;
  const nowMs =
    timeState.baseEpochMs +
    (typeof performance !== "undefined" ? performance.now() : 0) -
    timeState.basePerfMs;
  timeEl.textContent = formatTime(new Date(nowMs));
};

const fetchNetworkTime = async () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endpoint = tz
    ? `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`
    : "https://worldtimeapi.org/api/ip";
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Time API error");
  }
  const data = await response.json();
  if (!data || !data.datetime) {
    throw new Error("Time API missing datetime");
  }
  const epochMs = Date.parse(data.datetime);
  if (Number.isNaN(epochMs)) {
    throw new Error("Time API invalid datetime");
  }
  setTimeBase(epochMs, "worldtimeapi");
};

const startClock = () => {
  if (!timeEl) return;
  const tick = () => {
    renderTime();
    const nowMs =
      timeState.baseEpochMs +
      (typeof performance !== "undefined" ? performance.now() : 0) -
      timeState.basePerfMs;
    const msToNextSecond = 1000 - (nowMs % 1000);
    window.setTimeout(tick, Math.max(200, msToNextSecond));
  };
  tick();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderTime();
      fetchNetworkTime().catch(() => {
        setTimeBase(Date.now(), "device");
      });
    }
  });
};

const initNetworkClock = () => {
  fetchNetworkTime().catch(() => {
    setTimeBase(Date.now(), "device");
  });
  window.setInterval(() => {
    fetchNetworkTime().catch(() => {
      if (timeState.source !== "worldtimeapi") {
        setTimeBase(Date.now(), "device");
      }
    });
  }, 10 * 60 * 1000);
};

const updateBatteryDisplay = (battery) => {
  if (!batteryEl || !battery) return;
  const percent = Math.round(battery.level * 100);
  batteryEl.textContent = battery.charging
    ? `Battery ${percent}% (Charging)`
    : `Battery ${percent}%`;
};

const initBattery = () => {
  if (!batteryEl) return;
  if (!navigator.getBattery) {
    batteryEl.textContent = "Battery --%";
    return;
  }
  navigator
    .getBattery()
    .then((battery) => {
      updateBatteryDisplay(battery);
      const handler = () => updateBatteryDisplay(battery);
      battery.addEventListener("levelchange", handler);
      battery.addEventListener("chargingchange", handler);
    })
    .catch(() => {
      batteryEl.textContent = "Battery --%";
    });
};

const updateNetworkStatus = () => {
  if (!networkEl) return;
  networkEl.textContent = navigator.onLine ? "Online" : "Offline";
};

const initNetworkStatus = () => {
  if (!networkEl) return;
  updateNetworkStatus();
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
};

const measureLatency = async () => {
  if (!metricLatency) return null;
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const response = await fetch(`/ping?ts=${Date.now()}`, { cache: "no-store" });
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!response.ok) throw new Error("Ping failed");
    const ms = Math.max(0, Math.round(end - start));
    metricLatency.textContent = `${ms} ms`;
    return ms;
  } catch (error) {
    metricLatency.textContent = "—";
    return null;
  }
};

const startLatencyMonitor = () => {
  measureLatency();
  window.setInterval(measureLatency, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      measureLatency();
    }
  });
};

const updateSessionDisplay = (count) => {
  if (!metricSession) return;
  metricSession.textContent =
    typeof count === "number" && Number.isFinite(count) ? `${count}` : "--";
};

const fetchSessionCount = () => {
  if (!metricSession) return;
  fetch("/session", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || typeof data.count !== "number") {
        updateSessionDisplay(null);
        return;
      }
      updateSessionDisplay(data.count);
    })
    .catch(() => {
      updateSessionDisplay(null);
    });
};

const initSessionCount = () => {
  if (!metricSession) return;
  fetchSessionCount();
  window.setInterval(fetchSessionCount, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      fetchSessionCount();
    }
  });
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

const setDeoxyEnabled = (enabled) => {
  state.deoxyEnabled = enabled;
  deoxyToggles.forEach((toggle) => {
    toggle.checked = enabled;
  });
  body.classList.toggle("deoxy-off", !enabled);
  deoxyLabel.textContent = enabled ? "Deoxy On" : "Deoxy Off";
  deoxySub.textContent = enabled ? "Smart routing enabled" : "Deoxy paused";
  metricDeoxy.textContent = enabled ? "Enabled" : "Paused";
  log(enabled ? "Deoxy shield enabled." : "Deoxy shield paused.");
};

const setDeoxyMode = (mode) => {
  state.deoxyMode = mode;
  deoxyModes.forEach((select) => {
    select.value = mode;
  });
  log(`Routing mode set to ${mode}.`);
};

const setDeoxyEndpoint = (endpoint) => {
  state.deoxyEndpoint = endpoint;
  if (deoxyEndpoint) {
    deoxyEndpoint.value = endpoint;
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

const calcState = {
  mode: "basic",
  angle: "deg",
  precision: 6,
};

const calcFunctions = new Set(["sin", "cos", "tan", "log", "ln", "sqrt", "abs"]);
const calcConstants = { pi: Math.PI, e: Math.E };

const formatCalcNumber = (value) => {
  if (!Number.isFinite(value)) return "Error";
  const factor = Math.pow(10, calcState.precision);
  const rounded = Math.round(value * factor) / factor;
  return rounded.toString();
};

const updateCalcDisplay = (expression, result) => {
  if (calcExpression) {
    calcExpression.textContent = expression || "";
  }
  if (calcDisplay) {
    calcDisplay.textContent = result || "0";
  }
};

const setCalcInputValue = (value) => {
  if (!calcInput) return;
  calcInput.value = value;
  if (calcExpression) {
    calcExpression.textContent = value;
  }
};

const shouldInsertMultiply = (prev, next) => {
  const prevIsValue =
    prev.type === "number" ||
    prev.type === "var" ||
    (prev.type === "paren" && prev.value === ")");
  const nextIsValue =
    next.type === "number" ||
    next.type === "var" ||
    next.type === "func" ||
    (next.type === "paren" && next.value === "(");
  return prevIsValue && nextIsValue;
};

const tokenizeExpression = (expression) => {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let value = "";
      let dotCount = 0;
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        if (expression[index] === ".") {
          dotCount += 1;
          if (dotCount > 1) {
            return { error: "Invalid number format" };
          }
        }
        value += expression[index];
        index += 1;
      }
      if (value === ".") {
        return { error: "Invalid number format" };
      }
      tokens.push({ type: "number", value: parseFloat(value) });
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let value = "";
      while (index < expression.length && /[a-zA-Z]/.test(expression[index])) {
        value += expression[index];
        index += 1;
      }
      const lower = value.toLowerCase();
      if (calcFunctions.has(lower)) {
        tokens.push({ type: "func", value: lower });
      } else if (lower === "x") {
        tokens.push({ type: "var", value: "x" });
      } else if (Object.prototype.hasOwnProperty.call(calcConstants, lower)) {
        tokens.push({ type: "number", value: calcConstants[lower] });
      } else {
        return { error: `Unknown token "${value}"` };
      }
      continue;
    }

    if (char === "√") {
      tokens.push({ type: "func", value: "sqrt" });
      index += 1;
      continue;
    }

    if ("+-*/^".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    return { error: `Unexpected character "${char}"` };
  }

  const expanded = [];
  for (const token of tokens) {
    if (expanded.length > 0 && shouldInsertMultiply(expanded[expanded.length - 1], token)) {
      expanded.push({ type: "operator", value: "*" });
    }
    expanded.push(token);
  }

  return { tokens: expanded };
};

const operatorInfo = {
  "+": { prec: 1, assoc: "L" },
  "-": { prec: 1, assoc: "L" },
  "*": { prec: 2, assoc: "L" },
  "/": { prec: 2, assoc: "L" },
  "^": { prec: 3, assoc: "R" },
  "u-": { prec: 4, assoc: "R" },
};

const toRpn = (tokens) => {
  const output = [];
  const stack = [];
  let prev = null;

  for (const token of tokens) {
    if (token.type === "number" || token.type === "var") {
      output.push(token);
    } else if (token.type === "func") {
      stack.push(token);
    } else if (token.type === "operator") {
      let op = token.value;
      if (
        op === "-" &&
        (!prev ||
          prev.type === "operator" ||
          (prev.type === "paren" && prev.value === "(") ||
          prev.type === "func")
      ) {
        op = "u-";
      }

      const current = { type: "operator", value: op };
      const currentInfo = operatorInfo[op];
      if (!currentInfo) {
        return { error: `Unknown operator "${op}"` };
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === "operator") {
          const topInfo = operatorInfo[top.value];
          const shouldPop =
            (currentInfo.assoc === "L" && currentInfo.prec <= topInfo.prec) ||
            (currentInfo.assoc === "R" && currentInfo.prec < topInfo.prec);
          if (shouldPop) {
            output.push(stack.pop());
            continue;
          }
        } else if (top.type === "func") {
          output.push(stack.pop());
          continue;
        }
        break;
      }

      stack.push(current);
    } else if (token.type === "paren" && token.value === "(") {
      stack.push(token);
    } else if (token.type === "paren" && token.value === ")") {
      let matched = false;
      while (stack.length > 0) {
        const top = stack.pop();
        if (top.type === "paren" && top.value === "(") {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) {
        return { error: "Mismatched parentheses" };
      }
      if (stack.length > 0 && stack[stack.length - 1].type === "func") {
        output.push(stack.pop());
      }
    }
    prev = token;
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top.type === "paren") {
      return { error: "Mismatched parentheses" };
    }
    output.push(top);
  }

  return { rpn: output };
};

const evalRpn = (rpn, variables = {}) => {
  const stack = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
    } else if (token.type === "var") {
      stack.push(variables.x ?? 0);
    } else if (token.type === "operator") {
      if (token.value === "u-") {
        if (stack.length < 1) return { error: "Invalid expression" };
        stack.push(-stack.pop());
        continue;
      }
      if (stack.length < 2) return { error: "Invalid expression" };
      const right = stack.pop();
      const left = stack.pop();
      switch (token.value) {
        case "+":
          stack.push(left + right);
          break;
        case "-":
          stack.push(left - right);
          break;
        case "*":
          stack.push(left * right);
          break;
        case "/":
          stack.push(right === 0 ? NaN : left / right);
          break;
        case "^":
          stack.push(Math.pow(left, right));
          break;
        default:
          return { error: "Invalid operator" };
      }
    } else if (token.type === "func") {
      if (stack.length < 1) return { error: "Invalid expression" };
      const input = stack.pop();
      const angle = calcState.angle === "deg" ? (input * Math.PI) / 180 : input;
      let result = NaN;
      switch (token.value) {
        case "sin":
          result = Math.sin(angle);
          break;
        case "cos":
          result = Math.cos(angle);
          break;
        case "tan":
          result = Math.tan(angle);
          break;
        case "log":
          result = Math.log10 ? Math.log10(input) : Math.log(input) / Math.LN10;
          break;
        case "ln":
          result = Math.log(input);
          break;
        case "sqrt":
          result = Math.sqrt(input);
          break;
        case "abs":
          result = Math.abs(input);
          break;
        default:
          return { error: "Invalid function" };
      }
      stack.push(result);
    }
  }

  if (stack.length !== 1) {
    return { error: "Invalid expression" };
  }

  const value = stack[0];
  if (!Number.isFinite(value)) {
    return { error: "Math error" };
  }
  return { value };
};

const compileExpression = (expression) => {
  const tokenized = tokenizeExpression(expression);
  if (tokenized.error) return { error: tokenized.error };
  const compiled = toRpn(tokenized.tokens);
  if (compiled.error) return { error: compiled.error };
  return { rpn: compiled.rpn };
};

const evaluateExpression = (expression, variables = {}) => {
  const compiled = compileExpression(expression);
  if (compiled.error) return { error: compiled.error };
  return evalRpn(compiled.rpn, variables);
};

const normalizeGraphExpression = (raw) => {
  if (!raw) return "";
  let expression = raw.trim();
  if (!expression) return "";
  const equalsIndex = expression.indexOf("=");
  if (equalsIndex !== -1) {
    expression = expression.slice(equalsIndex + 1).trim();
  }
  expression = expression.replace(/^(f\s*\(\s*x\s*\)|y)\s*/i, "");
  return expression.trim();
};

const evaluateCalcInput = () => {
  if (!calcInput) return;
  const expression = calcInput.value.trim();
  if (!expression) {
    updateCalcDisplay("", "0");
    return;
  }
  const result = evaluateExpression(expression);
  if (result.error) {
    updateCalcDisplay(expression, "Error");
    return;
  }
  const formatted = formatCalcNumber(result.value);
  updateCalcDisplay(expression, formatted);
  setCalcInputValue(formatted);
};

const insertCalcToken = (token) => {
  if (!calcInput) return;
  const start = calcInput.selectionStart ?? calcInput.value.length;
  const end = calcInput.selectionEnd ?? calcInput.value.length;
  const next = `${calcInput.value.slice(0, start)}${token}${calcInput.value.slice(end)}`;
  calcInput.value = next;
  const caret = start + token.length;
  calcInput.setSelectionRange(caret, caret);
  calcInput.focus();
  if (calcExpression) {
    calcExpression.textContent = next;
  }
};

const toggleCalcSign = () => {
  if (!calcInput) return;
  const value = calcInput.value.trim();
  if (!value) {
    setCalcInputValue("-");
    return;
  }
  if (value.startsWith("-")) {
    setCalcInputValue(value.slice(1));
  } else {
    setCalcInputValue(`-${value}`);
  }
};

const applyCalcPercent = () => {
  if (!calcInput) return;
  const value = calcInput.value;
  const match = value.match(/(\d*\.?\d+)(?!.*\d)/);
  if (!match) return;
  const number = parseFloat(match[1]);
  if (!Number.isFinite(number)) return;
  const percent = formatCalcNumber(number / 100);
  const next = `${value.slice(0, match.index)}${percent}${value.slice(
    match.index + match[1].length,
  )}`;
  setCalcInputValue(next);
};

const handleCalcKey = (key) => {
  if (key === "clear") {
    setCalcInputValue("");
    updateCalcDisplay("", "0");
    return;
  }
  if (key === "sign") {
    toggleCalcSign();
    return;
  }
  if (key === "percent") {
    applyCalcPercent();
    return;
  }
  if (key === "=") {
    evaluateCalcInput();
    return;
  }
  insertCalcToken(key);
};

const setCalcMode = (mode) => {
  calcState.mode = mode;
  calcModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.calcMode === mode);
  });
  calcPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.calcPanel === mode);
  });
  if (calculatorEl) {
    calculatorEl.dataset.mode = mode;
  }
};

const setAngleMode = (mode) => {
  calcState.angle = mode;
  angleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.angle === mode);
  });
};

const setPrecision = (value) => {
  const precision = Number(value);
  if (Number.isNaN(precision)) return;
  calcState.precision = precision;
  if (precisionSelect) {
    precisionSelect.value = String(precision);
  }
};

const plotGraph = () => {
  if (!graphInput || !graphSvg || !graphStatus) return;
  const expression = normalizeGraphExpression(graphInput.value);
  if (!expression) {
    graphStatus.textContent = "Enter a function to plot.";
    graphSvg.innerHTML = "";
    return;
  }
  const compiled = compileExpression(expression);
  if (compiled.error) {
    graphStatus.textContent = compiled.error;
    graphSvg.innerHTML = "";
    return;
  }
  const min = graphMin ? parseFloat(graphMin.value) : -10;
  const max = graphMax ? parseFloat(graphMax.value) : 10;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    graphStatus.textContent = "Use a valid min/max range.";
    graphSvg.innerHTML = "";
    return;
  }

  const width = 400;
  const height = 220;
  const samples = 240;
  const points = [];

  for (let i = 0; i <= samples; i += 1) {
    const x = min + ((max - min) * i) / samples;
    const result = evalRpn(compiled.rpn, { x });
    if (!result.error && Number.isFinite(result.value)) {
      points.push({ x, y: result.value });
    }
  }

  if (!points.length) {
    graphStatus.textContent = "No real values in range.";
    graphSvg.innerHTML = "";
    return;
  }

  let yMin = Math.min(...points.map((point) => point.y));
  let yMax = Math.max(...points.map((point) => point.y));
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const mapX = (x) => ((x - min) / (max - min)) * width;
  const mapY = (y) => height - ((y - yMin) / (yMax - yMin)) * height;

  const linePoints = points
    .map((point) => `${mapX(point.x).toFixed(2)},${mapY(point.y).toFixed(2)}`)
    .join(" ");

  const axis = [];
  if (min <= 0 && max >= 0) {
    const xZero = mapX(0);
    axis.push(`<line class="graph-axis" x1="${xZero}" y1="0" x2="${xZero}" y2="${height}" />`);
  }
  if (yMin <= 0 && yMax >= 0) {
    const yZero = mapY(0);
    axis.push(`<line class="graph-axis" x1="0" y1="${yZero}" x2="${width}" y2="${yZero}" />`);
  }

  graphSvg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="none" />
    <g>${axis.join("")}</g>
    <polyline class="graph-line" points="${linePoints}" />
  `;
  graphStatus.textContent = `Plotted ${points.length} points from ${min} to ${max}.`;
};

const conversionTables = {
  length: {
    units: {
      m: 1,
      km: 1000,
      cm: 0.01,
      mm: 0.001,
      in: 0.0254,
      ft: 0.3048,
      yd: 0.9144,
      mi: 1609.344,
    },
  },
  mass: {
    units: {
      kg: 1,
      g: 0.001,
      mg: 0.000001,
      lb: 0.45359237,
      oz: 0.0283495231,
    },
  },
  temp: {
    units: {
      C: "C",
      F: "F",
      K: "K",
    },
  },
  currency: {
    units: {
      USD: "USD",
      EUR: "EUR",
      GBP: "GBP",
      JPY: "JPY",
    },
  },
};

const fillSelect = (select, options) => {
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";
  options.forEach((option) => {
    const entry = document.createElement("option");
    entry.value = option;
    entry.textContent = option;
    select.appendChild(entry);
  });
  if (options.includes(current)) {
    select.value = current;
  }
};

const updateRateLabel = () => {
  if (!convertRateLabel || !convertFrom || !convertTo) return;
  convertRateLabel.textContent = `Manual rate (1 ${convertFrom.value} = ? ${convertTo.value})`;
};

const updateConversionUnits = () => {
  if (!convertCategory || !convertFrom || !convertTo) return;
  const category = convertCategory.value;
  const table = conversionTables[category];
  if (!table) return;
  const unitKeys = Object.keys(table.units);
  fillSelect(convertFrom, unitKeys);
  fillSelect(convertTo, unitKeys);
  if (convertFrom.value === convertTo.value && unitKeys.length > 1) {
    convertTo.value = unitKeys[1];
  }
  if (convertRateWrap) {
    convertRateWrap.style.display = category === "currency" ? "block" : "none";
  }
  updateRateLabel();
  updateConversion();
};

const convertTemperature = (value, from, to) => {
  let kelvin = value;
  if (from === "C") kelvin = value + 273.15;
  if (from === "F") kelvin = ((value - 32) * 5) / 9 + 273.15;
  if (from === "K") kelvin = value;

  if (to === "C") return kelvin - 273.15;
  if (to === "F") return ((kelvin - 273.15) * 9) / 5 + 32;
  return kelvin;
};

const updateConversion = () => {
  if (!convertCategory || !convertFrom || !convertTo || !convertInput || !convertOutput) return;
  const category = convertCategory.value;
  const value = parseFloat(convertInput.value);
  if (!Number.isFinite(value)) {
    convertOutput.textContent = "--";
    return;
  }

  let result;
  if (category === "temp") {
    result = convertTemperature(value, convertFrom.value, convertTo.value);
  } else if (category === "currency") {
    const rateValue = convertRate ? parseFloat(convertRate.value) : NaN;
    if (!Number.isFinite(rateValue)) {
      convertOutput.textContent = "--";
      return;
    }
    result =
      convertFrom.value === convertTo.value ? value : value * rateValue;
  } else {
    const table = conversionTables[category];
    if (!table) return;
    const fromUnit = table.units[convertFrom.value];
    const toUnit = table.units[convertTo.value];
    if (!fromUnit || !toUnit) return;
    result = (value * fromUnit) / toUnit;
  }

  convertOutput.textContent = formatCalcNumber(result);
};

const initCalculator = () => {
  if (!calcDisplay || !calcExpression) return;

  if (calcInput) {
    calcInput.addEventListener("input", () => {
      calcExpression.textContent = calcInput.value;
    });
  }

  if (calcForm) {
    calcForm.addEventListener("submit", (event) => {
      event.preventDefault();
      evaluateCalcInput();
    });
  }

  if (calcKeys.length) {
    calcKeys.forEach((button) => {
      button.addEventListener("click", () => handleCalcKey(button.dataset.calc));
    });
  }

  calcModeButtons.forEach((button) => {
    button.addEventListener("click", () => setCalcMode(button.dataset.calcMode));
  });

  angleButtons.forEach((button) => {
    button.addEventListener("click", () => setAngleMode(button.dataset.angle));
  });

  if (precisionSelect) {
    precisionSelect.addEventListener("change", (event) => {
      setPrecision(event.target.value);
    });
  }

  if (graphForm) {
    graphForm.addEventListener("submit", (event) => {
      event.preventDefault();
      plotGraph();
    });
  }

  if (convertCategory) {
    convertCategory.addEventListener("change", updateConversionUnits);
  }
  if (convertFrom) {
    convertFrom.addEventListener("change", () => {
      updateRateLabel();
      updateConversion();
    });
  }
  if (convertTo) {
    convertTo.addEventListener("change", () => {
      updateRateLabel();
      updateConversion();
    });
  }
  if (convertInput) {
    convertInput.addEventListener("input", updateConversion);
  }
  if (convertRate) {
    convertRate.addEventListener("input", updateConversion);
  }

  setCalcMode(calcState.mode);
  setAngleMode(calcState.angle);
  setPrecision(calcState.precision);
  updateConversionUnits();
  updateCalcDisplay("", "0");
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
  win.classList.remove("is-maximized", "is-fullscreen");
};

const restoreWindow = (appId) => {
  const win = windows.get(appId);
  if (!win) return;
  const { initialWidth, initialHeight, initialLeft, initialTop } = win.dataset;
  win.classList.remove("is-hidden", "is-maximized", "is-fullscreen");
  if (initialWidth) win.style.width = `${initialWidth}px`;
  if (initialHeight) win.style.height = `${initialHeight}px`;
  if (initialLeft) win.style.left = `${initialLeft}px`;
  if (initialTop) win.style.top = `${initialTop}px`;
  focusWindow(win);
};

const simulateRequest = (label) => {
  const hop = state.deoxyEnabled
    ? `via ${state.deoxyEndpoint} (${state.deoxyMode})`
    : "direct connection";
  return measureLatency().then((latency) => {
    if (typeof latency === "number") {
      log(`${label} completed ${hop} (${latency} ms).`);
    } else {
      log(`${label} completed ${hop}.`);
    }
    return { hop, latency };
  });
};

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => showWindow(button.dataset.open));
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => hideWindow(button.dataset.close));
});

document.querySelectorAll("[data-minimize]").forEach((button) => {
  button.addEventListener("click", () => {
    const appId = button.dataset.minimize;
    const win = windows.get(appId);
    if (!win) return;

    if (win.classList.contains("is-maximized") || win.classList.contains("is-fullscreen")) {
      restoreWindow(appId);
    } else {
      hideWindow(appId);
    }
  });
});

document.querySelectorAll("[data-maximize]").forEach((button) => {
  const appId = button.dataset.maximize;
  const win = windows.get(appId);
  if (!win) return;

  button.addEventListener("click", () => {
    const isFull = win.classList.contains("is-fullscreen");
    win.classList.toggle("is-fullscreen", !isFull);
    win.classList.remove("is-maximized");
    focusWindow(win);
  });
});

document.querySelectorAll(".window").forEach((win) => {
  const rect = win.getBoundingClientRect();
  win.dataset.initialWidth = String(rect.width);
  win.dataset.initialHeight = String(rect.height);
  win.dataset.initialLeft = String(win.offsetLeft);
  win.dataset.initialTop = String(win.offsetTop);

  const handle = document.createElement("div");
  handle.className = "window__resize";
  win.appendChild(handle);

  win.addEventListener("pointerdown", () => focusWindow(win));

  handle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 960px)").matches) return;
    if (win.classList.contains("is-fullscreen")) return;
    event.stopPropagation();
    const current = win.getBoundingClientRect();
    resizeState = {
      win,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: current.width,
      startHeight: current.height,
    };
    handle.setPointerCapture(event.pointerId);
    win.classList.remove("is-maximized", "is-fullscreen");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const dx = event.clientX - resizeState.startX;
    const dy = event.clientY - resizeState.startY;
    const nextWidth = Math.max(320, resizeState.startWidth + dx);
    const nextHeight = Math.max(220, resizeState.startHeight + dy);
    resizeState.win.style.width = `${nextWidth}px`;
    resizeState.win.style.height = `${nextHeight}px`;
  });

  handle.addEventListener("pointerup", (event) => {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    resizeState = null;
  });
});

document.querySelectorAll(".window__titlebar").forEach((bar) => {
  bar.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 960px)").matches) return;
    const win = bar.closest(".window");
    if (!win) return;
    if (win.classList.contains("is-fullscreen")) return;
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

deoxyToggles.forEach((toggle) => {
  toggle.addEventListener("change", (event) => {
    setDeoxyEnabled(event.target.checked);
  });
});

deoxyModes.forEach((select) => {
  select.addEventListener("change", (event) => {
    setDeoxyMode(event.target.value);
  });
});

if (deoxyEndpoint) {
  deoxyEndpoint.addEventListener("change", (event) => {
    setDeoxyEndpoint(event.target.value.trim() || state.deoxyEndpoint);
  });
}

if (runTest) {
  runTest.addEventListener("click", () => {
    log("Handshake initiated.");
    simulateRequest("Handshake");
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
    tunnelOutput.textContent = `Establishing deoxy chain for ${url}...`;

    simulateRequest("Tunnel negotiation").then((firstHop) => {
      const chain = state.deoxyEnabled
        ? `Ingress → ${state.deoxyEndpoint} → Exit region`
        : "Direct exit (no deoxy chain)";

      tunnelStatus.textContent = "Tunnel active";
      tunnelOutput.textContent = [
        `Tunneled session for ${url}`,
        `Path: ${chain}`,
        `Observed latency: ${firstHop.latency} ms`,
        "",
        `A real view of this page has been opened via the sfOS deoxy in a new tab.`,
      ].join("\n");

      const deoxyUrl = `/deoxy?target=${encodeURIComponent(url)}`;
      window.open(deoxyUrl, "_blank", "noopener");
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

initCalculator();
initBattery();
initNetworkClock();
initNetworkStatus();
initSessionCount();
startLatencyMonitor();

setDeoxyEnabled(state.deoxyEnabled);
setDeoxyMode(state.deoxyMode);
startClock();
setInterval(() => {
  metricUptime.textContent = formatUptime();
}, 1000);

if (boot) {
  setTimeout(() => {
    boot.remove();
  }, 1800);
}
