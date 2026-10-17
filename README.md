# 📡 Arduino Ultrasonic Radar System

[![Arduino](https://img.shields.io/badge/Arduino-UNO%20%7C%20Nano-00979D?style=for-the-badge&logo=arduino&logoColor=white)](https://www.arduino.cc/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5 / CSS3](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![Web Serial API](https://img.shields.io/badge/Web%20Serial%20API-Chrome%20%7C%20Edge-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

A real-time **180° Ultrasonic Radar Detection & Visualization System** built using **Arduino UNO / Nano**, an **HC-SR04 ultrasonic distance sensor**, an **SG90 micro servo motor**, a **piezo buzzer**, and a modern **Web Serial browser dashboard**.

No third-party desktop runtime (such as Processing or Python serial bridges) is required. The web dashboard connects directly to the Arduino microcontroller via the modern browser **Web Serial API**.

---

## 📸 Visual Showcase & Working Prototype

### 🖥️ Sci-Fi Web Radar Dashboard
<div align="center">
  <img src="assets/dashboard.png" alt="Arduino Ultrasonic Radar Dashboard UI" width="900" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,255,65,0.25);" />
  <p><em>Real-time military HUD web dashboard: 180° sweep line, calibrated distance rings, obstacle detection blips, live angle/distance telemetry, and control deck.</em></p>
</div>

### 🔌 Physical Hardware Assembly
<div align="center">
  <img src="assets/hardware_setup.jpeg" alt="Arduino Ultrasonic Radar Hardware Setup" width="600" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0,255,65,0.2);" />
  <p><em>Physical prototype: Arduino UNO R3, HC-SR04 ultrasonic sensor mounted on SG90 servo horn, and piezo buzzer alarm.</em></p>
</div>

> 📹 **Live Demonstration Video:** Check out the working demonstration video in [`assets/radar_demo.mp4`](assets/radar_demo.mp4) showing real-time 180° sweeping and obstacle detection!

---

## ✨ Key Features

* **🔄 Full 180° Panoramic Sweep:** Servo motor rotates the ultrasonic sensor smoothly back and forth between `0°` and `180°`.
* **🎯 Accurate Distance Measurement:** HC-SR04 sonar module calculates distance (2 cm to 400 cm) in real time with high precision.
* **🌐 Native Web Serial Dashboard:** Plug-and-play USB connection directly through modern web browsers (Chrome / Edge) using `navigator.serial`.
* **🖥️ Sci-Fi Military HUD Radar UI:**
  * Animated sweep line with trailing phosphor gradient.
  * 4 concentric calibrated distance rings with radial spokes at 30° intervals.
  * Color-coded target blips that fade automatically over time.
  * Real-time angle (`0°–180°`), distance (`cm`), and closest obstacle statistics.
* **🔊 Smart Audio Alarm:**
  * Physical buzzer sound on target acquisition.
  * Web dashboard audio indicator + Software Mute / Unmute controls.
  * Auto-buzz toggle with configurable response.
* **🎚️ Dynamic Threshold Adjustment:** Real-time distance threshold slider (5 cm to 200 cm) synchronized bi-directionally between web UI and Arduino firmware.
* **🎮 Dual Mode Support:**
  * **Live Mode:** Real-time physical hardware telemetry.
  * **Simulation / Demo Mode:** Built-in virtual targets allowing offline testing without hardware connected.

---

## 🧰 Hardware Bill of Materials (BOM)

| Component | Quantity | Purpose | Operating Voltage |
|:---|:---:|:---|:---:|
| **Arduino UNO R3 / Nano** | 1 | Microcontroller & USB Serial Host | 5V DC (USB powered) |
| **HC-SR04** | 1 | Ultrasonic Distance Sensor (40 kHz sonar) | 5V DC (~15 mA) |
| **SG90 9g Micro Servo** | 1 | 180° Sweep Actuator | 4.8V – 6.0V |
| **5V Piezo Buzzer** | 1 | Audible Object Detection Alarm | 3.3V – 5V (< 30 mA) |
| **Breadboard & Jumper Wires** | 1 | Circuit interconnection & common ground rail | — |
| **100 µF – 470 µF Capacitor** *(Optional)* | 1 | Power rail buffer against servo motor voltage dips | ≥ 10V rated |

