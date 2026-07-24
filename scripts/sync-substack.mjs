import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PUBLICATION_URL = "https://letdataspeak.substack.com";
export const ARCHIVE_URL = `${PUBLICATION_URL}/api/v1/archive?sort=new&search=&offset=0&limit=100`;
export const FEED_URL = `${PUBLICATION_URL}/feed`;
const START = "      // LET-DATA-SPEAK:START";
const END = "      // LET-DATA-SPEAK:END";

export function clean(value = "") {
  return String(value)
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
  return clean(match?.[1]);
}

export function parseFeed(xml) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({
      title: field(item, "title"),
      href: field(item, "link"),
      sub: field(item, "description"),
      publishedAt: field(item, "pubDate"),
    }))
    .filter((item) => item.title && item.href);
}

export function normalize(items) {
  const byUrl = new Map();
  for (const item of items) {
    const href = item?.href?.split("?")[0]?.replace(/\/$/, "");
    if (!href || !item?.title) continue;
    byUrl.set(href, { ...item, href, title: clean(item.title), sub: clean(item.sub) });
  }
  return [...byUrl.values()].sort(
    (a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0),
  );
}

export async function fetchIssues(fetchImpl = fetch) {
  const archive = await fetchImpl(ARCHIVE_URL, {
    headers: { "user-agent": "naman-portfolio-writing-sync/2.0" },
  });
  if (archive.ok) {
    const posts = await archive.json();
    const issues = Array.isArray(posts)
      ? posts
          .filter((post) => post && post.type !== "thread" && post.title)
          .map((post) => ({
            title: post.title,
            href: post.canonical_url || `${PUBLICATION_URL}/p/${post.slug}`,
            sub: post.subtitle || post.description || "",
            publishedAt: post.post_date || post.published_at || "",
          }))
      : [];
    if (issues.length) return normalize(issues);
  }

  const feed = await fetchImpl(FEED_URL, {
    headers: { "user-agent": "naman-portfolio-writing-sync/2.0" },
  });
  if (!feed.ok) throw new Error(`Substack returned ${feed.status}`);
  return normalize(parseFeed(await feed.text()));
}

const js = (value) => JSON.stringify(clean(value));

export function renderIssueBlock(issues) {
  const rows = issues.map((issue, index) => {
    const number = String(issues.length - index).padStart(2, "0");
    return `        { no: "№ ${number}", title: ${js(issue.title)}, sub: ${js(issue.sub)}, href: ${JSON.stringify(issue.href)} },`;
  });
  return [START, "      issues: [", ...rows, "      ],", END].join("\n");
}

export function updateDocument(html, issues) {
  if (!issues.length) throw new Error("Refusing to replace the archive with zero issues.");
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error("Let Data Speak markers are missing or malformed.");

  const updated = html.slice(0, start) + renderIssueBlock(issues) + html.slice(end + END.length);
  return updated
    .replace(/issueCount:\s*\d+/, `issueCount: ${issues.length}`)
    .replace(/num: "\d+", label: "Issues Published"/, `num: "${issues.length}", label: "Issues Published"`)
    .replace(/metrics: \[\{ n: "\d+", l: "Issues" \}/, `metrics: [{ n: "${issues.length}", l: "Issues" }`);
}

export async function sync({ file = "index.html", fetchImpl = fetch } = {}) {
  const [html, issues] = await Promise.all([readFile(file, "utf8"), fetchIssues(fetchImpl)]);
  const updated = updateDocument(html, issues);
  if (updated === html) return { changed: false, count: issues.length };
  await writeFile(file, updated);
  return { changed: true, count: issues.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await sync();
  console.log(`${result.changed ? "Updated" : "Already current"}: ${result.count} Let Data Speak issues.`);
}
