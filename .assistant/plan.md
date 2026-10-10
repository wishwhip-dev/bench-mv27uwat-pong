# Plan

Goal: A two-player paddle game like Pong. On a laptop the left paddle moves with W and S and the right paddle with the up and down arrow keys; on a phone each player drags on their own half of the screen. First to 7 points wins, then a Play again button. Space pauses and resumes.

1. The home page shows the game at once on load: a canvas with the court, two paddles and a ball idle-bouncing in the middle, plus a clearly labelled Start game button and a line of on-screen text listing the controls ("W/S for left, ↑/↓ for right, drag your half on touch, Space to pause").
2. Pressing Start game begins a rally: the ball serves toward a randomly chosen side, bounces off the top and bottom walls, and each paddle moves when its keys are held — W/S for the left paddle, the up and down arrow keys for the right — with no other keys needed.
3. On a phone-sized screen, dragging a finger in the left half of the canvas moves the left paddle and dragging in the right half moves the right paddle, each following the finger's vertical position; two simultaneous touches each control their own paddle, and the two touch zones do not interfere.
4. The current score of both players is rendered as text in the DOM beside the canvas (player names Left/Right with numerals) and updates the moment a point is scored.
5. A point is scored when the ball passes a paddle off the screen; the ball then re-serves toward the player who just lost the point after a visible 3-2-1 countdown shown on the canvas, and the first player to reach 7 points wins.
6. When a player reaches 7, the canvas and the DOM both show the winner and the final score, and a Play again button appears that resets both scores to 0 and starts a new game immediately when clicked.
7. Pressing Space at any time during play pauses the game with a visible Paused overlay on the canvas and a matching status line in the DOM; pressing Space again resumes from the same positions. Pausing during the serve countdown freezes the countdown where it is and resumes it, and Space never scrolls the page.
8. The return angle depends on where the ball strikes the paddle face — a hit near the top or bottom edge sends the ball off at a steeper angle — and ball speed visibly increases after each paddle hit up to a cap, with a live readout beside the canvas showing the current ball speed so both effects are checkable.
9. A three-setting ball speed control (Slow / Normal / Fast) rendered as a shadcn Select beside the canvas changes the serve speed immediately for the next serve, and its current value is shown next to it.
10. Hit and point sounds play through the shared AudioContext only after the user has clicked Start, with a Sound on/off toggle button beside the canvas whose current state (Sound on or Sound off) is shown as text and is respected by all sounds.
11. The sound setting and the speed setting are saved to localStorage under app-specific keys and are still in effect after reloading the page; if storage is unavailable the game starts with Normal speed and sound off without erroring.
12. Paddles stop at the top and bottom edges of the court when a key is held past the boundary, and the ball never tunnels through a paddle, even at top speed with the paddle moving toward it.
13. The game runs correctly at phone width: the canvas, score readout and controls all fit without horizontal scrolling, and touch paddles remain responsive during a rally.
14. The page keeps working through a whole rally with no console errors, and if the canvas cannot get a drawing context the stage's fallback message states the rules of the game instead of showing a blank area.

These are the outcomes this task is judged against.