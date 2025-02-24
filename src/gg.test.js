import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import * as gg from "./gg.js";
import {latin1, Segment, unhex} from "./util.js";

function rand(n, seed) {
  seed = seed || 1;
  const data = new Uint8Array(n);
  data.forEach((_, i) => {
    seed = (48271 * seed) % 2147483647;
    data[i] = seed;
  });
  return data;
}

function zero(array, start, end) {
  while (start < end) {
    array[start++] = 0;
  }
}

function copy(array, start, ...data) { data.forEach((x, i) => array[start + i] = x); }

class FakeClient {
  constructor(rom, ram) {
    this.address = 0;
    this.rom = new Uint8Array(rom);
  }

  read(addr) {
    if (0 <= addr && addr < 0xC000) {
      return this.rom[addr] || 0;
    }
    return 0xFF;
  }

  write(addr, value) {}

  async command(cmd, ...args) {}

  async setVariable(variable, value) {
    if (variable === vars.ADDRESS) {
      this.address = value & 0xFFFF;
    } else if (variable === vars.DMG_READ_METHOD) {
    } else if (variable === vars.DMG_ACCESS_MODE) {
    } else if (variable === vars.CART_MODE) {
    } else if (variable === vars.DMG_READ_CS_PULSE) {
    } else {
      expect(variable).toEqual(null);
    }
  }

  async transfer(cmd, size, ...args) {
    expect(cmd.id).toBe(cmds.DMG_CART_READ.id);
    expect(args).toHaveLength(0);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(gg.unshuffleAddr(this.address++));
      this.address &= 0xFFFF;
    }
    return result;
  }
}

test("address shuffling", () => {
  expect(gg.shuffleAddr(0x0000)).toBe(0x0000);
  expect(gg.shuffleAddr(0xFFFF)).toBe(0xFFFF);
  expect(gg.shuffleAddr(0x1234)).toBe(0x1059);
});

test("no mapper", async () => {
  const data = rand(0x8000);
  copy(data, 0x7FF0, ...unhex("544d5220534547410000"));  // "TMR SEGA"
  copy(data, 0x7FFA, 0xBB, 0xAA);                        // Checksum: 0xAABB
  copy(data, 0x7FFC, ...unhex("123456"));                // Product code: 53412; Version: 6
  copy(data, 0x7FFF, ...unhex("5c"));                    // Region: GG Japan; Size: 32 KiB
  const client = new FakeClient(data);

  const cart = await gg.detect(client);
  expect(cart.title).toBe(null);
  expect(cart.code).toBe("53412");
  expect(cart.romVersion).toBe(6);
  expect(cart.region).toBe(5);
  expect(cart.romSize).toBe(32768);
  expect(cart.valid.trademark).toBe(true);

  // const backup = await cart.backUpRom(client);
  // expect(backup).toEqual(data);
});
