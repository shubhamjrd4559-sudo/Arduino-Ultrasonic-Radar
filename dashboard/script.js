/* ═══════════════════════════════════════════════════════════════════
   ARDUINO ULTRASONIC RADAR — script.js
   Phase 1: Frontend Dashboard (DEMO / Simulation mode)
   ═══════════════════════════════════════════════════════════════════

   Architecture notes (for Phase 3 Web Serial integration):
   ─────────────────────────────────────────────────────────
   All hardware interaction is routed through the ArduinoSerial
   namespace below.  When Phase 3 arrives, only that namespace
   needs real implementation; the rest of the app stays untouched.

   Demo data flows through the same RadarState and Renderer paths
   that real serial data will use — so the UI/UX is fully tested now.
*/

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1.  CONSTANTS & CONFIGURATION
   ═══════════════════════════════════════════════════════════════════ */
const CFG = {
  // Canvas / Radar
  RADAR_PADDING:    10,           // px between canvas edge and radar arc
  RING_COUNT:       4,            // concentric distance rings
  ANGLE_MARKS:      [0,30,60,90,120,150,180], // degrees shown on arc
  SWEEP_TRAIL_DEG:  40,           // how wide the green sweep trail is
  DOT_RADIUS:       5,            // detection dot radius px
  DOT_FADE_MS:      8000,         // ms before a detection dot fully fades

  // Demo simulation
  DEMO_STEP_DEG:    2,            // sweep step size in degrees (demo)
  DEMO_STEP_MS:     40,           // ms between demo steps
  DEMO_DETECT_PROB: 0.18,         // probability of fake detection each step

  // Serial protocol (used in Phase 3)
  BAUD_RATE:        9600,
  CMD_START:        'START\n',
  CMD_STOP:         'STOP\n',
  CMD_MUTE:         'MUTE\n',
  CMD_UNMUTE:       'UNMUTE\n',
  CMD_THRESHOLD:    (cm) => `THRESHOLD:${cm}\n`,
};

/* ═══════════════════════════════════════════════════════════════════
   2.  APPLICATION STATE
   ═══════════════════════════════════════════════════════════════════ */
const RadarState = {
  // Connectivity
  connected:        false,     // true when real Arduino is connected
  demoMode:         true,      // false once real serial is active

  // Scanning
  scanning:         false,
  sweepAngle:       0,         // current sweep line angle (0–180°)
  sweepDir:         1,         // +1 or -1

  // Threshold
  threshold:        30,        // cm — detection threshold

  // Detection tracking
  detections:       [],        // [{angle, distance, timestamp}]
  detectionCount:   0,
  closestDistance:  Infinity,
  lastAngle:        null,

  // Buzzer
  buzzerMuted:      false,
  manualBuzzerMuted:false,
  buzzerActive:     false,

  // Timers
  _demoTimer:       null,
  _uptimeStart:     null,
  _uptimeTimer:     null,
};

/* ═══════════════════════════════════════════════════════════════════
   3.  ARDUINO SERIAL NAMESPACE — Web Serial API (Phase 3)
   ═══════════════════════════════════════════════════════════════════ */
