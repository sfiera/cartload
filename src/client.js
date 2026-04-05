// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {latin1} from "./util.js";

const MAX_TRANSFER_SIZE = 64;

class LockedClient {
  constructor(port) {
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.open = true;
  }

  async close() {
    await this.reader.releaseLock();
    await this.writer.releaseLock();
    await this.port.close();
    this.open = false;
  }

  async #command(cmd, ...args) {
    await this.writer.write(pack(cmd.reqFormat, cmd.id, ...args));
    if (!cmd.respFormat.length) {
      return [];
    }
    let data = new Array();
    while (true) {
      let readData = await this.reader.read();
      data.push(...readData.value);
      try {
        return unpack(cmd.respFormat, new Uint8Array(data));
      } catch (e) {
        if (e.message != "data underflow") {
          throw e;
        }
      }
      if (readData.done) {
        throw new Error("EOF");
      }
    }
  }

  async #getVariable(variable) {
    return await this.#command(cmds.GET_VARIABLE, variable.size, variable.id);
  }

  async #setVariable(variable, value) {
    return await this.#command(cmds.SET_VARIABLE, variable.size, variable.id, value);
  }

  async #writeDmg(address, value, {csPulse = true}) {
    await this.#setVariable(vars.DMG_WRITE_CS_PULSE, csPulse ? 1 : 0);
    return await this.#command(cmds.DMG_CART_WRITE, address, value);
  }

  write(mode, address, value, options = {}) {
    switch (mode) {
      case "dmg":
        return this.#writeDmg(address, value, options);
      default:
        throw new Error(`invalid write mode ${mode}`);
    }
  }

  async setMode(mode, voltage) {
    if (voltage == 5) {
      await this.#command(cmds.SET_VOLTAGE_5V);
    } else if (voltage == 3.3) {
      await this.#command(cmds.SET_VOLTAGE_3_3V);
    } else {
      throw new Error(`Invalid voltage: ${voltage}`);
    }

    if (mode === "dmg") {
      await this.#command(cmds.SET_MODE_DMG);
      await this.#setVariable(vars.CART_MODE, 1);
      await this.#setVariable(vars.DMG_READ_METHOD, 1);
      await this.#setVariable(vars.DMG_ACCESS_MODE, 1);
    } else if (mode === "agb") {
      await this.#command(cmds.SET_MODE_AGB);
      await this.#setVariable(vars.CART_MODE, 2);
      await this.#setVariable(vars.AGB_READ_METHOD, 2);
      await this.#setVariable(vars.AGB_IRQ_ENABLED, 0);
    } else {
      throw new Error(`Invalid mode: ${mode}`);
    }
    await this.#command(cmds.DISABLE_PULLUPS);
    await this.#setVariable(vars.ADDRESS, 0);
  }

  async setPower(on) { await this.#command(on ? cmds.CART_PWR_ON : cmds.CART_PWR_OFF); }

  async dmgBoot() { await this.#command(cmds.DMG_MBC_RESET); }
  async agbBoot() { await this.#command(cmds.AGB_BOOTUP_SEQUENCE); }

  async setPin(mask, value) { return await this.#command(cmds.SET_PIN, mask, value ? 1 : 0); }

  async #transferAll(cmd, size, callback, ...args) {
    let result = [];
    if (size >= MAX_TRANSFER_SIZE) {
      await this.#setVariable(vars.TRANSFER_SIZE, MAX_TRANSFER_SIZE);
      while (size >= MAX_TRANSFER_SIZE) {
        await this.#transferChunk(cmd, result, MAX_TRANSFER_SIZE, ...args);
        size -= MAX_TRANSFER_SIZE;
        callback(result.length);
      }
    }
    if (size > 0) {
      await this.#setVariable(vars.TRANSFER_SIZE, size);
      await this.#transferChunk(cmd, result, size, ...args);
      callback(result.length);
    }
    return result;
  }

  async #transferChunk(cmd, result, size, ...args) {
    await this.#command(cmd, ...args);
    while (size > 0) {
      let data = (await this.reader.read()).value;
      result.push(...data);
      size -= data.length;
    }
  }

  async #transferDmg(address, size, {progress, csPulse}) {
    await this.#setVariable(vars.CART_MODE, 1);
    await this.#setVariable(vars.DMG_READ_METHOD, 1);
    await this.#setVariable(vars.DMG_ACCESS_MODE, 1);
    await this.#setVariable(vars.DMG_READ_CS_PULSE, csPulse ? 1 : 0);
    await this.#setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.DMG_CART_READ, size, progress);
  }

  async #transferDmgRam(address, size, {progress, csPulse}) {
    await this.#setVariable(vars.CART_MODE, 1);
    await this.#setVariable(vars.DMG_READ_METHOD, 1);
    await this.#setVariable(vars.DMG_ACCESS_MODE, 3);
    await this.#setVariable(vars.DMG_READ_CS_PULSE, csPulse ? 1 : 0);
    await this.#setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.DMG_CART_READ, size, progress);
  }

  async #transferDmgEep(address, size, {progress}) {
    await this.#setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.DMG_MBC7_READ_EEPROM, size, progress);
  }

  async #transferAgb(address, size, {progress}) {
    await this.#setVariable(vars.CART_MODE, 2);
    await this.#setVariable(vars.AGB_READ_METHOD, 2);
    await this.#setVariable(vars.ADDRESS, address >>> 1);
    return await this.#transferAll(cmds.AGB_CART_READ, size, progress);
  }

  async #transferAgbRam(address, size, {progress}) {
    await this.#setVariable(vars.CART_MODE, 2);
    await this.#setVariable(vars.AGB_READ_METHOD, 2);
    await this.#setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.AGB_CART_READ_SRAM, size, progress);
  }

  async #transferAgbEep(address, size, {progress}) {
    await this.#setVariable(vars.CART_MODE, 2);
    await this.#setVariable(vars.AGB_READ_METHOD, 2);
    await this.#setVariable(vars.ADDRESS, address >>> 3);
    return await this.#transferAll(cmds.AGB_CART_READ_EEPROM, size, progress, 1);
  }

  async readRange(mode, address, size, options) {
    options ||= {};
    options.progress ||= () => {};
    const {pullups} = options;

    if (pullups) {
      await this.#command(cmds.ENABLE_PULLUPS);
    } else {
      await this.#command(cmds.DISABLE_PULLUPS);
    }

    switch (mode) {
      case "dmg":
        return await this.#transferDmg(address, size, options);
      case "dmg-ram":
        return await this.#transferDmgRam(address, size, options);
      case "dmg-eep":
        return await this.#transferDmgEep(address, size, options);
      case "agb":
        return await this.#transferAgb(address, size, options);
      case "agb-ram":
        return await this.#transferAgbRam(address, size, options);
      case "agb-eep":
        return await this.#transferAgbEep(address, size, options);
      default:
        throw new Error(`invalid readRange mode ${mode}`);
    }
  }

  async identify() {
    const [ofwPcbVer] = await this.#command(cmds.OFW_PCB_VER);
    const [ofwFwVer] = await this.#command(cmds.OFW_FW_VER);

    if ((ofwPcbVer < 5) || (ofwFwVer == 0)) {
      throw new Error("unsupported ofw version", ofwPcbVer, ofwFwVer);
    }

    const [info, nameEnc, cartPowerCtrl, bootloaderReset] =
        await this.#command(cmds.QUERY_FW_INFO);
    const [cfwID, fwVer, pcbVer, fwTs] = unpack("BHBI", info);
    const fwDate = new Date(fwTs * 1000);
    const name = latin1.decode(nameEnc).replaceAll("\u0000", "");
    if (fwVer < 12) {
      throw new Error("unsupported fw version", fwVer);
    } else if (!cartPowerCtrl) {
      throw new Error("cartridge reset not supported");
    }

    return {cfwID, fwVer, pcbVer, fwDate, name, cartPowerCtrl, bootloaderReset};
  }
}

export default class Client {
  constructor(port) {
    this.locked = new LockedClient(port);
    this.working = false;
    this.queue = [];
  }

  async #work() {
    if (this.working) {
      return;
    }
    while (this.queue.length) {
      const n = this.queue.slice(1).reduce(
          (i, _, j) => (this.queue[i].priority < this.queue[j].priority) ? i : j, 0);
      const {resolve, reject, fn} = this.queue[n];
      this.queue.splice(n, 1);
      this.working = true;
      try {
        const result = await fn(this.locked);
        resolve(result);
      } catch (e) {
        reject(e);
      }

      // Queue might become non-empty while running this command.
      if (!this.queue.length) {
        if (this.locked.open) {
          await this.locked.setPower(false);
        }
      }
    }
    this.working = false;
  }

  lock(priority, fn) {
    const {promise, resolve, reject} = Promise.withResolvers();
    this.queue.push({resolve, reject, fn, priority});
    this.#work();
    return promise;
  }

  static async open(port) {
    await port.open({baudRate: 1000000});
    return new Client(port);
  }
}
