'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import gptConfig from '@/config/gpt-config.json'
import voicePresets from '@/config/voice-presets.json'

export default function RealtimeVoicePanel() {
  // Ana durum yönetimi
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentPreset, setCurrentPreset] = useState('default')
  const [conversationHistory, setConversationHistory] = useState([])
  const [debugInfo, setDebugInfo] = useState([])
  const [lastUserSpeechTime, setLastUserSpeechTime] = useState(0)
  const [currentConversationId, setCurrentConversationId] = useState(null)
  const [userInfo, setUserInfo] = useState(null)

  // WebRTC referansları
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const operationTimers = useRef({}) // İşlem sürelerini takip etmek için

  // Gelişmiş debug sistemi - işlem sürelerini detaylı takip eder
  const addDebugInfo = useCallback((message, type = 'info', operation = null, duration = null) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString('tr-TR')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')
    const fullTimestamp = `${timestamp}.${milliseconds}`
    
    // İşlem süresi bilgisi varsa ekle
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
        console.error('🔴 REALTIME VOICE PANEL ERROR:', consoleMessage)
        break
      case 'warning':
        console.warn('🟡 REALTIME VOICE PANEL WARNING:', consoleMessage)
        break
      case 'success':
        console.log('🟢 REALTIME VOICE PANEL SUCCESS:', consoleMessage)
        break
      case 'info':
      default:
        console.log('🔵 REALTIME VOICE PANEL INFO:', consoleMessage)
        break
    }
  }, [])

  // Conversation history'yi yükle
  const loadConversationHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/conversation')
      if (response.ok) {
        const data = await response.json()
        setConversationHistory(data.conversation?.messages || [])
        setCurrentConversationId(data.conversation?.id || null)
        setUserInfo(data.user)
        addDebugInfo(`Realtime conversation history loaded: ${data.conversation?.messages?.length || 0} messages`, 'info', 'CONVERSATION')
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
        
        addDebugInfo(`Realtime message added to history: ${role} - ${content.substring(0, 50)}...`, 'info', 'CONVERSATION')
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
    console.log(`🚀 REALTIME API CALL START: [${apiName}] ${method} ${endpoint} - ${timestamp}`)
    addDebugInfo(`${apiName} API çağrısı başlatıldı: ${method} ${endpoint}`, 'info', apiName)
  }, [addDebugInfo])

  // API başarı takibi
  const trackAPISuccess = useCallback((apiName, responseData = null, duration = null) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    const dataInfo = responseData ? ` - Data: ${JSON.stringify(responseData).substring(0, 100)}...` : ''
    console.log(`✅ REALTIME API SUCCESS: [${apiName}] Tamamlandı${dataInfo} - ${timestamp}`)
    addDebugInfo(`${apiName} API başarılı`, 'success', apiName, duration)
  }, [addDebugInfo])

  // API hata takibi
  const trackAPIError = useCallback((apiName, error, duration = null) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ REALTIME API ERROR: [${apiName}] ${error.message || error} - ${timestamp}`)
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

  // Basit bağlantı başlatma (WebRTC olmadan)
  const initializeConnection = useCallback(async () => {
    try {
      startOperation('CONNECTION')
      addDebugInfo('Bağlantı başlatılıyor...', 'info', 'CONNECTION')

      // Mikrofon erişimini test et
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // Test için hemen kapat
      stream.getTracks().forEach(track => track.stop())
      
      const duration = endOperation('CONNECTION', true)
      addDebugInfo('Mikrofon erişimi test edildi', 'success', 'CONNECTION', duration)
      setIsConnected(true)
      addDebugInfo('Sistem hazır', 'success', 'CONNECTION')

    } catch (error) {
      endOperation('CONNECTION', false)
      addDebugInfo(`Bağlantı hatası: ${error.message}`, 'error', 'CONNECTION')
    }
  }, [startOperation, endOperation, addDebugInfo])

  // Uzak komutları işleme
  const handleRemoteCommand = useCallback((command) => {
    addDebugInfo(`Uzak komut alındı: ${command.type}`, 'info', 'REMOTE_COMMAND')
    
    switch (command.type) {
      case 'start_speaking':
        setIsSpeaking(true)
        break
      case 'stop_speaking':
        setIsSpeaking(false)
        break
      case 'change_preset':
        setCurrentPreset(command.preset)
        break
      case 'system_message':
        addDebugInfo(`Sistem mesajı: ${command.message}`, 'info', 'REMOTE_COMMAND')
        break
      default:
        addDebugInfo(`Bilinmeyen komut: ${command.type}`, 'warning', 'REMOTE_COMMAND')
    }
  }, [addDebugInfo])

  // Realtime ses işleme
  const processRealtimeAudio = useCallback(async (audioBlob) => {
    try {
      startOperation('STT')
      addDebugInfo(`Realtime ses işleme başlatıldı: ${audioBlob.size} bytes`, 'info', 'STT')

      // OpenAI Whisper ile işleme
      const formData = new FormData()
      formData.append('audio', audioBlob, 'realtime-audio.webm')

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.text && result.text.trim()) {
          const currentTime = Date.now()
          const timeSinceLastUserSpeech = currentTime - lastUserSpeechTime
          
          // AI konuşurken gelen sesi engelle
          if (isSpeaking && timeSinceLastUserSpeech < 5000) {
            addDebugInfo('AI konuşurken gelen ses, yok sayılıyor', 'warning', 'STT')
            endOperation('STT', false)
            return
          }
          
          // Konuşma geçmişine ekleme
          setConversationHistory(prev => [...prev, {
            type: 'user',
            text: result.text,
            timestamp: new Date().toISOString()
          }])
          
          setLastUserSpeechTime(currentTime)

          // GPT ile işleme
          await processRealtimeChat(result.text)
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`STT hatası: ${errorText}`, 'error', 'STT')
      }

      const duration = endOperation('STT', true)
      addDebugInfo(`STT başarılı: "${result.text}"`, 'success', 'STT', duration)

    } catch (error) {
      endOperation('STT', false)
      addDebugInfo(`Realtime ses işleme hatası: ${error.message}`, 'error', 'STT')
    }
  }, [isSpeaking, lastUserSpeechTime, startOperation, endOperation, addDebugInfo])

  // Realtime chat işleme
  const processRealtimeChat = useCallback(async (userMessage) => {
    try {
      // Input validation
      if (!userMessage.trim()) {
        addDebugInfo('Boş input, yanıt verilmiyor', 'warning', 'GPT')
        return
      }

      const trimmedMessage = userMessage.trim()
      if (trimmedMessage.length < 2) {
        addDebugInfo('Çok kısa input, yanıt verilmiyor', 'warning', 'GPT')
        return
      }

      // AI'nin kendi yanıtlarını engelle
      const aiResponsePatterns = [
        'Merhaba, ben Selin', 'Size nasıl yardımcı olabilirim', 'Nasılsınız',
        'Saç Ekimi Merkezi', 'FUE tekniği', 'FUT tekniği', 'DHI tekniği'
      ]
      
      const isAiResponse = aiResponsePatterns.some(pattern =>
        trimmedMessage.toLowerCase().includes(pattern.toLowerCase())
      )
      
      if (isAiResponse) {
        addDebugInfo('AI kendi yanıtını tekrar işlemeye çalışıyor, engellendi', 'warning', 'GPT')
        return
      }

      // Kullanıcı mesajını geçmişe ekle
      await addMessageToHistory('user', trimmedMessage)

      startOperation('GPT')
      addDebugInfo(`Realtime chat başlatıldı: "${trimmedMessage}"`, 'info', 'GPT')

      // ElevenLabs default preset'i al
      const preset = voicePresets.presets['default']
      
      // Kişisel bilgileri system prompt'a ekle
      const personalInfo = userInfo ? `
KULLANICI BİLGİLERİ:
- Ad: ${userInfo.name || 'Bilinmiyor'}
- Email: ${userInfo.email || 'Bilinmiyor'}
- ID: ${userInfo.id || 'Bilinmiyor'}

Bu bilgileri kullanarak kişisel bir bağ kur ve geçmiş konuşmaları hatırla.
` : ''

      // GPT config'i preset ile birleştir
      const systemPrompt = `${gptConfig.system_prompt}\n\n${personalInfo}\n\n${preset.style_instructions}\n\n${gptConfig.voice_guidelines.sentence_structure}`
      
      // Conversation history'yi messages array'ine ekle
      const historyMessages = conversationHistory.map(msg => ({
        role: msg.role.toLowerCase(),
        content: msg.content
      }))

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: trimmedMessage,
          system_prompt: systemPrompt,
          conversation_history: historyMessages,
          max_tokens: gptConfig.technical_instructions.max_tokens,
          temperature: gptConfig.technical_instructions.temperature
        })
      })

      if (response.ok) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullResponse = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (!payload || payload === '[DONE]') continue

            try {
              const data = JSON.parse(payload)
              const chunk = data.text || ''
              if (chunk) {
                fullResponse += chunk
              }
            } catch (e) {
              // JSON parse hatası, devam et
            }
          }
        }

        if (fullResponse.trim()) {
          addDebugInfo(`AI yanıtı: "${fullResponse.trim()}"`, 'success', 'GPT')
          
          // Konuşma geçmişine ekleme
          setConversationHistory(prev => [...prev, {
            type: 'assistant',
            text: fullResponse.trim(),
            timestamp: new Date().toISOString()
          }])

          // TTS ile seslendirme
          await processRealtimeTTS(fullResponse.trim(), preset)
        }
      }

      const duration = endOperation('GPT', true)
      addDebugInfo(`GPT başarılı - ${fullResponse.length} karakter`, 'success', 'GPT', duration)
      
      // GPT yanıtını geçmişe ekle
      await addMessageToHistory('assistant', fullResponse)

    } catch (error) {
      endOperation('GPT', false)
      addDebugInfo(`Realtime chat hatası: ${error.message}`, 'error', 'GPT')
    }
  }, [startOperation, endOperation, addDebugInfo, addMessageToHistory, conversationHistory, userInfo])

  // Realtime TTS işleme
  const processRealtimeTTS = useCallback(async (text, preset) => {
    try {
      // TTS başlamadan önce mikrofonu tamamen durdur
      if (isRecording) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
          mediaRecorderRef.current = null
        }
        
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
        }
        
        setIsRecording(false)
        addDebugInfo('TTS başlıyor, mikrofon durduruldu', 'info', 'TTS')
      }

      // Kullanıcı metnini koruma altına al
      const originalUserText = userText
      setUserText('AI konuşuyor... (Mikrofon devre dışı)')

      startOperation('TTS')
      addDebugInfo(`Realtime ElevenLabs TTS başlatıldı: "${text}"`, 'info', 'TTS')

      const response = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice_settings: preset.voice_settings
        })
      })

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
        
        // Ses kuyruğuna ekleme
        audioQueueRef.current.push(audioBlob)
        
        // Eğer çalmıyorsa başlat
        if (!isPlayingRef.current) {
          playNextAudio()
        }

        const duration = endOperation('TTS', true)
        addDebugInfo(`TTS başarılı: ${audioBlob.size} bytes`, 'success', 'TTS', duration)
        
        // Kullanıcı metnini geri yükle
        setUserText(originalUserText)
      }

    } catch (error) {
      endOperation('TTS', false)
      addDebugInfo(`Realtime TTS hatası: ${error.message}`, 'error', 'TTS')
      
      // Hata durumunda da kullanıcı metnini geri yükle
      setUserText(originalUserText)
    }
  }, [startOperation, endOperation, addDebugInfo, userText])

  // Ses çalma kuyruğu - pürüzsüz geçişlerle
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
      isPlayingRef.current = true
      setIsSpeaking(true)
      
      // AI konuşurken mikrofonu TAMAMEN durdur
      if (isRecording) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
          mediaRecorderRef.current = null
        }
        
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
        }
        
        setIsRecording(false)
        addDebugInfo('AI konuşuyor, mikrofon durduruldu', 'info', 'AUDIO_PLAY')
      }
      
      // TTS çalarken mikrofonu FİZİKSEL olarak kapat (ekstra güvenlik)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
        addDebugInfo('TTS çalarken MediaRecorder kapatıldı', 'info')
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
        addDebugInfo('TTS çalarken local stream kapatıldı', 'info')
      }

      const audioBlob = audioQueueRef.current.shift()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      // Ses kalitesi optimizasyonları
      audio.volume = 0.9 // Optimum ses seviyesi
      audio.preload = 'auto' // Önceden yükleme

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        // Pürüzsüz geçiş için çok kısa bekleme (10ms)
        setTimeout(() => {
          playNextAudio()
        }, 10)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        playNextAudio()
      }

      audio.play().catch(console.error)
    }
  }, [isRecording, addDebugInfo])

  // Kayıt başlatma/durdurma
  const toggleRecording = useCallback(async () => {
    const timestamp = new Date().toLocaleTimeString('tr-TR')
    
    if (isRecording) {
      // Kayıt durdur
      console.log(`👆 REALTIME USER ACTION: Kayıt durduruluyor - ${timestamp}`)
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      
      setIsRecording(false)
      addDebugInfo('Kayıt durduruldu', 'info', 'RECORDING')
    } else {
      console.log(`👆 REALTIME USER ACTION: Kayıt başlatılmaya çalışılıyor - ${timestamp}`)
      // AI konuşuyorsa kayıt yapma
      if (isSpeaking) {
        console.warn('⚠️ REALTIME USER ACTION BLOCKED: AI konuşuyor, kayıt yapılamıyor')
        addDebugInfo('AI konuşuyor, kayıt yapılamıyor', 'warning', 'RECORDING')
        return
      }
      
      // TTS çalıyorsa kayıt başlatma
      if (isPlayingRef.current) {
        console.warn('⚠️ REALTIME USER ACTION BLOCKED: TTS çalıyor, kayıt yapılamıyor')
        addDebugInfo('TTS çalıyor, kayıt yapılamıyor', 'warning', 'RECORDING')
        return
      }
      
      // Kayıt başlat
      try {
        console.log('✅ REALTIME USER ACTION SUCCESS: Kayıt başlatılıyor')
        startOperation('RECORDING')
        addDebugInfo('Kayıt başlatılıyor...', 'info', 'RECORDING')
        
        // Mikrofon erişimi
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })

        localStreamRef.current = stream
        addDebugInfo('Mikrofon erişimi başarılı', 'success', 'RECORDING')

        // MediaRecorder oluştur
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        })
        
        addDebugInfo(`MediaRecorder formatı: audio/webm`, 'info', 'RECORDING')

        mediaRecorderRef.current = mediaRecorder
        setIsRecording(true)
        addDebugInfo('Kayıt başlatıldı', 'success', 'RECORDING')

        // Ses verisi geldiğinde işle
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            addDebugInfo(`Ses verisi alındı: ${event.data.size} bytes`, 'info', 'RECORDING')
            await processRealtimeAudio(event.data)
          }
        }

        // Kayıt hatalarını yakala
        mediaRecorder.onerror = (event) => {
          addDebugInfo(`Kayıt hatası: ${event.error}`, 'error', 'RECORDING')
          setIsRecording(false)
        }

        // Kayıt başlat (1 saniyede bir chunk)
        mediaRecorder.start(1000)

        const duration = endOperation('RECORDING', true)
        addDebugInfo(`Kayıt başarılı`, 'success', 'RECORDING', duration)

      } catch (error) {
        endOperation('RECORDING', false)
        addDebugInfo(`Kayıt başlatma hatası: ${error.message}`, 'error', 'RECORDING')
        console.error('Recording error:', error)
      }
    }
  }, [isRecording, isSpeaking, startOperation, endOperation, addDebugInfo, processRealtimeAudio])

  // Bağlantıyı kapatma
  const disconnect = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    setIsConnected(false)
    setIsRecording(false)
    setIsSpeaking(false)
    addDebugInfo('Bağlantı kapatıldı', 'info', 'CONNECTION')
  }, [addDebugInfo])

  // Component mount olduğunda bağlantıyı başlat
  useEffect(() => {
    setDebugInfo([])
    addDebugInfo('Realtime Voice Panel başlatıldı', 'info', 'SYSTEM')
    loadConversationHistory()
  }, [])
    
    initializeConnection()
    
    return () => {
      disconnect()
    }
  }, [initializeConnection, disconnect, addDebugInfo])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
      {/* Başlık */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Realtime AI Asistan</h2>
        <p className="text-gray-600">WebRTC ile gerçek zamanlı sesli konuşma</p>
        <div className="mt-2 flex justify-center space-x-2 text-xs text-gray-500">
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">WebRTC</span>
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Realtime STT</span>
          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">Smart TTS</span>
        </div>
      </div>

      {/* Bağlantı Durumu */}
      <div className="text-center mb-4">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          {isConnected ? 'Bağlı' : 'Bağlantı Yok'}
        </div>
      </div>

      {/* ElevenLabs Voice Info */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">ElevenLabs Ses Sistemi</h3>
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

      {/* Kontrol Butonları */}
      <div className="text-center mb-6">
        <button
          onClick={toggleRecording}
          disabled={!isConnected || isProcessing || isSpeaking || isPlayingRef.current}
          className={`w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 shadow-lg' 
              : isSpeaking
              ? 'bg-yellow-500 shadow-lg'
              : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg'
          }`}
        >
          {isRecording ? '■' : isSpeaking ? '🔊' : '●'}
        </button>
        <p className="mt-2 text-sm text-gray-600">
          {isRecording ? 'Kayıt yapılıyor...' : 'Kayıt başlat'}
        </p>
      </div>

      {/* Durum Göstergeleri */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'
          }`}></div>
          <div className="text-xs text-gray-600">Kayıt</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${
            isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'
          }`}></div>
          <div className="text-xs text-gray-600">İşleme</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${
            isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}></div>
          <div className="text-xs text-gray-600">Konuşma</div>
        </div>
      </div>

      {/* Konuşma Geçmişi */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Konuşma Geçmişi</h3>
        <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
          {conversationHistory.length === 0 ? (
            <div className="text-gray-500 text-sm">Henüz konuşma yok...</div>
          ) : (
            conversationHistory.map((message, index) => (
              <div key={index} className={`mb-2 p-2 rounded ${
                message.type === 'user' 
                  ? 'bg-blue-100 text-blue-800 ml-4' 
                  : 'bg-green-100 text-green-800 mr-4'
              }`}>
                <div className="text-xs text-gray-500 mb-1">
                  {message.type === 'user' ? 'Sen' : 'AI'} - {new Date(message.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-sm">{message.text}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Debug Bilgileri - Kompakt İşlem Takibi */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri - İşlem Takibi</h3>
          <button
            onClick={() => setDebugInfo([])}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            Temizle
          </button>
        </div>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono max-h-32 overflow-y-auto">
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

      {/* Bağlantı Kontrolü */}
      <div className="text-center">
        <button
          onClick={isConnected ? disconnect : initializeConnection}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isConnected 
              ? 'bg-red-100 text-red-800 hover:bg-red-200' 
              : 'bg-green-100 text-green-800 hover:bg-green-200'
          }`}
        >
          {isConnected ? 'Bağlantıyı Kes' : 'Bağlan'}
        </button>
      </div>
    </div>
  )
}