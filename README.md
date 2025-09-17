# 🤖 AI Asistan - Realtime Sesli AI Asistan

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-15.5.3-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19.1.0-blue?style=for-the-badge&logo=react)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-green?style=for-the-badge&logo=openai)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-TTS-purple?style=for-the-badge)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-green?style=for-the-badge&logo=mongodb)

**Gerçek zamanlı sesli konuşma yapabilen, saç ekimi merkezi temsilcisi "Selin" karakteri ile çalışan profesyonel AI asistan uygulaması**

[🚀 Demo](#-demo) • [📋 Özellikler](#-özellikler) • [🛠️ Kurulum](#️-kurulum) • [📖 Kullanım](#-kullanım) • [🔧 API](#-api)

</div>

---

## 🎯 Proje Hakkında

**AI Asistan**, modern web teknolojileri ile yapay zekayı birleştiren, gerçek zamanlı sesli konuşma yapabilen profesyonel bir uygulamadır. Özellikle müşteri hizmetleri ve telefon karşılama senaryoları için optimize edilmiştir.

### 🎭 Selin Karakteri
- **Rol**: Saç Ekimi Merkezi telefon temsilcisi
- **Kişilik**: Sıcak, samimi, profesyonel
- **Uzmanlık**: FUE, FUT, DHI, Sapphire FUE teknikleri
- **Dil**: Türkçe (optimize edilmiş)

---

## ✨ Özellikler

### 🎤 **Realtime Ses Sistemi**
- **Hold-to-record** mikrofon kontrolü
- **WebRTC** ile düşük gecikme
- **Akıllı ses kuyruğu** sistemi
- **Kesintisiz ses çalma**

### 🤖 **AI Entegrasyonu**
- **OpenAI GPT-4o** - Akıllı konuşma
- **OpenAI Whisper** - Türkçe STT
- **ElevenLabs TTS** - Doğal ses üretimi
- **Streaming responses** - Anlık yanıtlar

### 🎨 **Modern UI/UX**
- **Responsive tasarım** - Mobil uyumlu
- **Gradient arayüz** - Modern görünüm
- **Debug paneli** - Detaylı log sistemi
- **Test modları** - Farklı test seçenekleri

### 🔐 **Güvenlik**
- **NextAuth.js** - JWT authentication
- **MongoDB** - Güvenli veri saklama
- **Bcrypt** - Şifre hashleme
- **Middleware** - Route koruması

---

## 🛠️ Teknoloji Yığını

### **Frontend**
- **Next.js 15.5.3** (App Router)
- **React 19.1.0**
- **Tailwind CSS** (styling)
- **Formik + Yup** (form validation)

### **Backend & AI**
- **OpenAI GPT-4o** (chat completions)
- **OpenAI Whisper** (speech-to-text)
- **ElevenLabs TTS** (text-to-speech)
- **NextAuth.js** (authentication)
- **Prisma** (database ORM)
- **MongoDB** (database)

### **Ses Teknolojileri**
- **WebRTC** (realtime audio)
- **MediaRecorder API** (audio recording)
- **Web Speech API** (fallback STT)

---

## 🚀 Kurulum

### 1. **Projeyi Klonlayın**
```bash
git clone https://github.com/your-username/ai-asistan.git
cd ai-asistan
```

### 2. **Bağımlılıkları Yükleyin**
```bash
npm install
# veya
yarn install
```

### 3. **Environment Variables Ayarlayın**
`.env.local` dosyası oluşturun:
```env
# OpenAI API Key (Zorunlu)
OPENAI_API_KEY=sk-your-openai-api-key-here

# ElevenLabs API Key (Zorunlu)
ELEVENLABS_API_KEY=your-elevenlabs-api-key-here

# Database
DATABASE_URL=your-mongodb-connection-string

# NextAuth
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### 4. **Veritabanını Hazırlayın**
```bash
# Prisma generate
npm run prisma:generate

# Database push
npm run prisma:push
```

### 5. **Uygulamayı Başlatın**
```bash
npm run dev
# veya
yarn dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde çalışacaktır.

---

## 📖 Kullanım

### 🎯 **Temel Kullanım**

1. **Hesap Oluşturun** - `/register` sayfasından kayıt olun
2. **Giriş Yapın** - `/login` sayfasından giriş yapın
3. **Dashboard'a Geçin** - Otomatik yönlendirme
4. **Mikrofon Butonuna Basılı Tutun** - Konuşmaya başlayın
5. **Bırakın** - AI yanıtlayacak

### 🎤 **Ses Kontrolleri**

- **● (Kırmızı)**: Kayıt yapılıyor
- **🔊 (Sarı)**: AI konuşuyor
- **● (Mavi)**: Hazır

### 🧪 **Test Modları**

- **Metin Testi**: Doğrudan metin gönder
- **Web Speech Testi**: Tarayıcı STT kullan
- **TTS Testi**: Ses üretimini test et
- **Dosya Testi**: Ses dosyası yükle

---

## 🔧 API

### **Chat API** (`/api/chat/stream`)
```javascript
POST /api/chat/stream
Content-Type: application/json

{
  "prompt": "Kullanıcı mesajı",
  "system_prompt": "Özel sistem prompt'u (opsiyonel)",
  "max_tokens": 500,
  "temperature": 0.7
}

// Response: Server-Sent Events stream
```

### **STT API** (`/api/stt/stream`)
```javascript
POST /api/stt/stream
Content-Type: multipart/form-data

// FormData with audio file

// Response:
{
  "text": "Transkript edilen metin",
  "confidence": 0.95,
  "is_final": true,
  "duration": 3.2,
  "language": "tr"
}
```

### **TTS API** (`/api/tts/stream`)
```javascript
POST /api/tts/stream
Content-Type: application/json

{
  "text": "Seslendirilecek metin",
  "voice_settings": {
    "stability": 0.75,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}

// Response: MP3 audio binary
```

---

## 📁 Proje Yapısı

```
src/
├── app/
│   ├── (auth)/              # Kimlik doğrulama sayfaları
│   │   ├── login/           # Giriş sayfası
│   │   └── register/        # Kayıt sayfası
│   ├── api/                 # API endpoints
│   │   ├── auth/[...nextauth]/  # NextAuth konfigürasyonu
│   │   ├── chat/stream/     # GPT API
│   │   ├── stt/stream/      # Whisper API
│   │   └── tts/stream/      # ElevenLabs API
│   ├── dashboard/           # Ana panel
│   └── layout.js           # Root layout
├── components/
│   ├── VoicePanel.jsx           # Ana ses paneli
│   ├── RealtimeVoicePanel.jsx   # WebRTC paneli
│   ├── FormInput.jsx            # Form bileşeni
│   └── LogoutButton.jsx         # Çıkış butonu
├── config/
│   ├── gpt-config.json          # GPT konfigürasyonu
│   └── voice-presets.json       # Ses ayarları
└── lib/
    ├── auth.js                   # NextAuth config
    └── prisma.js                 # Database client
```

---

## 🎨 Konfigürasyon

### **GPT Ayarları** (`src/config/gpt-config.json`)
```json
{
  "system_prompt": "Sen Selin. Saç Ekimi Merkezi temsilcisisin...",
  "technical_instructions": {
    "max_tokens": 500,
    "temperature": 0.7
  },
  "voice_guidelines": {
    "sentence_structure": "5-8 kelimelik çok kısa cümleler",
    "emotions": "Sadece: nazik, kibar, güvenli, samimi"
  }
}
```

### **Ses Preset'leri** (`src/config/voice-presets.json`)
```json
{
  "presets": {
    "default": {
      "name": "Selin - Klinik Temsilcisi",
      "elevenlabs_voice_id": "PdYVUd1CAGSXsTvZZTNn",
      "voice_settings": {
        "stability": 0.75,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": true
      }
    }
  }
}
```

---

## 📊 Performans

| Özellik | Süre | Açıklama |
|---------|------|----------|
| **STT İşleme** | ~1-2 saniye | OpenAI Whisper |
| **GPT Yanıtı** | ~1-2 saniye | Streaming response |
| **TTS Üretimi** | ~1-2 saniye | ElevenLabs |
| **Toplam Gecikme** | ~5-8 saniye | End-to-end |
| **Bağlantı Kurma** | ~2-3 saniye | WebRTC setup |

---

## 🚀 Deployment

### **Vercel (Önerilen)**
```bash
# Vercel CLI ile
npm i -g vercel
vercel

# Environment variables'ları Vercel dashboard'dan ekleyin
```

### **Docker**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

---

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

## 📞 İletişim

- **Proje Sahibi**: [Your Name](https://github.com/your-username)
- **Email**: your.email@example.com
- **LinkedIn**: [Your LinkedIn](https://linkedin.com/in/your-profile)

---

## 🙏 Teşekkürler

- [OpenAI](https://openai.com) - GPT-4o ve Whisper
- [ElevenLabs](https://elevenlabs.io) - Text-to-Speech
- [Next.js](https://nextjs.org) - React framework
- [Vercel](https://vercel.com) - Deployment platform

---

<div align="center">

**⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!**

Made with ❤️ by [Your Name](https://github.com/your-username)

</div>