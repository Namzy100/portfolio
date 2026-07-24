const PUBLICATION_URL = "https://letdataspeak.substack.com";
const ARCHIVE_URL = `${PUBLICATION_URL}/api/v1/archive?sort=new&search=&offset=0&limit=50`;
const FEED_URL = `${PUBLICATION_URL}/feed`;

function clean(value = "") {
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

function parseFeed(xml) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => ({
      title: field(item, "title"),
      href: field(item, "link"),
      sub: field(item, "description"),
      publishedAt: field(item, "pubDate"),
    }))
    .filter((item) => item.title && item.href);
}

function normalize(items) {
  const unique = new Map();
  for (const item of items) {
    if (item?.title && item?.href) unique.set(item.href, item);
  }
  return [...unique.values()].sort(
    (a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0),
  );
}

module.exports = async function handler(_request, response) {
  try {
    let issues = [];
    const archive = await fetch(ARCHIVE_URL, {
      headers: { "user-agent": "naman-portfolio-live-writing/1.0" },
    });

    if (archive.ok) {
      const posts = await archive.json();
      issues = Array.isArray(posts)
        ? posts
            .filter((post) => post && post.type !== "thread" && post.title)
            .map((post) => ({
              title: clean(post.title),
              href: post.canonical_url || `${PUBLICATION_URL}/p/${post.slug}`,
              sub: clean(post.subtitle || post.description || ""),
              publishedAt: post.post_date || post.published_at || "",
            }))
        : [];
    }

    if (!issues.length) {
      const feed = await fetch(FEED_URL, {
        headers: { "user-agent": "naman-portfolio-live-writing/1.0" },
      });
      if (!feed.ok) throw new Error(`Substack returned ${feed.status}`);
      issues = parseFeed(await feed.text());
    }

    const normalized = normalize(issues);
    response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
    response.status(200).json({ count: normalized.length, issues: normalized });
  } catch (error) {
    response.status(502).json({ error: "Unable to refresh Let Data Speak.", detail: error.message });
  }
};