const ArduinoSerial = {

  _port:              null,   // SerialPort object from navigator.serial
  _reader:            null,   // ReadableStreamDefaultReader (active reader)
  _writer:            null,   // WritableStreamDefaultWriter (for sending commands)
  _readLoopActive:    false,  // set false to signal read loop to exit cleanly
  _lineBuffer:        '',     // accumulates partial serial data between reads
  _disconnectHandler: null,   // bound reference kept for removeEventListener
  _textDecoder:       new TextDecoder(),
  _textEncoder:       new TextEncoder(),

  /* ── connect ─────────────────────────────────────────────────── */
  async connect() {
    if (!('serial' in navigator)) {
      UI.log('[SERIAL] Web Serial API not available.', 'error');
      UI.log('[SERIAL] Use Chrome or Edge (desktop, not file://).', 'warn');
      UI.setFooter('Web Serial not supported — Demo mode only.');
      return false;
    }
    try {
      UI.log('[SERIAL] Opening port picker…', 'info');
      // Prompts the browser permission dialog — user picks their COM port
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: CFG.BAUD_RATE });

      this._port           = port;
      this._readLoopActive = true;
      this._lineBuffer     = '';
      this._writer         = port.writable.getWriter();

      // Store the bound handler so we can remove it precisely on disconnect
      this._disconnectHandler = this._onPortDisconnect.bind(this);
      navigator.serial.addEventListener('disconnect', this._disconnectHandler);

      // Start the async read loop (fire-and-forget — runs until disconnect)
      this._startReadLoop();

      UI.log(`[SERIAL] Port opened at ${CFG.BAUD_RATE} baud.`, 'ok');
      return true;

    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User closed the picker without choosing a port — not an error
        UI.log('[SERIAL] No port selected — picker closed.', 'warn');
      } else {
        UI.log(`[SERIAL] Connection failed: ${err.message}`, 'error');
      }
      return false;
    }
  },

  /* ── _startReadLoop ──────────────────────────────────────────── */
  async _startReadLoop() {
    // Outer loop restarts if the readable stream closes but port is still open
    while (this._port && this._port.readable && this._readLoopActive) {
      const reader = this._port.readable.getReader();
      this._reader = reader;
      try {
        while (this._readLoopActive) {
          const { value, done } = await reader.read();
          if (done) break;   // stream ended (port closed cleanly)

          // Decode Uint8Array → string and append to line buffer
          this._lineBuffer += this._textDecoder.decode(value, { stream: true });

          // Split on newlines; keep any trailing incomplete fragment
          const lines = this._lineBuffer.split('\n');
          this._lineBuffer = lines.pop();

          for (const raw of lines) {
            const line = raw.replace(/\r/g, '').trim();
            if (line.length > 0) this._parseLine(line);
          }
        }
      } catch (err) {
        // Only surface errors that weren't caused by our own cancel() call
        if (this._readLoopActive) {
          UI.log(`[SERIAL] Read error: ${err.message}`, 'error');
          this._triggerDisconnect('Unexpected read error — cable pulled?');
        }
      } finally {
        reader.releaseLock();
        this._reader = null;
      }
      if (!this._readLoopActive) break;
    }
  },

  /* ── _parseLine ──────────────────────────────────────────────── */
  _parseLine(line) {
    try {
      if (line.startsWith('DATA:')) {
        // Format: DATA:<angle>,<distance>
        const reading = this._parseReading(line.slice(5));
        if (reading) LiveData.handleData(reading.angle, reading.distance);

      } else if (line.startsWith('DETECT:')) {
        // Format: DETECT:<angle>,<distance>
        const reading = this._parseReading(line.slice(7));
        if (reading && reading.distance !== 999) LiveData.handleDetect(reading.angle, reading.distance);

      } else if (line.startsWith('STATUS:')) {
        const msg = line.slice(7);
        UI.log(`[ARD] ${msg}`, 'ok');
        UI.setFooter(`Arduino: ${msg}`);

      } else if (line.startsWith('ERROR:')) {
        UI.log(`[ARD-ERR] ${line.slice(6)}`, 'error');

      } else {
        // Malformed or unknown prefix — log without crashing
        UI.log(`[SERIAL] Unknown message: "${line}"`, 'warn');
      }
    } catch (err) {
      UI.log(`[SERIAL] Parse error on "${line}": ${err.message}`, 'error');
    }
  },

  _parseReading(payload) {
    const match = /^(\d{1,3}),(\d{1,3})$/.exec(payload);
    if (!match) {
      UI.log(`[SERIAL] Invalid reading: "${payload}"`, 'warn');
      return null;
    }
    const angle = Number(match[1]);
    const distance = Number(match[2]);
    if (angle > 180 || (distance !== 999 && (distance < 2 || distance > 400))) {
      UI.log(`[SERIAL] Reading out of range: "${payload}"`, 'warn');
      return null;
    }
    return { angle, distance };
  },

  /* ── send ────────────────────────────────────────────────────── */
  async send(cmd) {
    if (!this._writer) {
      UI.log('[SERIAL] Cannot send — not connected.', 'error');
      return;
    }
    try {
      await this._writer.write(this._textEncoder.encode(cmd));
    } catch (err) {
      UI.log(`[SERIAL] Send error: ${err.message}`, 'error');
    }
  },

  /* ── disconnect (voluntary — called by the Disconnect button) ── */
  async disconnect() {
    this._readLoopActive = false;

    // Remove the cable-pull listener before we close
    if (this._disconnectHandler) {
      navigator.serial.removeEventListener('disconnect', this._disconnectHandler);
      this._disconnectHandler = null;
    }
    // Cancel the active reader (this unblocks the await reader.read())
    try { if (this._reader) await this._reader.cancel(); } catch (_) { /* ignore */ }
    this._reader = null;

    // Release the writer lock before closing the port
    try { if (this._writer) this._writer.releaseLock(); } catch (_) { /* ignore */ }
    this._writer = null;

    // Close the port
    try { if (this._port) await this._port.close(); }
    catch (err) { UI.log(`[SERIAL] Port close warning: ${err.message}`, 'warn'); }
    this._port       = null;
    this._lineBuffer = '';
  },

  /* ── _onPortDisconnect (physical cable-pull event) ───────────── */
  _onPortDisconnect(event) {
    if (event.target === this._port) {
      this._triggerDisconnect('USB cable disconnected.');
    }
  },

  /* ── _triggerDisconnect (shared cleanup for unexpected loss) ─── */
  async _triggerDisconnect(reason) {
    if (!RadarState.connected) return;   // guard against double-firing
    UI.log(`[SERIAL] ${reason}`, 'error');
    await this.disconnect();
    // Reset all application state back to disconnected / standby
    RadarState.connected    = false;
    RadarState.demoMode     = true;
    RadarState.scanning     = false;
    RadarState.buzzerActive = false;
    UI.updateConnection(false);
    UI.setConnectionButtons(false);
    UI.setScanButtons(false);
    UI.updateBuzzer(false, false);
    UI.updateDetectionStatus(false);
    UI.updateReadings(null, null);
    UI.setFooter('Connection lost. Reconnect or use Demo Mode.');
  },
};

