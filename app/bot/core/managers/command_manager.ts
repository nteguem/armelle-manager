import commandsConfig from '#config/commands'
import I18nManager from '#bot/core/managers/i18n_manager'
import type {
  CommandDetectionResult,
  SessionContext,
  SupportedLanguage,
} from '#bot/types/bot_types'

interface CommandConfig {
  synonyms: string[]
  priority: number
  alwaysAllowed?: boolean
  workflowOnly?: boolean
  blockedInWorkflows?: string[]
  contextual?: boolean
  confirmationRequired?: boolean
  target?: string
}

type WorkflowRestrictions = {
  [key: string]: {
    blocked: string[]
    allowed: string[] | string
  }
}

interface CommandsConfig {
  systemCommands: {
    language: Record<string, CommandConfig>
    navigation: Record<string, CommandConfig>
    workflow: Record<string, CommandConfig>
  }
  restrictions: WorkflowRestrictions
  detection: {
    caseSensitive: boolean
    exactMatch: boolean
    maxSynonyms: number
    timeoutMs: number
  }
}

export default class CommandManager {
  private static instance: CommandManager
  private commandMap: Map<string, { type: string; category: string; config: CommandConfig }> =
    new Map()
  private i18n: I18nManager
  private commandsConfig: CommandsConfig

  private constructor() {
    this.i18n = I18nManager.getInstance()
    this.commandsConfig = commandsConfig
  }

  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager()
    }
    return CommandManager.instance
  }

  /**
   * Initialise le CommandManager
   */
  public async initialize(): Promise<void> {
    this.buildCommandMap()
  }

  /**
   * Recharge la configuration (utile en développement)
   */
  public async reloadConfiguration(): Promise<void> {
    console.log('🔄 Reloading commands configuration...')
    this.commandMap.clear()
    this.buildCommandMap()
    console.log('✅ Commands configuration reloaded')
  }

  /**
   * Construit la map des commandes depuis la configuration
   */
  private buildCommandMap(): void {
    if (!this.commandsConfig) {
      throw new Error('Commands configuration not loaded')
    }

    const { systemCommands } = this.commandsConfig

    // Commandes de langue
    Object.entries(systemCommands.language).forEach(([type, config]) => {
      config.synonyms.forEach((synonym) => {
        this.commandMap.set(synonym.toLowerCase(), {
          type,
          category: 'language',
          config: config as CommandConfig,
        })
      })
    })

    // Commandes de navigation
    Object.entries(systemCommands.navigation).forEach(([type, config]) => {
      config.synonyms.forEach((synonym) => {
        this.commandMap.set(synonym.toLowerCase(), {
          type,
          category: 'navigation',
          config: config as CommandConfig,
        })
      })
    })

    // Commandes de workflow
    Object.entries(systemCommands.workflow).forEach(([type, config]) => {
      config.synonyms.forEach((synonym) => {
        this.commandMap.set(synonym.toLowerCase(), {
          type,
          category: 'workflow',
          config: config as CommandConfig,
        })
      })
    })

    console.log(`✅ Command map built with ${this.commandMap.size} synonyms`)
  }

  /**
   * Détecte si l'input est une commande système
   */
  public detectCommand(input: string, context: SessionContext): CommandDetectionResult {
    const normalizedInput = input.toLowerCase().trim()
    const command = this.commandMap.get(normalizedInput)

    if (!command) {
      return { detected: false }
    }

    // Vérifier si la commande est autorisée dans ce contexte
    const isAllowed = this.isCommandAllowed(command, context)

    return {
      detected: true,
      type: command.type,
      command: command.category,
      blocked: !isAllowed,
      reason: isAllowed ? undefined : this.getBlockReason(command, context),
    }
  }

  /**
   * Vérifie si une commande est autorisée dans le contexte donné
   */
  private isCommandAllowed(
    command: { type: string; category: string; config: CommandConfig },
    context: SessionContext
  ): boolean {
    const { config } = command

    // Commandes toujours autorisées
    if (config.alwaysAllowed) {
      return true
    }

    // Commandes workflow uniquement
    if (config.workflowOnly && !context.currentWorkflow) {
      return false
    }

    // Commandes bloquées dans certains workflows
    if (config.blockedInWorkflows?.includes(context.currentWorkflow || '')) {
      return false
    }

    // Vérifier les restrictions par workflow
    const currentWorkflow = context.currentWorkflow
    if (currentWorkflow) {
      const restrictions = this.commandsConfig.restrictions[currentWorkflow]
      if (restrictions && restrictions.blocked.includes(command.type)) {
        return false
      }
    }

    return true
  }

  /**
   * Retourne la raison du blocage d'une commande (multilingue)
   */
  private getBlockReason(
    command: { type: string; category: string; config: CommandConfig },
    context: SessionContext
  ): string {
    const { config } = command
    const language = context.language

    if (config.workflowOnly && !context.currentWorkflow) {
      return this.i18n.t('errors.commands.not_allowed_in_context', {}, language)
    }

    if (config.blockedInWorkflows?.includes(context.currentWorkflow || '')) {
      return this.i18n.t(
        'errors.commands.blocked_in_workflow',
        {
          workflow: context.currentWorkflow,
        },
        language
      )
    }

    if (context.currentWorkflow === 'onboarding' && command.type === 'menu') {
      return this.i18n.t('errors.commands.menu_blocked_onboarding', {}, language)
    }

    return this.i18n.t('errors.commands.not_allowed_in_context', {}, language)
  }

  /**
   * Récupère la langue cible pour une commande de langue
   */
  public getLanguageTarget(commandType: string): SupportedLanguage | null {
    const { systemCommands } = this.commandsConfig
    const languageCommands = systemCommands.language as Record<string, any>
    const languageCommand = languageCommands[commandType]

    return (languageCommand?.target as SupportedLanguage) || null
  }

  /**
   * Vérifie si une commande nécessite une confirmation
   */
  public requiresConfirmation(commandType: string): boolean {
    // Chercher dans toutes les catégories
    const allCommands = {
      ...this.commandsConfig.systemCommands.language,
      ...this.commandsConfig.systemCommands.navigation,
      ...this.commandsConfig.systemCommands.workflow,
    } as Record<string, any>

    return allCommands[commandType]?.confirmationRequired || false
  }

  /**
   * Récupère les statistiques des commandes
   */
  public getStats(): {
    totalSynonyms: number
    commandsByCategory: Record<string, number>
    restrictedWorkflows: string[]
  } {
    const stats = {
      totalSynonyms: this.commandMap.size,
      commandsByCategory: {} as Record<string, number>,
      restrictedWorkflows: [] as string[],
    }

    // Compter par catégorie
    for (const command of this.commandMap.values()) {
      stats.commandsByCategory[command.category] =
        (stats.commandsByCategory[command.category] || 0) + 1
    }

    // Workflows avec restrictions
    stats.restrictedWorkflows = Object.keys(this.commandsConfig.restrictions)

    return stats
  }

  /**
   * Vérifie si la configuration est chargée
   */
  public isConfigurationLoaded(): boolean {
    return this.commandMap.size > 0
  }
}
