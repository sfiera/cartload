// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import * as agb from "./agb.js";
import {Client} from "./client.js";
import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import * as gg from "./gg.js";
import * as ngp from "./ngp.js";
import {downloadUrl, hex, toDataUrl, unitBytes} from "./util.js";

const PLATFORMS = {
  dmg,
  agb,
  gg,
  ngp,
};

const showInfo = cart => {
  const title = document.getElementById("title");
  const code = document.getElementById("code");
  const mapper = document.getElementById("mapper");
  const rom = document.getElementById("rom");
  const sav = document.getElementById("sav");
  const logo = document.getElementById("logo");

  if (cart) {
    title.replaceChildren(cart.title || "(none)");
    code.replaceChildren(cart.code || "(none)");
    mapper.replaceChildren(cart.mapperName);
    rom.replaceChildren(unitBytes(cart.romSize));
    sav.replaceChildren(unitBytes(cart.savSize));

    const img = new Image();
    img.src = cart.logoImageUrl();
    logo.replaceChildren(img);
  } else {
    title.replaceChildren();
    code.replaceChildren();
    mapper.replaceChildren();
    rom.replaceChildren();
    sav.replaceChildren();
    logo.replaceChildren();
  }
};

const showProgress = (curr, max) => {
  const progress = document.getElementById("progress");
  const pct = Math.floor(1000 * curr / max) / 10;
  progress.value = pct;
  progress.innerText = `${pct}%`;
};

const handleConnect = async platform => {
  const ctrl = new AbortController();
  const signal = ctrl.signal;

  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort()];
  }

  const port = ports[0];
  await port.open({baudRate: 1000000});
  const client = new Client(port);
  console.log(await client.identify());

  try {
    await run(client, platform, {signal});
  } finally {
    ctrl.abort();
    await client.command(cmds.CART_PWR_OFF);
    await client.close();
    await port.close();
  };
};

const run = async (client, platform, {signal}) => {
  let cart = null;
  try {
    await platform.connect(client);
    cart = await platform.detect(client);
  } finally {
    await client.command(cmds.CART_PWR_OFF);
  }

  console.log(cart);
  if (!cart) {
    return;
  }

  console.log(hex(await window.crypto.subtle.digest("SHA-1", cart.header)));
  showInfo(cart);
  signal.addEventListener("abort", () => showInfo(null));

  const backUp = document.getElementById("back-up");
  const handleBackUp = async () => {
    backUp.disabled = true;
    const data = await cart.backUpRom(client, len => showProgress(len, cart.romSize));
    console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
    downloadUrl(`${cart.title || cart.code || "ROM"}.${cart.extension}`, await toDataUrl(data));
    backUp.disabled = false;
  };
  backUp.disabled = false;
  backUp.addEventListener("click", handleBackUp, {signal});
  signal.addEventListener("abort", () => backUp.disabled = true);

  const {promise, resolve} = Promise.withResolvers();
  const disconnect = document.getElementById("disconnect");
  disconnect.disabled = false;
  disconnect.addEventListener("click", () => resolve(), {signal});
  signal.addEventListener("abort", () => disconnect.disabled = true);

  await promise;
};

document.addEventListener("DOMContentLoaded", () => {
  const platform = document.getElementById("platform");
  const connect = document.getElementById("connect");

  platform.addEventListener("change", () => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", async () => {
    connect.disabled = true;
    platform.disabled = true;
    await handleConnect(PLATFORMS[platform.value]);
    connect.disabled = false;
    platform.disabled = false;
  });
});
