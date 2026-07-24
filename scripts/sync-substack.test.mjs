import assert from "node:assert/strict";
import test from "node:test";
import { normalize, renderIssueBlock, updateDocument } from "./sync-substack.mjs";

const posts = Array.from({ length: 13 }, (_, index) => ({
  title: `Issue ${index + 1}`,
  href: `https://letdataspeak.substack.com/p/issue-${index + 1}`,
  sub: `Summary ${index + 1}`,
  publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));

test("deduplicates by canonical URL and sorts newest first", () => {
  const result = normalize([...posts, { ...posts[12], title: "Issue 13" }]);
  assert.equal(result.length, 13);
  assert.equal(result[0].title, "Issue 13");
});

test("renders one row for every detected issue", () => {
  const block = renderIssueBlock(normalize(posts));
  assert.equal((block.match(/\{ no:/g) || []).length, 13);
  assert.match(block, /№ 13/);
  assert.match(block, /№ 01/);
});

test("updates rows and all explicit counters from one source", () => {
  const html = `issueCount: 9,
{ num: "9", label: "Issues Published" }
metrics: [{ n: "9", l: "Issues" }]
      // LET-DATA-SPEAK:START
      issues: [],
      // LET-DATA-SPEAK:END`;
  const once = updateDocument(html, normalize(posts));
  const twice = updateDocument(once, normalize(posts));
  assert.equal(once, twice);
  assert.match(once, /issueCount: 13/);
  assert.equal((once.match(/\{ no:/g) || []).length, 13);
});
