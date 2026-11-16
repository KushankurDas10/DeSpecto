import { lookup } from "node:dns/promises";
import { createServer, request } from "node:http";
import { BlockList, connect, isIP } from "node:net";
import { InputError } from "../../shared/target.js";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
]) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16]]) {
  blocked.addSubnet(address, prefix, "ipv6");
}

export async function publicAddress(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address, family }) =>
    blocked.check(address, family === 6 ? "ipv6" : "ipv4") || (family === 6 && !/^[23]/i.test(address)))) {
    throw new InputError("Only public websites can be audited.");
  }
  return addresses.find((entry) => entry.family === 4)?.address ?? addresses[0].address;
}

export async function startAuditProxy() {
  const sockets = new Set();
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url);
      if (url.protocol !== "http:" || url.port || url.username || url.password
        || !["GET", "HEAD"].includes(incoming.method)) throw new Error();
      const address = await publicAddress(url.hostname);
      const headers = { ...incoming.headers, host: url.host, connection: "close" };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = request({
        hostname: address, port: 80, path: url.pathname + url.search, headers, method: incoming.method,
        timeout: 12000,
      }, (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
        response.on("error", () => outgoing.destroy());
      });
      upstream.on("error", () => outgoing.destroy());
      upstream.on("timeout", () => upstream.destroy());
      outgoing.on("close", () => upstream.destroy());
      upstream.end();
    } catch {
      outgoing.writeHead(403).end();
    }
  });

  server.on("connect", async (incoming, browser, head) => {
    browser.on("error", () => browser.destroy());
    try {
      const match = /^(\[[a-f\d:]+\]|[a-z\d.-]+):443$/i.exec(incoming.url);
      if (!match) throw new Error();
      // Dial the validated address so DNS cannot change between validation and connection.
      const address = await publicAddress(match[1]);
      if (browser.destroyed) return;
      const upstream = connect({ host: address, port: 443, timeout: 15000 });
      upstream.once("connect", () => {
        browser.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        browser.pipe(upstream).pipe(browser);
      });
      upstream.on("error", () => browser.destroy());
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("close", () => browser.destroy());
      browser.on("close", () => upstream.destroy());
    } catch {
      browser.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });

  server.maxConnections = 70;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setTimeout(20000, () => socket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
