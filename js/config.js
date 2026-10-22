/**
 * BROWSER SETTINGS
 * ---------------------------------------------------------------
 * API_URL: paste your Apps Script web app URL (ends in /exec).
 *          Leave it as 'DEMO' to try everything offline in one browser (no Google needed).
 */
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw6v67ApYAtR9wygDcr2B3mqfZXnwQHWU8BVvD5TqagO6yoDPQ8GzzE1mPBXCmPjIUMxA/exec',

  // ---- Polling (how often screens ask the server "anything new?") ----
  // Each poll is a cache read on the server (no sheet access). Nothing is polled while a game is being played.
  LOBBY_POLL_MS: 3000,      // students waiting in the lobby. Keep below START_DELAY_MS in server/Config.js
  RESULTS_POLL_MS: 4000,    // students waiting for results / the next round
  NO_ROOM_POLL_MS: 6000,    // students who pressed Multiplayer before the teacher opened a room
  TEACHER_POLL_MS: 2500,    // teacher screen (lobby, and collecting results after the timer ends)
  POLL_JITTER_MS: 1000,     // random extra delay so 25 iPads don't all ask at the same instant

  // ---- Choices shown on screen ----
  PRACTICE_SECONDS: 60,     // every practice round is this long
  GAME_SECONDS: [60, 90, 120, 180, 300],
  TEAM_SIZES: [1, 2, 3, 4, 5, 6],   // 1 = individual play

  // ---- Feel ----
  WRONG_PAUSE_MS: 900,      // how long the correct answer shows after a wrong answer
  RIGHT_FLASH_MS: 160,
  MAX_ANSWER_DIGITS: 6
};
