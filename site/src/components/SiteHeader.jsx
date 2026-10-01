import React, { useEffect, useState } from "react";
import { Archive, Folder, Menu, Moon, Search, Sun, Wrench } from "lucide-react";
import SiteLink from "./SiteLink.jsx";

export default function SiteHeader({ title, subtitle, page, theme, onTheme, onSearch }) {
  const [scrolled, setScrolled] = useState(window.scrollY > 30);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const listener = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", listener, { passive: true });
    return () => window.removeEventListener("scroll", listener);
  }, []);
  useEffect(() => setExpanded(false), [page, title]);
  return <header>
    <nav id="navbar" className={`navbar fixed-top navbar-expand-lg scrolling-navbar ${scrolled || expanded ? "top-nav-collapse" : ""}`} aria-label="主导航">
      <div className="container">
        <SiteLink className="navbar-brand" to="/"><strong>myBlog</strong></SiteLink>
        <button type="button" className="nav-icon mobile-menu" aria-label="展开导航" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Menu size={19} /></button>
        <div className={`nav-links ${expanded ? "is-open" : ""}`}>
          {[["directory", "目录", Folder], ["articles", "文章", Archive], ["tools", "工具", Wrench]].map(([value, label, Icon]) => <SiteLink key={value} className="nav-link" to={`/${value}`} aria-current={page === value ? "page" : undefined}><Icon size={14} /><span>{label}</span></SiteLink>)}
          <button type="button" className="nav-icon" aria-label="搜索文章" onClick={onSearch}><Search size={15} /></button>
          <button type="button" className="nav-icon" aria-label={`切换${theme === "dark" ? "浅" : "深"}色模式`} onClick={onTheme}>{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}</button>
        </div>
      </div>
    </nav>
    <div className="header-inner"><div id="banner" className="banner"><div className="full-bg-img"><div className="mask flex-center"><div className="banner-text text-center"><h1 id="subtitle">{title}</h1>{subtitle && <div className="hero-description">{subtitle}</div>}</div></div></div></div></div>
  </header>;
}
