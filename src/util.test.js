// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {hex, unhex, unitBytes} from "./util.js";

const b = (...bytes) => new Uint8Array([...bytes]);

test("hex", () => {
  expect(hex(b())).toBe("");
  expect(hex(b(0))).toBe("00");
  expect(hex(b(0x12, 0x34))).toBe("1234");
})

test("unhex", () => {
  expect(unhex("00")).toStrictEqual(b(0));
  expect(unhex("1234")).toStrictEqual(b(0x12, 0x34));
  expect(unhex("1234 5678")).toStrictEqual(b(0x12, 0x34, 0x56, 0x78));
})

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