/* ═══════════════════════════════════════════════════════════════════
   3b. LIVE DATA HANDLER  (Phase 3)
       Receives parsed serial lines and drives the radar UI + canvas.
       Called only when RadarState.demoMode === false.
   ═══════════════════════════════════════════════════════════════════ */
const LiveData = {

  _buzzerTimer: null,   // timeout handle to auto-clear the buzzer indicator
  _lastLoggedDetectTime: 0,
  _lastLoggedAngle: null,
  _lastLoggedDistance: null,

  /** DATA:<angle>,<distance>  — normal sweep step, no object in threshold */
  handleData(angle, distance) {
    // Drive the sweep line from real Arduino angle
    if (angle !== RadarState.sweepAngle) RadarState.sweepDir = angle > RadarState.sweepAngle ? 1 : -1;
    RadarState.sweepAngle = angle;

    // Arduino sends 999 when HC-SR04 reading is invalid or out of range
    const displayDist = (distance === 999) ? null : distance;
    UI.updateReadings(angle, displayDist);
    UI.setTimestamp();

    // If Arduino sends DATA with a valid reading within current threshold, treat as detection
    if (displayDist !== null && displayDist <= RadarState.threshold) {
      this.handleDetect(angle, displayDist);
      return;
    }

    UI.updateDetectionStatus(false);

    // Clear buzzer indicator on any non-detect step
    RadarState.buzzerActive = false;
    UI.updateBuzzer(RadarState.buzzerMuted, false);

    // Prune dots older than DOT_FADE_MS
    const now = Date.now();
    RadarState.detections = RadarState.detections.filter(
      d => now - d.timestamp < CFG.DOT_FADE_MS
    );
    UI.updateStats();
    Renderer.draw();
  },

  /** DETECT:<angle>,<distance>  — object detected within threshold */
  handleDetect(angle, distance) {
    if (angle !== RadarState.sweepAngle) RadarState.sweepDir = angle > RadarState.sweepAngle ? 1 : -1;
    RadarState.sweepAngle = angle;

    const now = Date.now();

    // Update existing dot at this angle or insert a new one
    const existing = RadarState.detections.find(d => Math.abs(d.angle - angle) < 2);
    if (existing) {
      existing.distance = distance;
      existing.timestamp = now;
    } else {
      RadarState.detections.push({ angle, distance, timestamp: now });
      RadarState.detectionCount++;
    }

    if (distance < RadarState.closestDistance) RadarState.closestDistance = distance;
    RadarState.lastAngle = angle;

    UI.updateReadings(angle, distance);
    UI.setTimestamp();
    UI.updateDetectionStatus(true);

    // Log detection during 180° sweep (logs when target angle or distance changes, or periodic refresh)
    const angleChanged = this._lastLoggedAngle === null || Math.abs(this._lastLoggedAngle - angle) >= 3;
    const distChanged  = this._lastLoggedDistance === null || Math.abs(this._lastLoggedDistance - distance) >= 3;
    const timeElapsed  = (now - this._lastLoggedDetectTime) > 1500;
    if (angleChanged || distChanged || timeElapsed) {
      UI.log(`[LIVE] Object at ${angle}° — ${distance} cm`, 'detect');
      this._lastLoggedDetectTime = now;
      this._lastLoggedAngle = angle;
      this._lastLoggedDistance = distance;
    }

    // Buzzer indicator: show active briefly, then auto-clear
    // (mirrors the Arduino's BUZZ_ON_MS = 80 ms physical buzz)
    if (!RadarState.buzzerMuted && UI.els.autoBuzz.checked) {
      RadarState.buzzerActive = true;
      UI.updateBuzzer(false, true);
      clearTimeout(this._buzzerTimer);
      this._buzzerTimer = setTimeout(() => {
        RadarState.buzzerActive = false;
        UI.updateBuzzer(RadarState.buzzerMuted, false);
      }, 400);
    }

    // Prune stale dots
    RadarState.detections = RadarState.detections.filter(
      d => now - d.timestamp < CFG.DOT_FADE_MS
    );
    UI.updateStats();
    Renderer.draw();
  },
};

