import { readFile, writeFile } from "node:fs/promises";

const FEED_URL = "https://letdataspeak.substack.com/feed";
const FILE = new URL("../index.html", import.meta.url);
const START = "      // LET-DATA-SPEAK:START";
const END = "      // LET-DATA-SPEAK:END";

function decode(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function field(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decode(match?.[1]);
}

export function parseFeed(xml) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({
      title: field(item, "title"),
      href: field(item, "link"),
      sub: field(item, "description"),
      publishedAt: field(item, "pubDate"),
    }))
    .filter((item) => item.title && item.href);

  if (!items.length) throw new Error("The publication feed returned no posts.");
  return items;
}

function js(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function replaceWriting(html, items) {
  const latest = items.slice(0, 12);
  const rows = latest.map((item, index) => {
    const issueNumber = String(items.length - index).padStart(2, "0");
    return `        { no: "№ ${issueNumber}", title: ${js(item.title)}, sub: ${js(item.sub)}, href: ${js(item.href)} },`;
  });
  const block = `${START}\n      issues: [\n${rows.join("\n")}\n      ],\n${END}`;
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < 0 || end <= start) throw new Error("Writing update markers are missing.");

  return html
    .slice(0, start)
    .concat(block, html.slice(end + END.length))
    .replace(/issueCount:\s*\d+,/, `issueCount: ${items.length},`)
    .replace(
      /\{ num: "\d+", label: "Issues Published", detail: "[^"]*" \}/,
      `{ num: "${items.length}", label: "Issues Published", detail: "Let Data Speak — updated automatically" }`,
    );
}

async function main() {
  const response = await fetch(FEED_URL, {
    headers: { "user-agent": "naman-portfolio-writing-sync/1.0" },
  });
  if (!response.ok) throw new Error(`Feed request failed with ${response.status}.`);
  const items = parseFeed(await response.text());
  const current = await readFile(FILE, "utf8");
  const next = replaceWriting(current, items);
  if (next !== current) await writeFile(FILE, next);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
