// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {arrayEq, ints, latin1, makeImage, Segment} from "./util.js";

class LynxCart {
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
    const deBruijn = Uint8Array.fromBase64("AoOCQ0LDwiMyKjomNi4+KTk1LT2zsnPz8quurW/v/gE=");
    await client.command(cmds.CART_PWR_ON);
    try {
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.setVariable(vars.DMG_ACCESS_MODE, 1);  // MODE_ROM_READ
      await client.setVariable(vars.CART_MODE, 1);
      const banks = {};
      let acc = 0;
      let total = 0;
      for (let b of deBruijn) {
        for (const _ of ints(8)) {
          await shift(client, b & 1);
          acc = (b & 1) | ((acc << 1) & 0xFF);
          b >>>= 1;
          await client.setVariable(vars.ADDRESS, 0x0000);
          banks[acc] = await client.transfer(cmds.DMG_CART_READ, 0x200, progress => {
            if (callback) {
              callback(total + progress);
            }
          });
          total += 0x200;
        }
      };
      const data = [];
      for (const i of ints(256)) {
        data.push(...banks[i]);
      }
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }
};

const shift = async (client, value) => {
  await client.command(cmds.SET_PIN, 0b10000, 1);              // /CS
  await client.command(cmds.SET_PIN, 0b00010, value ? 1 : 0);  // CLK
  await client.command(cmds.SET_PIN, 0b10000, 0);              // /CS
  await client.command(cmds.SET_PIN, 0b10000, 1);              // /CS
};

export const detect = async (client) => {
  await client.setVariable(vars.ADDRESS, 0x0000);
  const data = await client.transfer(cmds.DMG_CART_READ, 0x200);
  if (data.every(x => x == 0)) {
    throw new Error("No cartridge detected");
  }
  return new LynxCart(new Uint8Array(data));
};

export const connect = async (client) => {
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
};

export const db = async () => (await import("./db/lynx.json", {with: {type: "json"}})).default;
