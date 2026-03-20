import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";

export class FakeClient {
  constructor(rom) {
    this.address = 0;
    this.rom = new Uint8Array(rom);
    this.pullups = undefined;
    this.on = false;
  }

  openBus() {
    expect(this.pullups).toBeDefined();
    return this.pullups ? 0xFF : 0x00;
  }

  async lock(fn) { return await fn(this); }

  cmdCartPwrOn() { this.on = true; }
  cmdCartPwrOff() { this.on = false; }

  async command(cmd, ...args) {
    for (const [key, cmd2] of Object.entries(cmds)) {
      if (cmd.id == cmd2.id) {
        const fn = "cmd" + key.toLowerCase().replace(/(?:^|_)+(.)/g, (_, c) => c.toUpperCase())
        if (typeof this[fn] === "undefined") {
          throw new Error(`unimplemented command ${key}`);
        }
        return this[fn](...args);
      }
    }
    throw new Error(`unknown command ${cmd.id}`);
  }

  async setVariable(variable, value) {
    for (const [key, variable2] of Object.entries(vars)) {
      if ((variable.id == variable2.id) && (variable.size == variable2.size)) {
        const fn = "set" + key.toLowerCase().replace(/(?:^|_)+(.)/g, (_, c) => c.toUpperCase())
        if (typeof this[fn] === "undefined") {
          throw new Error(`unimplemented variable ${key}`);
        }
        return this[fn](value);
      }
    }
    throw new Error(`unknown command ${cmd.id}`);
  }
}

export function rand(n, seed) {
  seed = seed || 1;
  const data = new Uint8Array(n);
  data.forEach((_, i) => {
    seed = (48271 * seed) % 2147483647;
    data[i] = seed;
  });
  return data;
}

export function zero(array, start, end) {
  while (start < end) {
    array[start++] = 0;
  }
}

export function copy(array, start, ...data) { data.forEach((x, i) => array[start + i] = x); }
