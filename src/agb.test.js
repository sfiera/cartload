// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import agb from "./agb.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {FakeClient, rand} from "./testutil.js";
import {unhex} from "./util.js";

const logoBits = unhex(
    "24ffae51699aa2213d84820a84e409ad11248b98c0817f21a352" +
    "be199309ce2010464a4af82731ec58c7e83382e3cebf85f4df94" +
    "ce4b09c194568ac01372a7fc9f844d73a3ca9a615897a327fc03" +
    "9876231dc7610304ae56bf38840040a70efdff52fe036f9530f1" +
    "97fbc08560d68025a963be03014e38e2f9a234ffbb3e03447800" +
    "90cb88113a9465c07c6387f03cafd625e48b380aac7221d4f807")

const logoGfx = [
  "                                                ▗▄▖ ",
  " ██▖  ██ ██        ▄▄                  ██      ▗▚▄▝▖",
  " ██▙  ██ ▀▀       ▄██▄                 ██      ▐▐▄▘▌",
  " ██▜▌ ██ ██ ██▟█▙▖▀██▀ ▟▛▜▙ ▐█▙██▄  ▟█▙██ ▗█▀█▖▝▞ ▚▘",
  " ██▝█▖██ ██ ██▘ ██ ██ ▟█  █▙▐█▛ ▐█▌▟█▘ ██▗█▌ ▐█▖▝▀▘ ",
  " ██ ▐▙██ ██ ██  ██ ██ ██▀▀▀▀▐█▌ ▐█▌██  ██▐█▌ ▐█▌    ",
  " ██  ▜██ ██ ██  ██ ██ ▜█  ██▐█▌ ▐█▌▜█  ██▝█▌ ▐█▘    ",
  " ██  ▝██ ██ ██  ██ ██  ▜▙▟▛▘▐█▌ ▐█▌ ▜▙▟██ ▝█▄█▘     ",
].join("\n");

const tiles = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";  // bitfield

test("decompress logo", async () => {
  const data = Array(0x180).fill(0);
  data.splice(0x004, logoBits.length, ...logoBits);
  const cart = await agb.detect(new AgbFakeClient(data));
  const logo = Array(8).fill(0).map(_ => Array(52).fill(0));
  const ctx = {
    fillRect: (x, y, w, h) => {
      expect(w).toEqual(1);
      expect(h).toEqual(1);
      expect(ctx.fillStyle).toEqual("black");
      const bit = (x & 1) | ((y & 1) << 1);
      logo[y >>> 1][x >>> 1] |= 1 << bit;
    },
  };
  cart.drawImage(ctx);
  expect(logo.map(row => row.map(x => tiles[x]).join("")).join("\n")).toEqual(logoGfx);
});

const KIB = 1024;
const MIB = 1024 * KIB;

test.each([
  {size: 4},   // less than 16 MiB → detection by open bus
  {size: 16},  // exactly 16 MiB → detection by repeated header
  {size: 32},  // more than 16 MiB → detection by repeated header
])("detect size $size MiB", async ({size}) => {
  size *= MIB;
  const data = rand(size);
  const cart = await agb.detect(new AgbFakeClient(data));
  expect(cart.romSize).toBe(size);
});

class AgbFakeClient extends FakeClient {
  read(addr, options) {
    const {pullups} = options || {};

    if (this.rom.length >= (16 * MIB)) {
      addr &= this.rom.length - 1;
    } else {
      addr &= (16 * MIB) - 1;
    }

    if (0 <= addr && addr < this.rom.length) {
      return this.rom[addr] || 0;
    } else if (pullups) {
      return 0xFF;
    } else {
      return 0x00;
    }
  }

  write(addr, value) {}

  async transfer(mode, address, size, options) {
    const {pullups} = options || {};

    expect(mode).toBe("agb");
    expect(!!pullups).toBe(false);

    address &= 0xFFFFFFFF;
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(address++, options);
      address &= 0xFFFFFFFF;
    }
    return result;
  }
}
