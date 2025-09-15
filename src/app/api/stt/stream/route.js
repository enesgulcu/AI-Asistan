import { NextRequest } from 'next/server'
import { createClient } from '@deepgram/sdk'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')
    
    if (!audioFile) {
      return new Response('No audio file provided', { status: 400 })
    }

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY)
    
    // Convert File to Buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    
    // Options optimized for MP4/WebM files
    const options = {
      model: 'nova-2',
      language: 'tr',
      smart_format: true,
      punctuate: true,
      // Let Deepgram auto-detect encoding for container formats
    }

    console.log('Deepgram options:', options)
    console.log('Audio file type:', audioFile.type)
    console.log('Audio buffer size:', audioBuffer.length)

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      options
    )

    if (error) {
      console.error('Deepgram error:', error)
      return new Response(JSON.stringify({ error: 'STT processing failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0

    return new Response(JSON.stringify({
      text: transcript,
      confidence: confidence,
      is_final: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('STT API error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
