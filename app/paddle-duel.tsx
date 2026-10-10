"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CanvasStage } from "@/components/canvas-stage";
import { setMuted, unlockAudio, useAudioStatus } from "@/lib/audio";
import { createEngine, SPEED_SETTINGS, WINNING_SCORE, type Phase, type Side, type SpeedKey } from "@/lib/paddle-duel-engine";
import { drawCourt, drawState, readCourtColors } from "@/lib/paddle-duel-draw";
import { playCountdownBeep, playHitSound, playPointSound, playWinSound } from "@/lib/sound";

const SPEED_STORAGE_KEY = "paddle-duel:speed";
const SOUND_STORAGE_KEY = "paddle-duel:sound";

function readStoredSpeed(): SpeedKey {
  try {
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
    if (raw === "slow" || raw === "normal" || raw === "fast") return raw;
  } catch {
    // Storage unavailable: the default below applies.
  }
  return "normal";
}

function readStoredSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function storeValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the setting simply does not persist.
  }
}

/**
 * The whole game as one client island: the court on a CanvasStage, the score and controls as DOM
 * beside it. Per-frame state lives in the engine; React only holds what is shown as text.
 */
export function PaddleDuel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [winner, setWinner] = useState<Side | null>(null);
  const [scores, setScores] = useState({ left: 0, right: 0 });
  const [paused, setPaused] = useState(false);
  const [speedKey, setSpeedKey] = useState<SpeedKey>("normal");
  const [soundOn, setSoundOn] = useState(false);
  const [ballSpeed, setBallSpeed] = useState<number | null>(null);

  const soundOnRef = useRef(false);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createEngine({
      onScores: (left, right) => setScores({ left, right }),
      onPhase: (next, nextWinner) => {
        setPhase(next);
        setWinner(nextWinner);
        if (next === "over" || next === "idle") setPaused(false);
      },
      onBallSpeed: (pxPerSecond) => setBallSpeed(pxPerSecond),
      onHit: () => {
        if (soundOnRef.current) playHitSound();
      },
      onPoint: () => {
        if (!soundOnRef.current) return;
        if (engineRef.current?.state.phase === "over") playWinSound();
        else playPointSound();
      },      onCountdownTick: (n) => {
        if (soundOnRef.current) playCountdownBeep(n);
      },
    });
  }
  const engine = engineRef.current;

  // Saved settings are read after mount, never during render, so hydration matches. The mirrors
  // into React go through a microtask: state setters do not run inside the effect body itself.
  useEffect(() => {
    const speed = readStoredSpeed();
    const sound = readStoredSound();
    soundOnRef.current = sound;
    engine.setServeSpeed(SPEED_SETTINGS[speed]);
    setMuted(!sound);
    queueMicrotask(() => {
      setSpeedKey(speed);
      setSoundOn(sound);
    });
  }, [engine]);

  // Keyboard: held keys drive the paddles, Space pauses and resumes and never scrolls the page.
  useEffect(() => {
    const keyToPaddle = (key: string): string | null => {
      const lower = key.toLowerCase();
      if (lower === "w") return "w";
      if (lower === "s") return "s";
      if (key === "ArrowUp") return "up";
      if (key === "ArrowDown") return "down";
      return null;
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const onControl = !!target?.closest("button, a, input, textarea, select, [role='listbox'], [role='option']");
      if (event.key === " ") {
        if (onControl) return;
        event.preventDefault();
        const phaseNow = engine.state.phase;
        if (phaseNow === "countdown" || phaseNow === "rally") {
          const next = !engine.state.paused;
          engine.setPaused(next);
          setPaused(next);
        }
        return;
      }
      const paddle = keyToPaddle(event.key);
      if (paddle) {
        event.preventDefault();
        engine.keys.add(paddle);
      }
    };
    const up = (event: KeyboardEvent) => {
      const paddle = keyToPaddle(event.key);
      if (paddle) engine.keys.delete(paddle);
    };
    const blur = () => engine.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      engine.keys.clear();
    };
  }, [engine]);

  // React's pause flag only feeds the engine; the overlay is drawn from engine state.
  useEffect(() => {
    engine.setPaused(paused);
  }, [engine, paused]);

  const primaryAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (soundOnRef.current) void unlockAudio();
    engine.setPaused(false);
    setPaused(false);
    if (phase === "idle") engine.startGame();
    else engine.restart();
    // Give the keyboard back: a focused button would swallow Space and restart the game.
    event.currentTarget.blur();
  };

  const changeSpeed = (next: SpeedKey) => {
    setSpeedKey(next);
    engine.setServeSpeed(SPEED_SETTINGS[next]);
    storeValue(SPEED_STORAGE_KEY, next);
  };

  const audioStatus = useAudioStatus();
  const audible = audioStatus === "running" && soundOn;

  const toggleSound = async () => {
    if (audible) {
      setMuted(true);
      soundOnRef.current = false;
      setSoundOn(false);
      storeValue(SOUND_STORAGE_KEY, "off");
      return;
    }
    setMuted(false);
    soundOnRef.current = true;
    setSoundOn(true);
    storeValue(SOUND_STORAGE_KEY, "on");
    await unlockAudio();
    playHitSound(); // audible confirmation that sound now works
  };

  // Touch: each half of the court is one player's paddle. Pointer capture keeps a drag following
  // the finger even when it leaves the court, and each pointer is tracked separately so two
  // simultaneous drags never interfere.
  const courtRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Side>());
  const localY = (event: React.PointerEvent<HTMLDivElement>): number => {
    const rect = courtRef.current?.getBoundingClientRect();
    return event.clientY - (rect?.top ?? 0);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = courtRef.current?.getBoundingClientRect();
    if (!rect) return;
    const side: Side = event.clientX - rect.left < rect.width / 2 ? "left" : "right";
    pointers.current.set(event.pointerId, side);
    engine.setTouchTarget(side, localY(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const side = pointers.current.get(event.pointerId);
    if (side) engine.setTouchTarget(side, localY(event));
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const side = pointers.current.get(event.pointerId);
    if (side) {
      engine.setTouchTarget(side, null);
      pointers.current.delete(event.pointerId);
    }
  };

  const sideName = (side: Side) => (side === "left" ? "Left" : "Right");
  const status =
    phase === "idle"
      ? "Warm-up. Press Start game to serve — first to 7 points wins."
      : phase === "countdown"
        ? `${sideName(engine.state.serving)} receives the serve…`
        : phase === "over" && winner
          ? `${sideName(winner)} wins ${scores.left}–${scores.right}.`
          : paused
            ? "Paused — press Space to resume."
            : "Rally in progress — Space pauses.";

  const primaryLabel = phase === "idle" ? "Start game" : phase === "over" ? "Play again" : "Restart game";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-center gap-6 sm:gap-10" aria-live="polite">
        <div className="text-right">
          <div className="text-sm font-medium text-muted-foreground">Left</div>
          <div className="text-4xl font-semibold tabular-nums sm:text-5xl">{scores.left}</div>
        </div>
        <div className="pb-1 text-2xl text-muted-foreground" aria-hidden>
          –
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground">Right</div>
          <div className="text-4xl font-semibold tabular-nums sm:text-5xl">{scores.right}</div>
        </div>
      </div>

      <div
        ref={courtRef}
        className="touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <CanvasStage
          label="Paddle duel court: two paddles and a ball. W and S move the left paddle, the arrow keys move the right, Space pauses."
          fallback={
            <p className="max-w-md">
              Paddle duel: two players rally a ball, the left paddle with W and S, the right with the up and down arrow
              keys, or by dragging your own half of the court on a touch screen. First to {WINNING_SCORE} points wins;
              Space pauses and resumes.
            </p>
          }
          motion="essential"
          interactive
          start={({ ctx, width, height }) => {
            let w = width;
            let h = height;
            const colors = readCourtColors();
            engine.setViewport(width, height);
            return {
              resize: (nextWidth, nextHeight) => {
                w = nextWidth;
                h = nextHeight;
                engine.setViewport(nextWidth, nextHeight);
              },
              frame: (_elapsed, delta) => {
                engine.update(delta);
                const m = engine.metrics();
                drawCourt(ctx, w, h, engine.state, m, colors);
                drawState(ctx, w, h, engine.state, m, colors);
              },
            };
          }}
        />
      </div>

      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        {status}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={primaryAction}>
          {primaryLabel}
        </Button>
        <div className="flex items-center gap-2">
          <Select value={speedKey} onValueChange={(value) => changeSpeed(value as SpeedKey)}>
            <SelectTrigger aria-label="Ball speed" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slow">Slow</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="fast">Fast</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            Ball speed: <span className="font-medium text-foreground">{speedKey === "slow" ? "Slow" : speedKey === "fast" ? "Fast" : "Normal"}</span>
          </span>
        </div>
        <Button variant="outline" onClick={() => void toggleSound()}>
          {audible ? "Sound on" : "Sound off"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          Ball speed now: <span className="font-medium tabular-nums text-foreground">{ballSpeed === null ? "—" : `${ballSpeed} px/s`}</span>
        </span>
        {audioStatus === "suspended" && <span>Sound is paused by the browser — press the sound button to resume it.</span>}
        {audioStatus === "unsupported" && <span>Sound is not available in this browser.</span>}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        W/S for left, ↑/↓ for right, drag your half on touch, Space to pause
      </p>
    </div>
  );
}