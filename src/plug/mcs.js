// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {unpack} from "../struct.js";
import {makeImage, shiftJis, toDataUrl} from "../util.js";

export default {
  scan:
      async function(client, card, fn) {
        if (card.platform !== "ps1") {
          return;
        }

        for (const file of card.files) {
          if (file.state === 0x51) {
            fn(ps1File(client, card, file.block));
          }
        }
      },
};

const ps1File = async (client, card, block) => {
  const header = card.files[block - 1];
  const headerData = card.header.slice(block * 128, (block + 1) * 128);
  const totalSize = 128 + header.size;
  const code = shiftJis.decode(new Uint8Array(headerData.slice(12, 16))) + "-" +
      shiftJis.decode(new Uint8Array(headerData.slice(17, 22)));
  const {title, iconUrl} = await client.lock(200, async client => {
    const frame = await client.readFrame(block * 64, card.brokenFrames);
    const title = shiftJis.decode(new Uint8Array(frame.slice(0x04, 0x44))).replace(/\0.*/, "");
    const palette = unpack("<16H", frame.slice(0x60, 0x80));
    const iconData = [];
    for (const byte of await client.readFrame(header.block * 64 + 1, card.brokenFrames)) {
      iconData.push((byte & 0x0F), (byte & 0xF0) >> 4);
    }
    const iconUrl = makeImage(16, 16, ctx => {
      let i = 0;
      for (let y = 0; y < 16; ++y) {
        for (let x = 0; x < 16; ++x) {
          const color = palette[iconData[i++]];
          if (color) {
            const r = ((color & 0x001F) << 3) | ((color & 0x001F) >> 2);
            const g = ((color & 0x03E0) >> 2) | ((color & 0x03E0) >> 7);
            const b = ((color & 0x7C00) >> 7) | ((color & 0x7C00) >> 12);
            ctx.fillStyle = `#${r.toString(16).padStart(2, "0")}${
                g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    })
    return {title, iconUrl};
  });
  return {
    title: title,
    code: code,
    iconUrl: iconUrl,
    size: totalSize,
    extension: "mcs",
    backUp: (client, progress) => client.lock(
        0,
        async client => {
          let file = header;
          const data = [...headerData];
          progress(data.length);
          while (data.length < totalSize) {
            for (let f = 0; f < 64; ++f) {
              data.push(...await client.readFrame(f + (file.block * 64), card.brokenFrames));
              progress(data.length);
            }
            file = card.files[file.next];
          }
          return await toDataUrl(new Uint8Array(data));
        }),
  };
};
