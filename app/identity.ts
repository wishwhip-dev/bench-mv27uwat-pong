/**
 * What this app is called and how it looks when shared: the page title, the description search
 * engines and link previews show, the colour of the icon and the browser bar, and the letter on
 * the icon. The layout, the icons, the manifest and the share image all read from here, so a
 * change here reaches every one of them. Keep `name` short and `description` one plain sentence.
 */
export const identity = {
  name: "Paddle duel",
  description: "A two-player paddle game like Pong. First to 7 points wins.",
  accent: "#7c3aed",
  initial: "P",
} as const;
