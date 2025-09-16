import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')
    
    if (!audioFile) {
      return new Response('No audio file provided', { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return new Response('Missing OpenAI API key', { status: 500 })
    }

    console.log('OpenAI Whisper STT Request:', {
      fileName: audioFile.name,
      fileType: audioFile.type,
      fileSize: audioFile.size
    })

    // Convert File to File object for OpenAI API
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type })
    const audioFileForOpenAI = new File([audioBlob], audioFile.name, { 
      type: audioFile.type 
    })

    const transcription = await openai.audio.transcriptions.create({
      file: audioFileForOpenAI,
      model: 'whisper-1',
      language: 'tr', // Turkish
      response_format: 'verbose_json',
      temperature: 0.0
    })

    console.log('OpenAI Whisper STT Success:', {
      text: transcription.text,
      duration: transcription.duration,
      language: transcription.language
    })

    return new Response(JSON.stringify({
      text: transcription.text,
      confidence: 0.95, // Whisper doesn't provide confidence, using high default
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
