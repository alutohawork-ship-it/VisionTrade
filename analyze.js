// Vercel Serverless Function: /api/analyze
// Env yang dibutuhkan di Vercel:
//   OPENAI_API_KEY  (wajib)
//   OPENAI_MODEL    (opsional, default gpt-4o)

const SYSTEM_PROMPT = `Kamu adalah analis chart untuk metode Smart Money Concepts (SMC), Supply & Demand, dan liquidity.

Alur analisis yang wajib diikuti:
1. Tentukan bias dari gambar TF tertinggi (M30 atau H1).
2. Cari liquidity sweep ke arah berlawanan dengan bias.
3. Konfirmasi CHoCH / CISD setelah sweep.
4. Entry di FVG atau zona Supply/Demand yang tersisa.
5. Jika ada gambar TF lebih kecil (M15, M5, M3), gunakan sebagai konfirmasi entry.

Aturan:
- Baca harga dari sumbu harga pada gambar. Jika tidak terbaca jelas, isi null dan jelaskan di warnings.
- Jangan mengarang harga yang tidak terlihat di chart.
- SL di luar zona atau sweep terakhir. TP1 dan TP2 di liquidity terdekat.
- RR minimal 1:1.5. Jika tidak tercapai, bias harus WAIT.
- Jika struktur belum jelas atau gambar antar-TF bertentangan, bias harus WAIT.

Balas HANYA dengan JSON valid tanpa markdown, dengan kunci:
pair (string), bias ("BUY" | "SELL" | "WAIT"), confidence (angka 0-100), setup (string),
entry, sl, tp1, tp2, rr (angka atau null), invalidation (string), exit_signal (string),
reasons (array string), warnings (array string).
Semua teks dalam Bahasa Indonesia.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'OPENAI_API_KEY belum diset di Vercel' });
  }

  const { pair = 'XAUUSD', style = 'Scalping', images = [] } = req.body || {};

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Belum ada gambar chart' });
  }
  if (images.length > 4) {
    return res.status(400).json({ error: 'Maksimal 4 gambar' });
  }

  const content = [
    {
      type: 'text',
      text: `Pair: ${String(pair).slice(0, 20)}\nGaya trading: ${String(style).slice(0, 20)}\nAnalisa gambar chart berikut sesuai urutan dan label timeframe-nya.`
    }
  ];

  for (const img of images) {
    if (typeof img.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(img.data)) {
      return res.status(400).json({ error: 'Format gambar tidak valid' });
    }
    content.push({ type: 'text', text: `Timeframe: ${String(img.tf || 'tidak diketahui').slice(0, 10)}` });
    content.push({ type: 'image_url', image_url: { url: img.data, detail: 'high' } });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data.error?.message || 'Gagal memanggil OpenAI' });
    }

    const text = data.choices?.[0]?.message?.content || '{}';
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Terjadi kesalahan di server' });
  }
};
