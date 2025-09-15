'use client'

import { useState, useRef, useEffect } from 'react'

export default function VoicePanel() {
  const [isRunning, setIsRunning] = useState(false)
  const [userText, setUserText] = useState('')
  const [assistantText, setAssistantText] = useState('')
  const [status, setStatus] = useState('Hazır')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [debugInfo, setDebugInfo] = useState([])
  const [currentStep, setCurrentStep] = useState('')

  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const fileInputRef = useRef(null)

  // Debug logging
  const addDebugInfo = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev, { message, type, timestamp }])
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`)
  }

  // Audio playback queue
  const playNextAudio = () => {
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
        playNextAudio() // Play next in queue
      }
      
      audio.onerror = () => {
        isPlayingRef.current = false
        setIsSpeaking(false)
        playNextAudio()
      }
      
      audio.play().catch(console.error)
    }
  }

  // Process TTS using Gemini API + Web Speech API


function enqueuePlay(url) {
  audioQueueRef.current = audioQueueRef.current.then(
    () =>
      new Promise((resolve) => {
        const a = new Audio(url);
        a.onended = resolve;
        a.onerror = resolve;
        a.play().catch(resolve);
      })
  );
}

async function processTTS(text) {
  if (!text?.trim()) return;

  try {
    setCurrentStep('TTS: Ses üretiliyor...');
    addDebugInfo(`TTS başlatılıyor: "${text.trim()}"`, 'info');
    setStatus('Ses üretiliyor...');

    const res = await fetch('/api/tts/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });

    addDebugInfo(`TTS API yanıtı: ${res.status}`, res.ok ? 'success' : 'error');
    if (!res.ok) {
      const err = await res.text();
      addDebugInfo(`TTS API hatası: ${err}`, 'error');
      return;
    }

    // MP3 binary al → kuyruğa ekle → sıradaki sesi çal
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    audioQueueRef.current.push(blob);
    playNextAudio();
  } catch (e) {
    addDebugInfo(`TTS error: ${e.message}`, 'error');
    console.error('TTS error:', e);
  } finally {
    setStatus('Hazır');
  }
}



  // Process chat completion
  // 👇 VoicePanel.jsx — processChat (tam sürüm)
const processChat = async (prompt) => {
  if (!prompt.trim()) return;

  try {
    setCurrentStep('Chat: AI yanıtı alınıyor...');
    addDebugInfo(`Chat başlatılıyor: "${prompt.trim()}"`, 'info');
    setStatus('AI yanıtı alınıyor...');
    setIsProcessing(true);
    setAssistantText('');

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() })
    });

    addDebugInfo(`Chat API yanıtı: ${response.status}`, response.ok ? 'success' : 'error');

    if (!response.ok) {
      const errorText = await response.text();
      addDebugInfo(`Chat hatası: ${errorText}`, 'error');
      throw new Error('Chat request failed');
    }

    // ----- SSE okuma -----
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentSentence = '';

    // Yardımcı: payload içinden metni çıkar
    const getChunkText = (payload) => {
      try {
        const d = JSON.parse(payload);
        return (
          d?.text ??
          d?.delta?.content?.[0]?.text ??
          d?.choices?.[0]?.delta?.content?.[0]?.text ??
          d?.choices?.[0]?.text ??
          d?.message?.content ??
          ''
        );
      } catch {
        // JSON değilse olduğu gibi kullan
        return payload;
      }
    };

    addDebugInfo('Chat stream başlatıldı', 'info');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        addDebugInfo('Chat stream tamamlandı', 'success');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();

        // SSE final satırı
        if (!payload || payload === '[DONE]') continue;

        // Metin parçasını çıkar
        const chunk = getChunkText(payload);
        if (!chunk) continue;

        addDebugInfo(`Chat token alındı: "${chunk}"`, 'info');

        currentSentence += chunk;
        setAssistantText(prev => prev + chunk);

        // Cümle bitti mi?
        const endsSentence = /[.!?…]([”"’')\]]|\s|$)/.test(chunk.trim());
        if (endsSentence || currentSentence.length > 80) {
          const sentence = currentSentence.trim();
          if (sentence) {
            addDebugInfo(`Cümle tamamlandı: "${sentence}"`, 'success');
            processTTS(sentence);       // ✅ TTS'ye artık temiz metin gidiyor
            currentSentence = '';
          }
        }
      }
    }

    // Kalan metin
    if (currentSentence.trim()) {
      addDebugInfo(`Kalan metin işleniyor: "${currentSentence.trim()}"`, 'info');
      processTTS(currentSentence.trim());
    }

  } catch (error) {
    addDebugInfo(`Chat error: ${error.message}`, 'error');
    console.error('Chat error:', error);
    setStatus('Hata: ' + error.message);
  } finally {
    setIsProcessing(false);
    setCurrentStep('');
    setStatus('Hazır');
  }
};

  // Process STT
  const processSTT = async (audioBlob) => {
    try {
      setCurrentStep('STT: Konuşma işleniyor...')
      addDebugInfo(`STT başlatılıyor: ${audioBlob.size} bytes, ${audioBlob.type}`, 'info')
      setStatus('Konuşma işleniyor...')
      
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.wav')

      addDebugInfo('STT API çağrısı yapılıyor...', 'info')

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      addDebugInfo(`STT API yanıtı: ${response.status}`, response.ok ? 'success' : 'error')

      if (response.ok) {
        const result = await response.json()
        addDebugInfo(`STT sonucu: ${JSON.stringify(result)}`, 'success')
        
        if (result.text) {
          addDebugInfo(`Metin alındı: "${result.text}"`, 'success')
          setUserText(result.text)
          await processChat(result.text)
        } else {
          addDebugInfo('STT sonucunda metin bulunamadı', 'warning')
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`STT hatası: ${errorText}`, 'error')
        setStatus('STT hatası: ' + errorText)
      }
    } catch (error) {
      addDebugInfo(`STT error: ${error.message}`, 'error')
      console.error('STT error:', error)
      setStatus('Hata: ' + error.message)
    }
  }

  // Start recording with Web Speech API
  const startRecording = async () => {
    try {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addDebugInfo('Web Speech API desteklenmiyor, MediaRecorder kullanılıyor', 'warning')
        startRecordingWithMediaRecorder()
        return
      }

      addDebugInfo('Web Speech API ile kayıt başlatılıyor...', 'info')
      setStatus('Web Speech API ile dinleniyor...')
      setIsRecording(true)

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.lang = 'tr-TR'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (event) => {
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
          addDebugInfo(`Interim: "${interimTranscript}"`, 'info')
        }

        if (finalTranscript) {
          addDebugInfo(`Final: "${finalTranscript}"`, 'success')
          setUserText(finalTranscript)
          processChat(finalTranscript)
        }
      }

      recognition.onerror = (event) => {
        addDebugInfo(`Web Speech hatası: ${event.error}`, 'error')
        setStatus('Hazır')
        setIsRecording(false)
      }

      recognition.onend = () => {
        setStatus('Hazır')
        setIsRecording(false)
      }

      recognition.start()

    } catch (error) {
      addDebugInfo(`Recording error: ${error.message}`, 'error')
      setStatus('Mikrofon erişim hatası: ' + error.message)
    }
  }

  // Fallback to MediaRecorder if Web Speech API not available
  const startRecordingWithMediaRecorder = async () => {
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
        mimeType: 'audio/webm;codecs=opus'
      })

      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setStatus('Kayıt yapılıyor...')

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          processSTT(event.data)
        }
      }

      mediaRecorder.start(1000)

    } catch (error) {
      console.error('Recording error:', error)
      setStatus('Mikrofon erişim hatası: ' + error.message)
    }
  }

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
    }
    setIsRecording(false)
    setStatus('Hazır')
  }

  // Test with file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (file) {
      setStatus('Dosya işleniyor...')
      addDebugInfo(`Dosya seçildi: ${file.name}, ${file.size} bytes, ${file.type}`, 'info')
      await processSTT(file)
    }
  }

  // Test with simple text (bypass STT)
  const testWithText = () => {
    const testText = "Merhaba, bu bir test mesajıdır. Nasılsın?"
    addDebugInfo(`Test metni: "${testText}"`, 'info')
    setUserText(testText)
    processChat(testText)
  }

  // Test with Web Speech API (browser's built-in STT)
  const testWebSpeech = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addDebugInfo('Web Speech API desteklenmiyor', 'error')
      return
    }

    addDebugInfo('Web Speech API başlatılıyor...', 'info')
    setStatus('Web Speech API ile dinleniyor...')

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.lang = 'tr-TR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      addDebugInfo(`Web Speech sonucu: "${transcript}"`, 'success')
      setUserText(transcript)
      processChat(transcript)
    }

    recognition.onerror = (event) => {
      addDebugInfo(`Web Speech hatası: ${event.error}`, 'error')
      setStatus('Hazır')
    }

    recognition.onend = () => {
      setStatus('Hazır')
    }

    recognition.start()
  }

  // Start/Stop voice interaction
  const toggleVoice = () => {
    if (isRunning) {
      // Stop everything
      stopRecording()
      audioQueueRef.current = []
      isPlayingRef.current = false
      setIsSpeaking(false)
      setIsProcessing(false)
      setUserText('')
      setAssistantText('')
      setStatus('Hazır')
      setIsRunning(false)
    } else {
      // Start everything
      setIsRunning(true)
      startRecording()
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sesli Asistan</h2>
        <p className="text-gray-600">Mikrofonla konuşun, AI yanıtlasın</p>
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
          onClick={testWebSpeech}
          className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-colors"
        >
          Web Speech Testi
        </button>
      </div>

      {/* Control Button */}
      <div className="text-center mb-6">
        {testMode ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 shadow-lg"
            >
              📁
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Ses dosyası yükleyin
            </p>
          </div>
        ) : (
          <div>
            <button
              onClick={toggleVoice}
              disabled={isProcessing}
              className={`w-24 h-24 rounded-full text-white font-bold text-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                isRunning 
                  ? 'bg-red-500 hover:bg-red-600 shadow-lg' 
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg'
              }`}
            >
              {isRunning ? '■' : '●'}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              {isRunning ? 'Durdurmak için tıklayın' : 'Başlatmak için tıklayın'}
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
            <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Kullanıcı (STT)
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm leading-relaxed">
              {userText || 'Konuşmanız burada görünecek...'}
            </p>
          </div>
        </div>

        {/* Assistant Text */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Asistan (GPT)
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm leading-relaxed">
              {assistantText || 'AI yanıtı burada görünecek...'}
            </p>
          </div>
        </div>
      </div>

      {/* Current Step */}
      {currentStep && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-sm text-blue-800 font-medium">{currentStep}</span>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri</h3>
          <button
            onClick={() => setDebugInfo([])}
            className="text-xs text-gray-500 hover:text-gray-700"
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

      {/* Instructions */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500">
          Mikrofon izni verin, konuşun ve AI'nın sesli yanıtını dinleyin
        </p>
      </div>
    </div>
  )
}

