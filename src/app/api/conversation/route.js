import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Conversation API - Kullanıcının konuşma geçmişini yönetir
 * GET: Mevcut konuşmayı getir
 * POST: Yeni mesaj ekle
 * DELETE: Konuşmayı temizle
 */

// Mevcut konuşmayı getir
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    let conversation

    if (conversationId) {
      // Belirli bir konuşmayı getir
      conversation = await prisma.conversation.findUnique({
        where: { 
          id: conversationId,
          userId: session.user.id 
        },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' }
          }
        }
      })
    } else {
      // En son konuşmayı getir veya yeni oluştur
      conversation = await prisma.conversation.findFirst({
        where: { userId: session.user.id },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      // Eğer konuşma yoksa yeni oluştur
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            userId: session.user.id
          },
          include: {
            messages: true
          }
        })
      }
    }

    return new Response(JSON.stringify({ 
      conversation,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Conversation GET error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch conversation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Yeni mesaj ekle
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { conversationId, role, content } = await request.json()

    if (!role || !content) {
      return new Response(JSON.stringify({ error: 'Role and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let conversation

    if (conversationId) {
      // Mevcut konuşmaya mesaj ekle
      conversation = await prisma.conversation.findUnique({
        where: { 
          id: conversationId,
          userId: session.user.id 
        }
      })

      if (!conversation) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    } else {
      // Yeni konuşma oluştur
      conversation = await prisma.conversation.create({
        data: {
          userId: session.user.id
        }
      })
    }

    // Mesajı ekle
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: role.toUpperCase(),
        content: content
      }
    })

    // Konuşmayı güncelle
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    })

    return new Response(JSON.stringify({ 
      message,
      conversationId: conversation.id 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Conversation POST error:', error)
    return new Response(JSON.stringify({ error: 'Failed to add message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Konuşmayı temizle
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (conversationId) {
      // Belirli konuşmayı sil
      await prisma.conversation.delete({
        where: { 
          id: conversationId,
          userId: session.user.id 
        }
      })
    } else {
      // Tüm konuşmaları sil
      await prisma.conversation.deleteMany({
        where: { userId: session.user.id }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Conversation DELETE error:', error)
    return new Response(JSON.stringify({ error: 'Failed to delete conversation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
