import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import gptConfig from '@/config/gpt-config.json'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request) {
  try {
    const { 
      prompt, 
      context, 
      system_prompt, 
      max_tokens = gptConfig.technical_instructions.max_tokens,
      temperature = gptConfig.technical_instructions.temperature 
    } = await request.json()
    
    if (!prompt) {
      return new Response('No prompt provided', { status: 400 })
    }

    // Sistem prompt'unu belirleme (özel prompt varsa onu kullan, yoksa default'u kullan)
    const finalSystemPrompt = system_prompt || gptConfig.system_prompt

    // GPT konfigürasyonunu uygula
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...(context ? [{ role: 'system', content: `Context: ${context}` }] : []),
        { role: 'user', content: prompt }
      ],
      stream: true,
      max_tokens: max_tokens,
      temperature: temperature,
      stop: gptConfig.technical_instructions.stop_sequences
    })

    const encoder = new TextEncoder()
    
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              const data = `data: ${JSON.stringify({ text: content })}\n\n`
              controller.enqueue(encoder.encode(data))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Chat stream error:', error)
          controller.error(error)
        }
      }
    })

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

