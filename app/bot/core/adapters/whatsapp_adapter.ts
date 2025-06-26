import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
  proto,
} from '@whiskeysockets/baileys'
import type {
  ChannelAdapter,
  IncomingMessage,
  OutgoingMessage,
  MessageChannel,
} from '#bot/types/bot_types'

/**
 * Adapter WhatsApp utilisant Baileys
 */
export default class WhatsAppAdapter implements ChannelAdapter {
  public readonly channel: MessageChannel = 'whatsapp'

  private socket: WASocket | null = null
  private connectionStatus: boolean = false
  private reconnectAttempts: number = 0
  private readonly maxReconnectAttempts: number = 5
  private readonly reconnectDelayMs: number = 5000
  private readonly sessionPath: string

  // Callbacks
  private onMessageReceived?: (message: IncomingMessage) => Promise<void>
  private onQRGenerated?: (qr: string) => void
  private onConnectionUpdate?: (status: string) => void

  constructor(
    sessionPath: string = 'storage/whatsapp_auth',
    maxReconnectAttempts: number = 5,
    reconnectDelayMs: number = 5000
  ) {
    this.sessionPath = sessionPath
    this.maxReconnectAttempts = maxReconnectAttempts
    this.reconnectDelayMs = reconnectDelayMs
  }