/* ═══════════════════════════════════════════════════════════════════
   4.  CANVAS / RADAR RENDERER
   ═══════════════════════════════════════════════════════════════════ */
const Renderer = (() => {
  const canvas = document.getElementById('radarCanvas');
  const ctx    = canvas.getContext('2d');

  let size = 0;   // canvas width/height (square)
  let cx = 0, cy = 0; // centre x, y (bottom-centre of semicircle)
  let R  = 0;          // radius of outermost ring

  /** Resize canvas to fill available space (keeps it square) */
  function resize() {
    const section = canvas.parentElement.parentElement;
    const w = section.clientWidth;
    const h = section.clientHeight;
    // Account for section padding, header, and timestamp
    const available = Math.min(w - 24, (h - 70) * 2);
    size = Math.max(300, available);

    // Margins to guarantee angle labels (0°, 180°, 90°) stay well inside canvas
    const horizontalMargin = Math.max(42, Math.round(size * 0.055));
    const topMargin        = Math.max(32, Math.round(size * 0.045));
    const bottomMargin     = 18;

    R = Math.round((size / 2) - horizontalMargin);
    canvas.width  = size;
    canvas.height = R + topMargin + bottomMargin;
    cx = Math.round(size / 2);
    cy = canvas.height - bottomMargin;
    draw();
  }

  /** Convert polar radar coords to canvas XY */
  function polarToXY(angleDeg, radiusFraction) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx - R * radiusFraction * Math.cos(rad),  // mirror: 0°=left, 180°=right
      y: cy - R * radiusFraction * Math.sin(rad),
    };
  }

  /** Draw the static background grid */
  function drawGrid() {
    // Background fill
    ctx.fillStyle = '#020d0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Distance rings
    for (let i = 1; i <= CFG.RING_COUNT; i++) {
      const frac = i / CFG.RING_COUNT;
      ctx.beginPath();
      ctx.arc(cx, cy, R * frac, Math.PI, 0, false);
      ctx.strokeStyle = i === CFG.RING_COUNT
        ? 'rgba(0,255,65,0.55)'
        : 'rgba(0,255,65,0.18)';
      ctx.lineWidth = i === CFG.RING_COUNT ? 1.5 : 1;
      ctx.stroke();
    }

    // Baseline
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.strokeStyle = 'rgba(0,255,65,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Radial spokes at 30° intervals
    for (let a = 0; a <= 180; a += 30) {
      const p = polarToXY(a, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(0,255,65,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Angle labels — dynamically aligned so text never clips at edges or overlaps top
    const fontPx = Math.max(9, Math.round(size * 0.022));
    ctx.font = `bold ${fontPx}px 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(0,255,65,0.75)';

    for (const a of CFG.ANGLE_MARKS) {
      if (a === 0) {
        // Left baseline end: right-aligned just outside the arc (fully inside canvas)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('0\u00B0', cx - R - 8, cy);
      } else if (a === 180) {
        // Right baseline end: left-aligned just outside the arc (fully inside canvas)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('180\u00B0', cx + R + 8, cy);
      } else if (a === 90) {
        // Top vertical center: centered, sitting cleanly above the arc
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('90\u00B0', cx, cy - R - 6);
      } else {
        // Intermediate radial angles (30°, 60°, 120°, 150°)
        const p = polarToXY(a, 1.07);
        ctx.textAlign = (a < 90) ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${a}\u00B0`, p.x, p.y);
      }
    }

    // Distance-ring labels — positioned along the 90° vertical spoke (clean military radar layout)
    // away from the baseline and detection paths
    const thresholdCm = RadarState.threshold;
    const ringFontPx = Math.max(8, Math.round(size * 0.016));
    ctx.font = `bold ${ringFontPx}px 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(0,230,60,0.6)';
    ctx.textAlign  = 'left';
    ctx.textBaseline = 'bottom';

    for (let i = 1; i <= CFG.RING_COUNT; i++) {
      const frac = i / CFG.RING_COUNT;
      const distCm = Math.round(thresholdCm * frac);
      const p = polarToXY(90, frac);
      ctx.fillText(`${distCm}cm`, p.x + 4, p.y - 2);
    }

    // Centre dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,255,65,0.9)';
    ctx.fill();
  }

  /** Draw the sweep line + trailing green gradient */
  function drawSweep(angleDeg) {
    const trailDeg = CFG.SWEEP_TRAIL_DEG;
    const dir      = RadarState.sweepDir;

    // Trail (gradient from transparent green to bright orange at sweep edge)
    const trailStart = angleDeg + dir * trailDeg;
    const trailEnd   = angleDeg;

    const startRad = (Math.max(0, Math.min(180, trailStart)) * Math.PI) / 180;
    const endRad   = (Math.max(0, Math.min(180, trailEnd))   * Math.PI) / 180;

    // Draw filled arc trail
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    // Arc must go in the right winding direction
    if (dir > 0) {
      // sweeping left→right: trail is behind (at higher angles)
      ctx.arc(cx, cy, R, Math.PI - endRad, Math.PI - startRad, false);
    } else {
      ctx.arc(cx, cy, R, Math.PI - startRad, Math.PI - endRad, false);
    }
    ctx.closePath();

    const gradX1 = cx - R * Math.cos(endRad);
    const gradY1 = cy - R * Math.sin(endRad);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0,   'rgba(0,200,50,0.02)');
    grad.addColorStop(0.6, 'rgba(0,200,50,0.06)');
    grad.addColorStop(1,   'rgba(255,120,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Bright sweep line
    const tip = polarToXY(angleDeg, 1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tip.x, tip.y);
    const lineGrad = ctx.createLinearGradient(cx, cy, tip.x, tip.y);
    lineGrad.addColorStop(0,   'rgba(255,140,0,0.1)');
    lineGrad.addColorStop(0.5, 'rgba(255,140,0,0.6)');
    lineGrad.addColorStop(1,   'rgba(255,200,0,1)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255,140,0,0.8)';
    ctx.shadowBlur  = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /** Draw all detection dots with age-based fade and collision-free distance labels */
  function drawDetections() {
    const now = Date.now();
    // Sort descending by timestamp so newest detections receive label priority
    const sorted = [...RadarState.detections].sort((a, b) => b.timestamp - a.timestamp);
    const drawnLabels = []; // track [{x,y}] of rendered text labels to avoid collisions

    for (const det of sorted) {
      const age    = now - det.timestamp;
      const alpha  = Math.max(0, 1 - age / CFG.DOT_FADE_MS);
      if (alpha <= 0) continue;

      // Map distance to fraction (capped at threshold)
      const frac = Math.min(1, det.distance / RadarState.threshold);
      const p    = polarToXY(det.angle, frac);

      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, CFG.DOT_RADIUS * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,34,68,${alpha * 0.25})`;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, CFG.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,34,68,${alpha})`;
      ctx.shadowColor = `rgba(255,34,68,${alpha * 0.9})`;
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Distance label — show only for recent detections (< 3.5s) and skip if colliding
      if (size > 360 && (now - det.timestamp < 3500)) {
        const lx = p.x + 8;
        const ly = p.y - 6;

        // Check if another label was already placed within 26px
        const collides = drawnLabels.some(
          lbl => Math.hypot(lx - lbl.x, ly - lbl.y) < 26
        );

        if (!collides) {
          drawnLabels.push({ x: lx, y: ly });
          ctx.font = `bold ${Math.max(8, Math.round(size * 0.016))}px 'Courier New', monospace`;
          ctx.fillStyle = `rgba(255,130,130,${Math.min(1, alpha * 1.2)})`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${det.distance}cm`, lx, ly);
        }
      }
    }
  }

  /** Master draw — called every animation frame */
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    if (RadarState.scanning) drawSweep(RadarState.sweepAngle);
    drawDetections();
  }

  return { resize, draw, polarToXY };
})();

