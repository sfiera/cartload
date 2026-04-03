// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import AgbCart from "./agb.js";
import Client from "./client.js";
import DmgCart from "./dmg.js";
import GameGearCart from "./gg.js";
import LynxCart from "./lynx.js";
import NeoGeoPocketCart from "./ngp.js";
import {crc32, downloadUrl, hex, hex32, makeElement, toDataUrl, unitBytes} from "./util.js";

const q = (s, el = document) => el.querySelector(s);

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
  const db = q("#db");
  const rom = q("#rom");
  const sav = q("#sav");
  for (const el of [db, rom, sav]) {
    el.replaceChildren(el.children[0]);
  }

  if (!cart) {
    db.append(p("Disconnected"));
    rom.append(p("Disconnected"));
    sav.append(p("Disconnected"));
    return;
  }

  if (dbEntry) {
    const dbProps = ul(li(`Title: ${dbEntry.gn} ${dbEntry.ne}`));
    db.append(dbProps);
    if (typeof dbEntry.rc !== "undefined") {
      dbProps.append(
          li("Checksum: ", makeElement("tt", {className: "crc32", children: hex32(dbEntry.rc)})))
    }
  } else {
    db.append(p("Not found"));
  }

  const romProps = ul(li(`Size: ${unitBytes(cart.romSize)}`));
  rom.append(romProps);
  for (const [prop, name] of Object.entries(ROM_PROPS)) {
    if (typeof cart[prop] !== "undefined") {
      romProps.append(li(`${name}: ${cart[prop]}`));
    }
  }
  if (typeof cart.logoImageUrl !== "undefined") {
    romProps.append(li("Logo: ", makeElement("img", {src: cart.logoImageUrl()})));
  }

  if (cart.savSize) {
    sav.append(ul(li(`Size: ${unitBytes(cart.savSize)}`)));
  } else {
    sav.append(p("None"));
  }
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

const action = async (title, fn) => {
  q("#disconnect").disabled = true;
  const sect = makeElement("section", {
    className: "progress",
    children: [h2(title), makeElement("progress")],
  });
  q("main").append(sect);
  let update = true;
  try {
    return await fn((curr, max) => {
      const pct = Math.floor(1000 * curr / max) / 10;
      const progress = q("progress", sect);
      progress.value = curr;
      progress.max = max;
      progress.innerText = `${pct}%`;
      if (update) {
        let text = q("p", sect);
        if (!text) {
          text = p();
          sect.append(text);
        }
        text.innerText = `${unitBytes(curr)} of ${unitBytes(max)}`;
        update = false;
        setTimeout(() => update = true, 250);
      }
    });
  } finally {
    q("main").removeChild(sect);
    q("#disconnect").disabled = false;
  };
};

const run = async (client, platform, {signal}) => {
  const cart = await action("Detect cartridge", () => platform.detect(client));
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

  const backUp = async title => {
    return await action(title, async progress => {
      const data = await cart.backUpRom(client, len => progress(len, cart.romSize));
      console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
      if (dbEntry && typeof dbEntry.rc !== "undefined") {
        if (dbEntry.rc === crc32(data)) {
          q("#db .crc32").classList.add("valid");
          q("#db .crc32").classList.remove("invalid");
        } else {
          q("#db .crc32").classList.add("invalid");
          q("#db .crc32").classList.remove("valid");
        }
        return data;
      }
    });
  };

  const romForm = makeElement("form", {onsubmit: () => false});
  q("#rom").append(romForm);

  romForm.append(makeElement("button", {
    children: [`Back up .${cart.extension}`],
    onclick: async () => downloadUrl(
        `${title}.${cart.extension}`, await toDataUrl(await backUp("Back up ROM Data"))),
  }));

  if (dbEntry && typeof dbEntry.rc !== "undefined") {
    romForm.append(makeElement("button", {
      children: ["Validate"],
      onclick: () => backUp("Validate ROM Data"),
    }));
  }

  if (typeof cart.backUpSav !== "undefined") {
    const savForm = makeElement("form", {onsubmit: () => false});
    q("#sav").append(savForm);
    savForm.append(makeElement("button", {
      children: ["Back up .sav"],
      onclick: async () => {
        await action("Back up Save Data", async progress => {
          const data = await cart.backUpSav(client, len => progress(len, cart.savSize));
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
  dlog.append(form);

  dlog.addEventListener("close", e => {
    document.body.removeChild(dlog);
    resolve(dlog.returnValue);
  });
  document.body.append(dlog);
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
