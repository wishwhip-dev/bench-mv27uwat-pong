import { PaddleDuel } from "./paddle-duel";

/**
 * A two-player paddle game: the court is a canvas, everything that must be read as text — the
 * score, the status, the controls and their values — is DOM beside it.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-5 px-4 py-8 sm:px-6">
      <header className="space-y-1 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">First to 7 points</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Paddle duel</h1>
      </header>
      <PaddleDuel />
    </main>
  );
}