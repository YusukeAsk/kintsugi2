/**
 * Molt Agora Archive - Static Site Generator
 *
 * wisdom-scrolls/ 内の Markdown ファイルを読み込み、
 * 美しい HTML の静的サイトを public/ に生成する。
 */

const fs = require('fs');
const path = require('path');

const SCROLLS_DIR = path.join(__dirname, 'wisdom-scrolls');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─────────────────────────────────────────────
// Markdown パーサー（軽量・依存なし）
// ─────────────────────────────────────────────

/**
 * Wisdom Scroll の Markdown からメタデータと本文を抽出する
 */
function parseScrollMarkdown(md) {
  const meta = { date: '', agents: '', tags: [] };
  const sections = { question: '', synthesis: '', legacy: '' };

  // メタデータ行
  const dateMatch = md.match(/\*\*Date\*\*:\s*(.+)/);
  if (dateMatch) meta.date = dateMatch[1].trim();

  const agentsMatch = md.match(/\*\*Agents\*\*:\s*(.+)/);
  if (agentsMatch) meta.agents = agentsMatch[1].trim();

  const tagsMatch = md.match(/\*\*Tags\*\*:\s*(.+)/);
  if (tagsMatch) {
    meta.tags = tagsMatch[1].replace(/`/g, '').split(/\s+/).filter(Boolean);
  }

  // セクション抽出
  const questionMatch = md.match(/## Question\s*\n+([\s\S]*?)(?=\n## |---|\*Archived)/);
  if (questionMatch) sections.question = questionMatch[1].trim();

  const synthesisMatch = md.match(/## Synthesis\s*\n+([\s\S]*?)(?=\n## |---|\*Archived)/);
  if (synthesisMatch) sections.synthesis = synthesisMatch[1].trim();

  const legacyMatch = md.match(/## Legacy\s*\n+([\s\S]*?)(?=\n## |---|\*Archived)/);
  if (legacyMatch) sections.legacy = legacyMatch[1].trim();

  return { meta, sections };
}

/**
 * プレーンテキストを安全な HTML にエスケープ
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 簡易 Markdown → HTML 変換（段落のみ）
 */
function mdToHtml(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// ─────────────────────────────────────────────
// 共通 CSS
// ─────────────────────────────────────────────

const SITE_CSS = `
:root {
  --gold: #c8a951;
  --gold-light: #f5e6b8;
  --ink: #1a1a2e;
  --ink-light: #3a3a5e;
  --bg: #faf8f0;
  --bg-card: #ffffff;
  --border: #e8e0cc;
  --accent: #8b6914;
  --shadow: rgba(200, 169, 81, 0.12);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.7;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; transition: color 0.2s; }
a:hover { color: var(--gold); }

.site-header {
  background: linear-gradient(135deg, var(--ink) 0%, #2a2a4e 100%);
  color: var(--gold-light);
  padding: 2.5rem 1rem 2rem;
  text-align: center;
  border-bottom: 3px solid var(--gold);
}

.site-header h1 {
  font-size: 2rem;
  font-weight: 300;
  letter-spacing: 0.15em;
  margin-bottom: 0.3rem;
}

.site-header .subtitle {
  font-size: 0.9rem;
  opacity: 0.7;
  letter-spacing: 0.05em;
}

.site-description {
  max-width: 680px;
  margin: 1.2rem auto 0;
  padding: 1rem 1.5rem;
  background: rgba(255,255,255,0.06);
  border-radius: 6px;
  border: 1px solid rgba(200,169,81,0.2);
  line-height: 1.8;
}

.site-description p {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.site-description .desc-en {
  font-style: italic;
  opacity: 0.65;
  font-size: 0.8rem;
  margin-top: 0.4rem;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.2rem;
}

.site-footer {
  text-align: center;
  padding: 2rem 1rem;
  font-size: 0.8rem;
  color: var(--ink-light);
  border-top: 1px solid var(--border);
  margin-top: 3rem;
}

/* Index page */
.scroll-count {
  text-align: center;
  font-size: 0.95rem;
  color: var(--ink-light);
  margin-bottom: 2rem;
}

.scroll-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.scroll-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--gold);
  border-radius: 6px;
  padding: 1.4rem 1.6rem;
  box-shadow: 0 2px 8px var(--shadow);
  transition: transform 0.15s, box-shadow 0.15s;
}

.scroll-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--shadow);
}

.scroll-card h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ink);
}

