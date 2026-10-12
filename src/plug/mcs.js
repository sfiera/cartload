// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {latin1, makeImage, toDataUrl} from "../util.js";

export default {
  scan:
      async function(client, card, fn) {
        if (card.platform !== "ps1") {
          return;
        }

        for (const file of card.files) {
          if (file.state === 0x51) {
            fn(ps1File(card, file.block));
          }
        }
      },
};

const ps1File = async (card, block) => {
  const header = card.files[block - 1];
  const headerData = card.header.slice(block * 128, (block + 1) * 128);
  const totalSize = 128 + header.size;
  const title = latin1.decode(new Uint8Array(headerData.slice(12, 16))) + "-" +
      latin1.decode(new Uint8Array(headerData.slice(17, 22)));
  return {
    title: title,
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
              data.push(...await client.readFrame(f + (file.block * 64)));
              progress(data.length);
            }
            file = card.files[file.next];
          }
          return await toDataUrl(new Uint8Array(data));
        }),
  };
};
