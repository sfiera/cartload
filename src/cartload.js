import {Client} from "./client.js";
import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import * as gg from "./gg.js";
import {unpack} from "./struct.js";
import {downloadUrl, hex, toDataUrl, unitBytes} from "./util.js";

const MAX_TRANSFER_SIZE = 64;
const PLATFORMS = {
  dmg,
  gg,
};

let handleClick = async function(platform) {
  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort()];
  }

  let port = ports[0];
  await port.open({baudRate: 1000000});
  let client = new Client(port);
  console.log(await client.identify());
  platform = PLATFORMS[platform];

  try {
    await platform.connect(client);
    const cart = await platform.detect(client);

    console.log(cart);
    console.log(hex(await window.crypto.subtle.digest("SHA-1", cart.header)));
    document.getElementById("title").replaceChildren(cart.title || "(none)");
    document.getElementById("code").replaceChildren(cart.code || "(none)");
    document.getElementById("mapper").replaceChildren(cart.mapperName);
    document.getElementById("rom").replaceChildren(unitBytes(cart.romSize));
    document.getElementById("sav").replaceChildren(unitBytes(cart.savSize));

    const img = new Image();
    img.src = cart.logoImageUrl(cart.header);
    document.getElementById("logo").replaceChildren(img);

    document.getElementById("back-up").disabled = false;
    document.getElementById("back-up").addEventListener("click", async (e) => {
      e.target.disabled = true;
      const data = await cart.backUpRom(client);
      console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
      downloadUrl(`${cart.title || cart.code || 'ROM'}.${cart.extension}`, await toDataUrl(data));
      e.target.disabled = false;
    });

  } finally {
    await client.command(cmds.CART_PWR_OFF);
  }
};

document.addEventListener("DOMContentLoaded", (e) => {
  const platform = document.getElementById("platform");
  const connect = document.getElementById("connect");
  const disconnect = document.getElementById("disconnect");

  platform.addEventListener("change", (e) => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", (e) => {
    connect.disabled = true;
    disconnect.disabled = false;
    handleClick(platform.value);
  });
});