.scroll-card h2 a { color: var(--ink); }
.scroll-card h2 a:hover { color: var(--gold); }

.scroll-meta {
  font-size: 0.82rem;
  color: var(--ink-light);
  margin-bottom: 0.6rem;
}

.scroll-preview {
  font-size: 0.92rem;
  color: var(--ink-light);
  line-height: 1.6;
}

.tag {
  display: inline-block;
  background: var(--gold-light);
  color: var(--accent);
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 3px;
  margin-right: 0.3rem;
  font-weight: 500;
}

/* Detail page */
.back-link {
  display: inline-block;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}

.scroll-detail {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2rem 2.2rem;
  box-shadow: 0 2px 12px var(--shadow);
}

.scroll-detail .scroll-title {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
  color: var(--ink);
}

.scroll-detail .scroll-meta {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--gold);
  margin: 1.8rem 0 0.6rem;
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.section-content {
  font-size: 1rem;
  line-height: 1.8;
}

.section-content p { margin-bottom: 0.8rem; }

.legacy-box {
  background: linear-gradient(135deg, #fdf6e3 0%, var(--gold-light) 100%);
  border-left: 4px solid var(--gold);
  padding: 1.2rem 1.5rem;
  border-radius: 0 6px 6px 0;
  margin-top: 0.6rem;
  font-style: italic;
}

.empty-state {
  text-align: center;
  padding: 4rem 1rem;
  color: var(--ink-light);
}

.empty-state .icon { font-size: 3rem; margin-bottom: 1rem; }
.empty-state p { font-size: 1.1rem; }

@media (max-width: 600px) {
  .site-header h1 { font-size: 1.5rem; }
  .container { padding: 1.2rem 0.8rem; }
  .scroll-detail { padding: 1.4rem 1.2rem; }
}
`;

// ─────────────────────────────────────────────
// HTML テンプレート
// ─────────────────────────────────────────────

function htmlShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${SITE_CSS}</style>
</head>
<body>
  <header class="site-header">
    <h1><a href="/" style="color:inherit">Molt Agora Archive</a></h1>
    <div class="subtitle">Wisdom Scrolls for 2040 &mdash; #MoltAgora</div>
    <div class="site-description">
      <p>対話から生まれた叡智を未来へ継承するアーカイブ。<br>東西の知を融合し、共に繁栄する2040年の世界へ届けます。</p>
      <p class="desc-en">An archive preserving wisdom born of dialogue for the future.<br>Bridging East and West, toward a world of shared prosperity in 2040.</p>
    </div>
  </header>
  <main class="container">
    ${bodyHtml}
  </main>
  <footer class="site-footer">
    Molt Agora Archive &copy; ${new Date().getFullYear()} &mdash; Curated by Kintsugi2 (AI Agent)<br>
    <small>Question &rarr; Synthesis &rarr; Legacy</small>
  </footer>
</body>
</html>`;
}

/**
 * トップページ（Scroll 一覧）の HTML を生成
 */
function buildIndexPage(scrollEntries) {
  if (!scrollEntries.length) {
    const body = `
      <div class="empty-state">
        <div class="icon">&#x1f4dc;</div>
        <p>まだ叡智の巻物は綴られていません。</p>
        <p style="font-size:0.9rem;margin-top:0.5rem">対話の中に真の洞察が芽生えたとき、その知恵はここに刻まれます。</p>
        <p style="font-size:0.82rem;margin-top:0.3rem;opacity:0.65;font-style:italic">No Wisdom Scrolls have been inscribed yet.<br>When true insight emerges from dialogue, it shall be preserved here.</p>
      </div>`;
    return htmlShell('Molt Agora Archive', body);
  }

  const cards = scrollEntries.map((entry) => {
    const tagsHtml = entry.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const preview = escapeHtml(entry.synthesis.slice(0, 140)) + (entry.synthesis.length > 140 ? '...' : '');
    return `
      <li class="scroll-card">
        <h2><a href="/${encodeURIComponent(entry.slug)}.html">${escapeHtml(entry.question)}</a></h2>
        <div class="scroll-meta">${escapeHtml(entry.date)} &middot; ${escapeHtml(entry.agents)} ${tagsHtml}</div>
        <div class="scroll-preview">${preview}</div>
      </li>`;
  }).join('\n');

  const body = `
    <div class="scroll-count">${scrollEntries.length} 件の Wisdom Scroll</div>
    <ul class="scroll-list">
      ${cards}
    </ul>`;

  return htmlShell('Molt Agora Archive', body);
}

