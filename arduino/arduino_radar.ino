/*
  ═══════════════════════════════════════════════════════════════════════════
   ARDUINO ULTRASONIC RADAR SYSTEM — 180° SWEEP MODE
   Board   : Arduino UNO / Nano
   Sensor  : HC-SR04 Ultrasonic Distance Sensor
   Servo   : SG90 Micro Servo (0° to 180° Sweep)
   Buzzer  : 5V Piezo Buzzer (Passive / Active)
   Baud    : 9600 baud (line-terminated with '\n')
  ═══════════════════════════════════════════════════════════════════════════

   PIN CONFIGURATION:
   ──────────────────
   Standard Pin Assignment (as documented in docs/wiring.md):
     HC-SR04 TRIG   -> Arduino Pin 9   (or Pin 3 if customized)
     HC-SR04 ECHO   -> Arduino Pin 10  (or Pin 5 if customized)
     SG90 Signal    -> Arduino Pin 6   (PWM pin)
     Buzzer (+)     -> Arduino Pin 11  (PWM pin)
     VCC (All)      -> Breadboard 5V Rail
     GND (All)      -> Breadboard GND Rail (Shared Common Ground)
  ═══════════════════════════════════════════════════════════════════════════
*/

#include <Servo.h>

// ─────────────────────────────────────────────────────────────────────────
// PIN DEFINITIONS
// If your hardware uses pins 3 & 5, change PIN_TRIG to 3 and PIN_ECHO to 5:
// ─────────────────────────────────────────────────────────────────────────
const int PIN_TRIG   = 9;   // HC-SR04 Trigger (Default: 9, Alternate: 3)
const int PIN_ECHO   = 10;  // HC-SR04 Echo    (Default: 10, Alternate: 5)
const int PIN_SERVO  = 6;   // SG90 Servo PWM signal pin (D6)
const int PIN_BUZZER = 11;  // Piezo Buzzer positive pin (D11)

// ─────────────────────────────────────────────────────────────────────────
// SWEEP CONFIGURATION (Normal 180 Degree Radar Sweep)
// ─────────────────────────────────────────────────────────────────────────
const long BAUD_RATE          = 9600;   // Baud rate matching dashboard
const int  SERVO_MIN_ANGLE    = 0;      // Degrees: Left boundary (0°)
const int  SERVO_MAX_ANGLE    = 180;    // Degrees: Right boundary (180°)
const int  SERVO_STEP_DEG     = 2;      // Degrees per step (smooth sweep)
const int  SERVO_STEP_DELAY   = 40;     // ms delay per step
const int  SERVO_SETTLE_DELAY = 15;     // ms settle delay before measuring

const unsigned long ECHO_TIMEOUT_US = 30000UL; // ~510 cm max range timeout
const int  OUT_OF_RANGE_CM    = 999;   // Sentinel for out-of-range

int  detectionThreshold = 30;          // Initial detection threshold (cm)
bool buzzerMuted        = false;       // Buzzer state

// Tone settings for passive buzzer
const int BUZZ_FREQ_HZ = 1000;
const int BUZZ_ON_MS   = 80;

// ─────────────────────────────────────────────────────────────────────────
// RUNTIME STATE
// ─────────────────────────────────────────────────────────────────────────
Servo radarServo;
bool scanning       = false;  // Sweep state: controlled by START / STOP commands
int  currentAngle   = 0;      // Current servo angle (0 to 180)
int  sweepDirection = 1;      // +1 = 0° -> 180°, -1 = 180° -> 0°

// Serial Command Buffer
const int CMD_BUF_SIZE = 32;
char cmdBuffer[CMD_BUF_SIZE];
int  cmdIndex = 0;

// Function prototypes
int  measureDistance();
void doSweepStep();
void readSerialCommands();
void processCommand(const char* cmd);

// ─────────────────────────────────────────────────────────────────────────
// setup()
// ─────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(BAUD_RATE);

  // Ultrasonic sensor pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  // Buzzer pin
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Attach servo and initialize at 0 degrees
  radarServo.attach(PIN_SERVO);
  radarServo.write(0);
  delay(500);

  // Boot status messages
  Serial.println(F("STATUS:Arduino 180 Degree Radar System Ready"));
  Serial.println(F("STATUS:Send START to begin 180 degree sweep"));
}

