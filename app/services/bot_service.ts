import { BotOrchestrator } from '#bot/core/orchestrator/bot_orchestrator'
import { StateController } from '#bot/core/state/state_controller'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import { WorkflowServiceRegistry } from '#bot/core/workflow/services/workflow_service_registry'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import AIEngine from '#bot/core/ai/engine/ai_engine'
import WhatsAppAdapter from '#bot/core/adapters/whatsapp_adapter'
import OnboardingService from './onboarding_service.js'
import BotUserService from './bot_user_service.js'
import TaxpayerService from './taxpayer_service.js'
import DgiScraperService from './dgi_scraper_service.js'
import type { IncomingMessage } from '#bot/types/bot_types'
import logger from '@adonisjs/core/services/logger'
import IGSService from './igs_service.js'
import NIUFinderService from './niu_finder_service.js'
import NIURequestService from './niu_request_service.js'
import { NIURequestWorkflow } from '#bot/core/workflow/definitions/user/niu_request.workflow'
import { NIUFinderWorkflow } from '#bot/core/workflow/definitions/user/niu_finder.workflow'
import { IGSCalculatorWorkflow } from '#bot/core/workflow/definitions/user/igs_calculator.workflow'

export default class BotService {
  private orchestrator: BotOrchestrator
  private adapters: Map<string, any> = new Map()
  private isStarted = false

  constructor() {
    this.orchestrator = new BotOrchestrator()
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      logger.info('Bot is already started')
      return
    }

    try {
      logger.info('Starting Armelle Bot...')

      // 1. Initialiser les managers
      await this.initializeManagers()

      // 2. Initialiser les services
      await this.initializeServices()

      // 3. Enregistrer les workflows
      await this.registerWorkflows()

      // 4. Initialiser l'IA
      await this.initializeAI()

      // 5. Démarrer les adaptateurs
      await this.startAdapters()

      // 6. Tâches de nettoyage
      this.setupCleanupTasks()

      this.isStarted = true
      logger.info('Armelle Bot started successfully')
    } catch (error) {
      logger.error({ error }, 'Failed to start bot')
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      logger.info('Bot is not running')
      return
    }

    logger.info('Stopping Armelle Bot...')

    for (const [channel, adapter] of this.adapters) {
      await adapter.stop()
    }

    this.isStarted = false
    logger.info('Armelle Bot stopped')
  }

  private async initializeManagers(): Promise<void> {
    const i18n = I18nManager.getInstance()
    await i18n.initialize()
    logger.info('Managers initialized')
  }

  private async initializeServices(): Promise<void> {
    const serviceRegistry = WorkflowServiceRegistry.getInstance()

    // Enregistrer TOUS les services nécessaires
    serviceRegistry.register('onboarding_service', new OnboardingService())
    serviceRegistry.register('bot_user_service', new BotUserService())
    serviceRegistry.register('taxpayer_service', new TaxpayerService())
    serviceRegistry.register('dgi_scraper_service', new DgiScraperService())
    serviceRegistry.register('igs_service', new IGSService())
    serviceRegistry.register('niu_finder_service', new NIUFinderService())
    serviceRegistry.register('niu_request_service', new NIURequestService())

    logger.info('Services registered')
  }

  private async registerWorkflows(): Promise<void> {
    const registry = WorkflowRegistry.getInstance()

    // Workflows système
    const { OnboardingWorkflow } = await import(
      '#bot/core/workflow/definitions/system/onboarding.workflow'
    )
    registry.register(OnboardingWorkflow)
    // Workflows utilisateur
    registry.register(IGSCalculatorWorkflow)
    registry.register(NIURequestWorkflow)
    registry.register(NIUFinderWorkflow)

    const stats = registry.getStats()
    logger.info({ stats }, 'Workflows registered')
  }

  private async initializeAI(): Promise<void> {
    try {
      const aiEngine = AIEngine.getInstance()
      await aiEngine.initialize('anthropic')

      if (aiEngine.isAvailable()) {
        logger.info('AI system initialized')
      } else {
        logger.warn('AI system unavailable - check API keys')
      }
    } catch (error) {
      logger.error({ error }, 'AI initialization failed')
      logger.warn('Bot will run without AI capabilities')
    }
  }

  private async startAdapters(): Promise<void> {
    // WhatsApp
    const whatsapp = new WhatsAppAdapter()
    whatsapp.setCallbacks({
      onMessageReceived: (msg: IncomingMessage) => this.orchestrator.processMessage(msg),
    })

    await whatsapp.start()
    this.adapters.set('whatsapp', whatsapp)
    this.orchestrator.registerAdapter('whatsapp', whatsapp)

    logger.info('Adapters started')
  }

  private setupCleanupTasks(): void {
    // Nettoyer les sessions expirées toutes les heures
    setInterval(() => {
      try {
        const sessionManager = SessionManager.getInstance()
        sessionManager.cleanupExpiredSessions()

        const stateController = StateController.getInstance()
        stateController.cleanup()

        logger.info('Cleanup completed')
      } catch (error) {
        logger.error({ error }, 'Cleanup error')
      }
    }, 3600000) // 1 heure
  }

  isRunning(): boolean {
    return this.isStarted
  }

  getStats(): any {
    const workflowRegistry = WorkflowRegistry.getInstance()
    const stateController = StateController.getInstance()
    const aiEngine = AIEngine.getInstance()

    return {
      isRunning: this.isStarted,
      adapters: this.adapters.size,
      workflows: workflowRegistry.getStats(),
      states: stateController.getStats(),
      ai: aiEngine.getStats(),
    }
  }
}
