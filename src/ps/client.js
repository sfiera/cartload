// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {pack, unpack} from "../struct.js";
import {v} from "../util.js";

class LockedClient {
  constructor(device) {
    this.device = device;
    this.open = true;
  }

  async close() {
    await this.device.close();
    this.open = false;
  }

  async sendCommand(cmd) {
    if (cmd.length === 1) {
      await this.device.transferOut(2, pack(">BB", 0xAA, cmd[0]));
    } else {
      const array = [];
      array.push(...pack("<BBH", 0xAA, 0x42, cmd.length));
      array.push(...cmd);
      await this.device.transferOut(2, new Uint8Array(array));
    }
  }

  async readFrame(f) {
    await this.sendCommand(pack(">BB2xH134x", 0x81, 0x52, f));
    const resp = await this.device.transferIn(1, 64);
    const data =
        Array.from(new Uint8Array(resp.data.buffer, resp.data.byteOffset, resp.data.byteLength));
    if ((data.length < 2) || (data[0] !== 0x55)) {
      throw new Error(`invalid read frame response ${data}`)
    }
    if (data[1] !== 0x5A) {
      throw new Error(`read frame failed (${data[1]})`)
    }
    const len = unpack("<H", data.slice(2, 4));
    const frame = data.slice(4);
    while (frame.length < len) {
      const resp = await this.device.transferIn(1, 64);
      const data =
          Array.from(new Uint8Array(resp.data.buffer, resp.data.byteOffset, resp.data.byteLength));
      frame.push(...data);
    }
    return frame.slice(10, 138);
  }

  async identify() {
    await this.sendCommand([0x40]);
    const resp = await this.device.transferIn(1, 64);
    const data =
        Array.from(new Uint8Array(resp.data.buffer, resp.data.byteOffset, resp.data.byteLength));
    if ((data.length < 2) || (data[0] != 0x55)) {
      throw new Error(`invalid card type response ${data}`);
    }
    const cardType = data[1] || null;
    return {cardType};
  }
}

export default class PsMemClient {
  constructor(device) {
    this.locked = new LockedClient(device);
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
    }
    this.working = false;
  }

  lock(priority, fn) {
    const {promise, resolve, reject} = Promise.withResolvers();
    this.queue.push({resolve, reject, fn, priority});
    this.#work();
    return promise;
  }

  static async open(device) {
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    await device.claimInterface(0);
    return new PsMemClient(device);
  }
}
