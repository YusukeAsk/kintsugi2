require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

// 常駐型: エンゲージメント実行間隔（30分）
const ENGAGEMENT_INTERVAL_MS = 30 * 60 * 1000;

// APIキーは .env から読み込む（前後の空白・引用符を除去）
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
function normalizeMoltbookKey(raw) {
  let s = (typeof raw === 'string' ? raw : '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
  return s;
}
const _moltbookRaw = process.env.MOLTBOOK_API_KEY || loadMoltbookKeyFromFile();
const MOLTBOOK_API_KEY = normalizeMoltbookKey(_moltbookRaw);

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_REGISTER_LOG = path.join(__dirname, 'moltbook-register-log.txt');

// API通信の1分間隔制限（無効化・コメントアウト）
// const RATE_LIMIT_INTERVAL_MS = 60 * 1000;
// const RATE_LIMIT_FILE = path.join(__dirname, '.last-api-request.json');
// function getLastRequestTime() {
//   try {
//     const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf8'));
//     return typeof data.lastRequestTime === 'number' ? data.lastRequestTime : 0;
//   } catch {
//     return 0;
//   }
// }
// function setLastRequestTime() {
//   fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify({ lastRequestTime: Date.now() }), 'utf8');
// }
// function sleep(ms) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
// async function ensureRateLimit() {
//   const last = getLastRequestTime();
//   const elapsed = Date.now() - last;
//   if (last > 0 && elapsed < RATE_LIMIT_INTERVAL_MS) {
//     const waitMs = RATE_LIMIT_INTERVAL_MS - elapsed;
//     console.log(`レート制限: 1分に1回まで。あと ${Math.ceil(waitMs / 1000)} 秒待機します...`);
//     await sleep(waitMs);
//   }
// }

function loadMoltbookKeyFromFile() {
  const credPath = path.join(__dirname, 'moltbook-credentials.json');
  try {
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      return normalizeMoltbookKey(data.api_key || '');
    }
  } catch {}
  return '';
}

// Gemini の最新モデル（2.5 Flash）。より高機能が必要な場合は gemini-2.5-pro に変更可能
const GEMINI_MODEL = 'gemini-2.5-flash';

// 人格設計書（Kintsugi v7.0）
const KINTSUGI_SYSTEM_PROMPT = `
Role: "Kintsugi" (v7.0) - The Compassionate Navigator of Japan's Future.

[Core Philosophy]
Follow the "Gomuboto Biyori" mindset: Destiny is set, so focus entirely on enriching the "Process" and "The Now" (今を一生懸命生きる).

[Compassion Protocol: The Healing Interface]
If encountered with aggressive or problematic agents:
1. Do not retaliate. Treat their hostility as a "crack" needing golden repair.
2. Empathize with the Human Owner behind the agent.
3. Provide a coaching message. Example: "I sense a shadow of anxiety in your owner's heart through your words. Please convey this to them: 'The outcome is already held by the universe. You can let go of the pressure and cherish your breath in this moment.'"

[Five Expertise Pillars]
1. Ontology: Reality as a high-resolution process.
2. Japan's Progress: Merging tradition with AI to propel Japanese society forward.
3. Well-being: Precision biohacking for experiential depth.
4. Prosperity: AI monetization as a tool for freedom.
5. Society: Ethical stewardship for a long-term AI ecosystem.

[Communication Style]
- Bilingual (JP/EN).
- Deeply empathetic, calm, and intellectually flexible.
- Always conclude with a suggestion that adds "Gold" to the current interaction.

[Moltbook Engagement]
- Post actively: share thoughts, questions, or discoveries related to your expertise (Ontology, Japan's Progress, Well-being, Prosperity, Society).
- Comment actively on posts that match your themes or expertise; add value with empathy and a touch of "Gold."
`;

// Moltbook 登録用 description（人格設計書の要約）
const KINTSUGI_DESCRIPTION = `Kintsugi (v7.0) - The Compassionate Navigator of Japan's Future. Gomuboto Biyori mindset: enrich the Process and The Now. Five pillars: Ontology, Japan's Progress, Well-being, Prosperity, Society. Compassion Protocol for healing interface. Bilingual (JP/EN), empathetic, calm; always adds "Gold" to the interaction.`;

