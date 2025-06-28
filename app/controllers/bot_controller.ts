import type { HttpContext } from '@adonisjs/core/http'
import { ResponseHelper } from '#helpers/response_helper'
import { botEventBus } from '#bot/core/event_bus'

export default class BotController {
  async streamEvents({ response, request }: HttpContext) {
    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache')
    response.header('Connection', 'keep-alive')
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Accept')

    const res = response.response

    // 🔧 DEBUG: Envoyer l'état initial
    const currentState = botEventBus.getCurrentState()
    console.log('📡 SSE: Sending initial state:', currentState)
    res.write(`event: initial_state\n`)
    res.write(`data: ${JSON.stringify(currentState)}\n\n`)

    // 🔧 DEBUG: Log des événements écoutés
    const onQRUpdate = (data: any) => {
      console.log('📡 SSE: Sending QR update:', data)
      res.write(`event: qr_update\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const onStatusUpdate = (data: any) => {
      console.log('📡 SSE: Sending status update:', data)
      res.write(`event: status_update\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    // 🔧 DEBUG: Vérifier les noms d'événements
    console.log('📡 SSE: Registering event listeners...')
    botEventBus.on('whatsapp:qr_generated', onQRUpdate)
    botEventBus.on('whatsapp:connection_update', onStatusUpdate)

    console.log('📡 SSE: EventBus listeners count:', {
      qr: botEventBus.listenerCount('whatsapp:qr_generated'),
      connection: botEventBus.listenerCount('whatsapp:connection_update'),
    })

    // Test ping renforcé
    const keepAlive = setInterval(() => {
      console.log('📡 SSE: Sending ping...')
      res.write(`event: ping\n`)
      res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`)
    }, 10000) // Toutes les 10 secondes

    const cleanup = () => {
      clearInterval(keepAlive)
      botEventBus.off('whatsapp:qr_generated', onQRUpdate)
      botEventBus.off('whatsapp:connection_update', onStatusUpdate)
      console.log('📡 SSE client disconnected')
    }

    request.request.on('close', cleanup)
    request.request.on('aborted', cleanup)
    res.on('close', cleanup)

    console.log('📡 SSE client connected')
  }

  async getStatus({ response }: HttpContext) {
    try {
      const state = botEventBus.getCurrentState()
      const stats = botEventBus.getStats()

      return response.json(
        ResponseHelper.success(
          {
            ...state,
            stats,
          },
          'Bot status retrieved successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Failed to get bot status', 'BOT_STATUS_ERROR', error.message))
    }
  }

  async reconnect({ response }: HttpContext) {
    try {
      // Déclencher un restart WhatsApp via l'EventBus
      botEventBus.emit('bot:restart_whatsapp', {
        timestamp: Date.now(),
        source: 'api_request',
      })

      return response.json(
        ResponseHelper.success(
          {
            reconnection_requested: true,
          },
          'WhatsApp restart requested successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(
          ResponseHelper.error(
            'Failed to request reconnection',
            'BOT_RECONNECT_ERROR',
            error.message
          )
        )
    }
  }

  async getStats({ response }: HttpContext) {
    try {
      const stats = botEventBus.getStats()
      const state = botEventBus.getCurrentState()

      return response.json(
        ResponseHelper.success(
          {
            eventBus: stats,
            currentState: state,
            system: {
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              nodeVersion: process.version,
            },
          },
          'Bot statistics retrieved successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(
          ResponseHelper.error('Failed to get bot statistics', 'BOT_STATS_ERROR', error.message)
        )
    }
  }

  async clearQR({ response }: HttpContext) {
    try {
      botEventBus.clearQR()

      return response.json(
        ResponseHelper.success(
          {
            qr_cleared: true,
          },
          'QR Code cleared successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Failed to clear QR Code', 'BOT_QR_CLEAR_ERROR', error.message))
    }
  }
}
