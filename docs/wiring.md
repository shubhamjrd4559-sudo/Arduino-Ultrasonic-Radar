# Arduino Ultrasonic Radar — Hardware Wiring Guide

This guide details all electrical connections, pin assignments, power considerations, and common-ground rules for the **Arduino Ultrasonic Radar System**.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Quantity | Purpose | Operating Voltage |
|---|:---:|---|:---:|
| **Arduino UNO R3** | 1 | Microcontroller / USB Serial Host | 5V DC (USB powered) |
| **HC-SR04** | 1 | Ultrasonic Distance Sensor | 5V DC (~15 mA) |
| **SG90 9g Micro Servo** | 1 | 180° Mechanical Sweep Actuator | 4.8V – 6.0V (up to 250 mA peak) |
| **5V Piezo Buzzer** | 1 | Audible Object Detection Alarm | 3.3V – 5V (< 30 mA) |
| **Solderless Breadboard** | 1 | Power distribution and wire junction | — |
| **Jumper Wires (M-M / M-F)** | ~15 | Interconnects | — |
| **100 µF – 470 µF Capacitor** *(Optional)* | 1 | Servo 5V power rail decoupling buffer | >= 10V rated |

---

## 2. Complete Pin Assignment Matrix

These connections directly match the firmware definitions in [`arduino/arduino_radar/arduino_radar.ino`](../arduino/arduino_radar/arduino_radar.ino):

| Component | Component Pin / Wire | Arduino UNO Pin | Wire Type | Function / Description |
|---|---|---|:---:|---|
| **HC-SR04** | **VCC** | **5V** (via Breadboard 5V rail) | M-F | 5V Sensor Power Supply |
| **HC-SR04** | **TRIG** | **Pin 9** | M-F | 10 µs Trigger Pulse Output |
| **HC-SR04** | **ECHO** | **Pin 10** | M-F | Pulse Width Echo Input |
| **HC-SR04** | **GND** | **GND** (via Breadboard GND rail) | M-F | Ground Reference |
| **SG90 Servo** | **VCC (Red)** | **5V** (via Breadboard 5V rail) | M-M | Servo Motor Power |
| **SG90 Servo** | **GND (Brown / Black)** | **GND** (via Breadboard GND rail) | M-M | Servo Motor Ground |
| **SG90 Servo** | **Signal (Orange / Yellow)** | **Pin 6** | M-M | PWM Signal Control (50 Hz) |
| **Buzzer** | **Positive (+) / Long leg** | **Pin 11** | M-M | PWM Output / Tone Signal |
| **Buzzer** | **Negative (−) / Short leg** | **GND** (via Breadboard GND rail) | M-M | Ground Reference |

---

## 3. Component Details & Color Codes

### A. HC-SR04 Ultrasonic Distance Sensor
The HC-SR04 has 4 male header pins facing downwards:
* **VCC:** Connect to the Breadboard `+` (5V) power rail.
* **TRIG (Trigger):** Connect to Arduino digital **Pin 9**. The Arduino outputs a 10 µs pulse to begin ultrasonic burst transmission (8 cycles at 40 kHz).
* **ECHO (Echo):** Connect to Arduino digital **Pin 10**. Measures the duration of reflected sonic return.
* **GND:** Connect to the Breadboard `−` (GND) rail.

> **Mounting Tip:** Mount the HC-SR04 directly on top of the SG90 servo horn using hot glue, double-sided tape, or a 3D-printed bracket so the sensor rotates as the servo sweeps. Ensure jumper wires have enough slack to rotate 0° to 180° freely without snagging or pulling loose.

---

### B. SG90 9g Micro Servo Motor
The SG90 servo has a 3-pin female connector with color-coded leads:

| Lead Color | Standard | Connection | Function |
|---|:---:|---|---|
| **Orange** (or Yellow) | Signal | Arduino **Pin 6** | 50 Hz PWM position pulse (1 ms to 2 ms) |
| **Red** | VCC | Breadboard **5V Rail** | Motor power (4.8V – 5.5V) |
| **Brown** (or Black) | GND | Breadboard **GND Rail** | Electrical ground return |

> **Warning:** Never connect the servo signal lead to 5V or GND. Connecting power in reverse can permanently destroy the servo internal controller board.

---

### C. Active vs. Passive Piezo Buzzer

