/**
 * The Paddle duel game engine: pure state and physics, no canvas and no React.
 *
 * All positions and velocities are in CSS pixels of the current court, so the renderer draws
 * straight from state. `setViewport` rescales everything proportionally when the court changes
 * size, so a resize never teleports the ball.
 */

export type Phase = "idle" | "countdown" | "rally" | "over";
export type Side = "left" | "right";

export const WINNING_SCORE = 7;

/** Seconds for the serve to cross the court once, per speed setting. */
export const SPEED_SETTINGS = {
  slow: 1.7,
  normal: 1.2,
  fast: 0.85,
} as const;

export type SpeedKey = keyof typeof SPEED_SETTINGS;

export const COUNTDOWN_STEP = 0.8; // seconds each of "3", "2", "1" is on screen
const SPEED_INCREMENT = 1.07; // ball speed multiplier per paddle hit
const SPEED_CAP = 2.3; // cap, as a multiple of the serve speed
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180; // steepest angle off a paddle edge

export type EngineHandlers = {
  onScores: (left: number, right: number) => void;
  onPhase: (phase: Phase, winner: Side | null) => void;
  /** Current ball speed in px/s, whenever it changes by a visible amount. */
  onBallSpeed: (pxPerSecond: number) => void;
  onHit: () => void;
  onPoint: () => void;
  /** Each 3/2/1 shown during the serve countdown. */
  onCountdownTick: (n: number) => void;
};

export type Metrics = {
  paddleW: number;
  paddleH: number;
  inset: number;
  ballR: number;
  paddleSpeed: number; // px/s
};

export type EngineState = {
  phase: Phase;
  winner: Side | null;
  /** The side the ball will be (or was last) served toward. */
  serving: Side;
  scores: { left: number; right: number };
  width: number;
  height: number;
  ball: { x: number; y: number; vx: number; vy: number };
  /** Speed multiplier over the serve speed; grows with each paddle hit up to SPEED_CAP. */
  speedMult: number;
  leftY: number;
  rightY: number;
  /** Finger y targets from touch, per side; null when that side is not being dragged. */
  touch: { left: number | null; right: number | null };
  countdown: number;
  beeped: number;
  paused: boolean;
  /** Held keys: "w", "s", "up", "down". */
  keys: Set<string>;
  cross: number; // serve crossing seconds from the speed setting
};

