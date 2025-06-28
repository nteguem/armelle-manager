import { EventEmitter } from 'node:events'

export interface BotQREvent {
  qr: string
  timestamp: number
  expiresIn?: number
}

export interface BotStatusEvent {
  status: 'connecting' | 'connected' | 'disconnected' | 'logged_out' | 'failed'
  timestamp: number
}

export interface BotMessageEvent {
  from: string
  content: string
  timestamp: number
}

class BotEventBus extends EventEmitter {
  private currentQR: string | null = null
  private currentStatus: string = 'disconnected'
  private qrTimestamp: number | null = null

  emitQRUpdate(qr: string): void {
    this.currentQR = qr
    this.qrTimestamp = Date.now()

    const event: BotQREvent = {
      qr,
      timestamp: this.qrTimestamp,
      expiresIn: 5 * 60 * 1000, // 5 minutes
    }

    this.emit('whatsapp:qr_generated', event)
    console.log('📱 QR Code event emitted')
  }

  emitConnectionStatus(status: BotStatusEvent['status']): void {
    this.currentStatus = status

    const event: BotStatusEvent = {
      status,
      timestamp: Date.now(),
    }

    this.emit('whatsapp:connection_update', event)

    if (status === 'connected') {
      this.clearQR()
    }

    console.log(`📱 Connection status event: ${status}`)
  }

  emitMessageReceived(from: string, content: string): void {
    const event: BotMessageEvent = {
      from: this.maskPhoneNumber(from),
      content: content.substring(0, 50) + '...', // Truncate for privacy
      timestamp: Date.now(),
    }

    this.emit('whatsapp:message_received', event)
  }

  clearQR(): void {
    this.currentQR = null
    this.qrTimestamp = null
    this.emit('whatsapp:qr_cleared', { timestamp: Date.now() })
    console.log('📱 QR Code cleared')
  }

  getCurrentState(): {
    hasQR: boolean
    qr: string | null
    status: string
    qrAge: number | null
  } {
    return {
      hasQR: this.isQRValid(),
      qr: this.currentQR,
      status: this.currentStatus,
      qrAge: this.qrTimestamp ? Date.now() - this.qrTimestamp : null,
    }
  }

  private isQRValid(): boolean {
    if (!this.qrTimestamp || !this.currentQR) return false

    const expirationMs = 5 * 60 * 1000 // 5 minutes
    return Date.now() - this.qrTimestamp < expirationMs
  }

  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return phoneNumber
    return phoneNumber.slice(0, 4) + '***' + phoneNumber.slice(-2)
  }

  getStats(): {
    listenersCount: number
    hasActiveQR: boolean
    currentStatus: string
  } {
    return {
      listenersCount:
        this.listenerCount('whatsapp:qr_generated') +
        this.listenerCount('whatsapp:connection_update'),
      hasActiveQR: this.isQRValid(),
      currentStatus: this.currentStatus,
    }
  }
}

export const botEventBus = new BotEventBus()
export default BotEventBus
