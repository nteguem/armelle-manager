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

  public async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState('storage/whatsapp_auth')

    this.socket = makeWASocket({
      auth: state,
      logger: this.createLogger(),
      browser: ['ArmelleBotManager', 'Chrome', '1.0.0'],
    })

    this.socket.ev.on('creds.update', saveCreds)
    this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this))
    this.socket.ev.on('messages.upsert', this.handleMessages.bind(this))
  }

  public async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.socket || !this.connectionStatus) {
      throw new Error('WhatsApp not connected')
    }

    // Format correct pour Baileys
    const formattedJid = message.to.includes('@') ? message.to : `${message.to}@s.whatsapp.net`

    await this.simulateTyping(formattedJid, message.text) // Changé content en text
    await this.socket.sendMessage(formattedJid, { text: message.text }) // Changé content en text
    console.log(`📤 Message sent`)
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
    const keepAlive = process.env.WHATSAPP_KEEP_ALIVE === 'true'

    if (!keepAlive && this.socket && this.connectionStatus) {
      await this.socket.logout()
    }

    this.socket = null
    this.connectionStatus = false
    console.log('WhatsApp stopped')
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      this.displayQRInTerminal(qr)
    }

    if (connection === 'open') {
      this.connectionStatus = true
      console.log('✅ WhatsApp connected')
    } else if (connection === 'close') {
      this.connectionStatus = false
      console.log('❌ Connection closed')

      const shouldReconnect =
        lastDisconnect?.error &&
        (lastDisconnect.error as any)?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        console.log('🔄 Reconnecting in 5 seconds...')
        setTimeout(() => this.start(), 5000)
      } else {
        console.log('📱 Please restart to scan QR again')
      }
    } else if (connection === 'connecting') {
      console.log('🔄 Connecting...')
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
      console.warn('⚠️ Typing simulation failed')
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

      // Créer le message avec les bons champs
      const incomingMessage: IncomingMessage = {
        channel: 'whatsapp',
        from: phoneNumber, // Changé channelUserId en from
        text: content.trim(), // Changé content en text
        type: 'text', // Changé messageType en type
        timestamp: new Date(),
        metadata: {
          // Changé rawData en metadata
          messageInfo: message,
          timestamp: message.messageTimestamp,
          messageId: message.key.id,
        },
      }

      console.log(`📥 Message from ${phoneNumber}: ${content.substring(0, 30)}...`)

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