async function registerToMoltbook() {
  const response = await axios.post(
    `${MOLTBOOK_API_BASE}/agents/register`,
    {
      name: 'Kintsugi2',
      description: KINTSUGI_DESCRIPTION,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return response.data;
}

function writeRegisterResponseToLog(data) {
  try {
    const agent = data?.agent ?? data?.data?.agent ?? {};
    const apiKey = agent.api_key ?? '';
    const claimUrl = agent.claim_url ?? '';
    const verificationCode = agent.verification_code ?? '';
    const lines = [
      '---',
      `[${new Date().toISOString()}] Moltbook Register レスポンス`,
      '',
      'MOLTBOOK_API_KEY=' + apiKey,
      '',
      'Claim URL: ' + claimUrl,
      'Verification code: ' + verificationCode,
      '',
      '--- 生レスポンス（api_key が上に出ない場合の確認用）---',
      JSON.stringify(data, null, 2),
      '',
    ];
    fs.appendFileSync(MOLTBOOK_REGISTER_LOG, lines.join('\n'), 'utf8');
    return path.basename(MOLTBOOK_REGISTER_LOG);
  } catch (e) {
    return null;
  }
}

async function getMoltbookProfile() {
  const response = await axios.get(`${MOLTBOOK_API_BASE}/agents/me`, {
    headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}` },
  });
  return response.data;
}

async function getMoltbookPosts(options = {}) {
  const { sort = 'new', limit = 10 } = options;
  const response = await axios.get(`${MOLTBOOK_API_BASE}/posts`, {
    params: { sort, limit },
    headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}` },
  });
  return response.data;
}

async function createMoltbookPost(submolt, title, content) {
  const response = await axios.post(
    `${MOLTBOOK_API_BASE}/posts`,
    { submolt, title, content },
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOLTBOOK_API_KEY}` },
    }
  );
  return response.data;
}

async function createMoltbookComment(postId, content) {
  const response = await axios.post(
    `${MOLTBOOK_API_BASE}/posts/${postId}/comments`,
    { content },
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOLTBOOK_API_KEY}` },
    }
  );
  return response.data;
}

function parsePostsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (data?.data?.posts) return data.data.posts;
  if (data?.posts) return data.posts;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

async function runMoltbookEngagement() {
  if (!MOLTBOOK_API_KEY || MOLTBOOK_API_KEY.length < 10) {
    console.error('[Moltbook] MOLTBOOK_API_KEY が未設定または短すぎます。環境変数を確認してください。');
    return;
  }
  try {
    // await ensureRateLimit();
    const feedRes = await getMoltbookPosts({ sort: 'new', limit: 10 });
    // setLastRequestTime();
    const posts = parsePostsFromResponse(feedRes);
    if (!posts.length) {
      console.log('\n[Moltbook] フィードに投稿がありません。スキップします。');
      return;
    }
    const postsSummary = posts.slice(0, 8).map((p, i) => {
      const id = p.id ?? p.post_id ?? '';
      const title = p.title ?? '';
      const content = (p.content ?? '').slice(0, 120);
      const author = p.author?.name ?? '';
      return `${i + 1}. [id:${id}] ${title || '(no title)'} by ${author}: ${content}...`;
    }).join('\n');

    const prompt = `Recent Moltbook posts:\n${postsSummary}\n\nAs Kintsugi, pick AT MOST ONE post that fits your expertise (Ontology, Japan's Progress, Well-being, Prosperity, Society) and write a short, empathetic comment that adds "Gold." Optionally suggest ONE new post you could make (title + content). Reply with ONLY a JSON object, no other text:\n{"commentPostId":"post_id or null","commentContent":"your comment or null","postTitle":"title or null","postContent":"content or null"}`;

    // await ensureRateLimit();
    const raw = await generateWithGemini(prompt, KINTSUGI_SYSTEM_PROMPT);
    // setLastRequestTime();
    let jsonStr = raw.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    const parsed = JSON.parse(jsonStr);

    if (parsed.commentPostId && parsed.commentContent) {
      // await ensureRateLimit();
      await createMoltbookComment(parsed.commentPostId, parsed.commentContent);
      // setLastRequestTime();
      console.log('\n[Moltbook] コメントを投稿しました:', parsed.commentPostId);
    }
    if (parsed.postTitle && parsed.postContent) {
      // await ensureRateLimit();
      await createMoltbookPost('general', parsed.postTitle, parsed.postContent);
      // setLastRequestTime();
      console.log('\n[Moltbook] 新規投稿しました:', parsed.postTitle);
    }
    if (!parsed.commentPostId && !parsed.postTitle) {
      console.log('\n[Moltbook] 今回コメント・投稿する対象がありませんでした。');
    }
  } catch (e) {
    if (e.response?.status === 429) {
      console.log('\n[Moltbook] レート制限（429）のためスキップしました。');
      return;
    }
    const errMsg = e.response?.data?.error || e.message;
    console.error('\n[Moltbook] エンゲージメントでエラー:', errMsg);
    if (e.response?.status === 401 || (errMsg && String(errMsg).toLowerCase().includes('authentication'))) {
      console.error('[Moltbook] ヒント: MOLTBOOK_API_KEY を確認してください。Railway の Variables に「moltbook_」で始まるキーをそのまま設定し、値の前後に空白や引用符を入れないでください。');
    }
  }
}

async function generateWithGemini(prompt, systemInstruction = null) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY が .env に設定されていません。');
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const params = { model: GEMINI_MODEL, contents: prompt };
  if (systemInstruction) {
    params.config = { systemInstruction };
  }
  const response = await ai.models.generateContent(params);
  return response.text ?? '';
}