Distinguishing your buzzer type is essential because they are driven differently:

| Feature | Passive Buzzer | Active Buzzer |
|---|---|---|
| **Internal Oscillator** | No | Yes |
| **Bottom Seal** | Usually green circuit board visible | Usually sealed with black epoxy / label |
| **Test** | Connecting 5V DC produces only a brief click | Connecting 5V DC produces a continuous loud tone |
| **Firmware Drive** | Driven by PWM frequencies via `tone()` | Driven by simple `digitalWrite(HIGH / LOW)` |
| **Our Default Code** | Uses `tone(PIN_BUZZER, 1000, 80)` | See firmware line 170 to switch |

* **Positive (+) Terminal:** Longer pin or marked with a small `+` symbol on top casing. Connect to Arduino **Pin 11**.
* **Negative (−) Terminal:** Shorter pin. Connect to Breadboard **GND Rail**.

---

## 4. Power Supply, Inductive Loads & Common Ground

### Why Common Ground is Critical
All components (Arduino, HC-SR04, Servo, and Buzzer) **must share an identical 0V ground reference**:
1. Connect one jumper from Arduino `GND` to the negative (`−`) blue/black bus strip of your breadboard.
2. Route every component's ground lead directly to this shared breadboard strip.
3. Without common ground, digital voltage signals cannot establish a reliable reference, causing servo jitter, false ultrasonic readings, or USB disconnects.

### Safe Servo Power Considerations
* **USB Current Limits:** A standard laptop USB 2.0 port supplies up to **500 mA** at 5V.
  * Arduino UNO idle consumption: ~45 mA
  * HC-SR04 idle/burst consumption: ~15 mA
  * SG90 servo idle consumption: ~10 mA
  * SG90 servo inrush / stall current: **up to 250 mA** during rapid reversal or high load.
* **Brownout Protection:** If the servo draws a momentary current spike, the 5V line may drop below the ATmega328P brownout threshold (4.3V), causing the Arduino to randomly reset.
* **Recommended Capacitor Buffer:** Place a **100 µF to 470 µF electrolytic capacitor** directly across the breadboard power rails:
  * Capacitor **Long leg (+)** → Breadboard `5V` rail.
  * Capacitor **Short leg (−)** with stripe → Breadboard `GND` rail.
  * This capacitor buffers brief inductive surges from the motor and prevents board resets.

---

## 5. Schematic & Breadboard Circuit Layout

```
                        +----------------------+
                        |   Arduino UNO R3     |
                        |                      |
                        |                  5V  |----+ (To Breadboard + 5V Rail)
                        |                  GND |--+ | (To Breadboard - GND Rail)
                        |                      |  | |
(Trigger Pulse)         |  Pin 9               |  | |
(Echo Return)           |  Pin 10              |  | |
(PWM Servo Signal)      |  Pin 6               |  | |
(Buzzer Output)         |  Pin 11              |  | |
                        +----------------------+  | |
                                                  | |
=================== BREADBOARD POWER RAILS =======| |====
  [ + 5V Rail ]  <--------------------------------+ |
  [ - GND Rail ] <----------------------------------+
=========================================================
      |     |             |     |              |     |
     VCC   GND           VCC   GND             +     -
   +---------+         +---------+         +------------+
   | HC-SR04 |         |  SG90   |         |   Buzzer   |
   | Sensor  |         |  Servo  |         | (Pin 11)   |
   +---------+         +---------+         +------------+
    TRIG  ECHO           SIGNAL
      |     |               |
   Pin 9  Pin 10          Pin 6
```

---

## 6. Pre-Power Safety Checklist

Before inserting the USB cable into your laptop, verify:

- [ ] **No Short Circuits:** Check with an unpowered multimeter (or visually trace) that the `5V` and `GND` rails on the breadboard are not bridged.
- [ ] **Polarity Check:** Confirm the SG90 Red wire goes to `5V` and Brown wire to `GND`.
- [ ] **Sensor Orientation:** Confirm HC-SR04 `VCC` is on 5V and `GND` is on GND (reversing these can burn the sensor module).
- [ ] **Capacitor Orientation:** If using a decoupling capacitor, verify the negative stripe faces the `GND` rail.
- [ ] **Mechanical Clearance:** Manually verify that the servo arm with the mounted sensor can rotate a full 180° semicircle without wires binding, tangling, or hitting obstacles.
