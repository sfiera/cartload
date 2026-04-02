// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import AgbCart from "./agb.js";
import Client from "./client.js";
import DmgCart from "./dmg.js";
import GameGearCart from "./gg.js";
import LynxCart from "./lynx.js";
import NeoGeoPocketCart from "./ngp.js";
import {crc32, downloadUrl, hex, hex32, makeElement, toDataUrl, unitBytes} from "./util.js";

const q = (...args) => document.querySelector(...args);

const PLATFORMS = {
  dmg: DmgCart,
  agb: AgbCart,
  gg: GameGearCart,
  ngp: NeoGeoPocketCart,
  lynx: LynxCart,
};

const ROM_PROPS = {
  title: "Title",
  code: "Code",
  mapperName: "Mapper",
};

const showInfo = (cart, dbEntry) => {
  const db = q("#db > div");
  const rom = q("#rom > div");
  const sav = q("#sav > div");

  if (!cart) {
    db.replaceChildren(p("Disconnected"));
    rom.replaceChildren(p("Disconnected"));
    sav.replaceChildren(p("Disconnected"));
    return;
  }

  if (dbEntry) {
    const dbProps = ul(li(`Title: ${dbEntry.gn} ${dbEntry.ne}`));
    db.replaceChildren(dbProps);
    if (typeof dbEntry.rc !== "undefined") {
      dbProps.appendChild(
          li("Checksum: ", makeElement("tt", {className: "crc32", children: hex32(dbEntry.rc)})))
    }
  } else {
    db.replaceChildren(p("Not found"));
  }

  const romProps = ul(li(`Size: ${unitBytes(cart.romSize)}`));
  rom.replaceChildren(romProps);
  for (const [prop, name] of Object.entries(ROM_PROPS)) {
    if (typeof cart[prop] !== "undefined") {
      romProps.appendChild(li(`${name}: ${cart[prop]}`));
    }
  }
  if (typeof cart.logoImageUrl !== "undefined") {
    romProps.appendChild(li("Logo: ", makeElement("img", {src: cart.logoImageUrl()})));
  }

  if (cart.savSize) {
    sav.replaceChildren(ul(li(`Size: ${unitBytes(cart.savSize)}`)));
  } else {
    sav.replaceChildren(p("None"));
  }
};

const showProgress = (curr, max) => {
  const progress = q("progress");
  const pct = Math.floor(1000 * curr / max) / 10;
  progress.value = pct;
  progress.innerText = `${pct}%`;
};

const handleConnect = async platform => {
  const ctrl = new AbortController();
  const signal = ctrl.signal;

  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort({
      filters: [
        {usbVendorId: 0x1a86, usbProductId: 0x7523},
      ],
    })];
  }

  const client = await Client.open(ports[0]);
  await client.lock(0, async client => {
    console.log(await client.identify());
  });

  try {
    await run(client, platform, {signal});
  } catch (e) {
    showErr(e);
  } finally {
    ctrl.abort();
    await client.lock(0, async client => {
      await client.setPower(false);
      await client.close();
    });
  };
};

const action = async (fn) => {
  const elements = [];
  [...document.getElementsByTagName("button")].forEach(e => {
    elements.push([e, !!e.disabled]);
    e.disabled = true;
  });
  try {
    return await fn();
  } finally {
    elements.forEach(([e, dis]) => e.disabled = dis);
  };
};

const run = async (client, platform, {signal}) => {
  const cart = await platform.detect(client);
  console.log(cart);
  if (!cart) {
    return;
  }

  const digest = hex(await cart.headerDigest());
  const db = await platform.db();
  const dbEntry = db[digest];
  const title = dbEntry ? `${dbEntry.gn} ${dbEntry.ne}` : (cart.title || cart.code || "game");
  console.log(title, digest, dbEntry);

  showInfo(cart, dbEntry);
  signal.addEventListener("abort", () => showInfo(null));

  const backUp = async () => {
    const data = await cart.backUpRom(client, len => showProgress(len, cart.romSize));
    console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
    if (dbEntry && typeof dbEntry.rc !== "undefined") {
      if (dbEntry.rc === crc32(data)) {
        q("#db .crc32").classList.add("valid");
        q("#db .crc32").classList.remove("invalid");
      } else {
        q("#db .crc32").classList.add("invalid");
        q("#db .crc32").classList.remove("valid");
      }
    }
    return data;
  };

  const romForm = makeElement("form");
  q("#rom > div").appendChild(romForm);

  romForm.append(makeElement("button", {
    children: [`Back up .${cart.extension}`],
    onclick: async () =>
        downloadUrl(`${title}.${cart.extension}`, await toDataUrl(await backUp())),
  }));

  if (dbEntry && typeof dbEntry.rc !== "undefined") {
    romForm.append(makeElement("button", {
      children: ["Validate"],
      onclick: async () => await action(() => backUp()),
    }));
  }

  if (cart.canBackUpSav) {
    const savForm = makeElement("form");
    q("#sav > div").appendChild(savForm);
    savForm.append(makeElement("button", {
      children: ["Back up .sav"],
      onclick: async () => {
        await action(async () => {
          const data = await cart.backUpSav(client, len => showProgress(len, cart.savSize));
          console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
          downloadUrl(`${title}.sav`, await toDataUrl(data));
        });
      },
    }));
  }

  const {promise, resolve} = Promise.withResolvers();
  const disconnect = q("#disconnect");
  disconnect.disabled = false;
  disconnect.addEventListener("click", () => resolve(), {signal});
  signal.addEventListener("abort", () => disconnect.disabled = true);

  await promise;
};

const runModal = (children, buttons) => new Promise(resolve => {
  const dlog = makeElement("dialog", {children: children});

  const form = makeElement("form", {
    method: "dialog",
    children: buttons.map(b => makeElement("button", {innerText: b, value: b})),
  });
  form.firstChild.autofocus = true;
  dlog.appendChild(form);

  dlog.addEventListener("close", e => {
    document.body.removeChild(dlog);
    resolve(dlog.returnValue);
  });
  document.body.appendChild(dlog);
  dlog.showModal();
});

const [h2, p, ul, li, tt] = ["h2", "p", "ul", "li", "tt"].map(
    tag => ((...children) => makeElement(tag, {children: children})));

const showErr = e => {
  console.log(e);
  runModal([h2(e.name), p(e.message)], ["OK"]);
};

document.addEventListener("DOMContentLoaded", () => {
  const platform = q("#platform");
  const connect = q("#connect");

  if (!navigator.serial) {
    platform.disabled = true;
    runModal(
        [
          h2("Web Serial missing"),
          p("Cartload requires a ",
            makeElement("a", {
              href: "https://caniuse.com/web-serial",
              children: "Web Serial-compatible browser",
            }),
            ", such as the desktop versions of Chrome, Edge, or Opera."),
        ],
        ["OK"]);
    return;
  }

  platform.addEventListener("change", () => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", async () => {
    connect.disabled = true;
    platform.disabled = true;
    try {
      await handleConnect(PLATFORMS[platform.value]);
    } catch (e) {
      showErr(e);
    } finally {
      connect.disabled = false;
      platform.disabled = false;
    }
  });
});
