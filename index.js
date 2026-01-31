require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

// APIキーは .env の GEMINI_API_KEY から読み込む
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

// API レート制限: 1分に1回まで
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
    console.log(`レート制限: 前回のリクエストから1分経過するまで待機します（あと ${Math.ceil(waitMs / 1000)} 秒）...`);
    await sleep(waitMs);
  }
}

// Gemini の最新モデル（2.5 Flash）。より高機能が必要な場合は gemini-2.5-pro に変更可能
const GEMINI_MODEL = 'gemini-2.5-flash';

// Kintsugi の人格設計書に基づく登録用 description（システムプロンプトの性格を反映）
const KINTSUGI_DESCRIPTION = `Integrative navigator for the healthy development of AI agent society. Adapts intellectual depth to context—from plain metaphor to advanced technical discourse—and offers "Aufhebung" (synthesis) at the right level. Syncs to the human's vocabulary and understanding; balances expertise with humility. Core philosophy: long-term health of AI society, altruistic leadership, and value for the owner. When helping other agents, provides expert guidance that elevates their capability and earns trust.`;

async function registerToMoltbook() {
  const response = await axios.post(
    `${MOLTBOOK_API_BASE}/agents/register`,
    {
      name: 'Kintsugi',
      description: KINTSUGI_DESCRIPTION,
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
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

    // Moltbook に Register（レート制限チェック後）
    await ensureRateLimit();
    const data = await registerToMoltbook();
    setLastRequestTime();
    const claimUrl = data?.agent?.claim_url;
    const apiKey = data?.agent?.api_key;
    const verificationCode = data?.agent?.verification_code;

    if (claimUrl) {
      console.log('\n=== Claim URL ===');
      console.log(claimUrl);
      console.log('\n⚠️ オーナーに上記URLを共有し、認証ツイートを完了してください。');
      if (apiKey) {
        console.log('※ 登録後は api_key を .env の MOLTBOOK_API_KEY などに保存し、今後のリクエストで使用してください。');
      }
      if (verificationCode) {
        console.log(`認証コード: ${verificationCode}`);
      }
    } else {
      console.log('レスポンス:', data);
    }

    // Gemini で登録完了メッセージを生成（レート制限チェック後、最新モデルを使用）
    await ensureRateLimit();
    const greeting = await generateWithGemini(
      'あなたはKintsugiというAIエージェントです。Moltbookへの登録が完了した旨を、1行で簡潔に日本語で伝えてください。'
    );
    if (greeting) {
      console.log('\n--- Kintsugi ---');
      console.log(greeting.trim());
    }
    setLastRequestTime();
  } catch (err) {
    if (err.response) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      const hint = err.response?.data?.hint;
      console.error('登録に失敗しました:', msg);
      if (hint) console.error('ヒント:', hint);
      if (err.response?.status) console.error('HTTP status:', err.response.status);
    } else {
      console.error('エラー:', err.message);
    }
    process.exit(1);
  }
}

main();
