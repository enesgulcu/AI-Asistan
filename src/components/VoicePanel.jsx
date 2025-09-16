'use client'

import { useState, useRef, useEffect } from 'react'
import gptConfig from '@/config/gpt-config.json'
import voicePresets from '@/config/voice-presets.json'

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
  const [processSteps, setProcessSteps] = useState([])
  const [currentPreset, setCurrentPreset] = useState('default')
  const [lastResponseAudio, setLastResponseAudio] = useState(null) // Son yanıtın ses dosyası
  const [isReplaying, setIsReplaying] = useState(false) // Tekrar çalma durumu
  const [fullResponseAudios, setFullResponseAudios] = useState([]) // Tüm yanıtın ses parçaları
  const [currentResponseId, setCurrentResponseId] = useState(null) // Mevcut yanıt ID'si
  const [lastUserSpeechTime, setLastUserSpeechTime] = useState(0) // Son kullanıcı konuşma zamanı

  const mediaRecorderRef = useRef(null)

  // Sayfa yenilendiğinde tüm geçmişi temizle
  useEffect(() => {
    // Component mount olduğunda tüm state'leri temizle
    setUserText('')
    setAssistantText('')
    setDebugInfo([])
    setProcessSteps([])
    setFullResponseAudios([])
    setLastResponseAudio(null)
    setCurrentResponseId(null)
    addDebugInfo('Sayfa yenilendi, tüm geçmiş temizlendi', 'info')
  }, []) // Sadece component mount olduğunda çalış
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const fileInputRef = useRef(null)
  const recordingTimeoutRef = useRef(null)
  const isMouseDownRef = useRef(false)

  // Debug logging
  const addDebugInfo = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev, { message, type, timestamp }])
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`)
  }

  // Zaman damgası ile detaylı debug bilgisi
  const addDetailedDebugInfo = (message, type = 'info', details = {}) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString('tr-TR')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')
    const fullTimestamp = `${timestamp}.${milliseconds}`
    
    setDebugInfo(prev => [...prev, { 
      message, 
      type, 
      timestamp: fullTimestamp,
      details 
    }])
  }

  // Process steps tracking
  const addProcessStep = (step, status = 'pending') => {
    setProcessSteps(prev => [...prev, { step, status, timestamp: new Date().toLocaleTimeString() }])
  }

  const updateProcessStep = (step, status) => {
    setProcessSteps(prev => prev.map(s => s.step === step ? { ...s, status } : s))
  }

  // Audio playback queue - Sequential playback (no overlap)
  const playNextAudio = () => {
    if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
      const playStartTime = Date.now()
      const audioId = `AUDIO_${playStartTime}_${Math.random().toString(36).substr(2, 9)}`
      
      isPlayingRef.current = true
      setIsSpeaking(true)
      
      // AI konuşurken mikrofonu tamamen durdur ve kayıt yapmayı engelle
      if (isRecording) {
        stopRecording()
        addDebugInfo('AI konuşuyor, mikrofon durduruldu', 'info')
      }
      
      // Mouse down durumunu da sıfırla
      isMouseDownRef.current = false
      setIsRunning(false)
      
      const audioBlob = audioQueueRef.current.shift()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      addDetailedDebugInfo(`🔊 SES ÇALMA BAŞLADI`, 'info', {
        audioId,
        fileSize: `${audioBlob.size} bytes`,
        queueRemaining: audioQueueRef.current.length,
        startTime: new Date().toISOString()
      });
      
      audio.onended = () => {
        const playEndTime = Date.now()
        const playDuration = playEndTime - playStartTime
        
        addDetailedDebugInfo(`🔊 SES ÇALMA TAMAMLANDI`, 'success', {
          audioId,
          playDuration: `${playDuration}ms`,
          queueRemaining: audioQueueRef.current.length
        });
        
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        
        // Hemen bir sonraki sesi çal (kesintisiz geçiş)
        setTimeout(() => {
          playNextAudio()
        }, 50)
      }
      
      audio.onerror = (error) => {
        const playEndTime = Date.now()
        const playDuration = playEndTime - playStartTime
        
        addDetailedDebugInfo(`❌ SES ÇALMA HATASI`, 'error', {
          audioId,
          error: error.message || 'Unknown error',
          playDuration: `${playDuration}ms`
        });
        
        URL.revokeObjectURL(audioUrl)
        isPlayingRef.current = false
        setIsSpeaking(false)
        playNextAudio()
      }
      
      audio.play().catch((error) => {
        addDetailedDebugInfo(`❌ SES OYNATMA HATASI: ${error.message}`, 'error', {
          audioId,
          error: error.message
        });
      });
    }
  }

  // Process TTS - Fixed order issue with detailed timing
  async function processTTS(text) {
    if (!text?.trim()) return;

    const startTime = Date.now()
    const ttsId = `TTS_${startTime}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      setCurrentStep('TTS: Ses üretiliyor...');
      addDetailedDebugInfo(`🎵 TTS BAŞLATILDI: "${text.trim()}"`, 'info', {
        ttsId,
        textLength: text.trim().length,
        preset: currentPreset,
        startTime: new Date().toISOString()
      });
      addProcessStep('TTS: Ses üretiliyor', 'in_progress');
      setStatus('Ses üretiliyor...');

      // ElevenLabs preset'i al
      const preset = voicePresets.presets['default'] // Sadece default preset kullanıyoruz
      
      const apiStartTime = Date.now()
      addDetailedDebugInfo(`📡 ELEVENLABS API ÇAĞRISI BAŞLADI`, 'info', {
        ttsId,
        voice_id: preset.elevenlabs_voice_id,
        voice_settings: preset.voice_settings,
        provider: 'ElevenLabs'
      });
      
      const res = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text.trim(),
          voice_settings: preset.voice_settings
        }),
      });

      const apiEndTime = Date.now()
      const apiDuration = apiEndTime - apiStartTime
      
      addDetailedDebugInfo(`📡 API ÇAĞRISI TAMAMLANDI: ${res.status}`, res.ok ? 'success' : 'error', {
        ttsId,
        apiDuration: `${apiDuration}ms`,
        status: res.status
      });
      
      if (!res.ok) {
        const err = await res.text();
        addDetailedDebugInfo(`❌ API HATASI: ${err}`, 'error', {
          ttsId,
          error: err,
          apiDuration: `${apiDuration}ms`
        });
        updateProcessStep('TTS: Ses üretiliyor', 'error');
        return;
      }

      const bufferStartTime = Date.now()
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const bufferEndTime = Date.now()
      const bufferDuration = bufferEndTime - bufferStartTime
      
      // Sıraya ekle ve çal
      audioQueueRef.current.push(blob);
      playNextAudio();
      
      // Tüm yanıtın ses parçalarını kaydet (tekrar çalma için)
      setFullResponseAudios(prev => [...prev, {
        id: ttsId,
        text: text.trim(),
        audio: blob,
        timestamp: new Date().toISOString()
      }]);
      
      // Son yanıtın ses dosyasını da kaydet (geriye uyumluluk için)
      setLastResponseAudio(blob);
      
      const totalDuration = Date.now() - startTime
      
      addDetailedDebugInfo(`✅ TTS TAMAMLANDI: ${blob.size} bytes - SIRAYA EKLENDİ`, 'success', {
        ttsId,
        fileSize: `${blob.size} bytes`,
        apiDuration: `${apiDuration}ms`,
        bufferDuration: `${bufferDuration}ms`,
        totalDuration: `${totalDuration}ms`,
        queuePosition: audioQueueRef.current.length
      });
      
      updateProcessStep('TTS: Ses üretiliyor', 'completed');
    } catch (e) {
      const totalDuration = Date.now() - startTime
      addDetailedDebugInfo(`❌ TTS HATASI: ${e.message}`, 'error', {
        ttsId,
        error: e.message,
        totalDuration: `${totalDuration}ms`
      });
      updateProcessStep('TTS: Ses üretiliyor', 'error');
      console.error('OpenAI TTS error:', e);
    } finally {
      setStatus('Hazır');
    }
  }

  // Process chat completion - Fixed TTS order
  const processChat = async (prompt) => {
    if (!prompt.trim()) {
      addDebugInfo('Boş input, yanıt verilmiyor', 'warning');
      return;
    }

    // Input validation - sadece gerçek kullanıcı input'u kabul et
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 2) {
      addDebugInfo('Çok kısa input, yanıt verilmiyor', 'warning');
      return;
    }

    // AI'nin kendi yanıtlarını tekrar işlemesini engelle
    const aiResponsePatterns = [
      'Merhaba, ben Selin',
      'Size nasıl yardımcı olabilirim',
      'Nasılsınız',
      'Saç Ekimi Merkezi',
      'FUE tekniği',
      'FUT tekniği',
      'DHI tekniği',
      'Sapphire FUE',
      'foliküler ünite',
      'saç ekimi konusunda',
      'deneyimliyiz',
      'başarı hikayesi',
      'kliniğe yönlendir',
      'randevu almak',
      'endüşelenmeyin',
      'güven verici'
    ];
    
    const isAiResponse = aiResponsePatterns.some(pattern => 
      trimmedPrompt.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isAiResponse) {
      addDebugInfo('AI kendi yanıtını tekrar işlemeye çalışıyor, engellendi', 'warning');
      return;
    }

    // Yeni yanıt başladığında önceki ses parçalarını temizle
    const responseId = Date.now().toString()
    setCurrentResponseId(responseId)
    setFullResponseAudios([])
    setLastResponseAudio(null)

    try {
      setCurrentStep('Chat: AI yanıtı alınıyor...');
      addDebugInfo(`Chat başlatılıyor: "${prompt.trim()}"`, 'info');
      addProcessStep('Chat: AI yanıtı alınıyor', 'in_progress');
      setStatus('AI yanıtı alınıyor...');
      setIsProcessing(true);
      setAssistantText('');

      // Mevcut preset'i al
      const preset = voicePresets.presets[currentPreset]
      
      // GPT config'i preset ile birleştir
      const systemPrompt = `${gptConfig.system_prompt}\n\n${preset.style_instructions}\n\n${gptConfig.voice_guidelines.sentence_structure}`
      
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          system_prompt: systemPrompt,
          max_tokens: gptConfig.technical_instructions.max_tokens,
          temperature: gptConfig.technical_instructions.temperature
        })
      });

      addDebugInfo(`Chat API yanıtı: ${response.status}`, response.ok ? 'success' : 'error');

      if (!response.ok) {
        const errorText = await response.text();
        addDebugInfo(`Chat hatası: ${errorText}`, 'error');
        updateProcessStep('Chat: AI yanıtı alınıyor', 'error');
        throw new Error('Chat request failed');
      }

      // Read stream and collect full response - REALTIME STREAMING
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let sentenceBuffer = '';

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
          return payload;
        }
      };

      addDebugInfo('Chat stream başlatıldı - REALTIME MODE', 'info');

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

          if (!payload || payload === '[DONE]') continue;

          const chunk = getChunkText(payload);
          if (!chunk) continue;

          addDebugInfo(`Chat token alındı: "${chunk}"`, 'info');
          fullResponse += chunk;
          setAssistantText(fullResponse);

          // REALTIME: Her kelimeyi işle
          sentenceBuffer += chunk;
          
          // Yöntem 1: Sadece noktalama işaretlerinde böl (en güvenli)
          if (/[.!?]\s/.test(sentenceBuffer)) {
            const sentences = sentenceBuffer.split(/([.!?]\s)/);
            let completeSentence = '';
            
            for (let i = 0; i < sentences.length - 1; i += 2) {
              if (sentences[i] && sentences[i + 1]) {
                completeSentence = sentences[i].trim() + sentences[i + 1];
                if (completeSentence && completeSentence.length > 10) { // En az 10 karakter
                  // Hemen TTS'ye gönder
                  addDebugInfo(`Realtime TTS: "${completeSentence}"`, 'success');
                  updateProcessStep('Chat: AI yanıtı alınıyor', 'completed');
                  addProcessStep('TTS: Ses üretiliyor', 'pending');
                  await processTTS(completeSentence);
                }
              }
            }
            
            // Kalan kısmı buffer'da tut
            sentenceBuffer = sentences[sentences.length - 1] || '';
          }
          
          // Yöntem 2: Çok uzun cümlelerde (150+ karakter) son virgülden böl
          else if (sentenceBuffer.length > 150 && sentenceBuffer.includes(',')) {
            const lastCommaIndex = sentenceBuffer.lastIndexOf(',');
            if (lastCommaIndex > sentenceBuffer.length * 0.8) { // Son %20'de ise
              const firstPart = sentenceBuffer.substring(0, lastCommaIndex + 1).trim();
              const remainingPart = sentenceBuffer.substring(lastCommaIndex + 1).trim();
              
              if (firstPart.length > 30) {
                addDebugInfo(`Uzun cümle TTS: "${firstPart}"`, 'success');
                await processTTS(firstPart);
                sentenceBuffer = remainingPart;
              }
            }
          }
          
          // Yöntem 3: Çok çok uzun cümlelerde (200+ karakter) orta noktadan böl
          else if (sentenceBuffer.length > 200) {
            const midPoint = Math.floor(sentenceBuffer.length / 2);
            const spaceIndex = sentenceBuffer.indexOf(' ', midPoint);
            
            if (spaceIndex > midPoint - 20 && spaceIndex < midPoint + 20) {
              const firstPart = sentenceBuffer.substring(0, spaceIndex).trim();
              const remainingPart = sentenceBuffer.substring(spaceIndex).trim();
              
              if (firstPart.length > 50) {
                addDebugInfo(`Çok uzun cümle TTS: "${firstPart}"`, 'success');
                await processTTS(firstPart);
                sentenceBuffer = remainingPart;
              }
            }
          }
        }
      }

      // Kalan buffer'ı da akıllı işle
      if (sentenceBuffer.trim() && sentenceBuffer.trim().length > 5) {
        addDebugInfo(`Son TTS: "${sentenceBuffer.trim()}"`, 'success');
        await processTTS(sentenceBuffer.trim());
      } else if (sentenceBuffer.trim()) {
        // Çok kısa kalan kısım varsa bir sonraki yanıtla birleştir
        addDebugInfo(`Kısa buffer bekletiliyor: "${sentenceBuffer.trim()}"`, 'info');
      }

    } catch (error) {
      addDebugInfo(`Chat error: ${error.message}`, 'error');
      updateProcessStep('Chat: AI yanıtı alınıyor', 'error');
      console.error('Chat error:', error);
      setStatus('Hata: ' + error.message);
    } finally {
      setIsProcessing(false);
      setCurrentStep('');
      setStatus('Hazır');
    }
  };

  // Process STT with OpenAI Whisper
  const processSTT = async (audioBlob) => {
    try {
      setCurrentStep('STT: OpenAI Whisper ile konuşma işleniyor...');
      addDebugInfo(`OpenAI Whisper STT başlatılıyor: ${audioBlob.size} bytes, ${audioBlob.type}`, 'info');
      addProcessStep('STT: Konuşma işleniyor', 'in_progress');
      setStatus('Konuşma işleniyor...');
      
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')

      addDebugInfo('OpenAI Whisper API çağrısı yapılıyor...', 'info')

      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        body: formData
      })

      addDebugInfo(`OpenAI Whisper API yanıtı: ${response.status}`, response.ok ? 'success' : 'error')

      if (response.ok) {
        const result = await response.json()
        addDebugInfo(`OpenAI Whisper sonucu: ${JSON.stringify(result)}`, 'success')
        
        if (result.text) {
          const currentTime = Date.now()
          const timeSinceLastUserSpeech = currentTime - lastUserSpeechTime
          
          // Eğer AI konuşuyorsa ve son kullanıcı konuşmasından 5 saniye geçmemişse, bu muhtemelen AI'nin kendi sesi
          if (isSpeaking && timeSinceLastUserSpeech < 5000) {
            addDebugInfo('AI konuşurken gelen ses, muhtemelen AI\'nin kendi sesi - yok sayılıyor', 'warning')
            updateProcessStep('STT: Konuşma işleniyor', 'cancelled');
            return
          }
          
          addDebugInfo(`Metin alındı: "${result.text}"`, 'success')
          setUserText(result.text)
          setLastUserSpeechTime(currentTime)
          updateProcessStep('STT: Konuşma işleniyor', 'completed');
          addProcessStep('Chat: AI yanıtı alınıyor', 'pending');
          await processChat(result.text)
        } else {
          addDebugInfo('OpenAI Whisper sonucunda metin bulunamadı', 'warning')
          updateProcessStep('STT: Konuşma işleniyor', 'error');
        }
      } else {
        const errorText = await response.text()
        addDebugInfo(`OpenAI Whisper hatası: ${errorText}`, 'error')
        updateProcessStep('STT: Konuşma işleniyor', 'error');
        setStatus('STT hatası: ' + errorText)
      }
    } catch (error) {
      addDebugInfo(`OpenAI Whisper error: ${error.message}`, 'error')
      updateProcessStep('STT: Konuşma işleniyor', 'error');
      console.error('OpenAI Whisper error:', error)
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

  // Fallback to MediaRecorder
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
      mimeType: 'audio/webm'
    })

      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setStatus('OpenAI Whisper ile kayıt yapılıyor...')

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          addDebugInfo(`MediaRecorder data: ${event.data.size} bytes`, 'info')
          processSTT(event.data)
        }
      }

      mediaRecorder.start(1000)

    } catch (error) {
      console.error('MediaRecorder error:', error)
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

  // Mouse events for hold-to-record
  const handleMouseDown = () => {
    if (isProcessing || isSpeaking) {
      addDebugInfo('AI konuşuyor, kayıt yapılamıyor', 'warning')
      return;
    }
    
    // Eğer zaten kayıt yapılıyorsa, yeni kayıt başlatma
    if (isRecording) {
      addDebugInfo('Zaten kayıt yapılıyor', 'warning')
      return;
    }
    
    isMouseDownRef.current = true;
    setIsRunning(true);
    startRecording();
    
    // Auto-stop after 10 seconds if no speech detected
    recordingTimeoutRef.current = setTimeout(() => {
      if (isMouseDownRef.current) {
        handleMouseUp();
      }
    }, 10000);
  }

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    stopRecording();
    setIsRunning(false);
  }

  // Test functions
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (file) {
      setStatus('Dosya işleniyor...')
      addDebugInfo(`Dosya seçildi: ${file.name}, ${file.size} bytes, ${file.type}`, 'info')
      await processSTT(file)
    }
  }

  const testWithText = () => {
    const testText = "Merhaba, bu bir test mesajıdır. Nasılsın?"
    addDebugInfo(`Test metni: "${testText}"`, 'info')
    // setUserText çağrılmıyor - sadece AI'ye gönder
    processChat(testText)
  }

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
      // setUserText çağrılmıyor - sadece AI'ye gönder
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

  const testTTS = () => {
    const testText = "OpenAI TTS testi: Merhaba, bu OpenAI TTS ile üretilen bir ses testidir."
    addDebugInfo(`OpenAI TTS Test: "${testText}"`, 'info')
    // setUserText çağrılmıyor - sadece TTS testi
    processTTS(testText)
  }

  // Tekrar çalma fonksiyonu - Tüm yanıtı sırayla çal
  const replayLastResponse = () => {
    if (fullResponseAudios.length === 0) {
      addDebugInfo('Tekrar çalınacak ses dosyası bulunamadı', 'warning')
      return
    }

    setIsReplaying(true)
    addDebugInfo(`Tüm yanıt tekrar çalınıyor... (${fullResponseAudios.length} parça)`, 'info')
    
    // Tüm ses parçalarını sırayla çal
    let currentIndex = 0
    
    const playNextPart = () => {
      if (currentIndex >= fullResponseAudios.length) {
        setIsReplaying(false)
        addDebugInfo('Tüm yanıt tekrar çalma tamamlandı', 'success')
        return
      }
      
      const audioPart = fullResponseAudios[currentIndex]
      const audioUrl = URL.createObjectURL(audioPart.audio)
      const audio = new Audio(audioUrl)
      
      addDebugInfo(`Parça ${currentIndex + 1}/${fullResponseAudios.length}: "${audioPart.text}"`, 'info')
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        currentIndex++
        // Hemen bir sonraki parçayı çal (kesintisiz geçiş)
        setTimeout(playNextPart, 50)
      }
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        addDebugInfo(`Parça ${currentIndex + 1} çalma hatası`, 'error')
        currentIndex++
        setTimeout(playNextPart, 50)
      }
      
      audio.play().catch((error) => {
        addDebugInfo(`Parça ${currentIndex + 1} oynatma hatası: ${error.message}`, 'error')
        currentIndex++
        setTimeout(playNextPart, 50)
      })
    }
    
    playNextPart()
  }

  // Clear all data
  const clearAll = () => {
    setDebugInfo([])
    setProcessSteps([])
    setUserText('')
    setAssistantText('')
    setLastResponseAudio(null)
    setFullResponseAudios([])
    setCurrentResponseId(null)
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsSpeaking(false)
    setIsReplaying(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
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
          onClick={testWebSpeech}
          className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg transition-colors"
        >
          Web Speech Testi
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
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              disabled={isProcessing || isSpeaking}
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

      {/* Process Steps - New Beautiful Debug Panel */}

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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Asistan (OpenAI GPT-4o)
            </h3>
            {fullResponseAudios.length > 0 && (
              <button
                onClick={replayLastResponse}
                disabled={isReplaying || isSpeaking}
                className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  isReplaying || isSpeaking
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
                }`}
              >
                {isReplaying ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Çalıyor...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Tekrar Çal ({fullResponseAudios.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border">
            <p className="text-gray-800 text-sm leading-relaxed">
              {assistantText || 'OpenAI GPT yanıtı burada görünecek...'}
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

      {/* Process Steps - Scrollable */}
      {processSteps.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            İşlem Adımları
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto border">
            <div className="space-y-2">
              {processSteps.map((step, index) => (
                <div key={index} className="flex items-center p-3 bg-white rounded-lg border shadow-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                    step.status === 'completed' ? 'bg-green-500' :
                    step.status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                    step.status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`}>
                    {step.status === 'completed' ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : step.status === 'in_progress' ? (
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                    ) : step.status === 'error' ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{step.step}</div>
                    <div className="text-xs text-gray-500">{step.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Debug Bilgileri</h3>
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
              <div key={index} className={`mb-2 p-2 rounded border-l-2 ${
                info.type === 'error' ? 'text-red-400 border-red-500 bg-red-900/20' :
                info.type === 'success' ? 'text-green-400 border-green-500 bg-green-900/20' :
                info.type === 'warning' ? 'text-yellow-400 border-yellow-500 bg-yellow-900/20' :
                'text-blue-400 border-blue-500 bg-blue-900/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-gray-500 text-xs mb-1">[{info.timestamp}]</div>
                    <div className="font-medium">{info.message}</div>
                    {info.details && (
                      <div className="mt-2 text-xs text-gray-300 bg-black/30 p-2 rounded border">
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(info.details).map(([key, value]) => (
                            <div key={key} className="flex">
                              <span className="text-gray-400 font-mono">{key}:</span>
                              <span className="ml-1 text-white font-medium">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                    info.type === 'error' ? 'bg-red-500/20 text-red-300' :
                    info.type === 'success' ? 'bg-green-500/20 text-green-300' :
                    info.type === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-blue-500/20 text-blue-300'
                  }`}>
                    {info.type.toUpperCase()}
                  </div>
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