// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {arrayEq, latin1, makeImage, unhex} from "./util.js";

const nintendoLogo = unhex(
    "24ffae51699aa2213d84820a84e409ad11248b98c0817f21a352" +
    "be199309ce2010464a4af82731ec58c7e83382e3cebf85f4df94" +
    "ce4b09c194568ac01372a7fc9f844d73a3ca9a615897a327fc03" +
    "9876231dc7610304ae56bf38840040a70efdff52fe036f9530f1" +
    "97fbc08560d68025a963be03014e38e2f9a234ffbb3e03447800" +
    "90cb88113a9465c07c6387f03cafd625e48b380aac7221d4f807")

export default class AgbCart {
  constructor(data, romSize) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    }

    this.code = latin1.decode(data.slice(0x0AC, 0x0B0));
    const headerSize = this.code.startsWith("M") ? 0x100 : 0x180;
    if (data.length < headerSize) {
      throw new TypeError("data too short for header")
    }
    data = data.slice(0, headerSize);

    this.header = data;
    this.logo = data.slice(0x004, 0x0A0);
    this.title = latin1.decode(data.slice(0x0A0, 0x0AC));
    this.romSize = romSize;
    this.savSize = 0;

    this.valid = {
      logo: arrayEq(this.logo, nintendoLogo),
      headerCksum:
          data[0x0BD] == data.slice(0x0A0, 0x0BD).reduce((cksum, x) => (cksum - x) & 0xff, 0xe7),
    };
    this.valid.header = this.valid.logo && this.valid.headerCksum;
  }

  async headerDigest() { return await window.crypto.subtle.digest("SHA-1", this.header); }

  get mapperName() { return "None" }

  get extension() { return "gba"; }

  // Translated from FlashGBX code originally by Winter1760
  drawImage(ctx) {
    ctx.fillStyle = "black";

    const decompress = (data) => {
      const bits = data[0] & 0x0F;
      const [outLen] = unpack("<H", data.slice(1, 3));
      let nodeOffs = 5, outUnits = 0, outReady = 0;
      const out = [];

      for (let i = 6 + data[4] * 2;; i += 4) {
        const inUnit = unpack("<H", data.slice(i, i + 2))[0] |
            (unpack("<H", data.slice(i ^ 2, (i ^ 2) + 2)) << 16);
        for (let b = 31; b >= 0; b -= 1) {
          const node = data[nodeOffs];
          nodeOffs &= 0xFFFFFFFE;
          nodeOffs += (node & 0x3F) * 2 + 2 + ((inUnit >>> b) & 1);
          if (node << ((inUnit >>> b) & 1) & 0x80) {
            outReady >>>= bits;
            outReady |= (data[nodeOffs] & ((1 << bits) - 1)) << (32 - bits);
            outUnits += 1;
            if (outUnits == bits % 8 + 4) {
              out.push(...pack("<I", outReady));
              if (out.length >= outLen) {
                data.splice(0, data.length, ...out);
                return;
              }
              outUnits = outReady = 0;
            }
            nodeOffs = 5;
          }
        }
      }
    };

    const undiff = (data) => {
      const [outLen] = unpack("<H", data.slice(1, 3));
      let pos = 4;
      let prev = 0;
      while (pos < outLen) {
        if (pos + 2 > data.length) {
          break;
        }
        const next = (unpack("<H", data.slice(pos, pos + 2))[0] + prev) & 0xFFFF;
        data.splice(pos, 2, ...pack("<H", next));
        pos += 2;
        prev = next;
      }
    };

    let prefix = unhex("24D400000F4000000001818282830F830CC30383018304C3080E02C20DC2070B060A0509");
    let data = [...prefix];
    data.push(...this.logo);
    decompress(data);
    undiff(data);

    for (let ty = 0; ty < 2; ty += 1) {
      for (let tx = 0; tx < 13; tx += 1) {
        for (let x = 0; x < 8; x += 1) {
          for (let y = 0; y < 8; y += 1) {
            const pos = (ty * 13 * 8) + (tx * 8) + x + 4;
            if ((pos < data.length) && (data[pos] & (1 << y))) {
              ctx.fillRect(tx * 8 + y, ty * 8 + x, 1, 1);
            }
          }
        }
      }
    }
  }

  logoImageUrl() { return makeImage(104, 16, (ctx) => this.drawImage(ctx)); }

  async backUpRom(client, callback) {
    await client.command(cmds.CART_PWR_ON);
    try {
      const data = await client.transfer("agb", 0, this.romSize, {progress: callback});
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }

  static async detect(client) {
    const header = await client.transfer("agb", 0, 0x180);
    if (header.every(x => x == 0)) {
      throw new Error("No cartridge detected");
    }

    // Detect ROM size by scanning upwards for the header.
    for (let address = 0x8000; address <= 0x20000000; address <<= 1) {
      const newHeader = await client.transfer("agb", address, 0x180);
      if (arrayEq(newHeader, header) || newHeader.every(x => x == 0)) {
        return new AgbCart(new Uint8Array(header), address);
      }
    }

    // Failed to detect ROM size.
    return new AgbCart(new Uint8Array(header), 0);
  }

  static async connect(client) {
    await client.command(cmds.DISABLE_PULLUPS);
    await client.command(cmds.SET_MODE_AGB);
    await client.command(cmds.SET_VOLTAGE_3_3V);
    await client.setVariable(vars.AGB_READ_METHOD, 2);
    await client.setVariable(vars.CART_MODE, 2);
    await client.setVariable(vars.AGB_IRQ_ENABLED, 0);
    await client.setVariable(vars.ADDRESS, 0x00000000);
    await client.command(cmds.CART_PWR_ON);
    await client.command(cmds.AGB_BOOTUP_SEQUENCE);
  }

  static async db() { return (await import("./db/agb.json", {with: {type: "json"}})).default; }
};