export type Engine = {
  state: EngineState;
  /** Held keys: "w", "s", "up", "down" — mutated by the keyboard listeners. */
  keys: Set<string>;
  metrics: () => Metrics;
  servePx: () => number;
  ballSpeedPx: () => number;
  startGame: () => void;
  restart: () => void;
  setServeSpeed: (cross: number) => void;
  setViewport: (width: number, height: number) => void;
  setPaused: (paused: boolean) => void;
  setTouchTarget: (side: Side, y: number | null) => void;
  update: (delta: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createEngine(handlers: EngineHandlers): Engine {
  const state: EngineState = {
    phase: "idle",
    winner: null,
    serving: "left",
    scores: { left: 0, right: 0 },
    width: 640,
    height: 360,
    ball: { x: 320, y: 180, vx: 0, vy: 0 },
    speedMult: 1,
    leftY: 180,
    rightY: 180,
    touch: { left: null, right: null },
    countdown: 0,
    beeped: 0,
    paused: false,
    keys: new Set(),
    cross: SPEED_SETTINGS.normal,
  };

  let lastReportedSpeed = -1;

  const metrics = (): Metrics => {
    const h = state.height;
    const w = state.width;
    return {
      paddleW: Math.max(8, Math.round(w * 0.016)),
      paddleH: clamp(Math.round(h * 0.24), 44, 96),
      inset: Math.max(10, Math.round(w * 0.025)),
      ballR: Math.max(5, Math.round(h * 0.02)),
      paddleSpeed: h * 1.15,
    };
  };

  const servePx = (): number => state.width / state.cross;

  const ballSpeedPx = (): number => Math.hypot(state.ball.vx, state.ball.vy);

  const reportSpeed = () => {
    const rounded = Math.round(ballSpeedPx());
    if (rounded !== lastReportedSpeed) {
      lastReportedSpeed = rounded;
      handlers.onBallSpeed(rounded);
    }
  };

  const centreBall = () => {
    state.ball = { x: state.width / 2, y: state.height / 2, vx: 0, vy: 0 };
    state.speedMult = 1;
    reportSpeed();
  };

  const centrePaddles = () => {
    state.leftY = state.height / 2;
    state.rightY = state.height / 2;
  };

  /** Serve the ball toward `toward` — the player who receives it. */
  const serve = (toward: Side) => {
    const speed = servePx();
    const angle = (Math.random() * 0.5 - 0.25) * (Math.PI / 3);
    const dir = toward === "left" ? -1 : 1;
    state.ball = {
      x: state.width / 2,
      y: state.height / 2,
      vx: dir * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
    state.speedMult = 1;
    reportSpeed();
  };

  const setPhase = (phase: Phase, winner: Side | null = null) => {
    state.phase = phase;
    state.winner = winner;
    handlers.onPhase(phase, winner);
  };

  const startGame = () => {
    state.scores = { left: 0, right: 0 };
    handlers.onScores(0, 0);
    state.winner = null;
    state.serving = Math.random() < 0.5 ? "left" : "right";
    centrePaddles();
    centreBall();
    state.touch = { left: null, right: null };
    state.countdown = COUNTDOWN_STEP * 3;
    state.beeped = 0;
    state.paused = false;
    setPhase("countdown");
  };

  const restart = () => {
    state.keys.clear();
    startGame();
  };

  const setServeSpeed = (cross: number) => {
    state.cross = cross;
    // The idle warm-up bounce tracks the chosen serve speed, so the setting is visible at once.
    if (state.phase === "idle" && state.ball.vy !== 0) {
      state.ball.vy = Math.sign(state.ball.vy) * servePx();
      reportSpeed();
    }
  };

  const setViewport = (width: number, height: number) => {
    const sx = state.width > 0 ? width / state.width : 1;
    const sy = state.height > 0 ? height / state.height : 1;
    state.width = width;
    state.height = height;
    state.ball.x *= sx;
    state.ball.y *= sy;
    state.ball.vx *= sx;
    state.ball.vy *= sy;
    state.leftY *= sy;
    state.rightY *= sy;
    if (state.touch.left !== null) state.touch.left *= sy;
    if (state.touch.right !== null) state.touch.right *= sy;
    // Keep the idle bounce moving at the current serve speed at the new size.
    if (state.phase === "idle" && state.ball.vy !== 0) {
      state.ball.vy = Math.sign(state.ball.vy) * servePx();
    }
  };

  const setPaused = (paused: boolean) => {
    state.paused = paused;
  };

  const setTouchTarget = (side: Side, y: number | null) => {
    state.touch[side] = y;
  };

  const movePaddles = (dt: number) => {
    const m = metrics();
    let dl = 0;
    let dr = 0;
    if (state.keys.has("w")) dl -= 1;
    if (state.keys.has("s")) dl += 1;
    if (state.keys.has("up")) dr -= 1;
    if (state.keys.has("down")) dr += 1;
    state.leftY = clamp(state.leftY + dl * m.paddleSpeed * dt, m.paddleH / 2, state.height - m.paddleH / 2);
    state.rightY = clamp(state.rightY + dr * m.paddleSpeed * dt, m.paddleH / 2, state.height - m.paddleH / 2);
    if (state.touch.left !== null) {
      state.leftY = clamp(state.touch.left, m.paddleH / 2, state.height - m.paddleH / 2);
    }
    if (state.touch.right !== null) {
      state.rightY = clamp(state.touch.right, m.paddleH / 2, state.height - m.paddleH / 2);
    }
  };

  /** Reflect the ball off a paddle face at `yAt`, with the angle set by where it struck. */
  const hitPaddle = (side: Side, faceX: number, yAt: number) => {
    const m = metrics();
    const paddleY = side === "left" ? state.leftY : state.rightY;
    const offset = clamp((yAt - paddleY) / (m.paddleH / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE;
    const capped = Math.min(state.speedMult * SPEED_INCREMENT, SPEED_CAP);
    state.speedMult = capped;
    const speed = servePx() * capped;
    const dir = side === "left" ? 1 : -1;
    state.ball.x = side === "left" ? faceX + m.ballR : faceX - m.ballR;
    state.ball.y = yAt;
    state.ball.vx = dir * Math.cos(angle) * speed;
    state.ball.vy = Math.sin(angle) * speed;
    handlers.onHit();
  };

  const score = (scorer: Side) => {
    state.scores[scorer] += 1;
    handlers.onScores(state.scores.left, state.scores.right);
    if (state.scores[scorer] >= WINNING_SCORE) {
      centreBall();
      setPhase("over", scorer);
      handlers.onPoint();
      return;
    }
    // The loser receives the next serve.
    state.serving = scorer === "left" ? "right" : "left";
    centreBall();
    state.countdown = COUNTDOWN_STEP * 3;
    state.beeped = 0;
    setPhase("countdown");
    handlers.onPoint();
  };

  /** Advance the rally one substep: paddles first, then the ball with swept paddle checks. */
  const substep = (dt: number) => {
    const m = metrics();
    const prevX = state.ball.x;
    const prevY = state.ball.y;
    movePaddles(dt);
    state.ball.x += state.ball.vx * dt;
    state.ball.y += state.ball.vy * dt;

    // Top and bottom walls.
    if (state.ball.y < m.ballR) {
      state.ball.y = m.ballR + (m.ballR - state.ball.y);
      state.ball.vy = Math.abs(state.ball.vy);
    } else if (state.ball.y > state.height - m.ballR) {
      state.ball.y = state.height - m.ballR - (state.ball.y - (state.height - m.ballR));
      state.ball.vy = -Math.abs(state.ball.vy);
    }

    // Swept crossing of each paddle face: the ball cannot tunnel through, whatever the speed.
    const faceL = m.inset + m.paddleW;
    if (state.ball.vx < 0 && prevX - m.ballR >= faceL && state.ball.x - m.ballR <= faceL) {
      const t = (prevX - m.ballR - faceL) / (prevX - state.ball.x);
      const yAt = prevY + (state.ball.y - prevY) * t;
      if (yAt >= state.leftY - m.paddleH / 2 - m.ballR && yAt <= state.leftY + m.paddleH / 2 + m.ballR) {
        hitPaddle("left", faceL, yAt);
        return;
      }
    }
    const faceR = state.width - m.inset - m.paddleW;
    if (state.ball.vx > 0 && prevX + m.ballR <= faceR && state.ball.x + m.ballR >= faceR) {
      const t = (faceR - (prevX + m.ballR)) / (state.ball.x - prevX);
      const yAt = prevY + (state.ball.y - prevY) * t;
      if (yAt >= state.rightY - m.paddleH / 2 - m.ballR && yAt <= state.rightY + m.paddleH / 2 + m.ballR) {
        hitPaddle("right", faceR, yAt);
        return;
      }
    }

    // Past a paddle and off the court: a point for the other side.
    if (state.ball.x < -m.ballR * 2) {
      score("right");
    } else if (state.ball.x > state.width + m.ballR * 2) {
      score("left");
    }
  };

  const update = (delta: number) => {
    if (state.paused || delta <= 0) return;
    switch (state.phase) {
      case "idle": {
        // Warm-up: the ball idles, bouncing between the top and bottom walls in the middle.
        const m = metrics();
        state.ball.y += state.ball.vy * delta;
        if (state.ball.y < m.ballR) {
          state.ball.y = m.ballR + (m.ballR - state.ball.y);
          state.ball.vy = Math.abs(state.ball.vy);
        } else if (state.ball.y > state.height - m.ballR) {
          state.ball.y = state.height - m.ballR - (state.ball.y - (state.height - m.ballR));
          state.ball.vy = -Math.abs(state.ball.vy);
        }
        reportSpeed();
        break;
      }
      case "countdown": {
        movePaddles(delta);
        state.countdown -= delta;
        const shown = Math.max(1, Math.ceil(state.countdown / COUNTDOWN_STEP));
        if (shown !== state.beeped && state.countdown > 0) {
          state.beeped = shown;
          handlers.onCountdownTick(shown);
        }
        if (state.countdown <= 0) {
          serve(state.serving);
          setPhase("rally");
        }
        break;
      }
      case "rally": {
        const distance = ballSpeedPx() * delta;
        const m = metrics();
        const steps = clamp(Math.ceil(distance / Math.max(4, m.ballR)), 1, 80);
        for (let i = 0; i < steps && state.phase === "rally"; i++) {
          substep(delta / steps);
        }
        reportSpeed();
        break;
      }
      case "over":
        break;
    }
  };

  return {
    state,
    keys: state.keys,
    metrics,
    servePx,
    ballSpeedPx,
    startGame,
    restart,
    setServeSpeed,
    setViewport,
    setPaused,
    setTouchTarget,
    update,
  };
}
