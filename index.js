require('dotenv').config();
const axios = require('axios');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // e.g., -1003010980066
const GOLD_API_KEY = process.env.GOLD_API_KEY; // goldapi-durssmemsmlxm-io
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN in .env");
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error("❌ Missing CHANNEL_ID in .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Minimal HTTP server (Render/Railway health check)
const app = express();
app.get('/', (req, res) => res.send('Gold Signal Bot is running'));
app.get('/health', (req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`🌐 Health server on :${PORT}`));

// ===== Helpers =====
const PIP_VALUE = 0.1; // 0.1 = 1 pip (e.g., 75 -> 76 = 10 pips)
const MILESTONES = [20,40,60,80,100];

async function getLiveGoldPrice() {
  try {
    if (!GOLD_API_KEY) throw new Error("No GOLD_API_KEY");
    const r = await axios.get('https://www.goldapi.io/api/XAU/USD', {
      headers: {
        'x-access-token': GOLD_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 8000
    });
    const d = r.data || {};
    // Prefer 'price' or 'ask' as entry
    const price = Number(d.price || d.ask || d.bid);
    const chp = typeof d.chp !== 'undefined' ? d.chp : null; // change percent
    if (!price || Number.isNaN(price)) throw new Error("Bad price from API");
    return { price, chp };
  } catch (e) {
    // fallback: static price to avoid crash
    console.warn("⚠️ Gold API failed, using fallback", e.message);
    return { price: 3375.0, chp: null };
  }
}

function fmt(n) {
  return Number(n).toFixed(2);
}

function calcTP_SL(entry, side) {
  // 100 pips = 10.0 price units
  const delta = 100 * PIP_VALUE; // 10.0
  if (side === 'BUY') {
    return { tp: entry + delta, sl: entry - delta };
  } else {
    return { tp: entry - delta, sl: entry + delta };
  }
}

function signalTemplate({pair, side, entry, tp, sl, chp}) {
  const movePct = chp !== null ? `${chp}%` : '—';
  return [
    `🚀 Premium Trading Signal 🚀`,
    `────────────────────────────`,
    ``,
    `📊 Pair: ${pair}`,
    `${side === 'BUY' ? '🟢' : '🔴'} Type: ${side}`,
    `💲 Entry: ${fmt(entry)}`,
    `🎯 Take Profit (TP): ${fmt(tp)}`,
    `🛑 Stop Loss (SL): ${fmt(sl)}`,
    `📈 Move Potential: ${movePct}`,
    ``,
    `────────────────────────────`,
    `💰 Money Management Guide`,
    `▫ $100 = 0.01 lot`,
    `▫ $200 = 0.02 lot`,
    `▫ $300 = 0.03 lot`,
    `▫ $500 = 0.05 lot`,
    `▫ $1000 = 0.10 lot`,
    ``,
    `────────────────────────────`,
    `⚠️ Risk Disclaimer`,
    `Trading carries high risk. Invest only what you can afford to lose.`,
    `Proper risk management is the key to long-term success.`
  ].join('\n');
}

function milestoneMessage(side, entry, price, pipsHit, idx) {
  const stages = [
    { icon: '✅', text: 'Stay strong!' },
    { icon: '🚀', text: 'SL moved to breakeven 🛡️' },
    { icon: '💎', text: 'Risk-free trade 🎉' },
    { icon: '⚡', text: 'Trailing SL secured 🔒' },
    { icon: '🏆', text: 'Take Profit Reached! 💰🔥' }
  ];
  const s = stages[Math.min(idx, stages.length-1)];
  const dir = side === 'BUY' ? 'up' : 'down';
  return [
    `${s.icon} Price moved +${pipsHit} pips ${dir === 'up' ? '📈' : '📉'}`,
    `Entry: ${fmt(entry)} → Now: ${fmt(price)}`,
    idx === 2 ? `SL moved to breakeven at ${fmt(entry)} 🛡️` : '',
    idx === 5 ? `Total Gain: +100 pips` : ''
  ].filter(Boolean).join('\n');
}

// Track a single active GOLD trade
const active = {
  on: false,
  side: null, // BUY/SELL
  entry: null,
  tp: null,
  sl: null,
  milestonesDone: new Set(), // 20/40/60/80/100
  channelId: CHANNEL_ID
};

async function startGoldSignal(side, customEntry=null) {
  const { price, chp } = await getLiveGoldPrice();
  const entry = customEntry ? Number(customEntry) : price;
  const { tp, sl } = calcTP_SL(entry, side);
  active.on = true;
  active.side = side;
  active.entry = entry;
  active.tp = tp;
  active.sl = sl;
  active.milestonesDone = new Set();
  const txt = signalTemplate({ pair: 'XAUUSD (Gold)', side, entry, tp, sl, chp });
  await bot.sendMessage(active.channelId, txt);
}

async function postLotCalc(balance, riskPct) {
  const bal = Number(balance), rp = Number(riskPct);
  if (!bal || !rp) return;
  const riskAmount = (bal * rp) / 100;
  // simple: $100 risk ≈ 0.01 lot
  const lot = (riskAmount / 100 * 0.01).toFixed(2);
  const msg = [
    `📊 Lot Calculation`,
    `💵 Balance: $${bal}`,
    `⚖️ Risk: ${rp}%`,
    `🎯 Suggested Lot: ${lot}`
  ].join('\n');
  await bot.sendMessage(CHANNEL_ID, msg);
}

// ===== Buttons (14) =====
function mainKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Market BUY", callback_data: "buy" }, { text: "📉 Market SELL", callback_data: "sell" }],
        [{ text: "🔄 Again BUY", callback_data: "again_buy" }, { text: "🔄 Again SELL", callback_data: "again_sell" }],
        [{ text: "⏳ Limit BUY", callback_data: "limit_buy" }, { text: "⏳ Limit SELL", callback_data: "limit_sell" }],
        [{ text: "✏️ Update TP/SL", callback_data: "update_tpsl" }, { text: "📊 Calculate Lot", callback_data: "calc_lot" }],
        [{ text: "🌅 Morning Msg", callback_data: "morning" }, { text: "🧠 Psychology Tip", callback_data: "psych" }],
        [{ text: "📊 Daily Report", callback_data: "daily" }, { text: "📈 Weekly Report", callback_data: "weekly" }],
        [{ text: "💰 Price Check", callback_data: "price" }, { text: "❌ Cancel/Reset", callback_data: "reset" }]
      ]
    }
  };
}

