import MarkdownIt from "markdown-it";

const mediaExtensions = {
  video: new Set(["mp4", "webm", "ogv", "m4v", "mov"]),
  audio: new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac"])
};
const openingTag = /^<(video|audio)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i;
const attributePattern = /([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;

function safeMediaUrl(value) {
  const url = String(value || "").trim();
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return null;
  if (!url.startsWith("/media/") && !/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    if (parsed.username || parsed.password) return null;
    if (url.startsWith("/media/") && !parsed.pathname.startsWith("/media/")) return null;
    return url;
  } catch { return null; }
}

export function mediaKind(value) {
  const url = safeMediaUrl(value);
  if (!url) return null;
  try {
    const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    const extension = /\.([a-z0-9]+)$/i.exec(pathname)?.[1].toLowerCase();
    return Object.keys(mediaExtensions).find((kind) => mediaExtensions[kind].has(extension)) || null;
  } catch { return null; }
}

function attributes(source, md) {
  const result = Object.create(null);
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if (!(name in result)) result[name] = md.utils.unescapeAll(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

// Recognize only complete media elements. Rebuild their allowed attributes rather
// than rendering the original HTML; arbitrary article HTML stays disabled.
function readMediaElement(source, md) {
  const opening = openingTag.exec(source);
  if (!opening) return null;
  const kind = opening[1].toLowerCase();
  const attrs = attributes(opening[2], md);
  const closing = new RegExp(`</${kind}\\s*>`, "i").exec(source.slice(opening[0].length));
  if (!closing) return null;
  const end = opening[0].length + closing.index + closing[0].length;
  const body = source.slice(opening[0].length, opening[0].length + closing.index);
  const sources = [];
  const src = safeMediaUrl(attrs.src);
  if (src) sources.push({ src });
  if (!src) {
    for (const match of body.matchAll(/<source\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
      const sourceAttrs = attributes(match[1], md);
      const sourceUrl = safeMediaUrl(sourceAttrs.src);
      if (sourceUrl) sources.push({ src: sourceUrl, type: /^(?:video|audio)\/[a-z0-9.+-]+$/i.test(sourceAttrs.type || "") ? sourceAttrs.type : null });
    }
  }
  if (!sources.length) return null;
  return {
    end,
    media: { kind, sources, poster: kind === "video" ? safeMediaUrl(attrs.poster) : null, label: attrs.title || attrs["aria-label"] || "" }
  };
}

function mediaLabel(media) {
  if (media.label) return media.label;
  try { return decodeURIComponent(new URL(media.sources[0].src, "http://localhost").pathname.split("/").at(-1)); }
  catch { return media.kind === "video" ? "视频" : "音频"; }
}

function renderMedia(media, md) {
  const escape = md.utils.escapeHtml;
  const label = escape(mediaLabel(media));
  const downloadLabel = media.kind === "video" ? "下载视频" : "下载音频";
  const href = escape(media.sources[0].src);
  const poster = media.poster ? ` poster="${escape(media.poster)}"` : "";
  const inline = media.kind === "video" ? " playsinline" : "";
  const sources = media.sources.map((source) => `<source src="${escape(source.src)}"${source.type ? ` type="${escape(source.type)}"` : ""}>`).join("");
  return `<span class="article-media article-media-${media.kind}"><${media.kind} controls preload="metadata"${inline}${poster} aria-label="${label}">${sources}<a href="${href}">${downloadLabel}</a></${media.kind}><span class="article-media-caption"><span>${label}</span><a href="${href}" download>${downloadLabel}</a></span></span>`;
}

export function installMediaRules(md) {
  md.block.ruler.before("html_block", "article_media", (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src[start] !== "<") return false;
    const result = readMediaElement(state.src.slice(start, state.bMarks[endLine]), md);
    if (!result) return false;
    const end = start + result.end;
    let nextLine = startLine;
    while (nextLine < endLine && state.eMarks[nextLine] < end) nextLine++;
    if (nextLine >= endLine || state.src.slice(end, state.eMarks[nextLine]).trim()) return false;
    if (silent) return true;
    const token = state.push("media_embed", "", 0);
    token.meta = result.media;
    token.map = [startLine, nextLine + 1];
    token.block = true;
    state.line = nextLine + 1;
    return true;
  }, { alt: ["paragraph", "reference", "blockquote"] });

  md.inline.ruler.before("html_inline", "article_media", (state, silent) => {
    if (state.src[state.pos] !== "<") return false;
    const result = readMediaElement(state.src.slice(state.pos, state.posMax), md);
    if (!result) return false;
    if (!silent) state.push("media_embed", "", 0).meta = result.media;
    state.pos += result.end;
    return true;
  });

  md.core.ruler.after("linkify", "article_media_links", (state) => {
    for (const block of state.tokens) {
      const tokens = block.children;
      if (!tokens) continue;
      let linkDepth = 0;
      for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.type === "link_close") { linkDepth--; continue; }
        if (token.type === "image" && linkDepth === 0) {
          const src = token.attrGet("src");
          const kind = mediaKind(src);
          if (kind) { token.type = "media_embed"; token.meta = { kind, sources: [{ src }], label: token.content }; }
        } else if (token.type === "link_open") {
          const src = token.attrGet("href");
          const kind = mediaKind(src);
          if (!kind) { linkDepth++; continue; }
          let end = index + 1;
          while (end < tokens.length && tokens[end].type !== "link_close") end++;
          if (end === tokens.length) continue;
          const media = new state.Token("media_embed", "", 0);
          media.meta = { kind, sources: [{ src }], label: tokens.slice(index + 1, end).map((item) => item.content).join("") };
          tokens.splice(index, end - index + 1, media);
        }
      }
    }
  });

  md.renderer.rules.media_embed = (tokens, index) => renderMedia(tokens[index].meta, md) + (tokens[index].block ? "\n" : "");
  return md;
}

const referenceMarkdown = installMediaRules(new MarkdownIt({ html: false, linkify: true }));

// Use the same parsing rules for access control and display, including posters
// and alternate sources. Code examples never grant access to an attachment.
export function referencedMediaUrls(content) {
  const urls = new Set();
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === "media_embed") {
        for (const source of token.meta.sources) urls.add(source.src);
        if (token.meta.poster) urls.add(token.meta.poster);
      } else if (token.type === "image") urls.add(token.attrGet("src"));
      else if (token.type === "link_open") urls.add(token.attrGet("href"));
      if (token.children && token.type !== "media_embed") visit(token.children);
    }
  };
  visit(referenceMarkdown.parse(String(content || ""), {}));
  return [...urls].filter((url) => typeof url === "string" && url.startsWith("/media/"));
}
