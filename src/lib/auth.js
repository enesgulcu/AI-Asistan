import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

/**
 * NextAuth.js konfigürasyonu
 * JWT tabanlı authentication sistemi
 */
export const authOptions = {
  providers: [
    // Credentials provider - email/şifre ile giriş
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // Credentials validation
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Kullanıcıyı veritabanından bul
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user || !user.password) {
          return null
        }

        // Şifre kontrolü
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

        if (!isPasswordValid) {
          return null
        }

        // Başarılı authentication - user object döndür
        return {
          id: user.id,
          name: user.name,
          email: user.email
        }
      }
    })
  ],
  session: {
    strategy: 'jwt' // JWT tabanlı session
  },
  pages: {
    signIn: '/login' // Özel login sayfası
  },
  callbacks: {
    // JWT token'a user bilgilerini ekle
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
      }
      return token
    },
    // Session'a user bilgilerini ekle
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId
      }
      return session
    }
  }
}

// NextAuth instance'ı export et
export default NextAuth(authOptions)