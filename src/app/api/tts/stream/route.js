export async function POST(req) {
  try {
    if (!process.env.GOOGLE_TTS_KEY) {
      console.error("Missing GOOGLE_TTS_KEY");
      return new Response("Missing GOOGLE_TTS_KEY", { status: 500 });
    }
    
    const { text, voiceName, languageCode } = await req.json();
    if (!text) return new Response("No text", { status: 400 });

    const key = process.env.GOOGLE_TTS_KEY; // <--- sadece TTS key
    if (!key) return new Response("Missing GOOGLE_TTS_KEY", { status: 500 });

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`;
    const body = {
      input: { text },
      voice: {
        languageCode: languageCode || "tr-TR",
        // İstersen sabitleme: "tr-TR-Standard-A" yerine işi garantilemek için boş bırakma.
        name: voiceName || "tr-TR-Standard-A"
        // Alternatifler: "tr-TR-Wavenet-A", "tr-TR-Neural2-A" (projene açık olanlara göre)
      },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0.0 }
    };

    const gRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!gRes.ok) {
      const errText = await gRes.text();
      console.error("Google TTS error", gRes.status, errText);
      return new Response("TTS error", { status: 500 });
    }

    const { audioContent } = await gRes.json(); // base64
    const buf = Buffer.from(audioContent, "base64");
    return new Response(buf, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" }
    });
  } catch (e) {
    console.error("TTS API error:", e);
    return new Response("TTS failed", { status: 500 });
  }
}
