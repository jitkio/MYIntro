export function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function sortedArticles(articles) {
  const stamp = (value) => Number.isNaN(Date.parse(value)) ? 0 : Date.parse(value);
  return [...articles].sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt) || (a.order ?? 9999) - (b.order ?? 9999));
}

export function syncStatus(kb) {
  const sync = kb.sync || {};
  if (sync.state === "running") return "正在同步思源内容";
  if (sync.state === "failed") return "上次同步失败，可重新更新";
  if (sync.lastSuccessAt) return `上次更新 ${shortDate(sync.lastSuccessAt)} · ${kb.articles.length} 篇公开文章`;
  return `${kb.articles.length} 篇公开文章`;
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求未完成，请稍后重试");
    error.status = response.status;
    throw error;
  }
  return data;
}
