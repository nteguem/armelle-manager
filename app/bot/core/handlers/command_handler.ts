import { BaseHandler } from './base_handler.js'
import type { HandlerResult, HandlerPriority } from '#bot/contracts/handler.contract'
import type { StateContext } from '#bot/types/state.types'
import { BotState } from '#bot/types/state.types'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import SessionManager from '#bot/core/managers/session_manager'

interface CommandDefinition {
  id: string
  aliases: string[]
  allowedStates: BotState[] | 'all'
  execute: (context: StateContext) => Promise<HandlerResult>
}

export class CommandHandler extends BaseHandler {
  readonly name = 'command_handler'
  readonly supportedStates = [
    BotState.IDLE,
    BotState.USER_WORKFLOW,
    BotState.MENU_DISPLAYED,
    BotState.AI_WAITING_CONFIRM,
  ]

  private commands: Map<string, CommandDefinition> = new Map()

  constructor() {
    super()
    this.initializeCommands()
  }

  private initializeCommands(): void {
    this.registerCommand({
      id: 'menu',
      aliases: ['menu', 'options', 'aide', 'help'],
      allowedStates: [BotState.IDLE, BotState.AI_WAITING_CONFIRM],
      execute: (context) => this.executeMenu(context),
    })

    this.registerCommand({
      id: 'armelle',
      aliases: ['armelle', 'assistant', 'retour', 'back'],
      allowedStates: [BotState.USER_WORKFLOW, BotState.MENU_DISPLAYED, BotState.AI_WAITING_CONFIRM],
      execute: (context) => this.executeArmelle(context),
    })

    this.registerCommand({
      id: 'fr',
      aliases: ['fr', 'français', 'francais', 'french'],
      allowedStates: 'all',
      execute: (context) => this.executeLanguageChange(context, 'fr'),
    })

    this.registerCommand({
      id: 'en',
      aliases: ['en', 'english', 'anglais'],
      allowedStates: 'all',
      execute: (context) => this.executeLanguageChange(context, 'en'),
    })

    this.registerCommand({
      id: 'profile',
      aliases: ['profil', 'profile', 'compte', 'account'],
      allowedStates: [BotState.IDLE],
      execute: (context) => this.executeProfile(context),
    })

    this.registerCommand({
      id: 'niu',
      aliases: ['niu', 'matricule'],
      allowedStates: [BotState.IDLE],
      execute: (context) => this.executeNiu(context),
    })
  }

  private registerCommand(definition: CommandDefinition): void {
    for (const alias of definition.aliases) {
      this.commands.set(alias.toLowerCase(), definition)
    }
  }

  protected canHandleSpecific(context: StateContext, input: string): boolean {
    const normalized = input.toLowerCase().trim()
    const command = this.commands.get(normalized)

    if (!command) return false

    if (command.allowedStates === 'all') return true

    return command.allowedStates.includes(context.currentState)
  }

  async handle(context: StateContext, input: string): Promise<HandlerResult> {
    const normalized = input.toLowerCase().trim()
    const command = this.commands.get(normalized)

    if (!command) {
      return this.errorResult('Command not found', context)
    }

    if (command.allowedStates !== 'all' && !command.allowedStates.includes(context.currentState)) {
      const message = this.buildMessage(
        { key: 'errors.command_not_allowed', params: { command: normalized } },
        context,
        { useDefaultFooter: true }
      )

      return this.successResult(message)
    }

    try {
      return await command.execute(context)
    } catch (error: any) {
      this.log('error', 'Command execution failed', context, {
        command: command.id,
        error: error.message,
      })

      return this.errorResult(error.message, context)
    }
  }

  private async executeMenu(context: StateContext): Promise<HandlerResult> {
    const registry = WorkflowRegistry.getInstance()
    const userWorkflows = registry.getUserWorkflows(context.session)

    if (userWorkflows.length === 0) {
      const message = this.buildMessage({ key: 'menu.no_options' }, context, {
        useDefaultFooter: true,
      })

      return this.successResult(message)
    }

    // Construire le menu
    const menuItems = userWorkflows
      .map((workflow, index) => {
        const name = workflow.name
        const description = workflow.description ? ` - ${workflow.description}` : ''
        return `${index + 1}. ${name}${description}`
      })
      .join('\n')

    const menuContent =
      this.i18n.t('menu.title', {}, context.session.language) +
      '\n\n' +
      menuItems +
      '\n\n' +
      '0. ' +
      this.i18n.t('menu.back_to_assistant', {}, context.session.language)

    const message = this.buildMessage(menuContent, context, {
      footer: this.i18n.t('menu.footer', {}, context.session.language),
    })

    // CORRECTION : Sauvegarder les IDs des workflows
    const workflowIds = userWorkflows.map((w) => w.id)

    return {
      success: true,
      message,
      nextState: BotState.MENU_DISPLAYED,
      stateData: {
        menuOptions: workflowIds,
      },
    }
  }

  private async executeArmelle(context: StateContext): Promise<HandlerResult> {
    const message = this.buildMessage({ key: 'common.central_state_prompt' }, context, {
      useDefaultFooter: true,
    })

    return this.successResult(message, BotState.IDLE)
  }

  private async executeLanguageChange(
    context: StateContext,
    language: 'fr' | 'en'
  ): Promise<HandlerResult> {
    const sessionManager = SessionManager.getInstance()

    await sessionManager.updateUserLanguage(context.session, language)
    context.session.language = language

    const message = this.buildMessage({ key: 'common.language_changed' }, context, {
      useDefaultFooter: true,
    })

    return this.successResult(message)
  }

  private async executeProfile(context: StateContext): Promise<HandlerResult> {
    const userData = context.session.workflowData?.userData || {}

    let profileInfo = ''

    if (context.session.isVerified) {
      profileInfo = this.i18n.t(
        'profile.verified',
        {
          name: userData.name || 'N/A',
          niu: userData.niu || 'N/A',
          centre: userData.centre || 'N/A',
        },
        context.session.language
      )
    } else {
      profileInfo = this.i18n.t(
        'profile.partial',
        { name: userData.name || 'Utilisateur' },
        context.session.language
      )
    }

    const message = this.buildMessage(profileInfo, context, { useDefaultFooter: true })

    return this.successResult(message)
  }

  private async executeNiu(context: StateContext): Promise<HandlerResult> {
    if (!context.session.isVerified) {
      const message = this.buildMessage({ key: 'profile.no_niu' }, context, {
        useDefaultFooter: true,
      })

      return this.successResult(message)
    }

    const niu = context.session.workflowData?.userData?.niu || 'N/A'

    const message = this.buildMessage({ key: 'profile.your_niu', params: { niu } }, context, {
      useDefaultFooter: true,
    })

    return this.successResult(message)
  }
}
