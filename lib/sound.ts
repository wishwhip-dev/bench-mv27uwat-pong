/**
 * Paddle duel's sounds, generated with oscillators through the app's shared AudioContext.
 * Every call stays silent (and throws nothing) until the context has been unlocked by a user
 * gesture and the visitor has sound turned on — the component gates the calls, and the guards
 * here make sure an unlocked-but-suspended context can never click or throw.
 */
import { getAudioContext, getMasterGain } from "@/lib/audio";

function tone(frequency: number, duration: number, delay = 0, gainValue = 0.22, type: OscillatorType = "square") {
  const ctx = getAudioContext();
  const out = getMasterGain();
  if (!ctx || !out || ctx.state !== "running") return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Short tick when the ball strikes a paddle. */
export function playHitSound() {
  tone(540, 0.07, 0, 0.25);
}

/** Two-tone descending figure when a point is scored. */
export function playPointSound() {
  tone(392, 0.14, 0, 0.2, "triangle");
  tone(262, 0.22, 0.13, 0.2, "triangle");
}

/** Countdown beep; the final "1" is pitched higher. */
export function playCountdownBeep(n: number) {
  tone(n <= 1 ? 660 : 440, 0.1, 0, 0.18, "sine");
}

/** Rising arpeggio when a player wins the match. */
export function playWinSound() {
  tone(392, 0.12, 0, 0.2, "triangle");
  tone(494, 0.12, 0.12, 0.2, "triangle");
  tone(587, 0.12, 0.24, 0.2, "triangle");
  tone(784, 0.3, 0.36, 0.2, "triangle");
}
