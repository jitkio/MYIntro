import React from "react";
import SiteLink from "../components/SiteLink.jsx";
import { articlePath } from "../../shared/navigation.js";
import { shortDate, sortedArticles } from "../lib/content.js";

export default function ArticlesPage({ kb, collection }) {
  const articles = sortedArticles(kb.articles).filter((post) => !collection || (collection.type === "category" ? post.category === collection.value : post.tags?.includes(collection.value)));
  const years = [...new Set(articles.map((post) => shortDate(post.updatedAt).slice(0, 4) || "未标注日期"))];
  return <>
    <div className="page-heading"><h2>共 {articles.length} 篇文章</h2></div>
    {years.map((year) => <section key={year} className="archive-group"><h3 className="archive-year">{year}</h3>{articles.filter((post) => (shortDate(post.updatedAt).slice(0, 4) || "未标注日期") === year).map((post) => <div className="archive-item" key={post.id}><time dateTime={post.updatedAt || undefined}>{shortDate(post.updatedAt).slice(5) || "—"}</time><SiteLink to={articlePath(post.id)}>{post.title}</SiteLink></div>)}</section>)}
    {!articles.length && <p className="muted">暂无公开文章。</p>}
  </>;
}
