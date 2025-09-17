import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

/**
 * Kullanıcı kayıt API endpoint'i
 * Email ve şifre ile yeni kullanıcı oluşturur
 */
export async function POST(request) {
  try {
    // Request body'den kullanıcı bilgilerini al
    const { name, email, password } = await request.json()

    // Gerekli alanları kontrol et
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Tüm alanlar gerekli' }, { status: 400 })
    }

    // Email'in zaten kullanılıp kullanılmadığını kontrol et
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json({ error: 'Bu e-posta zaten kullanılıyor' }, { status: 409 })
    }

    // Şifreyi hashle (güvenlik için)
    const hashedPassword = await bcrypt.hash(password, 12)

    // Yeni kullanıcı oluştur
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword
      }
    })

    // Başarılı response döndür
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}