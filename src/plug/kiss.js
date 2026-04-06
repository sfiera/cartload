// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {unpack} from "../struct.js";
import {makeImage, toDataUrl} from "../util.js";

const ROMS = {
  "POKEBOM": [0x74003],
  "GBKISS MINIGAME": [
    0x18007, 0x19EDD, 0x1B2AD, 0x1C09A, 0x1DE25, 0x1F66C, 0x20000, 0x2160F, 0x21E16, 0x2407A,
    0x243E6, 0x256FE, 0x28000, 0x29690, 0x29F1A, 0x2B2DF, 0x2C07A, 0x2DAC6, 0x30000, 0x30718,
    0x3404D, 0x354AE, 0x3807F, 0x385DC, 0x38BEB, 0x391A8, 0x39811, 0x3C04F, 0x3C482, 0x3C4A1,
  ],
}


export default {
  scan: async function(client, cart, fn) {
    if ((cart.platform !== "dmg") || !cart.mapperName.startsWith("HuC-")) {
      return;
    }

    for (const addr of (ROMS[cart.title] || [])) {
      fn(romFile(client, addr));
    }

    const fileTable = await client.lock(100, async client => {
      await client.setPower(true);
      const meta = await client.readRange("dmg", 0x0014, 4, {csPulse: true});
      const [cartId, ownerBank, ownerAddr] = unpack("<bBH", meta);
      if ((ownerBank < 1) || (ownerBank >= 4) || (ownerAddr < 0xa1e8) || (ownerAddr > 0xbf80)) {
        return [];
      }

      try {
        await client.write("dmg", 0x0000, 0x0A);
        await client.write("dmg", 0x4000, ownerBank);

        const owner = await client.readRange("dmg", ownerAddr, 6, {csPulse: true});
        const [ownerCode, ownerCodeInv, ownerPrev, ownerNext] = unpack("<BBHH", owner);
        if ((ownerCode ^ ownerCodeInv ^ 0xFF) || (ownerCode != 0x53) ||
            (ownerPrev != ownerAddr - 486) || (ownerNext != 0xc000)) {
          return [];
        }

        const toc = await client.readRange("dmg", ownerPrev, 486, {csPulse: true});
        const [tocCode, tocCodeInv, _, tocNext] = unpack("<BBHH", toc.slice(0, 6));
        if ((tocCode ^ tocCodeInv ^ 0xFF) || (tocCode != 0x53) || (tocNext != ownerAddr)) {
          return [];
        }
        return toc.slice(6);
      } finally {
        await client.write("dmg", 0x0000, 0x00);
      }
    });

    for (let i = 0; i < fileTable.length; i += 4) {
      const [addr, cartId, fileId] = unpack("<HbB", fileTable.slice(i, i + 4));
      if (addr && (cartId !== -1)) {
        fn(ramFile(client, addr));
      }
    }
  },
};

const FILL_COLORS = ["#fff", "#aaa", "#555", "#000"];
const decodeImage = (buffer, width, height, bpp) => makeImage(width, height, ctx => {
  const data = new DataView(new Uint8Array(buffer).buffer);
  let i = 0;
  for (let col = 0; col < width; col += 8) {
    for (let row = 0; row < height; row++) {
      const byte1 = data.getUint8(i);
      i += bpp;
      const byte2 = data.getUint8(i - 1);
      let mask = 0x80;
      for (let bit = 0; bit < 8; ++bit) {
        const color = ((byte1 & mask) ? 1 : 0) + ((byte2 & mask) ? 2 : 0);
        mask >>= 1;
        ctx.fillStyle = FILL_COLORS[color];
        ctx.fillRect(col + bit, row, 1, 1);
      }
    }
  }
});

const file = async (client, fn) => {
  const header = await client.lock(200, client => fn(client, 256, {}));
  const [size, flags, cartId, headerSize, fileId] = unpack("<HBbBB", header.slice(0, 6));
  const iconBpp = ((flags & 0b00010000) ? ((flags & 0b00001000) ? 2 : 1) : 0);
  const end = 5 + headerSize;
  const iconStart = end - 96 * iconBpp;
  const titleStart = 6;
  const title = decodeRichText(header.slice(titleStart, iconStart));
  let iconUrl = null;
  if (iconBpp) {
    iconUrl = decodeImage(header.slice(iconStart, end), 32, 24, iconBpp);
  }

  return {
    title: title,
    iconUrl: iconUrl,
    size: size,
    extension: "gbf",
    backUp: async (client, progress) => {
      const data = await client.lock(0, client => fn(client, size, {progress}));
      return await toDataUrl(data);
    },
  };
};

const ramFile = (client, addr) => file(client, async (client, size, {progress}) => {
  try {
    await client.setPower(true);
    await client.write("dmg", 0x0000, 0x0A);
    await client.write("dmg", 0x4000, addr >>> 13);
    return new Uint8Array(
        await client.readRange("dmg", 0xA000 | (addr & 0x1FFF), size, {progress, csPulse: true}));
  } finally {
    await client.write("dmg", 0x0000, 0x00);
  }
});

const romFile = (client, addr) => file(client, async (client, size, {progress}) => {
  await client.setPower(true);
  await client.write("dmg", 0x2000, addr >>> 14);
  return new Uint8Array(
      await client.readRange("dmg", 0x4000 | (addr & 0x3FFF), size, {progress, csPulse: true}));
});

const LATIN =
    (" !\"#$%&'()*+,-./" +
     "0123456789:;<=>?" +
     "@ABCDEFGHIJKLMNO" +
     "PQRSTUVWXYZ[¥]^_" +
     "\u0000abcdefghijklmno" +
     "pqrstuvwxyz｢|｣¯\\");

const KATAKANA =
    ("「」、。ヲァィゥェォャュョッ" +
     "ーアイウエオカキクケコサシスセソ" +
     "タチツテトナニヌネノハヒフヘホマ" +
     "ミムメモヤユヨラリルレロワン");

const HIRAGANA =
    ("「」、。をぁぃぅぇぉゃゅょっ" +
     "ーあいうえおかきくけこさしすせそ" +
     "たちつてとなにぬねのはひふへほま" +
     "みむめもやゆよらりるれろわん");

const DIA_PARTS = [
  "ハヒフヘホはひふへほカキクケコかきくけこサシスセソさしすせそタチツテトたちつてと",
  "バビブベボばびぶべぼガギグゲゴがぎぐげごザジズゼゾざじずぜぞダヂヅデドだぢづでど",
  "パピプペポぱぴぷぺぽ",
];
const DIACRITICS = [
  Object.fromEntries(DIA_PARTS[1].split("").map((x, i) => [DIA_PARTS[0][i], x])),
  Object.fromEntries(DIA_PARTS[2].split("").map((x, i) => [DIA_PARTS[0][i], x])),
];

const decodeRichText = buffer => buffer.reduce(([string, kana], ch) => {
  if (ch === 0x0E) {
    return [string, KATAKANA];
  } else if (ch === 0x0F) {
    return [string, HIRAGANA];
  } else if (ch < 0x20) {
  } else if (ch < 0x80) {
    return [string + LATIN[ch - 0x20], kana];
  } else if (ch < 0xA1) {
  } else if (ch < 0xDE) {
    return [string + kana[ch - 0xA2], kana];
  } else if (ch < 0xE0) {
    const head = string.slice(0, -1), tail = string.slice(-1);
    return [head + (DIACRITICS[ch - 0xDE][tail] || tail), kana];
  }
  return [string + String.fromCharCode(ch), kana];
}, ["", KATAKANA])[0];
