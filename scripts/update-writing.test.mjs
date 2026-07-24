import assert from "node:assert/strict";
import test from "node:test";
import { parseArchive, parseFeed, replaceWriting } from "./update-writing.mjs";

test("parses Substack-style RSS items", () => {
  const items = parseFeed(`
    <rss><channel><item>
      <title><![CDATA[Numbers &amp; Noise]]></title>
      <link>https://example.com/p/numbers</link>
      <description><![CDATA[<p>The signal underneath.</p>]]></description>
      <pubDate>Fri, 24 Jul 2026 12:00:00 GMT</pubDate>
    </item></channel></rss>
  `);
  assert.deepEqual(items[0], {
    title: "Numbers & Noise",
    href: "https://example.com/p/numbers",
    sub: "The signal underneath.",
    publishedAt: "Fri, 24 Jul 2026 12:00:00 GMT",
  });
});

test("parses Substack archive posts", () => {
  const items = parseArchive([
    {
      title: "Issue twelve",
      subtitle: "Fresh analysis.",
      canonical_url: "https://letdataspeak.substack.com/p/issue-twelve",
      post_date: "2026-07-24T12:00:00.000Z",
      type: "newsletter",
    },
  ]);
  assert.deepEqual(items[0], {
    title: "Issue twelve",
    href: "https://letdataspeak.substack.com/p/issue-twelve",
    sub: "Fresh analysis.",
    publishedAt: "2026-07-24T12:00:00.000Z",
  });
});

test("updates only the protected writing block and counters", () => {
  const html = `before
      issueCount: 9,
        { num: "9", label: "Issues Published", detail: "old" },
        { n: "9", l: "Issues" },
      // LET-DATA-SPEAK:START
      issues: [],
      // LET-DATA-SPEAK:END
after`;
  const next = replaceWriting(html, [
    { title: "New issue", href: "https://example.com/new", sub: "Fresh analysis." },
  ]);
  assert.match(next, /issueCount: 1,/);
  assert.match(next, /\{ n: "1", l: "Issues" \}/);
  assert.match(next, /№ 01/);
  assert.match(next, /New issue/);
  assert.match(next, /before/);
  assert.match(next, /after/);
});

test("renders one row for every published issue", () => {
  const html = `before
      issueCount: 2,
        { num: "2", label: "Issues Published", detail: "old" },
      // LET-DATA-SPEAK:START
      issues: [],
      // LET-DATA-SPEAK:END
after`;
  const items = Array.from({ length: 13 }, (_, index) => ({
    title: `Issue ${13 - index}`,
    href: `https://example.com/${13 - index}`,
    sub: "Analysis.",
  }));
  const next = replaceWriting(html, items);
  assert.equal((next.match(/\{ no: "№/g) || []).length, 13);
  assert.match(next, /№ 13/);
  assert.match(next, /№ 01/);
});