/* ═══════════════════════════════════════════════════════════════════
   5.  UI HELPERS
   ═══════════════════════════════════════════════════════════════════ */
const UI = {
  // DOM refs
  els: {},

  init() {
    const ids = [
      'btnConnect','btnDisconnect','btnStart','btnStop','btnClear','btnMute',
      'btnClearLog','autoBuzz','thresholdSlider','thresholdDisplay',
      'connectionDot','connectionLabel','connectionPill',
      'buzzerDot','buzzerLabel',
      'readAngle','readDistance',
      'detectionStatus','detIcon','detText',
      'detCount','closestDist','lastAngle',
      'scanMode','sweepSpeed','dataSource','uptime',
      'consoleBox','footerStatus','radarTimestamp','demoBadge',
    ];
    ids.forEach(id => { this.els[id] = document.getElementById(id); });
  },

  /** Append a line to the console box */
  log(msg, type = 'info') {
    const box  = this.els.consoleBox;
    const line = document.createElement('p');
    line.className = `console-line console-line--${type}`;
    const ts   = new Date().toLocaleTimeString('en-US', { hour12: false });
    line.textContent = `[${ts}] ${msg}`;
    box.appendChild(line);
    // Keep only last 80 lines
    while (box.children.length > 80) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  },

  setFooter(msg) {
    this.els.footerStatus.textContent = msg;
  },

  setTimestamp() {
    const now = new Date();
    this.els.radarTimestamp.textContent = now.toLocaleTimeString('en-US');
  },

  updateConnection(connected) {
    const dot   = this.els.connectionDot;
    const label = this.els.connectionLabel;
    const demo  = this.els.demoBadge;
    if (connected) {
      dot.className   = 'status-pill__dot connected';
      label.textContent = 'Connected';
      this.els.dataSource.textContent  = 'LIVE (Arduino)';
      this.els.dataSource.classList.remove('demo-text');
      demo.classList.add('hidden');
    } else {
      dot.className   = 'status-pill__dot';
      label.textContent = 'Disconnected';
      this.els.dataSource.textContent  = 'DEMO (Simulated)';
      this.els.dataSource.classList.add('demo-text');
      demo.classList.remove('hidden');
    }
  },

  updateBuzzer(muted, active) {
    const dot   = this.els.buzzerDot;
    const label = this.els.buzzerLabel;
    if (muted) {
      dot.className   = 'status-pill__dot buzzer-muted';
      label.textContent = 'Buzzer: MUTED';
    } else if (active) {
      dot.className   = 'status-pill__dot buzzer-on';
      label.textContent = 'Buzzer: ON ●';
    } else {
      dot.className   = 'status-pill__dot';
      label.textContent = 'Buzzer: OFF';
    }
  },

  updateReadings(angle, distance) {
    this.els.readAngle.textContent    = angle !== null ? angle : '---';
    this.els.readDistance.textContent = distance !== null ? distance : '---';
  },

  updateDetectionStatus(detected) {
    const status = this.els.detectionStatus;
    const text   = this.els.detText;
    if (detected) {
      status.className = 'detection-status detected';
      text.textContent = '! DETECTED !';
    } else if (RadarState.scanning) {
      status.className = 'detection-status clear';
      text.textContent = 'CLEAR';
    } else {
      status.className = 'detection-status';
      text.textContent = 'STANDBY';
    }
  },

  updateStats() {
    const s = RadarState;
    this.els.detCount.textContent  = s.detectionCount;
    this.els.closestDist.textContent = s.closestDistance === Infinity
      ? '--- cm'
      : `${s.closestDistance} cm`;
    this.els.lastAngle.textContent = s.lastAngle !== null ? `${s.lastAngle}°` : '---°';
    this.els.scanMode.textContent  = s.scanning
      ? (s.demoMode ? 'DEMO Sweep' : 'Live Sweep')
      : 'Idle';
  },

  updateSlider(value) {
    const slider = this.els.thresholdSlider;
    const pct = ((value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--pct', `${pct}%`);
    this.els.thresholdDisplay.textContent = `${value} cm`;
  },

  setScanButtons(scanning) {
    this.els.btnStart.disabled = scanning;
    this.els.btnStop.disabled  = !scanning;
  },

  setConnectionButtons(connected) {
    this.els.btnConnect.disabled    = connected;
    this.els.btnDisconnect.disabled = !connected;
  },
};

/* ═══════════════════════════════════════════════════════════════════
   6.  DEMO SIMULATION ENGINE
   ═══════════════════════════════════════════════════════════════════ */
const Demo = {
  /** Start the simulated radar sweep */
  start() {
    if (RadarState._demoTimer) return;
    RadarState.scanning  = true;
    RadarState.sweepAngle = RadarState.sweepAngle || 0;
    RadarState.sweepDir  = 1;

    UI.log('[DEMO] Simulated sweep started.', 'warn');
    UI.setScanButtons(true);
    UI.setFooter('DEMO MODE — simulated sweep running.');

    // Start uptime counter
    if (!RadarState._uptimeStart) RadarState._uptimeStart = Date.now();
    RadarState._uptimeTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - RadarState._uptimeStart) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      UI.els.uptime.textContent = `${h}:${m}:${s}`;
    }, 1000);

    RadarState._demoTimer = setInterval(() => this.step(), CFG.DEMO_STEP_MS);
  },

  /** Stop the simulated sweep */
  stop() {
    clearInterval(RadarState._demoTimer);
    clearInterval(RadarState._uptimeTimer);
    RadarState._demoTimer  = null;
    RadarState.scanning    = false;

    UI.log('[DEMO] Sweep stopped.', 'warn');
    UI.setScanButtons(false);
    UI.setFooter('Scan stopped. Click "Start Scan" to resume.');
    UI.updateReadings(null, null);
    UI.updateDetectionStatus(false);
    UI.updateStats();
  },

  // 3 consistent virtual targets for realistic demo simulation
  // Target A: near obstacle at 48° (22 cm) — visible within default 30cm threshold
  // Target B: mid-range obstacle at 128° (62 cm) — visible when threshold > 62cm
  // Target C: distant obstacle at 88° (115 cm) — visible when threshold > 115cm
  _targets: [
    { angle: 48,  width: 5, dist: 22 },
    { angle: 128, width: 6, dist: 62 },
    { angle: 88,  width: 4, dist: 115 },
  ],

  /** One sweep step */
  step() {
    const s = RadarState;
    s.sweepAngle += CFG.DEMO_STEP_DEG * s.sweepDir;

    // Bounce at ends
    if (s.sweepAngle >= 180) { s.sweepAngle = 180; s.sweepDir = -1; }
    if (s.sweepAngle <= 0)   { s.sweepAngle = 0;   s.sweepDir =  1; }

    const curAngle = Math.round(s.sweepAngle);
    let hasObject = false;
    let distance  = null;

    // Check if current sweep line intersects any virtual target
    for (const tgt of this._targets) {
      if (Math.abs(curAngle - tgt.angle) <= tgt.width) {
        // Only detectable if within the active threshold
        if (tgt.dist <= s.threshold) {
          hasObject = true;
          // Realistic ±1 cm ultrasonic sensor jitter
          const jitter = (Math.random() < 0.25) ? (Math.random() < 0.5 ? 1 : -1) : 0;
          distance = Math.max(2, tgt.dist + jitter);
          break;
        }
      }
    }

    UI.updateReadings(curAngle, distance);
    UI.setTimestamp();

    if (hasObject && distance !== null) {
      this.recordDetection(curAngle, distance);
      UI.updateDetectionStatus(true);
      this.triggerBuzzer(true);
    } else {
      UI.updateDetectionStatus(false);
      this.triggerBuzzer(false);
    }

    // Prune stale detections
    const now = Date.now();
    s.detections = s.detections.filter(d => now - d.timestamp < CFG.DOT_FADE_MS);

    UI.updateStats();
    Renderer.draw();
  },

  recordDetection(angle, distance) {
    const s = RadarState;
    // Prevent duplicate dots at identical angle within 500ms
    const isRecent = s.detections.some(
      d => d.angle === angle && Math.abs(d.distance - distance) <= 2 && (Date.now() - d.timestamp < 500)
    );
    if (!isRecent) {
      s.detections.push({ angle, distance, timestamp: Date.now() });
      s.detectionCount++;
      if (distance < s.closestDistance) s.closestDistance = distance;
      s.lastAngle = angle;
      UI.log(`[DEMO] Target detected at ${angle}° — ${distance} cm`, 'detect');
    }
  },

  triggerBuzzer(active) {
    if (RadarState.buzzerMuted || !UI.els.autoBuzz.checked) active = false;
    RadarState.buzzerActive = active;
    UI.updateBuzzer(RadarState.buzzerMuted, active);
  },
};

