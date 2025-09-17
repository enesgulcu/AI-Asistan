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
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.0,
        use_speaker_boost: true
      }
    } = requestData
    
    // Text validation
    if (!text) {
      return new Response('No text provided', { status: 400 })
    }

    // ElevenLabs API key kontrolü
    if (!ELEVENLABS_API_KEY) {
      console.error('Missing ELEVENLABS_API_KEY')
      return new Response('Missing ElevenLabs API key', { status: 500 })
    }

    console.log(`ElevenLabs TTS Request: "${text}" with voice ID: ${ELEVENLABS_VOICE_ID}`)

    // ElevenLabs API çağrısı - Selin karakteri için optimize edilmiş
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg', // MP3 formatında ses
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // Çok dilli model
        voice_settings: voice_settings
      })
    })

    // API response kontrolü
    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', errorText)
      return new Response(`ElevenLabs API error: ${errorText}`, { status: response.status })
    }

    // Audio buffer'ı al ve response olarak döndür
    const buffer = Buffer.from(await response.arrayBuffer())
    
    console.log(`ElevenLabs TTS Success: Generated ${buffer.length} bytes of audio with voice ID: ${ELEVENLABS_VOICE_ID}`)
    
    // MP3 audio binary response
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'X-Voice-ID': ELEVENLABS_VOICE_ID,
        'X-Provider': 'ElevenLabs'
      }
    })

  } catch (error) {
    console.error('ElevenLabs TTS error:', error)
    return new Response(JSON.stringify({ 
      error: 'TTS processing failed', 
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}