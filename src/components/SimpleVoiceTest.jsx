'use client'

import { useState, useRef, useCallback } from 'react'

export default function SimpleVoiceTest() {
  const [isRecording, setIsRecording] = useState(false)
  const [debugInfo, setDebugInfo] = useState([])
  const [userText, setUserText] = useState('')
  const [assistantText, setAssistantText] = useState('')

  const mediaRecorderRef = useRef(null)
  const localStreamRef = useRef(null)

  // Debug logging
  const addDebugInfo = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev, { message, type, timestamp }])
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`)
  }, [])

  // Kayıt başlatma
  const startRecording = useCallback(async () => {
    try {
      addDebugInfo('Kayıt başlatılıyor...', 'info')
      
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
          await processAudio(event.data)
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
      console.error('Recording error:', error)
    }
  }, [addDebugInfo])

  // Kayıt durdurma
  const stopRecording = useCallback(() => {
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
  }, [addDebugInfo])

  // Ses işleme
  const processAudio = useCallback(async (audioBlob) => {
    try {
      addDebugInfo('Ses işleniyor...', 'info')
      
      // OpenAI Whisper ile işleme
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        addDebugInfo(`STT sonucu: "${result.text}"`, 'success')
        
        if (result.text && result.text.trim()) {
          setUserText(result.text)
          await processChat(result.text)
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`STT hatası: ${errorText}`, 'error')
      }

    } catch (error) {
      addDebugInfo(`Ses işleme hatası: ${error.message}`, 'error')
      console.error('Audio processing error:', error)
    }
  }, [addDebugInfo])

  // Chat işleme
  const processChat = useCallback(async (userMessage) => {
    try {
      addDebugInfo(`Chat başlatılıyor: "${userMessage}"`, 'info')
      
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage })
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
                setAssistantText(fullResponse)
              }
            } catch (e) {
              // JSON parse hatası, devam et
            }
          }
        }

        if (fullResponse.trim()) {
          addDebugInfo(`AI yanıtı: "${fullResponse.trim()}"`, 'success')
          await processTTS(fullResponse.trim())
        }
      }

    } catch (error) {
      addDebugInfo(`Chat hatası: ${error.message}`, 'error')
      console.error('Chat error:', error)
    }
  }, [addDebugInfo])

  // TTS işleme
  const processTTS = useCallback(async (text) => {
    try {
      addDebugInfo(`TTS başlatılıyor: "${text}"`, 'info')
      
      const response = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: 'alloy',
          model: 'tts-1'
        })
      })

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
        
        // Ses çal
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
        }
        
        audio.play().catch(console.error)
        addDebugInfo(`TTS başarılı: ${audioBlob.size} bytes`, 'success')
      }

    } catch (error) {
      addDebugInfo(`TTS hatası: ${error.message}`, 'error')
      console.error('TTS error:', error)
    }
  }, [addDebugInfo])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Basit Ses Testi</h2>
        <p className="text-gray-600">Mikrofonla konuş, AI yanıtlasın</p>
      </div>

      {/* Kontrol Butonu */}
      <div className="text-center mb-6">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 ${
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

      {/* Durum */}
      <div className="text-center mb-4">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isRecording ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
          }`}></div>
          {isRecording ? 'Kayıt Yapılıyor' : 'Hazır'}
        </div>
      </div>

      {/* Metin Alanları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Kullanıcı</h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm">
              {userText || 'Konuşmanız burada görünecek...'}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Asistan</h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm">
              {assistantText || 'AI yanıtı burada görünecek...'}
            </p>
          </div>
        </div>
      </div>

      {/* Debug Bilgileri */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri</h3>
          <button
            onClick={() => setDebugInfo([])}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            Temizle
          </button>
        </div>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono max-h-40 overflow-y-auto">
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
    </div>
  )
}