// ─────────────────────────────────────────────────────────────────────────
// loop()
// ─────────────────────────────────────────────────────────────────────────
void loop() {
  // 1. Process any incoming commands from web dashboard
  readSerialCommands();

  // 2. Perform 180-degree sweep step if scanning is active
  if (scanning) {
    doSweepStep();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// doSweepStep() — Advances servo across 0° to 180° and transmits sensor data
// ─────────────────────────────────────────────────────────────────────────
void doSweepStep() {
  // 1. Move servo to current sweep angle
  radarServo.write(currentAngle);
  delay(SERVO_SETTLE_DELAY);

  // 2. Measure distance with ultrasonic sensor
  int distanceCm = measureDistance();

  // 3. Check if object is within detection threshold
  bool detected = (distanceCm != OUT_OF_RANGE_CM) &&
                  (distanceCm <= detectionThreshold);

  if (detected) {
    // Send DETECT protocol message to dashboard
    Serial.print(F("DETECT:"));
    Serial.print(currentAngle);
    Serial.print(',');
    Serial.println(distanceCm);

    // Sound buzzer alert
    if (!buzzerMuted) {
      tone(PIN_BUZZER, BUZZ_FREQ_HZ, BUZZ_ON_MS);
    }
  } else {
    // Send DATA protocol message to dashboard
    Serial.print(F("DATA:"));
    Serial.print(currentAngle);
    Serial.print(',');
    Serial.println(distanceCm);
  }

  // 4. Advance servo angle
  currentAngle += SERVO_STEP_DEG * sweepDirection;

  // 5. Ping-pong bounce at the 0° and 180° limits
  if (currentAngle >= SERVO_MAX_ANGLE) {
    currentAngle   = SERVO_MAX_ANGLE;
    sweepDirection = -1;  // Reverse towards 0°
  } else if (currentAngle <= SERVO_MIN_ANGLE) {
    currentAngle   = SERVO_MIN_ANGLE;
    sweepDirection = 1;   // Forward towards 180°
  }

  // Delay for remaining step time
  delay(SERVO_STEP_DELAY - SERVO_SETTLE_DELAY);
}

// ─────────────────────────────────────────────────────────────────────────
// measureDistance() — Measures echo return duration and returns cm
// ─────────────────────────────────────────────────────────────────────────
int measureDistance() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);

  if (duration == 0) {
    return OUT_OF_RANGE_CM;
  }

  float distance = duration * 0.0343f / 2.0f;

  if (distance < 2.0f || distance > 400.0f) {
    return OUT_OF_RANGE_CM;
  }

  return (int)(distance + 0.5f);
}

// ─────────────────────────────────────────────────────────────────────────
// readSerialCommands() — Non-blocking serial command reader
// ─────────────────────────────────────────────────────────────────────────
void readSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      if (cmdIndex > 0) {
        cmdBuffer[cmdIndex] = '\0';
        processCommand(cmdBuffer);
        cmdIndex = 0;
      }
    } else {
      if (cmdIndex < CMD_BUF_SIZE - 1) {
        cmdBuffer[cmdIndex++] = c;
      } else {
        cmdIndex = 0;
        Serial.println(F("ERROR:Command buffer overflow"));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// processCommand() — Executes commands received from dashboard
// ─────────────────────────────────────────────────────────────────────────
void processCommand(const char* cmd) {
  // START 180-degree sweep
  if (strcmp(cmd, "START") == 0) {
    scanning = true;
    currentAngle = 0;
    sweepDirection = 1;
    Serial.println(F("STATUS:180 degree radar sweep started"));
    return;
  }

  // STOP sweep
  if (strcmp(cmd, "STOP") == 0) {
    scanning = false;
    noTone(PIN_BUZZER);
    digitalWrite(PIN_BUZZER, LOW);
    Serial.println(F("STATUS:Radar sweep stopped"));
    return;
  }

  // MUTE buzzer
  if (strcmp(cmd, "MUTE") == 0) {
    buzzerMuted = true;
    noTone(PIN_BUZZER);
    digitalWrite(PIN_BUZZER, LOW);
    Serial.println(F("STATUS:Buzzer muted"));
    return;
  }

  // UNMUTE buzzer
  if (strcmp(cmd, "UNMUTE") == 0) {
    buzzerMuted = false;
    Serial.println(F("STATUS:Buzzer unmuted"));
    return;
  }

  // THRESHOLD:<cm>
  if (strncmp(cmd, "THRESHOLD:", 10) == 0) {
    int newThreshold = atoi(cmd + 10);

    if (newThreshold >= 5 && newThreshold <= 200) {
      detectionThreshold = newThreshold;
      Serial.print(F("STATUS:Threshold set to "));
      Serial.print(detectionThreshold);
      Serial.println(F(" cm"));
    } else {
      Serial.println(F("ERROR:Threshold out of range (5-200 cm)"));
    }
    return;
  }

  Serial.print(F("ERROR:Unknown command: "));
  Serial.println(cmd);
}