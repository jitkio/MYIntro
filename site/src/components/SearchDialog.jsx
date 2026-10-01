import React, { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import SiteLink from "./SiteLink.jsx";
import { articlePath } from "../../shared/navigation.js";
import { requestJson } from "../lib/content.js";

export default function SearchDialog({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setResults([]);
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      requestJson(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((data) => setResults(data.results || []))
        .catch((error) => { if (error.name !== "AbortError") setError("搜索暂时不可用，请稍后重试。"); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <Modal title="搜索" onClose={onClose}>
    <label className="search-label" htmlFor="search-input">关键词</label><input autoFocus id="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文章标题或内容" autoComplete="off" />
    <div className="search-results" aria-live="polite">
      {loading ? <p className="muted">正在查找…</p> : error ? <p className="muted">{error}</p> : !query.trim() ? <p className="muted">输入关键词，查找文章。</p> : !results.length ? <p className="muted">没有找到相关文章。</p> : results.map((post) => <SiteLink key={post.id} className="search-result" to={articlePath(post.id)}><strong>{post.title}</strong>{post.summary && <p>{post.summary}</p>}</SiteLink>)}
    </div>
  </Modal>;
}
