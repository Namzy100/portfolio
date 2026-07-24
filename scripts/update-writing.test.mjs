import assert from "node:assert/strict";
import test from "node:test";
import { parseFeed, replaceWriting } from "./update-writing.mjs";

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

test("updates only the protected writing block and counters", () => {
  const html = `before
      issueCount: 9,
        { num: "9", label: "Issues Published", detail: "old" },
      // LET-DATA-SPEAK:START
      issues: [],
      // LET-DATA-SPEAK:END
after`;
  const next = replaceWriting(html, [
    { title: "New issue", href: "https://example.com/new", sub: "Fresh analysis." },
  ]);
  assert.match(next, /issueCount: 1,/);
  assert.match(next, /№ 01/);
  assert.match(next, /New issue/);
  assert.match(next, /before/);
  assert.match(next, /after/);
});
