// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

export default [
  (async () => (await import("./plug/camera.js")).default)(),
  (async () => (await import("./plug/kiss.js")).default)(),
];
