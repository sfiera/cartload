import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {arrayEq, ints, latin1, makeImage, Segment} from "./util.js";

class AgbCart {
  constructor(data, romSize) {
    this.header = data;
    this.title = latin1.decode(data.slice(0x0A0, 0x0AC));
    this.code = latin1.decode(data.slice(0x0AC, 0x0B0));
    this.romSize = romSize;
    this.savSize = 0;
  }

  get mapperName() { return "None" }

  get extension() { return "gba"; }

  logoImageUrl(header) {
    return makeImage(64, 8, (ctx) => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 64, 8);
    });
  }

  async backUpRom(client, callback) {
    await client.command(cmds.CART_PWR_ON);
    try {
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.ADDRESS, 0x00000000);
      await client.setVariable(vars.AGB_READ_METHOD, 2);
      await client.setVariable(vars.CART_MODE, 2);
      const data = await client.transfer(cmds.AGB_CART_READ, this.romSize, callback);
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }
};

export const detect = async (client) => {
  const header = new Uint8Array(await client.transfer(cmds.AGB_CART_READ, 0x180, null));
  for (let words = 0x4000; words <= 0x10000000; words <<= 1) {
    await client.command(cmds.ENABLE_PULLUPS);
    await client.setVariable(vars.ADDRESS, words);
    const hiHeader = await client.transfer(cmds.AGB_CART_READ, 0x180, null);

    await client.command(cmds.DISABLE_PULLUPS);
    await client.setVariable(vars.ADDRESS, words);
    const loHeader = await client.transfer(cmds.AGB_CART_READ, 0x180, null);

    if (arrayEq(hiHeader, header) || !arrayEq(hiHeader, loHeader)) {
      return new AgbCart(header, words * 2);
    }
  }
  return new AgbCart(header, 0);
};

export const connect = async (client) => {
  await client.command(cmds.DISABLE_PULLUPS);
  await client.command(cmds.SET_MODE_AGB);
  await client.command(cmds.SET_VOLTAGE_3_3V);
  await client.setVariable(vars.AGB_READ_METHOD, 2);
  await client.setVariable(vars.CART_MODE, 2);
  await client.setVariable(vars.AGB_IRQ_ENABLED, 0);
  await client.setVariable(vars.ADDRESS, 0x00000000);
  await client.command(cmds.CART_PWR_ON);
};
