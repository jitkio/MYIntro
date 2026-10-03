import assert from "node:assert/strict";
import { test } from "node:test";
import { articlePath, folderPath, findFolder, articleFolder } from "../shared/navigation.js";
import { routeFromUrl } from "../shared/routes.js";
import { renderArticle } from "../src/lib/markdown.js";
import { referencedMediaUrls } from "../shared/media.js";

test("article and folder URLs preserve Unicode hierarchy and reserved characters", () => {
  const folder = "公开知识库/电源 #1/目录 & 配置";
  assert.equal(routeFromUrl(folderPath(folder)).folder, folder);
  assert.equal(routeFromUrl(articlePath("siyuan/test-document")).articleId, "siyuan/test-document");
  assert.equal(routeFromUrl("/?article=siyuan%2Fstable-id").articleId, "siyuan/stable-id");
  assert.equal(routeFromUrl("/directory/%E0%A4%A").invalid, true);
  assert.equal(routeFromUrl("/directory/a%2Fb").invalid, true);
});

test("directory selection keeps overview articles and their children in one folder", () => {
  const folder = { type: "folder", path: "notes/power", overview: { id: "overview" }, children: [{ type: "article", id: "leaf" }] };
  const tree = { type: "root", children: [{ type: "folder", path: "notes", children: [folder] }] };
  assert.equal(findFolder(tree, "notes/power"), folder);
  assert.equal(findFolder(tree, "missing"), null);
  assert.equal(articleFolder(tree, "overview"), folder);
  assert.equal(articleFolder(tree, "leaf"), folder);
});

test("reading removes the repeated document title while preserving unique section anchors", () => {
  const rendered = renderArticle("# 电源\n\n介绍。\n\n## 电源\n\n内容\n\n## 电源\n\n更多。", "电源");
  assert.doesNotMatch(rendered.html, /<h1/);
  assert.deepEqual(rendered.headings.map((heading) => heading.id), ["电源-2", "电源-3"]);
  for (const heading of rendered.headings) assert.ok(rendered.html.includes(`id="${heading.id}"`));
});

test("Markdown examples inside code blocks cannot create false TOC entries or execute HTML", () => {
  const rendered = renderArticle('# Guide\n\n```md\n# Example\n```\n\n## **Real** heading\n\n<script>alert(1)</script>', "Guide");
  assert.equal(rendered.headings.length, 1);
  assert.equal(rendered.headings[0].text, "Real heading");
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;/);
});

test("multiple Markdown attachments become players in article order while images and ordinary links stay intact", () => {
  const rendered = renderArticle([
    "# Media", "", "[演示 **一**](/media/first.MP4?download=1#t=1)", "",
    "![第二段](/media/second.webm)", "", "[录音](/media/voice.mp3)", "",
    "![图片](/media/cover.png)", "", "[文档](/media/manual.pdf)"
  ].join("\n"), "Media");
  assert.equal((rendered.html.match(/<video /g) || []).length, 2);
  assert.equal((rendered.html.match(/<audio /g) || []).length, 1);
  assert.ok(rendered.html.indexOf("first.MP4") < rendered.html.indexOf("second.webm"));
  assert.ok(rendered.html.indexOf("second.webm") < rendered.html.indexOf("voice.mp3"));
  assert.match(rendered.html, /controls preload="metadata" playsinline/);
  assert.doesNotMatch(rendered.html, /autoplay/);
  assert.match(rendered.html, /演示 一/);
  assert.match(rendered.html, /<img src="\/media\/cover.png"/);
  assert.match(rendered.html, /<a href="\/media\/manual.pdf">文档<\/a>/);
  assert.match(rendered.html, /download>下载视频/);
});

test("SiYuan media HTML accepts sources and posters but strips arbitrary attributes and fallback HTML", () => {
  const content = '<video src="/media/movie.mp4" poster="/media/poster.png" title="&lt;演示&gt;" autoplay onplay="alert(1)" style="width:9999px"><script>alert(1)</script></video>\n\n' +
    '<audio controls>\n<source src="/media/voice.ogg?x=1&amp;y=2" type="audio/ogg">\n<source src="/media/voice.mp3" type="audio/mpeg">\n</audio>';
  const rendered = renderArticle(content);
  assert.match(rendered.html, /<video controls preload="metadata" playsinline poster="\/media\/poster.png"/);
  assert.match(rendered.html, /aria-label="&lt;演示&gt;"/);
  assert.match(rendered.html, /<audio controls preload="metadata"/);
  assert.match(rendered.html, /src="\/media\/voice.ogg\?x=1&amp;y=2" type="audio\/ogg"/);
  assert.doesNotMatch(rendered.html, /<script|onplay|autoplay|9999px/);
  assert.deepEqual(referencedMediaUrls(content).sort(), ["/media/movie.mp4", "/media/poster.png", "/media/voice.mp3", "/media/voice.ogg?x=1&y=2"].sort());
});

test("media works in paragraphs, lists and quoted content without breaking surrounding Markdown", () => {
  const rendered = renderArticle('说明 <audio src="/media/voice.mp3"></audio> 后文\n\n- [视频](/media/a.mp4)\n\n> <video src="/media/b.mp4"></video>\n\n## 正文小节');
  assert.match(rendered.html, /说明 <span/);
  assert.match(rendered.html, /<\/span> 后文/);
  assert.match(rendered.html, /<li>/);
  assert.match(rendered.html, /<blockquote>/);
  assert.equal((rendered.html.match(/<video /g) || []).length, 2);
  assert.equal(rendered.headings[0].text, "正文小节");
});

test("code examples, unsafe URLs and unsupported files do not create playable media", () => {
  const content = '```html\n<video src="/media/code.mp4"></video>\n```\n\n~~~md\n[example](/media/fenced.mp3)\n~~~\n\n' +
    '`[inline](/media/inline.mp4)`\n\n<audio src="javascript:alert(1)"></audio>\n\n' +
    '<video src="data:video/mp4;base64,AAAA"></video>\n\n[unsupported](/media/clip.avi)\n\n<script>alert(1)</script>';
  const rendered = renderArticle(content);
  assert.doesNotMatch(rendered.html, /<video |<audio |<script>/);
  assert.match(rendered.html, /href="\/media\/clip.avi"/);
  assert.deepEqual(referencedMediaUrls(content), ["/media/clip.avi"]);
});

test("encoded filenames, reference links and HTTPS media use escaped URLs and captions", () => {
  const content = '[录音][voice]\n\n[voice]: /media/%E5%BD%95%E9%9F%B3%20one.mp3\n\n' +
    '[\"演示\" & 示例](https://example.com/movie.mp4?x=1&y=2)\n\n' +
    '<video src="/media/scene.mp4" title="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"></video>';
  const rendered = renderArticle(content);
  assert.equal((rendered.html.match(/<audio /g) || []).length, 1);
  assert.equal((rendered.html.match(/<video /g) || []).length, 2);
  assert.match(rendered.html, /movie.mp4\?x=1&amp;y=2/);
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.deepEqual(referencedMediaUrls(content), ["/media/%E5%BD%95%E9%9F%B3%20one.mp3", "/media/scene.mp4"]);
});

test("media HTML preserves filenames with spaces and parentheses", () => {
  const content = '<video src="/media/演示 (第一段).mp4"></video>';
  assert.match(renderArticle(content).html, /<video controls/);
  assert.deepEqual(referencedMediaUrls(content), ["/media/演示 (第一段).mp4"]);
});
