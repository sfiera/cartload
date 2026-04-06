// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import fs from "fs/promises";
import path from "path";

import DmgCart from "../dmg.js";
import {copy, FakeClient, rand} from "../testutil.js";

import kiss from "./kiss.js";

test("find", async () => {
  const rom = rand(0x8000);
  copy(rom, 0x0014, 0x01, 0x03, 0x80, 0xBF);
  copy(rom, 0x0147, 0xFF);

  const savPath = path.resolve("src/plug/testdata/gbkiss.sav");
  const ram = await fs.readFile(savPath);

  const client = new HuCFakeClient(rom, ram);
  const cart = await DmgCart.detect(client);

  const files = [];
  await kiss.scan(client, cart, file => files.push(file));
  for (const [i, file] of files.entries()) {
    files[i] = await file;
  }
  expect(files.length).toBe(3);
  expect(files[0].title).toBe("HelloWorld");
  expect(files[1].title).toBe("Passwords");
  expect(files[2].title).toBe("CKSUM");
  expect(files[0].size).toBe(103);
  expect(files[1].size).toBe(197);
  expect(files[2].size).toBe(927);
});

class HuCFakeClient extends FakeClient {
  constructor(rom, ram) {
    super("dmg", 5, rom);
    this.ram = new Uint8Array(ram);
    this.ramEnabled = false;
    this.ramBank = 0;
    this.romBank = 1;
  }

  read(addr) {
    if (0 <= addr && addr < 0x4000) {
      return this.rom[addr] || 0;
    } else if (0x4000 <= addr && addr < 0x8000) {
      return this.rom[addr | (this.romBank << 14)] || 0;
    } else if (0xA000 <= addr && addr < 0xC000) {
      if (this.ramEnabled) {
        return this.ram[(addr & 0x1FFF) | (this.ramBank << 13)] || 0;
      }
    }
    return 0;
  }

  write(mode, addr, value) {
    if (0 <= addr && addr < 0x2000) {
      this.ramEnabled = (value == 0x0A);
    } else if (0x2000 <= addr && addr < 0x4000) {
      this.romBank = value;
    } else if (0x4000 <= addr && addr < 0x6000) {
      this.ramBank = value;
    }
  }

  async readRange(mode, address, size, options) {
    options ||= {};
    const {csPulse, pullups} = options;

    expect(mode).toBe("dmg");
    expect(!!csPulse).toBe(true);
    expect(!!pullups).toBe(false);

    address &= 0xFFFF;
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(address++);
      address &= 0xFFFF;
    }
    return result;
  }
}
