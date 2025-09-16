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
  const [currentPreset, setCurrentPreset] = useState(voicePresets.default_preset)
  const [conversationHistory, setConversationHistory] = useState([])
  const [debugInfo, setDebugInfo] = useState([])
  const [processSteps, setProcessSteps] = useState([])

  // WebRTC referansları
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)

  // Debug ve log yönetimi
  const addDebugInfo = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev, { message, type, timestamp }])
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`)
  }, [])

  // İşlem adımlarını takip etme
  const addProcessStep = useCallback((step, status = 'pending') => {
    setProcessSteps(prev => [...prev, { step, status, timestamp: new Date().toLocaleTimeString() }])
  }, [])

  const updateProcessStep = useCallback((step, status) => {
    setProcessSteps(prev => prev.map(s => s.step === step ? { ...s, status } : s))
  }, [])

  // Basit bağlantı başlatma (WebRTC olmadan)
  const initializeConnection = useCallback(async () => {
    try {
      addDebugInfo('Bağlantı başlatılıyor...', 'info')
      addProcessStep('Bağlantı: Sistem hazırlanıyor', 'in_progress')

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
      
      addDebugInfo('Mikrofon erişimi test edildi', 'success')
      updateProcessStep('Bağlantı: Sistem hazırlanıyor', 'completed')
      setIsConnected(true)
      addDebugInfo('Sistem hazır', 'success')

    } catch (error) {
      addDebugInfo(`Bağlantı hatası: ${error.message}`, 'error')
      updateProcessStep('Bağlantı: Sistem hazırlanıyor', 'error')
    }
  }, [addDebugInfo, addProcessStep, updateProcessStep])

  // Uzak komutları işleme
  const handleRemoteCommand = useCallback((command) => {
    addDebugInfo(`Uzak komut alındı: ${command.type}`, 'info')
    
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
        addDebugInfo(`Sistem mesajı: ${command.message}`, 'info')
        break
      default:
        addDebugInfo(`Bilinmeyen komut: ${command.type}`, 'warning')
    }
  }, [addDebugInfo])

  // Realtime ses işleme
  const processRealtimeAudio = useCallback(async (audioBlob) => {
    try {
      addProcessStep('STT: Realtime ses işleniyor', 'in_progress')
      addDebugInfo(`Realtime ses işleme başlatılıyor: ${audioBlob.size} bytes`, 'info')

      // OpenAI Whisper ile işleme
      const formData = new FormData()
      formData.append('audio', audioBlob, 'realtime-audio.webm')

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        addDebugInfo(`STT sonucu: "${result.text}"`, 'success')
        
        if (result.text && result.text.trim()) {
          // Konuşma geçmişine ekleme
          setConversationHistory(prev => [...prev, {
            type: 'user',
            text: result.text,
            timestamp: new Date().toISOString()
          }])

          // GPT ile işleme
          await processRealtimeChat(result.text)
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`STT hatası: ${errorText}`, 'error')
      }

      updateProcessStep('STT: Realtime ses işleniyor', 'completed')

    } catch (error) {
      addDebugInfo(`Realtime ses işleme hatası: ${error.message}`, 'error')
      updateProcessStep('STT: Realtime ses işleniyor', 'error')
    }
  }, [addDebugInfo, addProcessStep, updateProcessStep])


  // Realtime chat işleme
  const processRealtimeChat = useCallback(async (userMessage) => {
    try {
      addProcessStep('Chat: Realtime AI yanıtı', 'in_progress')
      addDebugInfo(`Realtime chat başlatılıyor: "${userMessage}"`, 'info')

      // Mevcut preset'i al
      const preset = voicePresets.presets[currentPreset]
      
      // GPT config'i preset ile birleştir
      const systemPrompt = `${gptConfig.system_prompt}\n\n${preset.style_instructions}\n\n${gptConfig.voice_guidelines.sentence_structure}`

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMessage,
          system_prompt: systemPrompt,
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
          addDebugInfo(`AI yanıtı: "${fullResponse.trim()}"`, 'success')
          
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

      updateProcessStep('Chat: Realtime AI yanıtı', 'completed')

    } catch (error) {
      addDebugInfo(`Realtime chat hatası: ${error.message}`, 'error')
      updateProcessStep('Chat: Realtime AI yanıtı', 'error')
    }
  }, [currentPreset, addDebugInfo, addProcessStep, updateProcessStep])

  // Realtime TTS işleme
  const processRealtimeTTS = useCallback(async (text, preset) => {
    try {
      addProcessStep('TTS: Realtime ses üretimi', 'in_progress')
      addDebugInfo(`Realtime TTS başlatılıyor: "${text}"`, 'info')

      const response = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: preset.openai_voice,
          model: 'tts-1',
          speed: preset.speed
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

        addDebugInfo(`TTS başarılı: ${audioBlob.size} bytes`, 'success')
      }

      updateProcessStep('TTS: Realtime ses üretimi', 'completed')

    } catch (error) {
      addDebugInfo(`Realtime TTS hatası: ${error.message}`, 'error')
      updateProcessStep('TTS: Realtime TTS hatası', 'error')
    }
  }, [addDebugInfo, addProcessStep, updateProcessStep])

  // Ses çalma kuyruğu
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
      isPlayingRef.current = true
      setIsSpeaking(true)

      const audioBlob = audioQueueRef.current.shift()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        // Bir sonraki sesi çal
        setTimeout(() => {
          playNextAudio()
        }, 100)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        playNextAudio()
      }

      audio.play().catch(console.error)
    }
  }, [])

  // Kayıt başlatma/durdurma
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Kayıt durdur
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      
      setIsRecording(false)
      addDebugInfo('Kayıt durduruldu', 'info')
    } else {
      // Kayıt başlat
      try {
        addDebugInfo('Kayıt başlatılıyor...', 'info')
        addProcessStep('Kayıt: Mikrofon erişimi', 'in_progress')
        
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
        addDebugInfo('Mikrofon erişimi başarılı', 'success')
        updateProcessStep('Kayıt: Mikrofon erişimi', 'completed')

        // MediaRecorder oluştur - WebM formatı kullan (OpenAI destekliyor)
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        })
        
        addDebugInfo(`MediaRecorder formatı: audio/webm`, 'info')

        mediaRecorderRef.current = mediaRecorder
        setIsRecording(true)
        addDebugInfo('Kayıt başlatıldı', 'success')

        // Ses verisi geldiğinde işle
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            addDebugInfo(`Ses verisi alındı: ${event.data.size} bytes`, 'info')
            addProcessStep('STT: Ses işleniyor', 'in_progress')
            await processRealtimeAudio(event.data)
          }
        }

        // Kayıt hatalarını yakala
        mediaRecorder.onerror = (event) => {
          addDebugInfo(`Kayıt hatası: ${event.error}`, 'error')
          setIsRecording(false)
        }

        // Kayıt başlat (1 saniyede bir chunk)
        mediaRecorder.start(1000)

      } catch (error) {
        addDebugInfo(`Kayıt başlatma hatası: ${error.message}`, 'error')
        updateProcessStep('Kayıt: Mikrofon erişimi', 'error')
        console.error('Recording error:', error)
      }
    }
  }, [isRecording, addDebugInfo, addProcessStep, updateProcessStep])

  // Preset değiştirme
  const changePreset = useCallback((presetName) => {
    setCurrentPreset(presetName)
    addDebugInfo(`Preset değiştirildi: ${presetName}`, 'info')
    
    // DataChannel ile uzak tarafa bildir
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({
        type: 'change_preset',
        preset: presetName
      }))
    }
  }, [addDebugInfo])

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
    addDebugInfo('Bağlantı kapatıldı', 'info')
  }, [addDebugInfo])

  // Component mount olduğunda bağlantıyı başlat
  useEffect(() => {
    initializeConnection()
    
    return () => {
      disconnect()
    }
  }, [initializeConnection, disconnect])

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

      {/* Preset Seçimi */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Ses Stili</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(voicePresets.presets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => changePreset(key)}
              className={`p-3 rounded-lg text-sm font-medium transition-all ${
                currentPreset === key
                  ? 'bg-indigo-100 text-indigo-800 border-2 border-indigo-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              <div className="text-lg mb-1">{voicePresets.emotion_indicators[preset.emotion]}</div>
              <div>{preset.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Kontrol Butonları */}
      <div className="text-center mb-6">
        <button
          onClick={toggleRecording}
          disabled={!isConnected || isProcessing}
          className={`w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 shadow-lg' 
              : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg'
          }`}
        >
          {isRecording ? '■' : '●'}
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

      {/* İşlem Adımları */}
      {processSteps.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">İşlem Adımları</h3>
          <div className="space-y-2">
            {processSteps.map((step, index) => (
              <div key={index} className="flex items-center p-2 bg-gray-50 rounded-lg">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center mr-3 ${
                  step.status === 'completed' ? 'bg-green-500' :
                  step.status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                  step.status === 'error' ? 'bg-red-500' :
                  'bg-gray-400'
                }`}>
                  {step.status === 'completed' ? (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.status === 'in_progress' ? (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  ) : step.status === 'error' ? (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-900">{step.step}</div>
                  <div className="text-xs text-gray-500">{step.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug Bilgileri */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri</h3>
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
              <div key={index} className={`mb-1 ${
                info.type === 'error' ? 'text-red-400' :
                info.type === 'success' ? 'text-green-400' :
                info.type === 'warning' ? 'text-yellow-400' :
                'text-blue-400'
              }`}>
                <span className="text-gray-500">[{info.timestamp}]</span> {info.message}
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
