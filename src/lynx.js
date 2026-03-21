// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {arrayEq, ints, latin1, makeImage, Segment} from "./util.js";

export default class LynxCart {
  constructor(data) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x200) {
      throw new TypeError("data too short for header")
    }
    this.header = data.slice(0, 0x200);
    this.title = null;
    this.code = null;
    this.romSize = 0x20000;

    this.valid = {};
    this.valid.header = true;
  }

  get mapperName() { return "None" }

  get extension() { return "lyx"; }

  async headerDigest() { return await window.crypto.subtle.digest("SHA-1", this.header); }

  logoImageUrl() {
    return makeImage(64, 8, (ctx) => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 64, 8);
    });
  }

  async backUpRom(client, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      const deBruijn = Uint8Array.fromBase64("AoOCQ0LDwiMyKjomNi4+KTk1LT2zsnPz8quurW/v/gE=");
      await client.command(cmds.CART_PWR_ON);
      try {
        let acc = 0;
        let total = 0;
        const data = new Uint8Array(this.romSize);
        for (let b of deBruijn) {
          for (const _ of ints(8)) {
            await shift(client, b & 1);
            acc = (b & 1) | ((acc << 1) & 0xFF);
            b >>>= 1;
            const chunk = await client.transfer("dmg", 0, 0x200, {
              progress: n => callback(total + n),
              csPulse: false,
            });
            chunk.forEach((b, i) => data[(acc << 9) | i] = b);
            total += 0x200;
          }
        };
        return new Uint8Array(data);
      } finally {
        await client.command(cmds.CART_PWR_OFF);
      }
    });
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      const data = await client.transfer("dmg", 0, 0x200, {csPulse: false});
      if (data.every(x => x == 0)) {
        throw new Error("No cartridge detected");
      }
      return new LynxCart(new Uint8Array(data));
    });
  }

  static async connect(client) {
    return await client.lock(0, async client => {
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.command(cmds.SET_MODE_DMG);
      await client.command(cmds.SET_VOLTAGE_5V);
      await client.command(cmds.CART_PWR_ON);
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.setVariable(vars.CART_MODE, 1);
      await client.setVariable(vars.DMG_READ_CS_PULSE, 0);
      await client.setVariable(vars.DMG_WRITE_CS_PULSE, 0);
      await client.setVariable(vars.DMG_ACCESS_MODE, 1);
      await client.setVariable(vars.ADDRESS, 0x0000);
      for (const _ of ints(8)) {
        await shift(client, 0);
      }
    });
  }

  static async db() { return (await import("./db/lynx.json", {with: {type: "json"}})).default; }
};

const shift = async (client, value) => {
  await client.setPin(0b10000, 1);              // /CS
  await client.setPin(0b00010, value ? 1 : 0);  // CLK
  await client.setPin(0b10000, 0);              // /CS
  await client.setPin(0b10000, 1);              // /CS
};
