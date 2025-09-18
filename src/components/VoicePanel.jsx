'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import gptConfig from '@/config/gpt-config.json'
import voicePresets from '@/config/voice-presets.json'

export default function VoicePanel() {
  // Ana durum yönetimi
  const [isRunning, setIsRunning] = useState(false)
  const [userText, setUserText] = useState('')
  const [assistantText, setAssistantText] = useState('')
  const [status, setStatus] = useState('Hazır')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [debugInfo, setDebugInfo] = useState([])
  const [currentPreset, setCurrentPreset] = useState('default')
  const [lastResponseAudio, setLastResponseAudio] = useState(null)
  const [isReplaying, setIsReplaying] = useState(false)
  const [fullResponseAudios, setFullResponseAudios] = useState([])
  const [currentResponseId, setCurrentResponseId] = useState(null)
  const [lastUserSpeechTime, setLastUserSpeechTime] = useState(0)
  const [conversationHistory, setConversationHistory] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(null)
  const [userInfo, setUserInfo] = useState(null)

  // Referanslar
  const mediaRecorderRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const fileInputRef = useRef(null)
  const recordingTimeoutRef = useRef(null)
  const isMouseDownRef = useRef(false)
  const operationTimers = useRef({})
  const recognitionRef = useRef(null)

  // === TTS DEMO KALİTESİ: Mikro-batch Buffer ve Gapless Player ===
  const LOG_TTS = false // ihtiyaçta true
  let ttsBuffer = ''
  let lastFlush = Date.now()
  const MIN_CHARS = 220         // yeterince metin biriksin
  const MAX_WAIT_MS = 1000      // ~1 sn
  const SENTENCE_REGEX = /([^.?!]+[.?!]+(\s+|$))/g // cümle yakalama

  // Gapless Player - Web Audio API
  const audioCtxRef = useRef(null)
  const queueRef = useRef([])
  const playHeadRef = useRef(0)

  // TTS Presetleri
  const TTS_PRESETS = {
    neutral:  { stability: 0.5, similarity: 0.9, style: 0.6 },
    warm:     { stability: 0.4, similarity: 0.9, style: 0.85 },
    corporate:{ stability: 0.6, similarity: 0.95, style: 0.4 },
  }
  let ACTIVE_PRESET = 'warm'

  // Component mount olduğunda temizlik
  useEffect(() => {
    setUserText('')
    setAssistantText('')
    setDebugInfo([])
    setFullResponseAudios([])
    setLastResponseAudio(null)
    setCurrentResponseId(null)
    addDebugInfo('Sayfa yenilendi, tüm geçmiş temizlendi', 'info')
    loadConversationHistory()
  }, [])

  // Gelişmiş debug sistemi
  const addDebugInfo = useCallback((message, type = 'info', operation = null, duration = null) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString('tr-TR')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')
    const fullTimestamp = `${timestamp}.${milliseconds}`
    
    const durationText = duration ? ` (${duration}ms)` : ''
    const operationText = operation ? `[${operation}] ` : ''
    
    setDebugInfo(prev => [...prev, { 
      message: `${operationText}${message}${durationText}`, 
      type, 
      timestamp: fullTimestamp,
      operation,
      duration
    }])
    
    // Console'a detaylı debug bilgisi yazdır
    const consoleMessage = `[${fullTimestamp}] ${operationText}${message}${durationText}`
    
    switch (type) {
      case 'error':
        console.error('🔴 VOICE PANEL ERROR:', consoleMessage)
        break
      case 'warning':
        console.warn('🟡 VOICE PANEL WARNING:', consoleMessage)
        break
      case 'success':
        console.log('🟢 VOICE PANEL SUCCESS:', consoleMessage)
        break
      case 'info':
      default:
        console.log('🔵 VOICE PANEL INFO:', consoleMessage)
        break
    }
  }, [])

  // === TTS DEMO KALİTESİ: Fonksiyonlar ===
  
  // Gapless Player - Web Audio API
  function getCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      playHeadRef.current = audioCtxRef.current.currentTime
    }
    return audioCtxRef.current
  }

  async function enqueueArrayBuffer(arrayBuffer) {
    try {
      const ctx = getCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      queueRef.current.push(audioBuffer)
      scheduleIfNeeded()
      addDebugInfo(`AudioBuffer kuyruğa eklendi: ${audioBuffer.duration.toFixed(2)}s`, 'info', 'AUDIO_QUEUE')
    } catch (error) {
      addDebugInfo(`AudioBuffer decode hatası: ${error.message}`, 'error', 'AUDIO_QUEUE')
    }
  }

  function scheduleIfNeeded() {
    const ctx = getCtx()
    while (queueRef.current.length > 0) {
      const buf = queueRef.current.shift()
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)

      const overlap = 0.06 // 60ms mini-crossfade etkisi
      const startAt = Math.max(ctx.currentTime, playHeadRef.current - overlap)
      src.start(startAt)
      playHeadRef.current = startAt + buf.duration
      
      addDebugInfo(`Gapless oynatım: ${buf.duration.toFixed(2)}s, overlap: ${overlap}s`, 'success', 'AUDIO_PLAY')
    }
  }

  // Prosodi iyileştirme - noktalama korunur
  function enhanceProsody(text) {
    let t = text

    // Üç nokta standardize
    t = t.replace(/\.{3,}/g, '…')

    // Uzun cümlelerde virgül sonrası minik durak için noktalı virgül/emdash tercih edilebilir
    t = t.replace(/, ve /g, ', ve ')
    t = t.replace(/, ama /g, ', ama ')

    // Paragraf boşluğu (iki yeni satır) korunursa TTS doğal nefes verir
    t = t.trim()

    return t
  }

  // Mikro-batch TTS gönderimi
  function pushForTTS(text) {
    const prepared = enhanceProsody(text)
    processTTS(prepared)
    if (LOG_TTS) console.debug('[TTS][SEND]', prepared)
  }

  function feedTextFromGPT(chunk) {
    if (!chunk) return
    ttsBuffer += chunk

    const enoughTime = (Date.now() - lastFlush) > MAX_WAIT_MS
    const sentences = ttsBuffer.match(SENTENCE_REGEX) || []

    // 2–3 cümleyi tek parçada gönder
    if (sentences.length >= 2 || ttsBuffer.length > MIN_CHARS || enoughTime) {
      // En fazla 3 cümle al
      const batch = sentences.slice(0, 3).join(' ').trim()

      if (batch.length > 10) {
        pushForTTS(batch)
        // buffer'dan gönderilen kısmı düş
        ttsBuffer = ttsBuffer.slice(batch.length).trimStart()
        lastFlush = Date.now()
      }
    }
  }

  // Conversation history'yi yükle
  const loadConversationHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/conversation')
      if (response.ok) {
        const data = await response.json()
        setConversationHistory(data.conversation?.messages || [])
        setCurrentConversationId(data.conversation?.id || null)
        setUserInfo(data.user)
        addDebugInfo(`Conversation history loaded: ${data.conversation?.messages?.length || 0} messages`, 'info', 'CONVERSATION')
      }
    } catch (error) {
      addDebugInfo(`Failed to load conversation history: ${error.message}`, 'error', 'CONVERSATION')
    }
  }, [addDebugInfo])

  // Yeni mesaj ekle
  const addMessageToHistory = useCallback(async (role, content) => {
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversationId,
          role,
          content
        })
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentConversationId(data.conversationId)
        
        // Local state'i güncelle
        setConversationHistory(prev => [
          ...prev,
          { role: role.toUpperCase(), content, timestamp: new Date().toISOString() }
        ])
        
        addDebugInfo(`Message added to history: ${role} - ${content.substring(0, 50)}...`, 'info', 'CONVERSATION')
      }
    } catch (error) {
      addDebugInfo(`Failed to add message to history: ${error.message}`, 'error', 'CONVERSATION')
    }
  }, [currentConversationId, addDebugInfo])

  // İşlem başlatma - süre takibi için
  const startOperation = useCallback((operationName) => {
    operationTimers.current[operationName] = Date.now()
    addDebugInfo(`${operationName} başlatıldı`, 'info', operationName)
  }, [addDebugInfo])

  // API çağrısı takibi için özel fonksiyon
  const trackAPICall = useCallback((apiName, endpoint, method = 'POST') => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    console.log(`🚀 API CALL START: [${apiName}] ${method} ${endpoint} - ${timestamp}`)
    addDebugInfo(`${apiName} API çağrısı başlatıldı: ${method} ${endpoint}`, 'info', apiName)
  }, [addDebugInfo])

  // API başarı takibi
  const trackAPISuccess = useCallback((apiName, responseData = null, duration = null) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    const dataInfo = responseData ? ` - Data: ${JSON.stringify(responseData).substring(0, 100)}...` : ''
    console.log(`✅ API SUCCESS: [${apiName}] Tamamlandı${dataInfo} - ${timestamp}`)
    addDebugInfo(`${apiName} API başarılı`, 'success', apiName, duration)
  }, [addDebugInfo])

  // API hata takibi
  const trackAPIError = useCallback((apiName, error, duration = null) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ API ERROR: [${apiName}] ${error.message || error} - ${timestamp}`)
    addDebugInfo(`${apiName} API hatası: ${error.message || error}`, 'error', apiName, duration)
  }, [addDebugInfo])

  // İşlem bitirme - süre hesaplama ile
  const endOperation = useCallback((operationName, success = true) => {
    const startTime = operationTimers.current[operationName]
    if (startTime) {
      const duration = Date.now() - startTime
      const type = success ? 'success' : 'error'
      addDebugInfo(`${operationName} tamamlandı`, type, operationName, duration)
      delete operationTimers.current[operationName]
      return duration
    }
    return 0
  }, [addDebugInfo])

  // === TTS DEMO KALİTESİ: Eski playNextAudio kaldırıldı - Web Audio API kullanılıyor ===

  // Kayıt durdurma
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    
    setIsRecording(false)
    setStatus('Hazır')
  }, [])

  // TTS işleme - ElevenLabs ile
  const processTTS = useCallback(async (text) => {
    if (!text?.trim()) return

    // TTS başlamadan önce mikrofonu tamamen durdur
    if (isRecording) {
      stopRecording()
      addDebugInfo('TTS başlıyor, mikrofon durduruldu', 'info', 'TTS')
    }
    
    // Mouse down durumunu sıfırla
    isMouseDownRef.current = false
    setIsRunning(false)

    startOperation('TTS')
    addDebugInfo(`TTS başlatıldı: "${text.trim()}"`, 'info', 'TTS')
    setStatus('Ses üretiliyor...')

    try {
      // ElevenLabs preset'i al
      const preset = voicePresets.presets['default']
      
      // API çağrısını takip et
      trackAPICall('ELEVENLABS_TTS', '/api/tts/stream', 'POST')
      console.log('📝 TTS Request Data:', {
        text: text.trim(),
        voice_settings: preset.voice_settings,
        preset_name: 'default'
      })
      
      const response = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text.trim(),
          voice_settings: preset.voice_settings
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        trackAPIError('ELEVENLABS_TTS', new Error(err))
        endOperation('TTS', false)
        return
      }

      const arrayBuffer = await response.arrayBuffer()
      
      // Web Audio API ile gapless oynatım
      await enqueueArrayBuffer(arrayBuffer)
      
      // Blob'u da kaydet (eski sistem için)
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      
      // API başarı takibi
      const duration = endOperation('TTS', true)
      trackAPISuccess('ELEVENLABS_TTS', { 
        blob_size: blob.size, 
        audio_type: 'audio/mpeg',
        text_length: text.trim().length 
      }, duration)
      
      // Yanıt ses parçalarını kaydet
      setFullResponseAudios(prev => [...prev, {
        id: `TTS_${Date.now()}`,
        text: text.trim(),
        audio: blob,
        timestamp: new Date().toISOString()
      }])
      
      setLastResponseAudio(blob)
      
    } catch (error) {
      endOperation('TTS', false)
      addDebugInfo(`TTS hatası: ${error.message}`, 'error', 'TTS')
      console.error('TTS error:', error)
    } finally {
      setStatus('Hazır')
    }
  }, [isRecording, stopRecording, startOperation, endOperation, addDebugInfo, trackAPICall, trackAPIError, trackAPISuccess, enqueueArrayBuffer])

  // Chat işleme - GPT ile
  const processChat = useCallback(async (prompt) => {
    if (!prompt.trim()) {
      addDebugInfo('Boş input, yanıt verilmiyor', 'warning')
      return
    }

    const trimmedPrompt = prompt.trim()
    if (trimmedPrompt.length < 2) {
      addDebugInfo('Çok kısa input, yanıt verilmiyor', 'warning')
      return
    }

    // AI'nin kendi yanıtlarını engelle
    const aiResponsePatterns = [
      'Merhaba, ben Selin', 'Size nasıl yardımcı olabilirim', 'Nasılsınız',
      'Şimşek Klinik', 'FUE tekniği', 'FUT tekniği', 'DHI tekniği'
    ]
    
    const isAiResponse = aiResponsePatterns.some(pattern => 
      trimmedPrompt.toLowerCase().includes(pattern.toLowerCase())
    )
    
    if (isAiResponse) {
      addDebugInfo('AI kendi yanıtını tekrar işlemeye çalışıyor, engellendi', 'warning')
      return
    }

    // Kullanıcı mesajını geçmişe ekle
    await addMessageToHistory('user', trimmedPrompt)

    // Yeni yanıt başladığında temizlik
    const responseId = Date.now().toString()
    setCurrentResponseId(responseId)
    setFullResponseAudios([])
    setLastResponseAudio(null)

    try {
      startOperation('GPT')
      addDebugInfo(`GPT başlatıldı: "${trimmedPrompt}"`, 'info', 'GPT')
      setStatus('AI yanıtı alınıyor...')
      setIsProcessing(true)
      setAssistantText('')

      const preset = voicePresets.presets[currentPreset]
      
      // Kişisel bilgileri system prompt'a ekle
      const personalInfo = userInfo ? `
KULLANICI BİLGİLERİ:
- Ad: ${userInfo.name || 'Bilinmiyor'}
- Email: ${userInfo.email || 'Bilinmiyor'}
- ID: ${userInfo.id || 'Bilinmiyor'}

Bu bilgileri kullanarak kişisel bir bağ kur ve geçmiş konuşmaları hatırla.
` : ''

      const systemPrompt = `${gptConfig.system_prompt}\n\n${personalInfo}\n\n${preset.style_instructions}\n\n${gptConfig.voice_guidelines.sentence_structure}`
      
      // Conversation history'yi messages array'ine ekle
      const historyMessages = conversationHistory.map(msg => ({
        role: msg.role.toLowerCase(),
        content: msg.content
      }))
      
      // API çağrısını takip et
      trackAPICall('OPENAI_GPT', '/api/chat/stream', 'POST')
      console.log('📝 GPT Request Data:', {
        prompt: trimmedPrompt,
        system_prompt_length: systemPrompt.length,
        history_messages: historyMessages.length,
        max_tokens: gptConfig.technical_instructions.max_tokens,
        temperature: gptConfig.technical_instructions.temperature,
        preset: currentPreset,
        user_info: userInfo
      })
      
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: trimmedPrompt,
          system_prompt: systemPrompt,
          conversation_history: historyMessages,
          max_tokens: gptConfig.technical_instructions.max_tokens,
          temperature: gptConfig.technical_instructions.temperature
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        trackAPIError('OPENAI_GPT', new Error(errorText))
        endOperation('GPT', false)
        throw new Error('Chat request failed')
      }

      // Stream okuma ve işleme
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullResponse = ''
      let sentenceBuffer = ''

      const getChunkText = (payload) => {
        try {
          const d = JSON.parse(payload)
          return d?.text ?? d?.delta?.content?.[0]?.text ?? d?.choices?.[0]?.delta?.content?.[0]?.text ?? d?.choices?.[0]?.text ?? d?.message?.content ?? ''
        } catch {
          return payload
        }
      }

      addDebugInfo('GPT stream başlatıldı', 'info', 'GPT')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          addDebugInfo('GPT stream tamamlandı', 'success', 'GPT')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()

          if (!payload || payload === '[DONE]') continue

          const chunk = getChunkText(payload)
          if (!chunk) continue

          fullResponse += chunk
          setAssistantText(fullResponse)

          // === TTS DEMO KALİTESİ: Mikro-batch Buffer ===
          feedTextFromGPT(chunk)
        }
      }

      // === TTS DEMO KALİTESİ: Son Buffer Flush ===
      if (ttsBuffer.trim() && ttsBuffer.trim().length > 5) {
        addDebugInfo(`Son TTS Flush: "${ttsBuffer.trim()}"`, 'success', 'TTS')
        pushForTTS(ttsBuffer.trim())
        ttsBuffer = '' // Buffer'ı temizle
      }

      const duration = endOperation('GPT', true)
      trackAPISuccess('OPENAI_GPT', { 
        response_length: fullResponse.length,
        response_text: fullResponse.substring(0, 100) + '...',
        total_chunks: fullResponse.split(' ').length
      }, duration)
      addDebugInfo(`GPT başarılı - ${fullResponse.length} karakter`, 'success', 'GPT', duration)
      
      // GPT yanıtını geçmişe ekle
      await addMessageToHistory('assistant', fullResponse)

    } catch (error) {
      endOperation('GPT', false)
      addDebugInfo(`GPT hatası: ${error.message}`, 'error', 'GPT')
      console.error('Chat error:', error)
      setStatus('Hata: ' + error.message)
    } finally {
      setIsProcessing(false)
      setStatus('Hazır')
    }
  }, [currentPreset, startOperation, endOperation, addDebugInfo, processTTS, trackAPICall, trackAPIError, trackAPISuccess, addMessageToHistory, conversationHistory, userInfo])

  // STT işleme - OpenAI Whisper ile
  const processSTT = useCallback(async (audioBlob) => {
    try {
      // TTS çalıyorsa STT işlemini TAMAMEN engelle
      if (isPlayingRef.current) {
        addDebugInfo('TTS çalıyor, STT işlemi engellendi', 'warning', 'STT')
        endOperation('STT', false)
        return
      }
      
      // AI konuşuyorsa STT işlemini engelle
      if (isSpeaking) {
        addDebugInfo('AI konuşuyor, STT işlemi engellendi', 'warning', 'STT')
        endOperation('STT', false)
        return
      }
      
      startOperation('STT')
      addDebugInfo(`STT başlatıldı: ${audioBlob.size} bytes`, 'info', 'STT')
      setStatus('Konuşma işleniyor...')
      
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')

      // API çağrısını takip et
      trackAPICall('OPENAI_WHISPER', '/api/stt/stream', 'POST')
      console.log('📝 STT Request Data:', {
        audio_size: audioBlob.size,
        audio_type: 'audio.webm',
        form_data_keys: Array.from(formData.keys())
      })

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.text) {
          const currentTime = Date.now()
          const timeSinceLastUserSpeech = currentTime - lastUserSpeechTime
          
          // AI konuşurken gelen sesi engelle (ekstra güvenlik)
          if (isSpeaking && timeSinceLastUserSpeech < 5000) {
            addDebugInfo('AI konuşurken gelen ses, yok sayılıyor', 'warning', 'STT')
            endOperation('STT', false)
            return
          }
          
          // TTS çalıyorsa son kontrol
          if (isPlayingRef.current) {
            addDebugInfo('TTS çalıyor, STT sonucu yok sayılıyor', 'warning', 'STT')
            endOperation('STT', false)
            return
          }
          
          const duration = endOperation('STT', true)
          trackAPISuccess('OPENAI_WHISPER', { 
            text: result.text,
            text_length: result.text.length,
            confidence: result.confidence || 'N/A'
          }, duration)
          addDebugInfo(`STT başarılı: "${result.text}"`, 'success', 'STT', duration)
          
          setUserText(result.text)
          setLastUserSpeechTime(currentTime)
          await processChat(result.text)
        } else {
          addDebugInfo('STT sonucunda metin bulunamadı', 'warning', 'STT')
          endOperation('STT', false)
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`STT API hatası: ${errorText}`, 'error', 'STT')
        endOperation('STT', false)
        setStatus('STT hatası: ' + errorText)
      }
    } catch (error) {
      endOperation('STT', false)
      addDebugInfo(`STT hatası: ${error.message}`, 'error', 'STT')
      console.error('STT error:', error)
      setStatus('Hata: ' + error.message)
    }
  }, [isSpeaking, lastUserSpeechTime, startOperation, endOperation, addDebugInfo, processChat, trackAPICall, trackAPISuccess, addMessageToHistory, conversationHistory, userInfo, currentPreset])

  // Kayıt başlatma - Web Speech API ile
  const startRecording = useCallback(async () => {
    try {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addDebugInfo('Web Speech API desteklenmiyor, MediaRecorder kullanılıyor', 'warning')
        startRecordingWithMediaRecorder()
        return
      }

      addDebugInfo('Web Speech API ile kayıt başlatılıyor', 'info', 'RECORDING')
      setStatus('Web Speech API ile dinleniyor...')
      setIsRecording(true)

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognitionRef.current = recognition
      
      recognition.lang = 'tr-TR'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (event) => {
        // TTS çalıyorsa Web Speech sonuçlarını engelle
        if (isPlayingRef.current) {
          addDebugInfo('TTS çalıyor, Web Speech sonucu engellendi', 'warning', 'RECORDING')
          return
        }
        
        // AI konuşuyorsa Web Speech sonuçlarını engelle
        if (isSpeaking) {
          addDebugInfo('AI konuşuyor, Web Speech sonucu engellendi', 'warning', 'RECORDING')
          return
        }
        
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        if (interimTranscript) {
          setUserText(interimTranscript)
        }

        if (finalTranscript) {
          // Son kontrol - TTS çalıyor mu?
          if (isPlayingRef.current || isSpeaking) {
            addDebugInfo('TTS çalıyor, Web Speech final sonucu engellendi', 'warning', 'RECORDING')
            return
          }
          
          addDebugInfo(`Web Speech sonucu: "${finalTranscript}"`, 'success', 'RECORDING')
          setUserText(finalTranscript)
          processChat(finalTranscript)
        }
      }

      recognition.onerror = (event) => {
        addDebugInfo(`Web Speech hatası: ${event.error}`, 'error', 'RECORDING')
        setStatus('Hazır')
        setIsRecording(false)
      }

      recognition.onend = () => {
        setStatus('Hazır')
        setIsRecording(false)
        recognitionRef.current = null
      }

      recognition.start()

    } catch (error) {
      addDebugInfo(`Kayıt hatası: ${error.message}`, 'error', 'RECORDING')
      setStatus('Mikrofon erişim hatası: ' + error.message)
    }
  }, [addDebugInfo, processChat])

  // MediaRecorder fallback
  const startRecordingWithMediaRecorder = useCallback(async () => {
    try {
      setStatus('Mikrofon izni alınıyor...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm'
    })

      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setStatus('OpenAI Whisper ile kayıt yapılıyor...')

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // TTS çalıyorsa MediaRecorder verilerini engelle
          if (isPlayingRef.current) {
            addDebugInfo('TTS çalıyor, MediaRecorder verisi engellendi', 'warning', 'RECORDING')
            return
          }
          
          // AI konuşuyorsa MediaRecorder verilerini engelle
          if (isSpeaking) {
            addDebugInfo('AI konuşuyor, MediaRecorder verisi engellendi', 'warning', 'RECORDING')
            return
          }
          
          addDebugInfo(`Ses verisi alındı: ${event.data.size} bytes`, 'info', 'RECORDING')
          processSTT(event.data)
        }
      }

      mediaRecorder.start(1000)

    } catch (error) {
      console.error('MediaRecorder error:', error)
      setStatus('Mikrofon erişim hatası: ' + error.message)
    }
  }, [addDebugInfo, processSTT])

  // Mouse events - hold-to-record
  const handleMouseDown = useCallback(() => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    console.log(`👆 USER ACTION: Mikrofon butonuna basıldı - ${timestamp}`)
    
    if (isProcessing || isSpeaking) {
      console.warn('⚠️ USER ACTION BLOCKED: AI konuşuyor, kayıt yapılamıyor')
      addDebugInfo('AI konuşuyor, kayıt yapılamıyor', 'warning')
      return
    }
    
    // TTS çalıyorsa kayıt başlatma
    if (isPlayingRef.current) {
      console.warn('⚠️ USER ACTION BLOCKED: TTS çalıyor, kayıt yapılamıyor')
      addDebugInfo('TTS çalıyor, kayıt yapılamıyor', 'warning')
      return
    }
    
    if (isRecording) {
      console.warn('⚠️ USER ACTION BLOCKED: Zaten kayıt yapılıyor')
      addDebugInfo('Zaten kayıt yapılıyor', 'warning')
      return
    }
    
    // TTS çalıyorsa kayıt başlatma
    if (isPlayingRef.current) {
      console.warn('⚠️ USER ACTION BLOCKED: TTS çalıyor, kayıt başlatılamıyor')
      addDebugInfo('TTS çalıyor, kayıt başlatılamıyor', 'warning')
      return
    }
    
    console.log('✅ USER ACTION SUCCESS: Kayıt başlatılıyor')
    isMouseDownRef.current = true
    setIsRunning(true)
    startRecording()
    
    // 10 saniye sonra otomatik durdur
    recordingTimeoutRef.current = setTimeout(() => {
      if (isMouseDownRef.current) {
        console.log('⏰ AUTO STOP: 10 saniye kayıt süresi doldu')
        handleMouseUp()
      }
    }, 10000)
  }, [isProcessing, isSpeaking, isRecording, startRecording, addDebugInfo])

  const handleMouseUp = useCallback(() => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    console.log(`👆 USER ACTION: Mikrofon butonu bırakıldı - ${timestamp}`)
    
    isMouseDownRef.current = false
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
    }
    
    if (isRecording) {
      console.log('✅ USER ACTION SUCCESS: Kayıt durduruluyor')
    }
    
    stopRecording()
    setIsRunning(false)
  }, [isRecording, stopRecording])

  // Test fonksiyonları
  const testWithText = useCallback(() => {
    const testText = "Merhaba, bu bir test mesajıdır. Nasılsın?"
    addDebugInfo(`Test metni: "${testText}"`, 'info', 'TEST')
    processChat(testText)
  }, [addDebugInfo, processChat])

  const testTTS = useCallback(() => {
    const testText = "ElevenLabs TTS testi: Merhaba, bu ElevenLabs ile üretilen bir ses testidir."
    addDebugInfo(`TTS Test: "${testText}"`, 'info', 'TEST')
    processTTS(testText)
  }, [addDebugInfo, processTTS])

  // Tüm verileri temizle
  const clearAll = useCallback(() => {
    setDebugInfo([])
    setUserText('')
    setAssistantText('')
    setLastResponseAudio(null)
    setFullResponseAudios([])
    setCurrentResponseId(null)
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsSpeaking(false)
    setIsReplaying(false)
    operationTimers.current = {}
  }, [])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
      {/* Başlık */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">ElevenLabs Sesli Asistan</h2>
        <p className="text-gray-600">Mikrofonla konuşun, OpenAI GPT + Whisper + ElevenLabs TTS ile yanıtlasın</p>
        <div className="mt-2 flex justify-center space-x-2 text-xs text-gray-500">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">GPT-4o</span>
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Whisper STT</span>
          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">ElevenLabs TTS</span>
        </div>
      </div>

      {/* Test Mode Toggle */}
      <div className="text-center mb-4 space-x-2">
        <button
          onClick={() => setTestMode(!testMode)}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          {testMode ? 'Canlı Kayıt Modu' : 'Test Modu (Dosya Yükle)'}
        </button>
        <button
          onClick={testWithText}
          className="px-4 py-2 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-lg transition-colors"
        >
          Metin Testi
        </button>
        <button
          onClick={testTTS}
          className="px-4 py-2 text-sm bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg transition-colors"
        >
          ElevenLabs TTS Testi
        </button>
      </div>

      {/* ElevenLabs Voice Info */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">ElevenLabs Ses Sistemi</h3>
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
          <div className="text-center">
            <div className="text-2xl mb-2">🎙️</div>
            <div className="font-medium text-gray-800">{voicePresets.presets.default.name}</div>
            <div className="text-sm text-gray-600 mt-1">{voicePresets.presets.default.description}</div>
            <div className="text-xs text-gray-500 mt-2">
              Voice ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{voicePresets.elevenlabs_config.voice_id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Button */}
      <div className="text-center mb-6">
        {testMode ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files[0]
                if (file) {
                  setStatus('Dosya işleniyor...')
                  addDebugInfo(`Dosya seçildi: ${file.name}, ${file.size} bytes`, 'info', 'FILE_UPLOAD')
                  processSTT(file)
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 shadow-lg"
            >
              📁
            </button>
            <p className="mt-2 text-sm text-gray-600">Ses dosyası yükleyin</p>
          </div>
        ) : (
          <div>
            <button
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              disabled={isProcessing || isSpeaking || isPlayingRef.current}
              className={`w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed select-none ${
                isRunning 
                  ? 'bg-red-500 hover:bg-red-600 shadow-lg' 
                  : isSpeaking
                  ? 'bg-yellow-500 shadow-lg'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg'
              }`}
            >
              {isRunning ? '■' : isSpeaking ? '🔊' : '●'}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              {isRunning ? 'Basılı tutun ve konuşun' : 'Basılı tutarak konuşun'}
            </p>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="text-center mb-4">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isRecording ? 'bg-red-100 text-red-800' :
          isProcessing ? 'bg-yellow-100 text-yellow-800' :
          isSpeaking ? 'bg-green-100 text-green-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isRecording ? 'bg-red-500 animate-pulse' :
            isProcessing ? 'bg-yellow-500 animate-pulse' :
            isSpeaking ? 'bg-green-500 animate-pulse' :
            'bg-gray-500'
          }`}></div>
          {status}
        </div>
      </div>

      {/* Text Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Text */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Kullanıcı (OpenAI Whisper)
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm leading-relaxed">
              {userText || 'Konuşmanız OpenAI Whisper ile burada görünecek...'}
            </p>
          </div>
        </div>

        {/* Assistant Text */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Asistan (OpenAI GPT-4o)
            </h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm leading-relaxed">
              {assistantText || 'OpenAI GPT yanıtı burada görünecek...'}
            </p>
          </div>
        </div>
      </div>

      {/* Debug Panel - Kompakt İşlem Takibi */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri - İşlem Takibi</h3>
          <div className="space-x-2">
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              Tümünü Temizle
            </button>
            <button
              onClick={() => setDebugInfo([])}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              Debug Temizle
            </button>
          </div>
        </div>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono max-h-60 overflow-y-auto">
          {debugInfo.length === 0 ? (
            <div className="text-gray-500">Debug bilgileri burada görünecek...</div>
          ) : (
            debugInfo.map((info, index) => (
              <div key={index} className={`mb-1 py-1 px-2 rounded ${
                info.type === 'error' ? 'text-red-400 bg-red-900/20' :
                info.type === 'success' ? 'text-green-400 bg-green-900/20' :
                info.type === 'warning' ? 'text-yellow-400 bg-yellow-900/20' :
                'text-blue-400 bg-blue-900/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500 text-xs">[{info.timestamp}]</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    info.type === 'error' ? 'bg-red-500/20 text-red-300' :
                    info.type === 'success' ? 'bg-green-500/20 text-green-300' :
                    info.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-blue-500/20 text-blue-300'
                  }`}>
                      {info.operation || 'INFO'}
                    </span>
                    <span className="font-medium">{info.message}</span>
                  </div>
                  {info.duration && (
                    <span className="text-gray-300 text-xs font-mono bg-black/30 px-2 py-0.5 rounded">
                      {info.duration}ms
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500">
          Mikrofon butonunu basılı tutarak konuşun, bıraktığınızda AI yanıtlayacak
        </p>
      </div>
    </div>
  )
}