---

## 🔌 Circuit Diagram & Wiring Guide

All components share a **common ground rail** on the breadboard.

```
       +-----------------------------------------------------------+
       |                     ARDUINO UNO R3                        |
       |                                                           |
       |  [5V]  [GND]         [D6]        [D9]       [D10]   [D11] |
       +---|------|------------|-----------|-----------|-------|---+
           |      |            |           |           |       |
           |      |       (PWM Servo)   (Trig)      (Echo)  (Buzzer)
           |      |            |           |           |       |
           |   +--+----+       |           |           |       |
           |   |       |       |           |           |       |
         [5V] [GND]    |       |           |           |       |
        Breadboard     |       |           |           |       |
         Power Rails   |       |           |           |       |
           |      |    |       |           |           |       |
       +---|------|----+       |           |           |       |
       |   |      |            |           |           |       |
       |  VCC    GND         Signal        |           |       |
       |  [ SG90 SERVO ] <-----+           |           |       |
       |                                   |           |       |
       |  VCC    GND                      TRIG        ECHO     |
       |  [ HC-SR04 SENSOR ] <-------------+-----------+       |
       |                                                       |
       |  (+)    (-)                                           |
       |  [ PIEZO BUZZER ] <-----------------------------------+
```

### Complete Pin Connections Matrix

| Component | Component Pin | Arduino UNO Pin | Wire Type | Function |
|:---|:---|:---:|:---:|:---|
| **HC-SR04** | **VCC** | **5V** (Breadboard Rail) | M-F | 5V Sensor Power Supply |
| **HC-SR04** | **TRIG** | **Pin 9** *(or Pin 3)* | M-F | 10 µs Trigger Pulse Output |
| **HC-SR04** | **ECHO** | **Pin 10** *(or Pin 5)* | M-F | Echo Pulse Return Input |
| **HC-SR04** | **GND** | **GND** (Breadboard Rail) | M-F | Ground Reference |
| **SG90 Servo** | **VCC (Red)** | **5V** (Breadboard Rail) | M-M | Motor Power |
| **SG90 Servo** | **GND (Brown/Black)**| **GND** (Breadboard Rail) | M-M | Motor Ground |
| **SG90 Servo** | **Signal (Orange/Yellow)**| **Pin 6** | M-M | 50 Hz PWM Position Signal |
| **Buzzer** | **(+) / Long leg** | **Pin 11** | M-M | Tone PWM / Audible Alarm |
| **Buzzer** | **(−) / Short leg** | **GND** (Breadboard Rail) | M-M | Ground Reference |

> 💡 *Note: If you have wired your ultrasonic sensor to Pins 3 and 5 instead of 9 and 10, simply change `PIN_TRIG = 3;` and `PIN_ECHO = 5;` at the top of the Arduino sketch.*

---

## 📂 Project Directory Structure

```plaintext
Arduino-Ultrasonic-Radar/
├── assets/                          # Project media and visual assets
│   ├── dashboard.png                # High-resolution screenshot of web radar dashboard
│   ├── hardware_setup.jpeg          # Photo of the physical Arduino setup
│   └── radar_demo.mp4               # Video demo of the 180° sweep in action
├── arduino/                         # Microcontroller firmware
│   └── arduino_radar/
│       └── arduino_radar.ino        # Complete 180° radar Arduino sketch
├── dashboard/                       # Modern web frontend
│   ├── index.html                   # Semantic HTML5 layout & radar canvas
│   ├── script.js                    # Web Serial driver, renderer & simulation
│   └── style.css                    # Sci-Fi radar dark theme styling
├── docs/                            # In-depth technical documentation
│   ├── wiring.md                    # Hardware wiring guide & safety notes
│   └── testing.md                   # Systematic testing & validation checklist
├── .gitignore                       # Clean Git configuration
└── README.md                        # Master project documentation
```

