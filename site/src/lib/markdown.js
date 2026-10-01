import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

for (const [names, language] of [["bash sh", bash], ["c", c], ["cpp", cpp], ["css", css], ["js javascript", javascript], ["json", json], ["ts typescript", typescript], ["html xml", xml]]) {
  for (const name of names.split(" ")) hljs.registerLanguage(name, language);
}
const markdown = new MarkdownIt({
  html: false, linkify: true, typographer: true,
  highlight(code, language) {
    const value = language && hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : markdown.utils.escapeHtml(code);
    return `<pre class="hljs"><code>${value}</code></pre>`;
  }
});

function headingId(text, used) {
  const base = String(text).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "section";
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

export function renderArticle(content, title = "") {
  const cleaned = String(content || "").split(/\r?\n/).map((line) => /^[\s\u200B-\u200D\uFEFF]*$/.test(line) ? "" : line).join("\n");
  const tokens = markdown.parse(cleaned, {});
  const used = new Map();
  const headings = [];
  const duplicateTitle = tokens[0]?.type === "heading_open" && tokens[0].tag === "h1" && tokens[1]?.content.trim() === title.trim();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== "heading_open") continue;
    const inline = tokens[index + 1];
    const text = inline?.children?.map((token) => token.type === "softbreak" ? " " : token.content || "").join("") || inline?.content || "";
    const id = headingId(inline?.content || "", used);
    tokens[index].attrSet("id", id);
    if (!(index === 0 && duplicateTitle)) headings.push({ id, text, level: Number(tokens[index].tag.slice(1)) });
  }
  if (duplicateTitle) tokens.splice(0, 3);
  return { html: markdown.renderer.render(tokens, markdown.options, {}), headings, empty: !tokens.length };
}
