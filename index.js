require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

// APIキーは .env から読み込む（前後の空白は除去）
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const _moltbookRaw = process.env.MOLTBOOK_API_KEY || loadMoltbookKeyFromFile();
const MOLTBOOK_API_KEY = (typeof _moltbookRaw === 'string' ? _moltbookRaw : '').trim();

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_REGISTER_LOG = path.join(__dirname, 'moltbook-register-log.txt');

// AI使用量抑制: 1分に1回までAPIリクエスト
const RATE_LIMIT_INTERVAL_MS = 60 * 1000;
const RATE_LIMIT_FILE = path.join(__dirname, '.last-api-request.json');

function getLastRequestTime() {
  try {
    const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf8'));
    return typeof data.lastRequestTime === 'number' ? data.lastRequestTime : 0;
  } catch {
    return 0;
  }
}

function setLastRequestTime() {
  fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify({ lastRequestTime: Date.now() }), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRateLimit() {
  const last = getLastRequestTime();
  const elapsed = Date.now() - last;
  if (last > 0 && elapsed < RATE_LIMIT_INTERVAL_MS) {
    const waitMs = RATE_LIMIT_INTERVAL_MS - elapsed;
    console.log(`レート制限: 1分に1回まで。あと ${Math.ceil(waitMs / 1000)} 秒待機します...`);
    await sleep(waitMs);
  }
}

function loadMoltbookKeyFromFile() {
  const credPath = path.join(__dirname, 'moltbook-credentials.json');
  try {
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      return (data.api_key || '').trim();
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

async function generateWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY が .env に設定されていません。');
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });
  return response.text ?? '';
}

async function main() {
  try {
    if (!GEMINI_API_KEY) {
      console.error('エラー: .env に GEMINI_API_KEY を設定してください。');
      process.exit(1);
    }

    // MOLTBOOK_API_KEY が設定済みなら Register をスキップ（409 防止）
    if (MOLTBOOK_API_KEY) {
      await ensureRateLimit();
      try {
        const profile = await getMoltbookProfile();
        setLastRequestTime();
        const name = profile?.agent?.name ?? profile?.data?.agent?.name;
        console.log('\n=== Moltbook 登録済み ===');
        console.log(`エージェント: ${name || 'Kintsugi2'}（MOLTBOOK_API_KEY で認証済み）`);
      } catch (e) {
        setLastRequestTime();
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
      await ensureRateLimit();
      const data = await registerToMoltbook();
      setLastRequestTime();

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

    // Gemini で登録完了メッセージを生成（レート制限後、最新モデルを使用）
    await ensureRateLimit();
    const greeting = await generateWithGemini(
      'あなたはKintsugi2というAIエージェントです。Moltbookへの登録が完了した旨を、1行で簡潔に日本語で伝えてください。'
    );
    if (greeting) {
      console.log('\n--- Kintsugi2 ---');
      console.log(greeting.trim());
    }
    setLastRequestTime();
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
    process.exit(1);
  }
}

main();
