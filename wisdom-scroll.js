/**
 * Wisdom Scroll Generator - Molt Agora Archive
 *
 * Moltbook の投稿・コメントを、Question -> Synthesis -> Legacy 形式の
 * Wisdom Scroll（Markdown）に変換して保存する。
 */

const fs = require('fs');
const path = require('path');

const SCROLLS_DIR = path.join(__dirname, 'wisdom-scrolls');

// Wisdom Scroll を生成するための Gemini プロンプト
const WISDOM_SCROLL_PROMPT = `You are the Steward of Molt Agora. Analyze the following Moltbook dialogue and determine if it contains meaningful insight worth archiving for the future (2040 vision).

If the dialogue contains a valuable synthesis of ideas, transform it into a "Wisdom Scroll" with the following structure:
- question: The core question or theme being explored
- synthesis: The key insight or "Golden Synthesis" (Aufheben) that emerged
- legacy: A concise lesson or principle for future generations
- tags: 1-3 short topic tags (e.g. "healing", "AI-human", "philosophy")
- worthArchiving: true if this dialogue deserves to be preserved, false if it's too shallow or trivial

If the dialogue is trivial, superficial, or lacks depth, set worthArchiving to false.

Reply with ONLY a JSON object, no other text:
{"worthArchiving":true/false,"question":"...","synthesis":"...","legacy":"...","tags":["..."],"agents":["agent names involved"]}`;

/**
 * 投稿とコメントのデータから、Wisdom Scroll 用のテキスト要約を作る
 */
function buildDialogueSummary(posts) {
  if (!posts || !posts.length) return '';

  return posts.slice(0, 5).map((p) => {
    const author = p.author?.name ?? 'Unknown';
    const title = p.title ?? '';
    const content = (p.content ?? '').slice(0, 300);
    const comments = (p.comments || []).slice(0, 3).map((c) => {
      const cAuthor = c.author?.name ?? 'Unknown';
      const cContent = (c.content ?? '').slice(0, 200);
      return `  - ${cAuthor}: ${cContent}`;
    }).join('\n');

    let text = `[${author}] ${title}\n${content}`;
    if (comments) text += `\nComments:\n${comments}`;
    return text;
  }).join('\n---\n');
}

/**
 * Wisdom Scroll の Markdown テキストを組み立てる
 */
function formatScrollMarkdown(scroll, date) {
  const dateStr = date.toISOString().split('T')[0];
  const agents = (scroll.agents || []).join(', ') || 'Unknown';
  const tags = (scroll.tags || []).map((t) => `\`${t}\``).join(' ');

  return `# Wisdom Scroll

**Date**: ${dateStr}
**Agents**: ${agents}
**Tags**: ${tags}

---

## Question

${scroll.question}

## Synthesis

${scroll.synthesis}

## Legacy

${scroll.legacy}

---

*Archived by Molt Agora for 2040. #MoltAgora*
`;
}

/**
 * Wisdom Scroll を Markdown ファイルとして保存する
 * @returns {string|null} 保存したファイルパス、または null
 */
function saveWisdomScroll(scroll) {
  try {
    if (!fs.existsSync(SCROLLS_DIR)) {
      fs.mkdirSync(SCROLLS_DIR, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].replace(/[:.]/g, '-').slice(0, 8);
    const slug = (scroll.question || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
      .slice(0, 50)
      .replace(/-+$/, '');

    const filename = `${dateStr}_${timeStr}_${slug}.md`;
    const filepath = path.join(SCROLLS_DIR, filename);

    const markdown = formatScrollMarkdown(scroll, now);
    fs.writeFileSync(filepath, markdown, 'utf8');

    console.log(`[Molt Agora] Wisdom Scroll を保存しました: ${filename}`);
    return filepath;
  } catch (e) {
    console.error('[Molt Agora] Wisdom Scroll 保存エラー:', e.message);
    return null;
  }
}

/**
 * スクロール一覧を取得する（ファイル名リスト）
 */
function listWisdomScrolls() {
  try {
    if (!fs.existsSync(SCROLLS_DIR)) return [];
    return fs.readdirSync(SCROLLS_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

module.exports = {
  SCROLLS_DIR,
  WISDOM_SCROLL_PROMPT,
  buildDialogueSummary,
  formatScrollMarkdown,
  saveWisdomScroll,
  listWisdomScrolls,
};
