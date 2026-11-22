# Lab 8 submission notes

## One-minute demo outline

1. Open the Meta page and briefly show the repository timeline slider.
2. Move the slider backward and forward to show that the scatter plot, summary
   statistics, and file visualization update together.
3. Scroll through several commit descriptions and point out that the sticky
   scatter plot updates when each story step reaches the middle of the screen.
4. Show the file-size unit visualization: every dot is one current line of code,
   files are sorted from largest to smallest, and dot color represents technology.
5. Finish with one of the learning points below.

## Interesting things I learned

- D3 needs a stable key, such as a commit ID, to match an existing circle with the
  same data item after filtering. Without that key, circles can jump between data
  points even when CSS transitions are enabled.
- CSS `@starting-style` gives newly inserted elements a starting state, which lets
  entry animations work without writing a separate D3 transition.
- Scrollytelling connects narrative position to visualization state. Scrollama
  identifies the active story step, while the same update function used by the
  slider keeps the chart, statistics, and unit visualization synchronized.
- A unit visualization can make file size tangible by drawing one mark per line,
  while sorting and color encode file size and technology at the same time.