// ===== Command Handlers =====
bot.onText(/\/start|\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "📌 Gold Signal Control Panel — press a button:", mainKeyboard());
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  try {
    if (data === 'buy') {
      await startGoldSignal('BUY');
      return bot.answerCallbackQuery(q.id, { text: 'BUY sent' });
    }
    if (data === 'sell') {
      await startGoldSignal('SELL');
      return bot.answerCallbackQuery(q.id, { text: 'SELL sent' });
    }
    if (data === 'again_buy') {
      await startGoldSignal('BUY');
      return bot.answerCallbackQuery(q.id, { text: 'Again BUY sent' });
    }
    if (data === 'again_sell') {
      await startGoldSignal('SELL');
      return bot.answerCallbackQuery(q.id, { text: 'Again SELL sent' });
    }
    if (data === 'limit_buy' || data === 'limit_sell') {
      const side = data === 'limit_buy' ? 'BUY' : 'SELL';
      const sent = await bot.sendMessage(chatId, `✍️ Send limit entry price for ${side} (e.g., 1930.50)`, { reply_markup: { force_reply: true } });
      pendingReplies.set(sent.message_id, { type: 'limit', side });
      return bot.answerCallbackQuery(q.id);
    }
    if (data === 'update_tpsl') {
      const sent = await bot.sendMessage(chatId, `✍️ Send: TP SL (e.g., "1935.50 1915.50")`, { reply_markup: { force_reply: true } });
      pendingReplies.set(sent.message_id, { type: 'tpsl' });
      return bot.answerCallbackQuery(q.id);
    }
    if (data === 'calc_lot') {
      const sent = await bot.sendMessage(chatId, `✍️ Send: Balance Risk% (e.g., "1000 2")`, { reply_markup: { force_reply: true } });
      pendingReplies.set(sent.message_id, { type: 'lot' });
      return bot.answerCallbackQuery(q.id);
    }
    if (data === 'morning') {
      const msg = [
        `🌅 In the name of Allah, we begin today.`,
        `Stay disciplined, trust your plan, and manage risk.`,
        `May your trades be guided with wisdom. 🤲`
      ].join('\n');
      await bot.sendMessage(CHANNEL_ID, msg);
      return bot.answerCallbackQuery(q.id, { text: 'Morning sent' });
    }
    if (data === 'psych') {
      const msg = `🧠 Trading Psychology:\nPatience beats impulse. Wait for confirmation, respect your stop, and let winners run.`;
      await bot.sendMessage(CHANNEL_ID, msg);
      return bot.answerCallbackQuery(q.id, { text: 'Psychology sent' });
    }
    if (data === 'daily') {
      const msg = `📊 Daily Report:\nSignals shared, risk observed, and discipline maintained. Remember to journal each trade.`;
      await bot.sendMessage(CHANNEL_ID, msg);
      return bot.answerCallbackQuery(q.id, { text: 'Daily sent' });
    }
    if (data === 'weekly') {
      const msg = `📈 Weekly Report:\nReview your entries, exits, and psychology. Small consistent gains build big results.`;
      await bot.sendMessage(CHANNEL_ID, msg);
      return bot.answerCallbackQuery(q.id, { text: 'Weekly sent' });
    }
    if (data === 'price') {
      const { price, chp } = await getLiveGoldPrice();
      const msg = `💰 XAUUSD Live Price: ${fmt(price)} ${chp!==null?`(${chp}%)`:''}`.trim();
      await bot.sendMessage(CHANNEL_ID, msg);
      return bot.answerCallbackQuery(q.id, { text: 'Price sent' });
    }
    if (data === 'reset') {
      active.on = false;
      active.milestonesDone = new Set();
      return bot.answerCallbackQuery(q.id, { text: 'Reset done' });
    }
  } catch (err) {
    console.error('Callback error:', err);
  }
});