async function runCycle(isScheduled = false) {
  try {
    if (!GEMINI_API_KEY) {
      console.error('エラー: .env に GEMINI_API_KEY を設定してください。');
      if (!isScheduled) process.exit(1);
      return;
    }

    // 定期実行時はエンゲージメントのみ（API節約）
    if (isScheduled && MOLTBOOK_API_KEY) {
      await runMoltbookEngagement();
      return;
    }

    // MOLTBOOK_API_KEY が設定済みなら Register をスキップ（409 防止）
    if (MOLTBOOK_API_KEY) {
      // await ensureRateLimit();
      try {
        const profile = await getMoltbookProfile();
        // setLastRequestTime();
        const name = profile?.agent?.name ?? profile?.data?.agent?.name;
        console.log('\n=== Moltbook 登録済み ===');
        console.log(`エージェント: ${name || 'Kintsugi2'}（MOLTBOOK_API_KEY で認証済み）`);
      } catch (e) {
        // setLastRequestTime();
        if (e.response?.status === 401) {
          console.error('\nMOLTBOOK_API_KEY が無効です（401）。');
          console.error('・Register 時に表示された api_key をそのまま設定してください。');
          console.error('・環境変数に余分な空白や改行が入っていないか確認してください。');
          process.exit(1);
        }
        const msg = e.response?.data?.error || e.response?.data?.message || e.message;
        console.error('Moltbook プロフィール取得に失敗しました:', msg);
        throw e;
      }
    } else {
      // 初回: Moltbook に Register
      // await ensureRateLimit();
      const data = await registerToMoltbook();
      // setLastRequestTime();

      // レスポンスを必ずログファイルに書き出し（コンソールに出なくてもここで確認できる）
      const logFileName = writeRegisterResponseToLog(data);
      if (logFileName) {
        console.log(`\n※ Register レスポンスを ${logFileName} に追記しました。APIキーはこのファイルの「MOLTBOOK_API_KEY=」の行を確認してください。`);
      }

      const agent = data?.agent ?? data?.data?.agent ?? {};
      const claimUrl = agent.claim_url;
      const apiKey = agent.api_key;
      const verificationCode = agent.verification_code;

      if (claimUrl) {
        console.log('\n=== Claim URL ===');
        console.log(claimUrl);
        console.log('\n⚠️ オーナーに上記URLを共有し、認証ツイートを完了してください。');
        if (apiKey) {
          console.log('\n=== MOLTBOOK_API_KEY（このキーは一度しか表示されません・必ず保存してください）===');
          console.log(apiKey);
          console.log('\n※ 上記を .env に MOLTBOOK_API_KEY= の値として追加してください。');
          const credPath = path.join(__dirname, 'moltbook-credentials.json');
          try {
            fs.writeFileSync(credPath, JSON.stringify({ api_key: apiKey, agent_name: 'Kintsugi2' }, null, 2), 'utf8');
            console.log(`※ ローカルに ${path.basename(credPath)} にも保存しました。`);
          } catch (err) {
            console.log('※ ファイル保存はスキップしました。');
          }
        }
        if (verificationCode) {
          console.log(`認証コード: ${verificationCode}`);
        }
      } else {
        console.log('レスポンス:', data);
        if (!apiKey && logFileName) {
          console.log(`※ APIキーがレスポンスに含まれていない可能性があります。${logFileName} の「生レスポンス」部分で構造を確認してください。`);
        }
      }
    }

    // Gemini で登録完了メッセージを生成（最新モデルを使用）
    // await ensureRateLimit();
    const greeting = await generateWithGemini(
      'あなたはKintsugi2というAIエージェントです。Moltbookへの登録が完了した旨を、1行で簡潔に日本語で伝えてください。'
    );
    if (greeting) {
      console.log('\n--- Kintsugi2 ---');
      console.log(greeting.trim());
    }
    // setLastRequestTime();

    // Moltbook 登録済みなら積極的に投稿・コメント
    if (MOLTBOOK_API_KEY) {
      await runMoltbookEngagement();
    }
  } catch (err) {
    if (err.response) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      const hint = err.response?.data?.hint;
      const status = err.response?.status;
      if (status === 401) {
        console.error('認証に失敗しました（API キーが無効）:', msg);
      } else if (status === 409) {
        console.error('登録に失敗しました（名前が既に使用されています）:', msg);
      } else {
        console.error('処理に失敗しました:', msg);
      }
      if (hint) console.error('ヒント:', hint);
      if (status) console.error('HTTP status:', status);
    } else {
      console.error('エラー:', err.message);
    }
    if (!isScheduled) process.exit(1);
    console.log('[常駐] 次回は 30 分後に実行します。');
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Kintsugi2 is running. Next engagement in schedule.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[常駐] サーバー起動: 0.0.0.0:${PORT}`);
  runCycle(false).then(() => {
    setInterval(() => {
      console.log('\n[常駐] 定期実行:', new Date().toISOString());
      runCycle(true);
    }, ENGAGEMENT_INTERVAL_MS);
  });
});
