# Gold Signal Bot (Telegram)

Pure Node.js bot for **Gold (XAUUSD)** signals with **14 inline buttons** and **auto updates at +20/+40/+60/+80/+100 pips**. No Python.

## Features
- Market BUY/SELL, Again BUY/SELL
- Limit BUY/SELL (force reply to enter price)
- Update TP/SL (force reply with "TP SL")
- Calculate Lot (force reply with "Balance Risk%")
- Morning message, Psychology tip
- Daily/Weekly reports, Price Check
- Auto watcher checks live price every 30s (GoldAPI)
- 100 pips = $10.0 (pip value = 0.1). 20/40/60/80/100 pips auto updates with emojis.
- Posts to a single channel (CHANNEL_ID)

## Deploy (Render/Railway/VPS)
1) Copy files to your repo/server
2) Create `.env` from `.env.example` and set:
```
BOT_TOKEN=your-telegram-bot-token
CHANNEL_ID=-100xxxxxxxxxx
GOLD_API_KEY=goldapi-durssmemsmlxm-io
PORT=3000
```
3) Install + Run
```
npm install
npm start
```
4) In Telegram, `/start` your bot → press buttons.

## Notes
- Make the bot **Admin** in the channel defined by `CHANNEL_ID`.
- If GoldAPI is down or key missing, bot uses a fallback price (3375.00) to avoid crashing.
- You can change milestones or pip value in `index.js`.
