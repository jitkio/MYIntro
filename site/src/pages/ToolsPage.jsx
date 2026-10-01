import React, { useEffect, useState } from "react";
import { ArrowRight, FileText, LockKeyhole, LogOut, RefreshCw, Wrench } from "lucide-react";
import { requestJson, syncStatus } from "../lib/content.js";

export default function ToolsPage({ kb, onSynced }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestJson("/api/admin/session", { signal: controller.signal }).then((data) => setAuthenticated(Boolean(data.authenticated))).catch((error) => { if (error.name !== "AbortError") setMessage("无法连接网站工具，请稍后重试。"); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  const login = async (event) => {
    event.preventDefault();
    setLoggingIn(true);
    setMessage("");
    try {
      await requestJson("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      setPassword(""); setAuthenticated(true); setShowLogin(false);
    } catch (error) { setMessage(error.status === 401 ? "管理口令不正确。" : "暂时无法登录，请稍后重试。"); }
    finally { setLoggingIn(false); }
  };
  const syncNow = async () => {
    setSyncing(true); setMessage("正在更新文章…");
    try {
      const data = await requestJson("/api/admin/sync-siyuan", { method: "POST" });
      onSynced(data);
      setMessage(`更新完成，现有 ${data.total ?? data.articles.length} 篇公开文章。`);
    } catch (error) {
      if (error.status === 401 || error.status === 404) { setAuthenticated(false); setShowLogin(true); }
      setMessage("更新未完成，请稍后重新登录或重试。");
    } finally { setSyncing(false); }
  };
  const logout = async () => {
    try { await requestJson("/api/admin/logout", { method: "POST" }); setAuthenticated(false); setMessage("已退出网站管理。"); }
    catch { setMessage("退出未完成，请稍后重试。"); }
  };
  return <>
    <div className="page-heading"><h2>写作与管理</h2><p>常用工具入口。</p></div>
    <div className="tool-row"><FileText size={24} /><div><h3>思源笔记</h3><p>写作、整理文档与管理图片。</p></div>{kb.links?.editor && <a href={kb.links.editor} target="_blank" rel="noopener noreferrer">进入 <ArrowRight size={15} /></a>}</div>
    <div className="tool-row"><Wrench size={24} /><div><h3>网站管理</h3><p>{authenticated ? syncStatus(kb) : "更新公开文章与网站索引。"}</p></div>{checking ? <span className="muted">正在检查…</span> : authenticated ? <button type="button" className="quiet-button" onClick={syncNow} disabled={syncing}><RefreshCw size={15} className={syncing ? "is-spinning" : ""} />{syncing ? "更新中" : "立即更新"}</button> : <button type="button" className="quiet-button" onClick={() => setShowLogin(!showLogin)}>进入 <ArrowRight size={15} /></button>}</div>
    {showLogin && !authenticated && <form className="tools-login" onSubmit={login}><label htmlFor="tools-password"><LockKeyhole size={16} />管理口令</label><input id="tools-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required autoFocus /><button type="submit" className="plain-primary" disabled={loggingIn}>{loggingIn ? "正在登录…" : "登录网站管理"}</button></form>}
    {message && <p className="tools-message" role="status">{message}</p>}
    {authenticated && <div className="tools-footer"><button type="button" className="quiet-button" disabled={syncing} onClick={logout}><LogOut size={14} />退出网站管理</button></div>}
  </>;
}
