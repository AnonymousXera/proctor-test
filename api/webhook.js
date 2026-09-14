export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = process.env.TELEGRAM_CHAT_ID;
  const update = req.body;

  const TOPIC_PRESENCE = 'eklavya_proctor_live_presence';
  const TOPIC_CMD = 'eklavya_proctor_live_cmd';

  async function sendTg(method, payload) {
    return fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  try {
    // 1. Slash Commands (/student, /photo, /video)
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text === '/student') {
        // Fetch active students from presence stream (last 3 minutes)
        const presRes = await fetch(`https://ntfy.sh/${TOPIC_PRESENCE}/json?poll=1&since=3m`);
        const rawText = await presRes.text();
        const lines = rawText.trim().split('\n').filter(Boolean);

        const activeMap = new Map();
        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            if (item.event === 'message') {
              const data = JSON.parse(item.message);
              activeMap.set(data.roll, data);
            }
          } catch (e) {}
        }

        const students = Array.from(activeMap.values());

        if (students.length === 0) {
          await sendTg('sendMessage', {
            chat_id: chatId,
            text: '⚠️ *Koi bhi student abhi active nahi hai.* (Exam portal par candidate verify hone ke baad yahan show honge)',
            parse_mode: 'Markdown'
          });
          return res.status(200).send('OK');
        }

        const keyboard = students.map(st => [
          { text: `👤 ${st.name} (${st.roll})`, callback_data: `st_${st.roll}_${encodeURIComponent(st.name)}` }
        ]);

        await sendTg('sendMessage', {
          chat_id: chatId,
          text: '📋 *Active Students List:*\nMedia request bhejne ke liye student select karein:',
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      }

      // Direct /photo <roll>
      else if (text.startsWith('/photo')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
          await sendTg('sendMessage', { chat_id: chatId, text: 'ℹ️ Sahi format: `/photo ROLL-NO`', parse_mode: 'Markdown' });
        } else {
          const roll = parts[1].trim();
          await fetch(`https://ntfy.sh/${TOPIC_CMD}`, {
            method: 'POST',
            body: JSON.stringify({ roll: roll, action: 'photo' })
          });
          await sendTg('sendMessage', { chat_id: chatId, text: `⏳ *${roll}* ko live photo capture karne ka order bhej diya gaya hai...`, parse_mode: 'Markdown' });
        }
      }

      // Direct /video <roll>
      else if (text.startsWith('/video')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
          await sendTg('sendMessage', { chat_id: chatId, text: 'ℹ️ Sahi format: `/video ROLL-NO`', parse_mode: 'Markdown' });
        } else {
          const roll = parts[1].trim();
          await fetch(`https://ntfy.sh/${TOPIC_CMD}`, {
            method: 'POST',
            body: JSON.stringify({ roll: roll, action: 'video' })
          });
          await sendTg('sendMessage', { chat_id: chatId, text: `⏳ *${roll}* ko 5 second video record karne ka order bhej diya gaya hai...`, parse_mode: 'Markdown' });
        }
      }
    }

    // 2. Inline Button Callbacks
    else if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data;
      const chatId = cq.message.chat.id;

      if (data.startsWith('st_')) {
        const [, roll, encName] = data.split('_');
        const sName = decodeURIComponent(encName || '');

        await sendTg('editMessageText', {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `🎯 *Candidate Selected:*\n👤 *Name:* ${sName}\n🆔 *Roll:* ${roll}\n\nAap kya request karna chahte hain?`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📸 Live Photo', callback_data: `req_photo_${roll}` },
                { text: '🎥 5s Video', callback_data: `req_video_${roll}` }
              ],
              [{ text: '🔙 Back to Student List', callback_data: 'back_list' }]
            ]
          }
        });
      }

      else if (data.startsWith('req_photo_')) {
        const roll = data.replace('req_photo_', '');
        await fetch(`https://ntfy.sh/${TOPIC_CMD}`, {
          method: 'POST',
          body: JSON.stringify({ roll: roll, action: 'photo' })
        });
        await sendTg('answerCallbackQuery', { callback_query_id: cq.id, text: `📸 Roll ${roll} se photo mangi ja rahi hai...` });
        await sendTg('sendMessage', { chat_id: chatId, text: `⏳ *Roll ${roll}* se live snapshot aane wala hai...`, parse_mode: 'Markdown' });
      }

      else if (data.startsWith('req_video_')) {
        const roll = data.replace('req_video_', '');
        await fetch(`https://ntfy.sh/${TOPIC_CMD}`, {
          method: 'POST',
          body: JSON.stringify({ roll: roll, action: 'video' })
        });
        await sendTg('answerCallbackQuery', { callback_query_id: cq.id, text: `🎥 Roll ${roll} se 5s video record ho rahi hai...` });
        await sendTg('sendMessage', { chat_id: chatId, text: `⏳ *Roll ${roll}* se 5 second ki live recording taiyar ho rahi hai...`, parse_mode: 'Markdown' });
      }

      else if (data === 'back_list') {
        await sendTg('answerCallbackQuery', { callback_query_id: cq.id });
        // Re-trigger /student
        update.message = { chat: { id: chatId }, text: '/student' };
        return handler(req, res);
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).send('OK');
  }
}
