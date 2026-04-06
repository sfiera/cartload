// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {makeImage} from "../util.js";

export default {
  scan:
      async function(client, cart, fn) {
        if ((cart.platform !== "dmg") || (cart.mapperName !== "MAC-GBD")) {
          return;
        }

        const files = await client.lock(100, async client => {
          await client.setPower(true);
          await client.write("dmg", 0x4000, 0x00, {csPulse: false});
          const files = [];
          return await client.readRange("dmg", 0xB1D7, 30, {csPulse: true});
        });

        for (const [i, pos] of [...files.entries()].sort((a, b) => a[0] - b[0])) {
          if (pos !== 255) {
            const bank = (i >>> 1) + 1;
            const base = (i & 1) ? 0xB000 : 0xA000;
            fn(photo(pos, client, bank, base));
          }
        }
      },
};

const FILL_COLORS = ["#fff", "#aaa", "#555", "#000"];
const decodeImage = (buffer, width, height) => makeImage(width, height, ctx => {
  const data = new DataView(new Uint8Array(buffer).buffer);
  let i = 0;
  for (let row = 0; row < height; row += 8) {
    for (let col = 0; col < width; col += 8) {
      for (let y = 0; y < 8; y++) {
        const byte1 = data.getUint8(i++);
        const byte2 = data.getUint8(i++);
        let mask = 0x80;
        for (let bit = 0; bit < 8; ++bit) {
          const color = ((byte1 & mask) ? 1 : 0) + ((byte2 & mask) ? 2 : 0);
          mask >>= 1;
          ctx.fillStyle = FILL_COLORS[color];
          ctx.fillRect(col + bit, row + y, 1, 1);
        }
      }
    }
  }
});

const photo = async (pos, client, bank, base) => {
  const thumbnail = await client.lock(200 + pos, async client => {
    await client.setPower(true);
    await client.write("dmg", 0x4000, bank, {csPulse: false});
    return await client.readRange("dmg", base + 0x0E00, 256, {csPulse: true});
  });

  return {
    title: `Photo ${pos + 1}`,
    iconUrl: decodeImage(thumbnail, 32, 28),
    size: 0xE00,
    extension: "png",
    backUp: (client, progress) => client.lock(
        0,
        async client => {
          await client.setPower(true);
          await client.write("dmg", 0x4000, bank, {csPulse: false});
          const data = await client.readRange("dmg", base, 0x0E00, {csPulse: true, progress});
          return decodeImage(data, 128, 112);
        }),
  };
};
