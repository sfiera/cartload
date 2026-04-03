export class FakeClient {
  constructor(mode, voltage, rom) {
    this.address = 0;
    this.rom = new Uint8Array(rom);
    this.expectedMode = mode;
    this.expectedVoltage = voltage;
    this.on = false;
    this.queue = [];
    this.working = false;
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
        const result = await fn(this);
        resolve(result);
      } catch (e) {
        reject(e);
      }

      // Queue might become non-empty while running this command.
      if (!this.queue.length) {
        await this.setPower(false);
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

  setMode(mode, voltage) {
    expect(mode).toBe(this.expectedMode);
    expect(voltage).toBe(this.expectedVoltage);
  }

  setPower(on) { this.on = on; }

  dmgBoot() {}
  agbBoot() {}
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
