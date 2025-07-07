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

export default class CommandManager {
  private static instance: CommandManager
  private commandMap: Map<string, { type: string; category: string; config: CommandConfig }> =
    new Map()
  private i18n: I18nManager

  private constructor() {
    this.i18n = I18nManager.getInstance()
    this.buildCommandMap()
  }

  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager()
    }
    return CommandManager.instance
  }

  /**
   * Construit la map des commandes depuis la configuration
   */
  private buildCommandMap(): void {
    const { systemCommands } = commandsConfig

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
      const restrictions = (commandsConfig.restrictions as WorkflowRestrictions)[currentWorkflow]
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
      return this.i18n.t('errors.commands.workflow_only', {}, language)
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
    const { systemCommands } = commandsConfig
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
      ...commandsConfig.systemCommands.language,
      ...commandsConfig.systemCommands.navigation,
      ...commandsConfig.systemCommands.workflow,
    } as Record<string, any>

    return allCommands[commandType]?.confirmationRequired || false
  }
}
