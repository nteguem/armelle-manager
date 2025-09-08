// app/bot/core/adapters/whatsapp_adapter.ts

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
  proto,
} from '@whiskeysockets/baileys'
import QRTerminal from 'qrcode-terminal'
import botConfig from '#config/bot'
import type {
  ChannelAdapter,
  IncomingMessage,
  OutgoingMessage,
  MessageChannel,
} from '#bot/types/bot_types'

export default class WhatsAppAdapter implements ChannelAdapter {
  public readonly channel: MessageChannel = 'whatsapp'

  private socket: WASocket | null = null
  private connectionStatus: boolean = false
  private onMessageReceived?: (message: IncomingMessage) => Promise<void>
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectTimeout: NodeJS.Timeout | null = null

  public async start(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState('storage/whatsapp_auth')

      this.socket = makeWASocket({
        auth: state,
        logger: this.createLogger(),
        browser: ['ArmelleBotManager', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
      })

      this.socket.ev.on('creds.update', saveCreds)
      this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this))
      this.socket.ev.on('messages.upsert', this.handleMessages.bind(this))
    } catch (error) {
      console.error('❌ Failed to start WhatsApp:', error)
      this.scheduleReconnect(10000)
    }
  }

  public async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.socket || !this.connectionStatus) {
      throw new Error('WhatsApp not connected')
    }

    const formattedJid = message.to.includes('@') ? message.to : `${message.to}@s.whatsapp.net`

    try {
      await this.simulateTyping(formattedJid, message.text)
      await this.socket.sendMessage(formattedJid, { text: message.text })
    } catch (error) {
      console.error('❌ Failed to send message:', error)
      throw error
    }
  }

  public isConnected(): boolean {
    return this.connectionStatus
  }

  public setCallbacks(callbacks: {
    onMessageReceived?: (message: IncomingMessage) => Promise<void>
  }): void {
    this.onMessageReceived = callbacks.onMessageReceived
  }

  public async stop(): Promise<void> {
    this.clearReconnectTimeout()

    const keepAlive = process.env.WHATSAPP_KEEP_ALIVE === 'true'

    if (!keepAlive && this.socket && this.connectionStatus) {
      try {
        await this.socket.logout()
      } catch (error) {
        console.warn('⚠️ Error during logout')
      }
    }

    this.socket = null
    this.connectionStatus = false
    this.reconnectAttempts = 0
    console.log('WhatsApp stopped')
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      this.displayQRInTerminal(qr)
    }

    if (connection === 'open') {
      this.connectionStatus = true
      this.reconnectAttempts = 0
      console.log('✅ WhatsApp connected')
    } else if (connection === 'close') {
      this.connectionStatus = false
      this.handleDisconnection(lastDisconnect)
    }
  }

  private handleDisconnection(lastDisconnect: any): void {
    const error = lastDisconnect?.error
    const statusCode = error?.output?.statusCode

    console.log('❌ Connection closed')

    // Gestion des différents types de déconnexion
    switch (statusCode) {
      case DisconnectReason.loggedOut:
        console.log('📱 Logged out - restart required')
        return

      case 440: // Conflict
        console.log('🚫 Session conflict detected')
        this.scheduleReconnect(30000) // Attendre 30s pour les conflits
        return

      case DisconnectReason.connectionClosed:
      case DisconnectReason.connectionLost:
      case DisconnectReason.connectionReplaced:
        this.scheduleReconnect(5000)
        return

      case DisconnectReason.restartRequired:
        console.log('🔄 Restart required')
        this.scheduleReconnect(10000)
        return

      case DisconnectReason.timedOut:
        this.scheduleReconnect(15000)
        return

      default:
        if (error) {
          this.scheduleReconnect(8000)
        }
        return
    }
  }

  private scheduleReconnect(delay: number): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached')
      return
    }

    this.clearReconnectTimeout()
    this.reconnectAttempts++

    console.log(
      `🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    )

    this.reconnectTimeout = setTimeout(() => {
      this.start()
    }, delay)
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  private displayQRInTerminal(qr: string): void {
    console.log('📱 Scan QR with WhatsApp:')
    QRTerminal.generate(qr, { small: true })
  }

  private async simulateTyping(jid: string, text: string): Promise<void> {
    if (!this.socket || !botConfig.messages.typingSimulation) return

    try {
      const wordsCount = text.split(' ').length
      const typingDurationMs = Math.min((wordsCount / 60) * 60 * 1000, 3000)

      await this.socket.sendPresenceUpdate('composing', jid)
      await new Promise((resolve) => setTimeout(resolve, typingDurationMs))
      await this.socket.sendPresenceUpdate('paused', jid)
    } catch (error) {
      // Erreur silencieuse pour la simulation de frappe
    }
  }

  private async handleMessages(messageUpdate: {
    messages: proto.IWebMessageInfo[]
  }): Promise<void> {
    for (const message of messageUpdate.messages) {
      if (message.key.fromMe || !message.message) continue

      const content = message.message.conversation || message.message.extendedTextMessage?.text
      if (!content) continue

      const phoneNumber = message.key.remoteJid?.split('@')[0]
      if (!phoneNumber || !message.key.remoteJid?.includes('@s.whatsapp.net')) continue

      const incomingMessage: IncomingMessage = {
        channel: 'whatsapp',
        from: phoneNumber,
        text: content.trim(),
        type: 'text',
        timestamp: new Date(),
        metadata: {
          messageInfo: message,
          timestamp: message.messageTimestamp,
          messageId: message.key.id,
        },
      }

      if (this.onMessageReceived) {
        try {
          await this.onMessageReceived(incomingMessage)
        } catch (error) {
          console.error('❌ Error processing message:', error)
        }
      }
    }
  }

  private createLogger() {
    return {
      level: 'silent' as const,
      fatal: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
      trace: () => {},
      child: () => this.createLogger(),
    }
  }
}
