// ElevenLabs TTS API kullanıyoruz - OpenAI TTS'den daha kaliteli ses üretimi için
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = 'PdYVUd1CAGSXsTvZZTNn' // Selin karakteri için optimize edilmiş voice ID

/**
 * ElevenLabs Text-to-Speech API endpoint'i
 * Selin karakteri için özel ses üretimi
 */
export async function POST(req) {
  try {
    // JSON parse hatasını önlemek için try-catch
    let requestData
    try {
      requestData = await req.json()
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError)
      return new Response('Invalid JSON data', { status: 400 })
    }

    const { 
      text, 
      voice_settings = {
        stability: 0.4,
        similarity_boost: 0.9,
        style: 0.85,
        use_speaker_boost: true
      }
    } = requestData
    
    // === TTS DEMO KALİTESİ: Güvenlik ve Rate Limiting ===
    if (!text || text.length < 3) {
      return new Response('Text too short (min 3 chars)', { status: 400 })
    }
    if (text.length > 2000) {
      return new Response('Text too long (max 2000 chars)', { status: 413 })
    }

    // ElevenLabs API key kontrolü
    if (!ELEVENLABS_API_KEY) {
      console.error('Missing ELEVENLABS_API_KEY')
      return new Response('Missing ElevenLabs API key', { status: 500 })
    }

    console.log(`🎵 ElevenLabs TTS Request: "${text.substring(0, 50)}..." (${text.length} chars)`)

    // === TTS DEMO KALİTESİ: ElevenLabs Optimizasyonu ===
    const body = {
      text: text,
      model_id: 'eleven_multilingual_v2', // Çok dilli model
      voice_settings: {
        stability: voice_settings?.stability ?? 0.4,
        similarity_boost: voice_settings?.similarity_boost ?? 0.9,
        style: voice_settings?.style ?? 0.85,
        use_speaker_boost: true
      },
      optimize_streaming_latency: 1, // Düşük latency
      output_format: 'mp3_44100_192' // Demo kalitesi: 44.1kHz, 192kbps
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify(body)
    })

    // API response kontrolü
    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', errorText)
      return new Response(`ElevenLabs Error ${response.status}: ${errorText}`, { status: 502 })
    }

    // Audio buffer'ı al ve response olarak döndür
    const arrayBuffer = await response.arrayBuffer()
    
    console.log(`✅ ElevenLabs TTS Success: Generated ${arrayBuffer.byteLength} bytes (${(arrayBuffer.byteLength/1024).toFixed(1)}KB)`)
    
    // MP3 audio binary response
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': arrayBuffer.byteLength.toString(),
        'X-Voice-ID': ELEVENLABS_VOICE_ID,
        'X-Provider': 'ElevenLabs',
        'X-Quality': 'mp3_44100_192',
        'X-Latency': 'optimized'
      }
    })

  } catch (error) {
    console.error('ElevenLabs TTS error:', error)
    return new Response(`Server Error: ${error?.message || error}`, { status: 500 })
  }
}