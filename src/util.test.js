// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {crc32, hex, hex32, unhex, unitBytes} from "./util.js";

const b = (...bytes) => new Uint8Array([...bytes]);

test("hex", () => {
  expect(hex(b())).toBe("");
  expect(hex(b(0))).toBe("00");
  expect(hex(b(0x12, 0x34))).toBe("1234");
});

test("unhex", () => {
  expect(unhex("00")).toStrictEqual(b(0));
  expect(unhex("1234")).toStrictEqual(b(0x12, 0x34));
  expect(unhex("1234 5678")).toStrictEqual(b(0x12, 0x34, 0x56, 0x78));
});

test("hex32", () => {
  expect(hex32(0)).toBe("00000000");
  expect(hex32(0x1234)).toBe("00001234");
  expect(hex32(0xFFFFFFFF)).toBe("ffffffff");
});

test("crc32", () => {
  expect(crc32([])).toBe(0);
  expect(crc32([0])).toBe(0XD202EF8D);
  expect(crc32([0, 1, 2])).toBe(0X0854897F);
  expect(crc32([1, 2], 0xd202ef8d)).toBe(0X0854897F);
  expect(crc32([0xFF])).toBe(0xFF000000);
});

test("bytes", () => {
  expect(unitBytes(0)).toBe("0");

  expect(unitBytes(1024)).toBe("1 KiB");
  expect(unitBytes(1024 * 1024)).toBe("1 MiB");
  expect(unitBytes(1024 * 1024 * 1024)).toBe("1 GiB");
  expect(unitBytes(1024 * 1024 * 1024 * 1024)).toBe("1024 GiB");  // No TiB cartridges

  expect(unitBytes(512)).toBe("512 B");
  expect(unitBytes(512 * 1024)).toBe("512 KiB");
  expect(unitBytes(512 * 1024 * 1024)).toBe("512 MiB");
  expect(unitBytes(512 * 1024 * 1024 * 1024)).toBe("512 GiB");

  expect(unitBytes(5325)).toBe("5.2 KiB");
  expect(unitBytes(5325 * 1024)).toBe("5.2 MiB");
  expect(unitBytes(5325 * 1024 * 1024)).toBe("5.2 GiB");

  expect(unitBytes(5329)).toBe("5.2 KiB");
  expect(unitBytes(5329 * 1024)).toBe("5.2 MiB");
  expect(unitBytes(5329 * 1024 * 1024)).toBe("5.2 GiB");

  expect(unitBytes(5330)).toBe("5.21 KiB");
  expect(unitBytes(5330 * 1024)).toBe("5.21 MiB");
  expect(unitBytes(5330 * 1024 * 1024)).toBe("5.21 GiB");

  expect(unitBytes(0.5)).toBe("0.5 B");
});
