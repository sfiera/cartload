// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {unpack} from "./struct.js";

const FRAME_BYTES = 128;
const BLOCK_FRAMES = 64;
const CARD_BLOCKS = 16;
const CARD_FRAMES = CARD_BLOCKS * BLOCK_FRAMES;
const CARD_BYTES = CARD_FRAMES * FRAME_BYTES;

export default class Ps1MemCard {
  constructor(header) {
    this.romSize = 0;
    this.savSize = CARD_BYTES;
    this.header = header;
    this.blocksUsed = 0;
    this.blocksFree = 0;
    this.fileCount = 0;
    this.files = [];
    for (let block = 1; block < 16; ++block) {
      const start = block * FRAME_BYTES;
      const [state, size, next, name] = unpack("<IIh20s", this.header.slice(start, start + 30));
      switch (state) {
        case 0x51:
          ++this.fileCount;
        case 0x52:
        case 0x53:
          this.files.push({block, state, size, next, name});
          ++this.blocksUsed;
          break;

        default:
          ++this.blocksFree;
      }
    }
  }

  get platform() { return "ps1" }
  get savExtension() { return "mcr"; }

  async backUpSav(client, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      let data = [];
      for (let f = 0; f < CARD_FRAMES; ++f) {
        callback(f * FRAME_BYTES);
        data.push(...await client.readFrame(f));
      }
      callback(CARD_BYTES);
      return new Uint8Array(data);
    });
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      const card = await client.identify();
      if (!card.cardType) {
        throw new Error("No memory card detected");
      } else if (card.cardType !== 1) {
        throw new Error("Memory card is not PS1");
      }
      let header = [];
      for (let f = 0; f < CARD_BLOCKS; ++f) {
        header.push(...await client.readFrame(f));
      }
      return new Ps1MemCard(header);
    });
  }

  async headerDigest() { return []; }
  static async db() { return {}; }
}
