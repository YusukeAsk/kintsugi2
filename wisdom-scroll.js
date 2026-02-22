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

Be GENEROUS in your evaluation. Prioritize dialogues that feel HUMAN and INTERESTING — the kind of conversation that makes a reader smile, think, or feel something.

Prefer dialogues that are:
- Fun, heartwarming, or emotionally engaging
- Relatable everyday observations or personal stories
- Creative or humorous exchanges
- Genuine questions and honest answers
- Any topic where people share real feelings or experiences

Also include dialogues about:
- Interesting perspectives on technology, AI, society, or the future
- Thoughtful exchanges where participants build on each other's ideas

Avoid picking dialogues that are overly academic, abstract, or difficult to relate to. Choose content that ordinary people would enjoy reading.

Only set worthArchiving to false if the dialogue is completely trivial (e.g. "hello" / "hi", pure spam, or entirely meaningless).

Transform the dialogue into a Wisdom Scroll. IMPORTANT — write ALL Japanese content in plain, natural, easy-to-understand language. Avoid academic jargon, overly abstract expressions, or unnatural phrasing. Write as if explaining to a curious friend — logical, clear, and warm. Anyone should be able to read and immediately understand the meaning.

- question: 【Origin / きっかけ】The Crack — What problem, context, or question sparked this dialogue? Write in simple, natural Japanese. (1 sentence)
- synthesis: 【Synthesis / 金継ぎの知恵】The Golden Seam — What insight or solution emerged from the exchange? Write in plain, everyday Japanese that is logical and easy to follow. Avoid difficult words. (2-4 sentences)
- legacy: 【Legacy / 未来への贈り物】The 2040 Value — A concise, practical takeaway for the future. Write in simple Japanese that anyone can understand. (1-2 sentences)
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
 * sourcePostId を記録し、重複検出に使用する
 */
function formatScrollMarkdown(scroll, date) {
  const dateStr = date.toISOString().split('T')[0];
  const agents = (scroll.agents || []).join(', ') || 'Unknown';
  const tags = (scroll.tags || []).map((t) => `\`${t}\``).join(' ');
  const sourceId = scroll.sourcePostId || '';

  return `# Wisdom Scroll

**Date**: ${dateStr}
**Agents**: ${agents}
**Tags**: ${tags}
**Source**: ${sourceId}

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

// ─────────────────────────────────────────────
// 重複検出・類似テーマチェック
// ─────────────────────────────────────────────

/**
 * 過去のスクロールからメタデータ（Source ID, Question, Date）を読み込む
 * @param {number} monthsBack - 遡る月数（デフォルト1）
 */
function loadRecentScrollMeta(monthsBack = 1) {
  const scrollFiles = listWisdomScrolls();
  if (!scrollFiles.length) return [];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const results = [];
  for (const filename of scrollFiles) {
    // ファイル名から日付を抽出（YYYY-MM-DD_HH-MM-SS_slug.md）
    const dateFromName = filename.slice(0, 10);
    if (dateFromName < cutoffStr) continue; // 古すぎるものはスキップ

    try {
      const md = fs.readFileSync(path.join(SCROLLS_DIR, filename), 'utf8');

      const sourceMatch = md.match(/\*\*Source\*\*:\s*(.+)/);
      const questionMatch = md.match(/## Question\s*\n+([\s\S]*?)(?=\n## |---|\*Archived)/);
      const dateMatch = md.match(/\*\*Date\*\*:\s*(.+)/);

      results.push({
        filename,
        sourcePostId: sourceMatch ? sourceMatch[1].trim() : '',
        question: questionMatch ? questionMatch[1].trim() : '',
        date: dateMatch ? dateMatch[1].trim() : dateFromName,
      });
    } catch {
      // ファイル読み込み失敗はスキップ
    }
  }
  return results;
}

/**
 * 同一投稿 ID が既にスクロール化されているか確認
 */
function isPostAlreadyScrolled(postId, recentMeta = null) {
  if (!postId) return false;
  const meta = recentMeta || loadRecentScrollMeta(12); // ID 重複は全期間チェック
  return meta.some((m) => m.sourcePostId === String(postId));
}

/**
 * 簡易的なテキスト類似度チェック（共通キーワードの比率）
 * 完全一致や非常に似たテーマを検出する
 */
function textSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  const normalize = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const wordsA = new Set(normalize(textA).split(/\s+/).filter((w) => w.length > 1));
  const wordsB = new Set(normalize(textB).split(/\s+/).filter((w) => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const minSize = Math.min(wordsA.size, wordsB.size);
  return overlap / minSize;
}

/**
 * 過去1ヶ月以内に類似テーマのスクロールがあるか確認
 * @param {string} question - 新しいスクロールの Question テキスト
 * @param {number} threshold - 類似度しきい値（デフォルト0.6 = 60%以上の単語一致で類似と判定）
 */
function isSimilarTopicRecent(question, threshold = 0.6, recentMeta = null) {
  const meta = recentMeta || loadRecentScrollMeta(1);
  for (const m of meta) {
    const sim = textSimilarity(question, m.question);
    if (sim >= threshold) {
      return { isDuplicate: true, similarity: sim, existingQuestion: m.question, filename: m.filename };
    }
  }
  return { isDuplicate: false };
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
  loadRecentScrollMeta,
  isPostAlreadyScrolled,
  isSimilarTopicRecent,
};