---

## ⚡ Quick Start Guide

### Step 1: Upload Firmware to Arduino

1. Connect your Arduino UNO or Nano to your PC via USB cable.
2. Open the [Arduino IDE](https://www.arduino.cc/en/software).
3. Open [`arduino/arduino_radar/arduino_radar.ino`](arduino/arduino_radar/arduino_radar.ino).
4. Select your board under **Tools → Board** (e.g. *Arduino Uno* or *Arduino Nano*).
5. Select the appropriate **Tools → Port** (e.g. `COM3` on Windows).
6. Click **Upload** (Ctrl + U).

### Step 2: Run the Web Dashboard

Because modern browsers enforce security permissions for the **Web Serial API**, the dashboard must be served from `http://localhost` (or `https://`):

Run a local server from the project directory:

```bash
# Using Python built-in server (recommended)
cd dashboard
python -m http.server 8080
```

Now open **Google Chrome** or **Microsoft Edge** and navigate to:
```
http://localhost:8080
```

### Step 3: Connect & Scan

1. On the web dashboard, click **🔌 Connect Arduino**.
2. A browser permission popup will appear — select your Arduino COM port and click **Connect**.
3. Click **▶ Start Scan**.
4. The SG90 servo will begin sweeping from `0°` to `180°` and back. Real-time targets detected by the HC-SR04 sensor will immediately appear on the radar HUD!

---

## 📡 Serial Communication Protocol

The system uses a clean, line-delimited ASCII protocol operating at **9600 baud** over USB Serial:

### Arduino ➔ Dashboard (Telemetry)

| Message | Meaning | Example |
|:---|:---|:---|
| `DATA:<angle>,<dist>` | Normal sweep step, no obstacle within threshold | `DATA:90,45` (At 90°, dist is 45 cm) |
| `DETECT:<angle>,<dist>` | Object detected within active threshold | `DETECT:45,18` (Object detected at 45°, 18 cm) |
| `STATUS:<message>` | System status update (boot, sweep start, etc.) | `STATUS:180 degree radar sweep started` |
| `ERROR:<message>` | Sensor error or buffer overflow | `ERROR:Threshold out of range (5-200 cm)` |

### Dashboard ➔ Arduino (Commands)

| Command | Action |
|:---|:---|
| `START\n` | Starts servo 180° sweep and telemetry transmission |
| `STOP\n` | Halts servo sweep and silences buzzer |
| `MUTE\n` | Silences physical buzzer alerts |
| `UNMUTE\n` | Re-enables buzzer alarms |
| `THRESHOLD:<cm>\n` | Updates detection threshold distance (5–200 cm) |

---

## 🔧 Troubleshooting

<details>
<summary><b>1. Web Serial button does not open the port picker</b></summary>

* Make sure you are using a Chromium-based desktop browser (**Google Chrome** or **Microsoft Edge**). Firefox and Safari do not support the Web Serial API.
* Ensure you opened the dashboard via `http://localhost:8080` and **not** directly as a `file:///` URL.
</details>

<details>
<summary><b>2. "Port already open" or Arduino upload failed</b></summary>

* A serial port can only be opened by one program at a time.
* If you want to re-upload code via the Arduino IDE, disconnect the dashboard or close the browser tab first.
* Close the Arduino IDE Serial Monitor before connecting through the web dashboard.
</details>

<details>
<summary><b>3. Servo motor jitters or Arduino resets during sweep</b></summary>

* An SG90 servo can draw up to 250 mA peak during direction changes, which may cause a voltage drop on USB power.
* Add a **100 µF – 470 µF electrolytic capacitor** across the breadboard `5V` (+) and `GND` (−) rails.
* Ensure jumper wires are firmly seated in the breadboard.
</details>

---

## 👨‍💻 Author

* **Shubham Kumar** — [@shubhamjrd4559-sudo](https://github.com/shubhamjrd4559-sudo)

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and build upon it for academic, personal, or commercial projects.
