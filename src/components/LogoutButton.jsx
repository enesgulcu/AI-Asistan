'use client'

import { signOut } from 'next-auth/react'

/**
 * Logout butonu bileşeni
 * NextAuth.js signOut fonksiyonunu kullanır
 */
export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
    >
      Çıkış Yap
    </button>
  )
}