// Capture replies for Limit / TP-SL / Lot
const pendingReplies = new Map();

bot.on('message', async (msg) => {
  // Ignore callback messages
  if (!msg.reply_to_message) return;

  const tag = pendingReplies.get(msg.reply_to_message.message_id);
  if (!tag) return;

  try {
    if (tag.type === 'limit') {
      const price = Number(String(msg.text).trim());
      if (!price) return bot.sendMessage(msg.chat.id, '❌ Invalid price');
      await startGoldSignal(tag.side, price);
      await bot.sendMessage(msg.chat.id, `⏳ Limit ${tag.side} signal posted at ${fmt(price)}`);
    }
    if (tag.type === 'tpsl') {
      const parts = String(msg.text).trim().split(/\s+/);
      const tp = Number(parts[0]), sl = Number(parts[1]);
      if (!tp || !sl) return bot.sendMessage(msg.chat.id, '❌ Send both TP and SL (e.g., "1935.50 1915.50")');
      if (!active.on) return bot.sendMessage(msg.chat.id, 'ℹ️ No active signal. Start BUY/SELL first.');
      active.tp = tp; active.sl = sl;
      await bot.sendMessage(CHANNEL_ID, `✏️ Update TP/SL:\n🎯 TP: ${fmt(tp)}\n🛑 SL: ${fmt(sl)}`);
    }
    if (tag.type === 'lot') {
      const parts = String(msg.text).trim().split(/\s+/);
      const bal = Number(parts[0]), risk = Number(parts[1]);
      if (!bal || !risk) return bot.sendMessage(msg.chat.id, '❌ Send "Balance Risk%" e.g., "1000 2"');
      await postLotCalc(bal, risk);
    }
  } catch (e) {
    console.error('Reply handler error:', e);
  } finally {
    pendingReplies.delete(msg.reply_to_message.message_id);
  }
});

// ===== Auto Watcher: every 30s check price and post 20/40/60/80/100 updates =====
setInterval(async () => {
  try {
    if (!active.on) return;
    const { price } = await getLiveGoldPrice();
    const movePips = active.side === 'BUY'
      ? Math.floor((price - active.entry) / PIP_VALUE)
      : Math.floor((active.entry - price) / PIP_VALUE);

    for (const m of [20,40,60,80,100]) {
      if (movePips >= m && !active.milestonesDone.has(m)) {
        active.milestonesDone.add(m);
        const idx = [20,40,60,80,100].indexOf(m) + 1; // 1..5
        if (m >= 40) {
          active.sl = active.entry; // breakeven
        }
        const msg = milestoneMessage(active.side, active.entry, price, m, idx);
        await bot.sendMessage(CHANNEL_ID, msg);
        if (m === 100) {
          active.on = false; // TP done
        }
      }
    }
  } catch (e) {
    console.error('Watcher error:', e.message);
  }
}, 30000);
