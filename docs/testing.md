# Arduino Ultrasonic Radar — Testing & Troubleshooting Guide

This guide covers step-by-step firmware compilation, uploading via Arduino IDE, standalone Serial Monitor verification, browser Web Serial integration, and troubleshooting for common hardware defects.

---

## 1. Prerequisites

Before testing, verify you have the following installed on your Windows laptop:

1. **Arduino IDE 2.x** (or 1.8.x): Download from [arduino.cc/en/software](https://www.arduino.cc/en/software).
2. **USB-to-Serial Drivers:**
   * Genuine Arduino UNO boards (with ATmega16U2 chip) install automatically in Windows.
   * Arduino clones using the **CH340 / CH341** USB chip require the CH340 driver (download from your board vendor or wch-ic.com if Windows Device Manager shows an unrecognized `USB2.0-Serial` device).
3. **Web Browser:** **Google Chrome** or **Microsoft Edge** (desktop). Firefox and Safari do **not** support the Web Serial API.
4. **Python 3** (or Node.js): Used to host the dashboard locally on `localhost:8080`.

---

## 2. Step-by-Step Arduino IDE Compilation & Upload

Follow these instructions to flash the firmware to your Arduino UNO:

1. **Connect the Board:** Plug your Arduino UNO into your laptop using a standard USB A-to-B cable.
2. **Open the Sketch:**
   * Launch **Arduino IDE**.
   * Go to **File → Open...**
   * Navigate to your project directory and select:
     ```
     Arduino-Ultrasonic-Radar\arduino\arduino_radar\arduino_radar.ino
     ```
3. **Select Board:**
   * In the top toolbar, open the **Select Board** dropdown (or **Tools → Board → Arduino AVR Boards**).
   * Choose **Arduino Uno**.
4. **Select COM Port:**
   * Open **Tools → Port**.
   * Select the port associated with your board (e.g. `COM3`, `COM4`, or `COM7 (Arduino Uno)`).
5. **Verify (Compile) the Code:**
   * Click the **Verify** button (check-mark icon ✔ in the top-left corner).
   * Confirm the bottom output pane displays:
     ```
     Sketch uses ~4300 bytes (13%) of program storage space.
     Global variables use ~310 bytes (15%) of dynamic memory.
     ```
   * *If any errors appear, check that the built-in `<Servo.h>` library is installed.*
6. **Upload to Board:**
   * Click the **Upload** button (right-arrow icon ➔).
   * The TX/RX LEDs on your Arduino board will flicker rapidly.
   * Wait until the status bar displays **"Done uploading"**.

---

## 3. Standalone Hardware Test (Serial Monitor)

Before connecting the web dashboard, verify that the Arduino firmware and sensors operate correctly using the built-in Arduino IDE Serial Monitor:

1. **Open Serial Monitor:**
   * Go to **Tools → Serial Monitor** (or click the magnifying glass icon in the top-right).
   * In the Serial Monitor settings, ensure the baud rate is set to **`9600 baud`** and line ending is set to **`Newline`** (or `Both NL & CR`).
2. **Observe Boot Banner:**
   * Press the physical red **Reset** button on the Arduino UNO.
   * The Serial Monitor should display:
     ```
     STATUS:Arduino Radar v1.0 ready
     STATUS:Send START to begin sweep
     ```
   * The SG90 servo will park at 0° (leftmost position).
3. **Test Sweep Command:**
   * In the Serial Monitor input field, type `START` and press **Enter**.
   * The servo should begin rotating smoothly from 0° to 180° and reversing back to 0°.
   * Streaming data will appear:
     ```
     DATA:0,999
     DATA:2,45
     DATA:4,44
     ```
4. **Test Obstacle Detection & Buzzer:**
   * Place your hand or a cardboard box approximately 15 cm in front of the ultrasonic sensor while the beam passes over it.
   * You should see:
     ```
     DETECT:48,15
     ```
   * The buzzer should emit a brief tone.
5. **Test Runtime Commands:**
   * Type `MUTE` → Observe `STATUS:Buzzer muted` (subsequent detections will remain silent).
   * Type `UNMUTE` → Observe `STATUS:Buzzer unmuted`.
   * Type `THRESHOLD:50` → Observe `STATUS:Threshold set to 50 cm`.
   * Type `STOP` → Observe `STATUS:Sweep stopped` (servo halts at current position).
6. **CRITICAL STEP — Close Serial Monitor:**
   * **Close the Arduino Serial Monitor window completely.**
   * *On Windows, a COM port can only be opened by ONE application at a time. Leaving the Serial Monitor open will block the web browser from connecting.*

---

## 4. End-to-End Browser Dashboard Test

Now connect the real hardware to the web dashboard:

1. **Start the Local Web Server:**
   * Open **PowerShell** or Command Prompt and run:
     ```powershell
     cd "c:\Users\shubh\OneDrive\Pictures\Desktop\Arduino-Ultrasonic-Radar\dashboard"
     python -m http.server 8080
     ```
2. **Open Dashboard:**
   * Launch **Google Chrome** or **Microsoft Edge**.
   * Navigate to: **`http://localhost:8080`**
3. **Connect to Arduino:**
   * Click the green **`🔌 Connect Arduino`** button in the top-left card.
   * The browser displays a permission prompt listing available serial ports.
   * Select your Arduino COM port (e.g., `Arduino Uno (COM3)`) and click **Connect**.
4. **Verify UI State Transition:**
   * The `DEMO MODE` orange badge disappears.
   * The connection status pill switches to green: `● Connected`.
   * Data Source displays `LIVE (Arduino)`.
   * Console log outputs: `[SERIAL] Port opened at 9600 baud.` followed by `[ARD] Arduino Radar v1.0 ready`.
5. **Start Scanning:**
   * Click **`▶ Start Scan`**.
   * The physical servo begins sweeping.
   * The orange beam on the screen tracks the real physical servo angle in lockstep.
   * Real distance readings appear in the `LIVE READINGS` card.
   * When an obstacle is detected, glowing red target markers appear on the radar grid and fade over time.

---

## 5. Hardware Testing Checklist

Use this checklist during your physical testing:

- [ ] **Power & Status:** Arduino power LED (ON) illuminates steady green/red; no unexpected board resets during servo movement.
- [ ] **Servo Mechanical Range:** Servo sweeps smoothly between 0° and 180° without stuttering, chattering, or mechanical binding.
- [ ] **Sensor Rotation:** HC-SR04 rotates smoothly with the servo; jumper wires do not snag or pull out.
- [ ] **Distance Accuracy:** An obstacle placed at 20 cm reads between 18 cm and 22 cm on the dashboard.
- [ ] **Out-of-Range Handling:** When pointed at open space, distance returns `---` (out-of-range sentinel `999`), not false detections.
- [ ] **Buzzer Response:** Buzzer chirps when an object enters the detection threshold.
- [ ] **Mute Control:** Clicking "Mute Buzzer" in the dashboard silences the buzzer immediately.
- [ ] **Threshold Slider:** Adjusting the slider to 50 cm immediately updates the Arduino threshold and ring markings.
- [ ] **Clean Disconnect:** Clicking "Disconnect" releases the COM port cleanly, allowing reconnects without restarting the browser.

---

## 6. Troubleshooting Guide

### A. Distance Reads `---` or Always `999` (No Target Detected)
* **Cause 1:** Loose or swapped trigger/echo wires.
  * **Fix:** Verify HC-SR04 `TRIG` is on **Pin 9** and `ECHO` is on **Pin 10**. Swapping these two wires prevents measurement.
* **Cause 2:** Sensor lacks 5V power.
  * **Fix:** Measure voltage across HC-SR04 `VCC` and `GND` using a multimeter. It must be at least 4.5V. If plugged into a weak breadboard rail, re-seat the jumper wires.
* **Cause 3:** Acoustic absorption / angle deflection.
  * **Fix:** Ultrasonic pulses bounce away from soft fabrics or steep diagonal surfaces. Test using a flat, hard, perpendicular surface (such as a book, box, or wall).

---

### B. Arduino Resets / Serial Disconnects When Servo Starts Moving
* **Cause:** SG90 servo inrush current causes a 5V rail voltage drop below the brownout threshold (4.3V).
* **Fix 1:** Insert a **100 µF to 470 µF electrolytic capacitor** directly across the breadboard `5V` and `GND` rails as described in [`docs/wiring.md`](wiring.md).
* **Fix 2:** Use a high-quality USB cable connected directly to a laptop USB 3.0 / powered USB port (avoid unpowered USB hubs).
* **Fix 3:** If necessary, power the servo from an external 5V power supply (e.g. 4x AA batteries or 5V 1A adapter), ensuring the external ground is connected to the Arduino GND.

---

### C. Servo Does Not Move or Only Jitters at One Angle
* **Cause 1:** Signal wire plugged into the wrong pin.
  * **Fix:** Verify the SG90 orange/yellow signal wire is connected to **Pin 6** (PWM-capable pin).
* **Cause 2:** Servo horn mounted at wrong mechanical offset.
  * **Fix:** Remove the plastic servo horn screw, power the Arduino with code loaded (which parks the servo at 0°), then manually attach the horn so the sensor points directly to the 0° position (left) before re-tightening.

---

### D. Buzzer Doesn't Sound or Makes Only a Quiet Click
* **Cause 1:** Reversed polarity.
  * **Fix:** Ensure the buzzer positive (+) leg is connected to **Pin 11** and the negative (−) leg is connected to **GND**.
* **Cause 2:** Active buzzer being driven by `tone()`.
  * **Fix:** If your buzzer has a sealed base and internal oscillator (active buzzer), open [`arduino/arduino_radar/arduino_radar.ino`](../arduino/arduino_radar/arduino_radar.ino), comment out `tone(...)`, and uncomment `digitalWrite(PIN_BUZZER, HIGH)`.

---

### E. Browser Error: "Failed to open serial port" / "Access Denied"
* **Cause 1:** Port is locked by another program.
  * **Fix:** Close Arduino IDE Serial Monitor, Serial Plotter, or any terminal emulator (PuTTY, Cura, etc.) using that COM port.
* **Cause 2:** Device Manager port conflict.
  * **Fix:** Unplug the USB cable, wait 5 seconds, reconnect it, and refresh `http://localhost:8080`.

---

### F. Browser Button Does Nothing / Web Serial Not Supported
* **Cause 1:** Using an unsupported browser (Firefox, Safari).
  * **Fix:** Use Google Chrome or Microsoft Edge.
* **Cause 2:** Opened via file protocol (`file:///.../index.html`).
  * **Fix:** Web Serial API is strictly disabled on `file://` URLs for security. You must run `python -m http.server 8080` in the `dashboard` folder and open `http://localhost:8080`.
