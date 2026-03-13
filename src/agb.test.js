// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import * as agb from "./agb.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {FakeClient} from "./testutil.js";
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

class AgbFakeClient extends FakeClient {
  read(addr) {
    if (0 <= addr && addr < this.rom.length) {
      return this.rom[addr] || 0;
    }
    return 0xFF;
  }

  write(addr, value) {}

  cmdCartPwrOn() {}
  cmdCartPwrOff() {}
  cmdEnablePullups() {}
  cmdDisablePullups() {}

  setAddress(value) { this.address = value & 0xFFFFFFFF; }
  setCartMode(value) {}

  async transfer(cmd, size, callback, ...args) {
    expect(cmd.id).toBe(cmds.AGB_CART_READ.id);
    expect(args).toHaveLength(0);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(this.address++);
    }
    return result;
  }
}
