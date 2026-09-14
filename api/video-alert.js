export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { studentName, rollNo, videoData, reason } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Telegram credentials missing' });
  }

  try {
    const base64Data = videoData.replace(/^data:video\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'video/webm' });

    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const tag = reason || 'Automatic Periodic Audit';
    const caption = `🎥 *5-SEC SURVEILLANCE CLIP*\n\n👤 *Candidate:* ${studentName || 'Student'}\n🆔 *Roll No:* ${rollNo || 'N/A'}\n⏰ *Time:* ${timeStr}\n📌 *Source:* ${tag}`;

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
    formData.append('video', blob, 'surveillance.webm');

    let tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
      method: 'POST',
      body: formData
    });

    let data = await tgRes.json();
    if (!data.ok) {
      formData.delete('video');
      formData.append('document', blob, 'surveillance.webm');
      tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      data = await tgRes.json();
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
