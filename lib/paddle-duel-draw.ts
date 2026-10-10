/**
 * The Paddle duel renderer: draws one frame of the court from engine state onto a 2D context.
 * Pure drawing — all simulation lives in `lib/paddle-duel-engine.ts`.
 */
import type { EngineState, Metrics, Side } from "@/lib/paddle-duel-engine";
import { COUNTDOWN_STEP, WINNING_SCORE } from "@/lib/paddle-duel-engine";

export type CourtColors = {
  court: string;
  line: string;
  dim: string;
  left: string;
  right: string;
  ball: string;
  text: string;
};

/** Read the design tokens once per acquired context; fall back to the known values. */
export function readCourtColors(): CourtColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    court: read("--card", "#121317"),
    line: read("--border", "#24262b"),
    dim: read("--muted-foreground", "#9a9aa5"),
    left: read("--primary", "#a9d977"),
    right: "#7dd3e0",
    ball: read("--foreground", "#ededf0"),
    text: read("--foreground", "#ededf0"),
  };
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: { size: number; color: string; weight?: number; align?: CanvasTextAlign; alpha?: number } = { size: 16, color: "#fff" },
) {
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.fillStyle = options.color;
  ctx.font = `${options.weight ?? 600} ${options.size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function drawCourt(ctx: CanvasRenderingContext2D, w: number, h: number, s: EngineState, m: Metrics, c: CourtColors) {
  // Court surface and frame.
  ctx.fillStyle = c.court;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // Centre net, dashed.
  ctx.save();
  ctx.strokeStyle = c.dim;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.setLineDash([h * 0.02, h * 0.028]);
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.03);
  ctx.lineTo(w / 2, h * 0.97);
  ctx.stroke();
  ctx.restore();

  // Faint score digits behind play, one on each half.
  text(ctx, String(s.scores.left), w * 0.25, h * 0.3, { size: Math.round(h * 0.3), color: c.dim, weight: 700, alpha: 0.16 });
  text(ctx, String(s.scores.right), w * 0.75, h * 0.3, { size: Math.round(h * 0.3), color: c.dim, weight: 700, alpha: 0.16 });

  // Touch-zone hint before the game starts: which half drives which paddle.
  if (s.phase === "idle") {
    text(ctx, "Left half", w * 0.25, h * 0.82, { size: Math.round(h * 0.045), color: c.dim, alpha: 0.6 });
    text(ctx, "Right half", w * 0.75, h * 0.82, { size: Math.round(h * 0.045), color: c.dim, alpha: 0.6 });
    text(ctx, `First to ${WINNING_SCORE} points wins`, w / 2, h * 0.62, { size: Math.round(h * 0.055), color: c.dim, alpha: 0.85 });
  }

  // Paddles.
  ctx.fillStyle = c.left;
  roundRect(ctx, m.inset, s.leftY - m.paddleH / 2, m.paddleW, m.paddleH, m.paddleW / 2);
  ctx.fillStyle = c.right;
  roundRect(ctx, w - m.inset - m.paddleW, s.rightY - m.paddleH / 2, m.paddleW, m.paddleH, m.paddleW / 2);

  // Ball, with a soft glow.
  ctx.save();
  ctx.shadowColor = c.ball;
  ctx.shadowBlur = m.ballR * 2;
  ctx.fillStyle = c.ball;
  ctx.beginPath();
  ctx.arc(s.ball.x, s.ball.y, m.ballR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function overlay(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
  ctx.fillStyle = "#0b0c0e";
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

export function drawState(ctx: CanvasRenderingContext2D, w: number, h: number, s: EngineState, m: Metrics, c: CourtColors) {
  const sideName = (side: Side) => (side === "left" ? "Left" : "Right");

  if (s.phase === "countdown") {
    const shown = Math.max(1, Math.ceil(s.countdown / 0.8));
    text(ctx, String(shown), w / 2, h * 0.42, { size: Math.round(h * 0.34), color: c.text, weight: 700 });
    text(ctx, `${sideName(s.serving)} serves`, w / 2, h * 0.66, { size: Math.round(h * 0.06), color: c.dim });
  }

  if (s.paused && s.phase !== "idle" && s.phase !== "over") {
    overlay(ctx, w, h, 0.6);
    text(ctx, "Paused", w / 2, h * 0.44, { size: Math.round(h * 0.16), color: c.text, weight: 700 });
    text(ctx, "Press Space to resume", w / 2, h * 0.6, { size: Math.round(h * 0.055), color: c.dim });
  }

  if (s.phase === "over" && s.winner) {
    overlay(ctx, w, h, 0.68);
    text(ctx, `${sideName(s.winner)} wins!`, w / 2, h * 0.36, { size: Math.round(h * 0.14), color: c.text, weight: 700 });
    text(ctx, `${s.scores.left} – ${s.scores.right}`, w / 2, h * 0.52, { size: Math.round(h * 0.12), color: s.winner === "left" ? c.left : c.right, weight: 700 });
    text(ctx, `First to ${WINNING_SCORE} · press Play again for a rematch`, w / 2, h * 0.68, { size: Math.round(h * 0.05), color: c.dim });
  }
}
