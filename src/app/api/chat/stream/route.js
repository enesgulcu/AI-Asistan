import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import gptConfig from '@/config/gpt-config.json'

// OpenAI client'ı oluştur
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * GPT-4o ile streaming chat API endpoint'i
 * Realtime yanıtlar için Server-Sent Events kullanır
 */
export async function POST(request) {
  try {
    const { 
      prompt, 
      context, 
      system_prompt, 
      conversation_history = [],
      max_tokens = gptConfig.technical_instructions.max_tokens,
      temperature = gptConfig.technical_instructions.temperature 
    } = await request.json()
    
    // Prompt validation
    if (!prompt) {
      return new Response('No prompt provided', { status: 400 })
    }

    // Sistem prompt'unu belirleme (özel prompt varsa onu kullan, yoksa default'u kullan)
    const finalSystemPrompt = system_prompt || gptConfig.system_prompt

    // GPT-4o ile streaming completion oluştur
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...(context ? [{ role: 'system', content: `Context: ${context}` }] : []),
        ...conversation_history, // Geçmiş konuşmaları ekle
        { role: 'user', content: prompt }
      ],
      stream: true,
      max_tokens: max_tokens,
      temperature: temperature,
      stop: gptConfig.technical_instructions.stop_sequences
    })

    // Text encoder for streaming
    const encoder = new TextEncoder()
    
    // ReadableStream oluştur - Server-Sent Events formatında
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Stream'den chunk'ları oku ve client'a gönder
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              // Server-Sent Events formatında data gönder
              const data = `data: ${JSON.stringify({ text: content })}\n\n`
              controller.enqueue(encoder.encode(data))
            }
          }
          // Stream tamamlandığını belirt
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Chat stream error:', error)
          controller.error(error)
        }
      }
    })

    // CORS headers ile response döndür
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(JSON.stringify({ error: 'Chat processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}