  /**
   * Démarre l'adapter WhatsApp
   */
  public async start(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath)

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // On gère le QR via Socket.IO
        logger: this.createLogger(),
        generateHighQualityLinkPreview: false,
        shouldIgnoreJid: (jid: string) => this.shouldIgnoreJid(jid),
      })

      this.setupEventHandlers(saveCreds)

      console.log('📱 WhatsApp Adapter initialized')
    } catch (error) {
      console.error('❌ Failed to start WhatsApp adapter:', error)
      throw error
    }
  }

  /**
   * Arrête l'adapter WhatsApp
   */
  public async stop(): Promise<void> {
    if (this.socket) {
      await this.socket.logout()
      this.socket = null
      this.connectionStatus = false
      console.log('📱 WhatsApp Adapter stopped')
    }
  }

  /**
   * Envoie un message
   */
  public async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.socket || !this.connectionStatus) {
      throw new Error('WhatsApp not connected')
    }

    try {
      // Simuler la frappe si activé
      await this.simulateTyping(message.to, message.content)

      // Envoyer le message
      await this.socket.sendMessage(message.to, {
        text: message.content,
      })

      console.log(`📤 Message sent to ${this.maskPhoneNumber(message.to)}`)
    } catch (error) {
      console.error('❌ Failed to send message:', error)
      throw error
    }
  }

  /**
   * Vérifie si WhatsApp est connecté
   */
  public isConnected(): boolean {
    return this.connectionStatus
  }

  /**
   * Configure les callbacks
   */
  public setCallbacks(callbacks: {
    onMessageReceived?: (message: IncomingMessage) => Promise<void>
    onQRGenerated?: (qr: string) => void
    onConnectionUpdate?: (status: string) => void
  }): void {
    this.onMessageReceived = callbacks.onMessageReceived
    this.onQRGenerated = callbacks.onQRGenerated
    this.onConnectionUpdate = callbacks.onConnectionUpdate
  }

  /**
   * Configure les gestionnaires d'événements
   */
  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.socket) return

    // Sauvegarde des credentials
    this.socket.ev.on('creds.update', saveCreds)

    // Gestion de la connexion
    this.socket.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update)
    })

    // Gestion des messages
    this.socket.ev.on('messages.upsert', (messageUpdate) => {
      this.handleMessages(messageUpdate)
    })
  }

  /**
   * Gère les mises à jour de connexion
   */
  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update

    // QR Code généré
    if (qr && this.onQRGenerated) {
      console.log('📱 QR Code generated')
      this.onQRGenerated(qr)
    }

    // État de connexion
    if (connection === 'close') {
      this.connectionStatus = false
      this.handleDisconnection(lastDisconnect)
    } else if (connection === 'open') {
      this.connectionStatus = true
      this.reconnectAttempts = 0
      console.log('✅ WhatsApp connected successfully!')

      if (this.onConnectionUpdate) {
        this.onConnectionUpdate('connected')
      }
    } else if (connection === 'connecting') {
      console.log('🔄 Connecting to WhatsApp...')

      if (this.onConnectionUpdate) {
        this.onConnectionUpdate('connecting')
      }
    }
  }

  /**
   * Gère les déconnexions
   */
  private handleDisconnection(lastDisconnect?: { error: Error | undefined; date: Date }): void {
    const shouldReconnect =
      lastDisconnect?.error &&
      (lastDisconnect.error as any)?.output?.statusCode !== DisconnectReason.loggedOut

    console.log('❌ WhatsApp connection closed')

    if (this.onConnectionUpdate) {
      this.onConnectionUpdate('disconnected')
    }

    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(
        `🔄 Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`
      )

      this.reconnectAttempts++

      setTimeout(() => {
        this.start().catch((error) => {
          console.error('❌ Reconnection failed:', error)
        })
      }, this.reconnectDelayMs)
    } else if (
      lastDisconnect?.error &&
      (lastDisconnect.error as any)?.output?.statusCode === DisconnectReason.loggedOut
    ) {
      console.log('📱 WhatsApp logged out - QR scan required')

      if (this.onConnectionUpdate) {
        this.onConnectionUpdate('logged_out')
      }
    } else {
      console.log('❌ Max reconnection attempts reached')

      if (this.onConnectionUpdate) {
        this.onConnectionUpdate('failed')
      }
    }
  }

  /**
   * Gère les messages reçus
   */
  private async handleMessages(messageUpdate: {
    messages: proto.IWebMessageInfo[]
  }): Promise<void> {
    for (const message of messageUpdate.messages) {
      await this.processIncomingMessage(message)
    }
  }

  /**
   * Traite un message entrant
   */
  private async processIncomingMessage(message: proto.IWebMessageInfo): Promise<void> {
    // Ignorer nos propres messages
    if (message.key.fromMe) return

    // Ignorer les messages de statut
    if (message.key.remoteJid === 'status@broadcast') return

    // Extraire le contenu du message
    const content = this.extractMessageContent(message)
    if (!content) return

    // Extraire le numéro de téléphone
    const phoneNumber = this.extractPhoneNumber(message.key.remoteJid!)
    if (!phoneNumber) return

    // Créer l'objet message entrant
    const incomingMessage: IncomingMessage = {
      channel: 'whatsapp',
      channelUserId: phoneNumber,
      content: content.trim(),
      rawData: {
        messageInfo: message,
        timestamp: message.messageTimestamp,
        messageId: message.key.id,
      },
      messageType: 'text',
      timestamp: new Date(),
    }

    console.log(
      `📥 Message received from ${this.maskPhoneNumber(phoneNumber)}: ${content.substring(0, 50)}...`
    )

    // Appeler le callback si défini
    if (this.onMessageReceived) {
      try {
        await this.onMessageReceived(incomingMessage)
      } catch (error) {
        console.error('❌ Error processing incoming message:', error)
      }
    }
  }

  /**
   * Extrait le contenu textuel d'un message
   */
  private extractMessageContent(message: proto.IWebMessageInfo): string | null {
    const messageContent = message.message
    if (!messageContent) return null

    // Message texte simple
    if (messageContent.conversation) {
      return messageContent.conversation
    }

    // Message texte étendu
    if (messageContent.extendedTextMessage?.text) {
      return messageContent.extendedTextMessage.text
    }

    // TODO: Ajouter support pour d'autres types (images, documents, etc.)

    return null
  }

  /**
   * Extrait le numéro de téléphone d'un JID
   */
  private extractPhoneNumber(jid: string): string | null {
    // Format: +237123456789@s.whatsapp.net -> +237123456789
    const match = jid.match(/^(\+?\d+)@/)
    return match ? match[1] : null
  }

  /**
   * Simule la frappe pour rendre la conversation plus naturelle
   */
  private async simulateTyping(jid: string, content: string): Promise<void> {
    if (!this.socket) return

    try {
      // Calculer la durée de frappe basée sur la longueur du message
      const wordsCount = content.split(' ').length
      const typingDurationMs = Math.min((wordsCount / 60) * 60 * 1000, 3000) // Max 3 secondes

      // Envoyer l'état "en train d'écrire"
      await this.socket.sendPresenceUpdate('composing', jid)

      // Attendre
      await this.delay(typingDurationMs)

      // Arrêter l'état "en train d'écrire"
      await this.socket.sendPresenceUpdate('paused', jid)
    } catch (error) {
      console.warn('⚠️ Failed to simulate typing:', error)
    }
  }

  /**
   * Vérifie si un JID doit être ignoré
   */
  private shouldIgnoreJid(jid: string): boolean {
    // Ignorer les groupes et les broadcasts
    return jid.includes('@g.us') || jid.includes('@broadcast')
  }

  /**
   * Masque un numéro de téléphone pour les logs
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return phoneNumber
    return phoneNumber.slice(0, 4) + '***' + phoneNumber.slice(-2)
  }

  /**
   * Utilitaire pour délai
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Crée un logger pour Baileys
   */
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
