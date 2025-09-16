import OpenAI from 'openai'
import voicePresets from '@/config/voice-presets.json'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
      voice = 'alloy', 
      model = 'tts-1-hd', // Daha hızlı varsayılan model
      speed = 1.0,
      preset = null // Preset adı verilirse onu kullan
    } = requestData
    
    if (!text) {
      return new Response('No text provided', { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return new Response('Missing OpenAI API key', { status: 500 })
    }

    // Preset varsa onu kullan, yoksa parametreleri kullan
    let finalVoice = voice
    let finalSpeed = speed

    if (preset && voicePresets.presets[preset]) {
      const presetConfig = voicePresets.presets[preset]
      finalVoice = presetConfig.openai_voice
      finalSpeed = presetConfig.speed
      console.log(`TTS Preset kullanılıyor: ${preset} (${presetConfig.name})`)
    }

    console.log(`TTS Request: "${text}" with voice: ${finalVoice}, speed: ${finalSpeed}`)

    const response = await openai.audio.speech.create({
      model: model,
      voice: finalVoice, // Preset'ten gelen veya parametre olarak verilen ses
      input: text,
      response_format: 'mp3',
      speed: finalSpeed // Preset'ten gelen veya parametre olarak verilen hız
    })

    const buffer = Buffer.from(await response.arrayBuffer())
    
    console.log(`TTS Success: Generated ${buffer.length} bytes of audio with voice: ${finalVoice}`)
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'X-Voice-Used': finalVoice,
        'X-Speed-Used': finalSpeed.toString()
      }
    })

  } catch (error) {
    console.error('OpenAI TTS error:', error)
    return new Response(JSON.stringify({ 
      error: 'TTS processing failed', 
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
