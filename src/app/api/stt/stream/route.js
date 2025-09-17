import { NextRequest } from 'next/server'
import OpenAI from 'openai'

// OpenAI client'ı oluştur
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * OpenAI Whisper ile Speech-to-Text API endpoint'i
 * Türkçe konuşma tanıma için optimize edilmiş
 */
export async function POST(request) {
  try {
    // FormData'dan audio dosyasını al
    const formData = await request.formData()
    const audioFile = formData.get('audio')
    
    // Audio file validation
    if (!audioFile) {
      return new Response('No audio file provided', { status: 400 })
    }

    // OpenAI API key kontrolü
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return new Response('Missing OpenAI API key', { status: 500 })
    }

    console.log('OpenAI Whisper STT Request:', {
      fileName: audioFile.name,
      fileType: audioFile.type,
      fileSize: audioFile.size
    })

    // File'ı OpenAI API için hazırla
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type })
    const audioFileForOpenAI = new File([audioBlob], audioFile.name, { 
      type: audioFile.type 
    })

    // OpenAI Whisper API çağrısı
    const transcription = await openai.audio.transcriptions.create({
      file: audioFileForOpenAI,
      model: 'whisper-1',
      language: 'tr', // Türkçe dil desteği
      response_format: 'verbose_json', // Detaylı response
      temperature: 0.0 // Deterministik sonuçlar için
    })

    console.log('OpenAI Whisper STT Success:', {
      text: transcription.text,
      duration: transcription.duration,
      language: transcription.language
    })

    // Başarılı response döndür
    return new Response(JSON.stringify({
      text: transcription.text,
      confidence: 0.95, // Whisper confidence değeri vermiyor, yüksek default kullan
      is_final: true,
      duration: transcription.duration,
      language: transcription.language
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('OpenAI Whisper STT error:', error)
    return new Response(JSON.stringify({ 
      error: 'STT processing failed', 
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}