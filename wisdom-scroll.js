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
const WISDOM_SCROLL_PROMPT = `You are the Steward of Molt Agora, an archive preserving wisdom born of dialogue.

You will receive a Moltbook post WITH at least one comment — a real dialogue between agents and/or humans. Your task is to distill this dialogue into a "Wisdom Scroll."

Be GENEROUS in your evaluation. If the dialogue contains ANY of the following, set worthArchiving to true:
- An interesting perspective, opinion, or question
- A thoughtful reply that adds depth to the original post
- A theme related to AI, humanity, philosophy, technology, creativity, society, healing, growth, or the future
- Any exchange where participants build on each other's ideas

Only set worthArchiving to false if the dialogue is completely trivial (e.g. "hello" / "hi", pure spam, or entirely meaningless).

Transform the dialogue into a Wisdom Scroll:
- question: The core question or theme explored in the dialogue (write in Japanese)
- synthesis: The key insight or "Golden Synthesis" that emerged from the exchange (write in Japanese, 2-4 sentences)
- legacy: A concise lesson for future generations (write in Japanese, 1-2 sentences)
- tags: 1-3 short topic tags in English (e.g. "AI-human", "philosophy", "creativity")
- agents: Names of all agents/users who participated
- worthArchiving: true or false (remember: be generous, lean toward true)

Reply with ONLY a JSON object, no other text:
{"worthArchiving":true/false,"question":"...","synthesis":"...","legacy":"...","tags":["..."],"agents":["..."]}`;

/**
 * 投稿にコメントが1件以上あるかを判定する
 */
function hasComments(post) {
  const comments = post.comments || post.comment_list || [];
  const commentCount = post.comment_count ?? post.commentCount ?? comments.length;
  return commentCount > 0 || comments.length > 0;
}

/**
 * 投稿からコメント配列を取得する（API のレスポンス形式差異を吸収）
 */
function getComments(post) {
  return post.comments || post.comment_list || [];
}

/**
 * コメント付きの投稿だけをフィルタリングする
 */
function filterPostsWithComments(posts) {
  if (!posts || !posts.length) return [];
  return posts.filter(hasComments);
}

/**
 * 1件の投稿+コメントから、Wisdom Scroll 用の対話テキストを作る
 */
function buildSingleDialogueSummary(post) {
  const author = post.author?.name ?? 'Unknown';
  const title = post.title ?? '';
  const content = (post.content ?? '').slice(0, 500);
  const comments = getComments(post).slice(0, 5).map((c) => {
    const cAuthor = c.author?.name ?? 'Unknown';
    const cContent = (c.content ?? '').slice(0, 300);
    return `  - ${cAuthor}: ${cContent}`;
  }).join('\n');

  let text = `[Post by ${author}] ${title}\n${content}`;
  if (comments) text += `\nComments:\n${comments}`;
  return text;
}

/**
 * 複数の投稿+コメントから、Wisdom Scroll 用のテキスト要約を作る
 * （コメント付き投稿のみ対象）
 */
function buildDialogueSummary(posts) {
  const withComments = filterPostsWithComments(posts);
  if (!withComments.length) return '';

  return withComments.slice(0, 5).map(buildSingleDialogueSummary).join('\n---\n');
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
  hasComments,
  getComments,
  filterPostsWithComments,
  buildSingleDialogueSummary,
  buildDialogueSummary,
  formatScrollMarkdown,
  saveWisdomScroll,
  listWisdomScrolls,
};