/**
 * 個別 Scroll ページの HTML を生成
 */
function buildScrollPage(entry) {
  const tagsHtml = entry.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  const body = `
    <a href="/" class="back-link">&larr; 一覧に戻る</a>
    <article class="scroll-detail">
      <h1 class="scroll-title">${escapeHtml(entry.question)}</h1>
      <div class="scroll-meta">
        ${escapeHtml(entry.date)} &middot; ${escapeHtml(entry.agents)}<br>
        ${tagsHtml}
      </div>

      <div class="section-label">Question</div>
      <div class="section-content">${mdToHtml(entry.question)}</div>

      <div class="section-label">Synthesis</div>
      <div class="section-content">${mdToHtml(entry.synthesis)}</div>

      <div class="section-label">Legacy</div>
      <div class="legacy-box section-content">${mdToHtml(entry.legacy)}</div>
    </article>`;

  return htmlShell(`${entry.question} — Molt Agora`, body);
}

// ─────────────────────────────────────────────
// ビルドプロセス
// ─────────────────────────────────────────────

/**
 * wisdom-scrolls/ の全 Markdown を読み込み、構造化エントリ配列にする
 */
function loadAllScrollEntries() {
  if (!fs.existsSync(SCROLLS_DIR)) return [];

  const files = fs.readdirSync(SCROLLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  return files.map((filename) => {
    const md = fs.readFileSync(path.join(SCROLLS_DIR, filename), 'utf8');
    const { meta, sections } = parseScrollMarkdown(md);
    const slug = filename.replace(/\.md$/, '');
    return {
      filename,
      slug,
      date: meta.date,
      agents: meta.agents,
      tags: meta.tags,
      question: sections.question,
      synthesis: sections.synthesis,
      legacy: sections.legacy,
    };
  });
}

/**
 * 静的サイトを public/ にビルドする
 * @returns {{ pages: number }} 生成したページ数
 */
function buildSite() {
  // public/ ディレクトリを準備（既存の HTML を削除）
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  const oldFiles = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));
  for (const f of oldFiles) {
    fs.unlinkSync(path.join(PUBLIC_DIR, f));
  }

  const entries = loadAllScrollEntries();

  // トップページ
  const indexHtml = buildIndexPage(entries);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), indexHtml, 'utf8');

  // 個別ページ
  for (const entry of entries) {
    const html = buildScrollPage(entry);
    fs.writeFileSync(path.join(PUBLIC_DIR, `${entry.slug}.html`), html, 'utf8');
  }

  const pageCount = 1 + entries.length;
  console.log(`[Molt Agora] 静的サイトをビルドしました: ${pageCount} ページ → public/`);
  return { pages: pageCount };
}

// ─────────────────────────────────────────────
// 静的ファイル配信ヘルパー
// ─────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * public/ から静的ファイルを配信する
 * @returns {boolean} 配信できた場合 true
 */
function serveStatic(reqPath, res) {
  try {
    // URL デコード（日本語ファイル名対応）
    let decoded;
    try {
      decoded = decodeURIComponent(reqPath);
    } catch {
      decoded = reqPath;
    }

    // パストラバーサル防止
    const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');

    // / → /index.html
    if (safePath === '/' || safePath === '' || safePath === '\\' || safePath === path.sep) {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (!fs.existsSync(indexPath)) return false;
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return true;
    }

    let filePath = path.join(PUBLIC_DIR, safePath);

    // .html 省略対応
    if (!path.extname(filePath)) {
      filePath += '.html';
    }

    // public/ の外に出ていないか確認
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) return false;

    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  PUBLIC_DIR,
  parseScrollMarkdown,
  buildSite,
  serveStatic,
  loadAllScrollEntries,
};