/* ═══════════════════════════════════════════════════════════════════
   7.  EVENT HANDLERS
   ═══════════════════════════════════════════════════════════════════ */
function bindEvents() {
  const e = UI.els;

  /* — Connect Arduino — */
  e.btnConnect.addEventListener('click', async () => {
    UI.log('[SERIAL] Attempting connection…', 'info');
    const ok = await ArduinoSerial.connect();
    if (ok) {
      // Do not leave the demo timer running beside live serial readings.
      if (RadarState._demoTimer) Demo.stop();
      RadarState.connected = true;
      RadarState.demoMode  = false;
      UI.updateConnection(true);
      UI.setConnectionButtons(true);
      UI.log('[SERIAL] Arduino connected.', 'ok');
      UI.setFooter('Arduino connected. Ready to scan.');
    } else {
      UI.log('[INFO] Falling back to DEMO MODE.', 'warn');
      UI.setFooter('DEMO MODE active — Arduino not connected.');
    }
  });

  /* — Disconnect — */
  e.btnDisconnect.addEventListener('click', async () => {
    // Stop whichever scanning mode is active
    if (RadarState.scanning) {
      if (RadarState.demoMode) { Demo.stop(); }
      else {
        // Live mode: send STOP to Arduino before closing port
        await ArduinoSerial.send(CFG.CMD_STOP);
        RadarState.scanning = false;
        UI.setScanButtons(false);
      }
    }
    await ArduinoSerial.disconnect();
    RadarState.connected    = false;
    RadarState.demoMode     = true;
    RadarState.buzzerActive = false;
    UI.updateConnection(false);
    UI.setConnectionButtons(false);
    UI.updateBuzzer(false, false);
    UI.updateReadings(null, null);
    UI.updateDetectionStatus(false);
    UI.log('[SERIAL] Disconnected from Arduino.', 'warn');
    UI.setFooter('Disconnected. Reconnect or use Demo Mode.');
  });

  /* — Start Scan — */
  e.btnStart.addEventListener('click', () => {
    if (RadarState.connected && !RadarState.demoMode) {
      ArduinoSerial.send(CFG.CMD_START);
      RadarState.scanning = true;
      UI.setScanButtons(true);
      UI.log('[SERIAL] START sent to Arduino.', 'info');
      UI.setFooter('Live scan started — Arduino sweeping.');
    } else {
      Demo.start();
    }
  });

  /* — Stop Scan — */
  e.btnStop.addEventListener('click', () => {
    if (RadarState.connected && !RadarState.demoMode) {
      ArduinoSerial.send(CFG.CMD_STOP);
      RadarState.scanning = false;
      UI.setScanButtons(false);
      UI.updateDetectionStatus(false);
      UI.log('[SERIAL] STOP sent to Arduino.', 'info');
      UI.setFooter('Live scan stopped.');
    } else {
      Demo.stop();
    }
  });

  /* — Clear Radar — */
  e.btnClear.addEventListener('click', () => {
    RadarState.detections       = [];
    RadarState.detectionCount   = 0;
    RadarState.closestDistance  = Infinity;
    RadarState.lastAngle        = null;
    UI.updateStats();
    UI.updateDetectionStatus(false);
    Renderer.draw();
    UI.log('[UI] Radar cleared.', 'info');
  });

  /* — Mute Buzzer — */
  e.btnMute.addEventListener('click', () => {
    RadarState.manualBuzzerMuted = !RadarState.manualBuzzerMuted;
    RadarState.buzzerMuted = RadarState.manualBuzzerMuted || !e.autoBuzz.checked;
    const muted = RadarState.buzzerMuted;
    e.btnMute.textContent = RadarState.manualBuzzerMuted ? '🔊 Unmute Buzzer' : '🔇 Mute Buzzer';
    UI.updateBuzzer(muted, RadarState.buzzerActive);
    if (RadarState.connected) {
      ArduinoSerial.send(muted ? CFG.CMD_MUTE : CFG.CMD_UNMUTE);
    }
    UI.log(`[UI] Buzzer ${muted ? 'MUTED' : 'UNMUTED'}.`, 'info');
  });

  /* — Detection Threshold Slider — */
  e.thresholdSlider.addEventListener('input', (ev) => {
    const val = parseInt(ev.target.value, 10);
    RadarState.threshold = val;
    UI.updateSlider(val);
    if (RadarState.connected) {
      ArduinoSerial.send(CFG.CMD_THRESHOLD(val));
    }
    UI.log(`[UI] Threshold set to ${val} cm.`, 'info');
    Renderer.draw(); // Redraw grid labels
  });

  /* — Auto-Buzz Toggle — */
  e.autoBuzz.addEventListener('change', (ev) => {
    RadarState.buzzerMuted = RadarState.manualBuzzerMuted || !ev.target.checked;
    UI.updateBuzzer(RadarState.buzzerMuted, RadarState.buzzerActive);
    if (RadarState.connected) {
      ArduinoSerial.send(RadarState.buzzerMuted ? CFG.CMD_MUTE : CFG.CMD_UNMUTE);
    }
    UI.log(`[UI] Auto-buzz ${ev.target.checked ? 'enabled' : 'disabled'}.`, 'info');
  });

  /* — Clear Log — */
  e.btnClearLog.addEventListener('click', () => {
    UI.els.consoleBox.innerHTML = '';
    UI.log('[UI] Log cleared.', 'info');
  });

  /* — Resize — */
  window.addEventListener('resize', () => {
    Renderer.resize();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   8.  ANIMATION LOOP
       Keeps detections fading smoothly even while sweeping
   ═══════════════════════════════════════════════════════════════════ */
function animLoop() {
  // Only redraw between steps to handle fade-out while not scanning
  if (!RadarState.scanning) {
    const hasVisible = RadarState.detections.some(
      d => Date.now() - d.timestamp < CFG.DOT_FADE_MS
    );
    if (hasVisible) Renderer.draw();
  }
  requestAnimationFrame(animLoop);
}

/* ═══════════════════════════════════════════════════════════════════
   9.  INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  Renderer.resize();
  UI.updateConnection(false);
  UI.updateBuzzer(false, false);
  UI.updateSlider(RadarState.threshold);
  UI.setConnectionButtons(false);
  UI.setScanButtons(false);
  UI.log('[SYSTEM] Dashboard initialised.', 'info');
  UI.log('[DEMO]   Running in simulation mode — no Arduino connected.', 'warn');
  UI.log('[INFO]   Click "Start Scan" to begin demo sweep.', 'info');
  UI.setFooter('System ready — Connect Arduino or click "Start Scan" for demo.');

  bindEvents();
  animLoop();
});
