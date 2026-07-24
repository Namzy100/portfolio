import { readFile, writeFile } from "node:fs/promises";

const PUBLICATION_URL = "https://letdataspeak.substack.com";
const ARCHIVE_URL = `${PUBLICATION_URL}/api/v1/archive`;
const FEED_URL = `${PUBLICATION_URL}/feed`;
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

export function parseArchive(payload) {
  if (!Array.isArray(payload)) throw new Error("The publication archive returned an invalid response.");
  return payload
    .filter((post) => post && post.type !== "thread" && post.title)
    .map((post) => ({
      title: decode(post.title),
      href: post.canonical_url || `${PUBLICATION_URL}/p/${post.slug}`,
      sub: decode(post.subtitle || post.description || ""),
      publishedAt: post.post_date || post.published_at || "",
    }))
    .filter((post) => post.href);
}

function normalizeIssues(items) {
  const unique = new Map();
  for (const item of items) {
    if (item?.href && item?.title) unique.set(item.href, item);
  }
  return [...unique.values()].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || "") || 0;
    const bTime = Date.parse(b.publishedAt || "") || 0;
    return bTime - aTime;
  });
}

function js(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function replaceWriting(html, rawItems) {
  const items = normalizeIssues(rawItems);
  const rows = items.map((item, index) => {
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
    )
    .replace(/\{ n: "\d+", l: "Issues" \}/, `{ n: "${items.length}", l: "Issues" }`);
}

async function fetchAllIssues() {
  const posts = [];
  const limit = 50;

  for (let offset = 0; ; offset += limit) {
    const url = new URL(ARCHIVE_URL);
    url.searchParams.set("sort", "new");
    url.searchParams.set("search", "");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url, {
      headers: { "user-agent": "naman-portfolio-writing-sync/3.0" },
    });
    if (!response.ok) break;

    const page = parseArchive(await response.json());
    posts.push(...page);
    if (page.length < limit) return normalizeIssues(posts);
  }

  const response = await fetch(FEED_URL, {
    headers: { "user-agent": "naman-portfolio-writing-sync/3.0" },
  });
  if (!response.ok) throw new Error(`Substack request failed with ${response.status}.`);
  return normalizeIssues(parseFeed(await response.text()));
}

async function main() {
  const items = await fetchAllIssues();
  if (!items.length) throw new Error("The publication archive returned no posts.");
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
