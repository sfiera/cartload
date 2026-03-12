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

class AgbCart {
  constructor(data, romSize) {
    this.header = data;
    this.logo = data.slice(0x004, 0x0A0);
    this.title = latin1.decode(data.slice(0x0A0, 0x0AC));
    this.code = latin1.decode(data.slice(0x0AC, 0x0B0));
    this.romSize = romSize;
    this.savSize = 0;

    this.valid = {
      logo: arrayEq(this.logo, nintendoLogo),
      headerCksum:
          data[0x0BD] == data.slice(0x0A0, 0x0BD).reduce((cksum, x) => (cksum - x) & 0xff, 0xe7),
    };
    this.valid.header = this.valid.logo && this.valid.headerCksum;
  }

  get mapperName() { return "None" }

  get extension() { return "gba"; }

  // Translated from FlashGBX code originally by Winter1760
  drawImage(ctx) {
    ctx.fillStyle = "black";

    const decompress = (data) => {
      const bits = data[0] & 0x0F;
      const outLen = data[1] | (data[2] << 8);
      let nodeOffs = 5, outUnits = 0, outReady = 0;
      const out = [];

      for (let i = 6 + data[4] * 2;; i += 4) {
        const inUnit =
            data[i] | (data[i + 1] << 8) | (data[i ^ 2] << 16) | (data[(i ^ 2) + 1] << 24)
        for (let b = 31; b >= 0; b -= 1) {
          const node = data[nodeOffs];
          nodeOffs &= 0xFFFFFFFE;
          nodeOffs += (node & 0x3F) * 2 + 2 + ((inUnit >>> b) & 1);
          if (node << ((inUnit >>> b) & 1) & 0x80) {
            outReady >>>= bits;
            outReady |= (data[nodeOffs] & ((1 << bits) - 1)) << (32 - bits);
            outUnits += 1;
            if (outUnits == bits % 8 + 4) {
              out.push(...pack("I", outReady).toReversed());
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
      const outLen = data[1] | (data[2] << 8);
      let pos = 4;
      let prev = 0;
      while (pos < outLen) {
        if (pos + 2 > data.length) {
          break;
        }
        const next = (data[pos] + (data[pos + 1] << 8) + prev) & 0xFFFF;
        data.splice(pos, 2, ...pack("H", next).toReversed());
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

  logoImageUrl(header) { return makeImage(104, 16, this.drawImage); }

  async backUpRom(client, callback) {
    await client.command(cmds.CART_PWR_ON);
    try {
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.ADDRESS, 0x00000000);
      await client.setVariable(vars.AGB_READ_METHOD, 2);
      await client.setVariable(vars.CART_MODE, 2);
      const data = await client.transfer(cmds.AGB_CART_READ, this.romSize, callback);
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }
};

const readHeader = async (client, {address, pullups}) => {
  await client.command(pullups ? cmds.ENABLE_PULLUPS : cmds.DISABLE_PULLUPS);
  await client.setVariable(vars.ADDRESS, (address || 0) / 2);
  return new Uint8Array(await client.transfer(cmds.AGB_CART_READ, 0x180, null));
};

export const detect = async (client) => {
  // Read ROM header with pullups enabled and disabled.
  // If results don’t match, bus is open and no cart is present.
  const hiHeader = await readHeader(client, {pullups: true});
  const loHeader = await readHeader(client, {pullups: false});
  if (!arrayEq(hiHeader, loHeader)) {
    return null;
  }
  const header = hiHeader;

  // Detect ROM size by scanning upwards for the header.
  // Size is found if header reappears or bus is open.
  for (let address = 0x8000; address <= 0x20000000; address <<= 1) {
    const hiHeader = await readHeader(client, {address, pullups: true});
    const loHeader = await readHeader(client, {address, pullups: false});
    if (arrayEq(hiHeader, header) || !arrayEq(hiHeader, loHeader)) {
      return new AgbCart(header, address);
    }
  }

  // Failed to detect ROM size.
  return new AgbCart(header, 0);
};

export const connect = async (client) => {
  await client.command(cmds.DISABLE_PULLUPS);
  await client.command(cmds.SET_MODE_AGB);
  await client.command(cmds.SET_VOLTAGE_3_3V);
  await client.setVariable(vars.AGB_READ_METHOD, 2);
  await client.setVariable(vars.CART_MODE, 2);
  await client.setVariable(vars.AGB_IRQ_ENABLED, 0);
  await client.setVariable(vars.ADDRESS, 0x00000000);
  await client.command(cmds.CART_PWR_ON);
  await client.command(cmds.AGB_BOOTUP_SEQUENCE);
};
