import Taxpayer from '#models/tax_payer'
import type { WorkflowDefinition, ActionContext, ActionResult } from '#bot/types/bot_types'

export const OnboardingWorkflow: WorkflowDefinition = {
  id: 'onboarding',
  version: '1.0.0',
  initialStep: 'welcome_collect_name',
  steps: {
    welcome_collect_name: {
      id: 'welcome_collect_name',
      type: 'input',
      messageKey: 'workflows.onboarding.welcome_collect_name',
      validation: {
        type: 'name',
        required: true,
        minLength: 2,
        maxLength: 100,
      },
      transitions: {
        valid_input: {
          target: 'search_dgi',
          action: 'save_user_name',
        },
      },
      allowSystemCommands: false,
    },

    search_dgi: {
      id: 'search_dgi',
      type: 'api',
      messageKey: 'workflows.onboarding.searching_dgi',
      transitions: {
        default: {
          target: 'search_dgi',
          action: 'search_dgi',
        },
        found_none: {
          target: 'no_results',
        },
        found_one: {
          target: 'confirm_single',
        },
        found_multiple: {
          target: 'select_from_list',
        },
        api_error: {
          target: 'dgi_error',
        },
      },
      allowSystemCommands: false,
    },

    dgi_error: {
      id: 'dgi_error',
      type: 'menu',
      messageKey: 'workflows.onboarding.dgi_service_error',
      transitions: {
        '1': {
          target: 'welcome_collect_name',
        },
        '2': {
          target: 'manual_niu_entry',
        },
        '3': {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
      },
      allowSystemCommands: true,
    },

    no_results: {
      id: 'no_results',
      type: 'menu',
      messageKey: 'workflows.onboarding.no_results_found',
      transitions: {
        '1': {
          target: 'welcome_collect_name',
        },
        '2': {
          target: 'manual_niu_entry',
        },
        '3': {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
      },
      allowSystemCommands: true,
    },

    confirm_single: {
      id: 'confirm_single',
      type: 'menu',
      messageKey: 'workflows.onboarding.confirm_taxpayer',
      transitions: {
        '1': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer',
        },
        '2': {
          target: 'welcome_collect_name',
        },
      },
      allowSystemCommands: true,
    },

    select_from_list: {
      id: 'select_from_list',
      type: 'menu',
      messageKey: 'workflows.onboarding.select_taxpayer',
      transitions: {
        '1': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer_by_index',
        },
        '2': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer_by_index',
        },
        '3': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer_by_index',
        },
        '4': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer_by_index',
        },
        '5': {
          target: 'onboarding_complete',
          action: 'associate_taxpayer_by_index',
        },
        '0': {
          target: 'welcome_collect_name',
        },
      },
      allowSystemCommands: true,
    },

    manual_niu_entry: {
      id: 'manual_niu_entry',
      type: 'input',
      messageKey: 'workflows.onboarding.enter_niu_manual',
      validation: {
        type: 'text',
        required: false,
        pattern: '^[A-Z0-9]{10,15}$',
      },
      transitions: {
        valid_input: {
          target: 'verify_niu',
          action: 'save_manual_niu',
        },
        default: {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
      },
      allowSystemCommands: true,
    },

    verify_niu: {
      id: 'verify_niu',
      type: 'api',
      messageKey: 'workflows.onboarding.verifying_niu',
      transitions: {
        default: {
          target: 'verify_niu',
          action: 'verify_niu',
        },
        niu_found: {
          target: 'confirm_manual_taxpayer',
        },
        niu_not_found: {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
        api_error: {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
      },
      allowSystemCommands: true,
    },

    confirm_manual_taxpayer: {
      id: 'confirm_manual_taxpayer',
      type: 'menu',
      messageKey: 'workflows.onboarding.confirm_manual_taxpayer',
      transitions: {
        '1': {
          target: 'onboarding_complete',
          action: 'associate_manual_taxpayer',
        },
        '2': {
          target: 'onboarding_complete',
          action: 'create_profile_without_niu',
        },
      },
      allowSystemCommands: true,
    },

    onboarding_complete: {
      id: 'onboarding_complete',
      type: 'display',
      messageKey: 'workflows.onboarding.success_complete',
      transitions: {
        default: {
          target: 'END',
        },
      },
      allowSystemCommands: false,
    },
  },

  metadata: {
    description: "Processus d'inscription Armelle avec vérification DGI",
    estimatedDuration: '2-3 minutes',
    requiredData: ['user_name'],
    optionalData: ['niu', 'taxpayer_info'],
    supportedLanguages: ['fr', 'en'],
  },
}

export const OnboardingActions = {
  async save_user_name({ botUser, input, context }: ActionContext): Promise<ActionResult> {
    const cleanName = input.trim()
    await botUser.merge({ fullName: cleanName }).save()
    context.user_name = cleanName
    context.search_query = cleanName
    return { success: true }
  },

  async search_dgi({ context }: ActionContext): Promise<ActionResult> {
    try {
      const { default: DGIScraper } = await import('#bot/services/dgi_scraper_service')
      const searchQuery = context.search_query || context.user_name

      const dgiService = new DGIScraper()

      // Timeout de 8 secondes
      const searchPromise = dgiService.rechercherParNom(searchQuery)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout DGI')), 8000)
      )

      const result = (await Promise.race([searchPromise, timeoutPromise])) as any

      if (!result.success) {
        context.api_error = result.message || 'Erreur DGI'
        return { nextStep: 'api_error' }
      }

      const results = result.data || []
      context.search_results = results

      if (results.length === 0) {
        return { nextStep: 'found_none' }
      }

      if (results.length === 1) {
        context.selected_taxpayer = results[0]
        return { nextStep: 'found_one' }
      }

      return { nextStep: 'found_multiple' }
    } catch (error) {
      console.error('Erreur DGI:', error)
      context.api_error = 'Service DGI indisponible'
      return { nextStep: 'api_error' }
    }
  },

  async associate_taxpayer({ botUser, context }: ActionContext): Promise<ActionResult> {
    const selectedTaxpayer = context.selected_taxpayer

    let taxpayer = await Taxpayer.findByNIU(selectedTaxpayer.niu)

    if (!taxpayer) {
      taxpayer = await Taxpayer.createFromDGI({
        niu: selectedTaxpayer.niu,
        nom: selectedTaxpayer.nom,
        prenom: selectedTaxpayer.prenom,
        numeroDocument: selectedTaxpayer.numeroDocument,
        activite: selectedTaxpayer.activite,
        regime: selectedTaxpayer.regime,
        centre: selectedTaxpayer.centre,
        etat: 'actif',
      })
    }

    await botUser.merge({ taxpayerId: taxpayer.id }).save()
    await botUser.markAsVerified()

    context.final_taxpayer = {
      niu: taxpayer.niu,
      nom: taxpayer.getNomComplet(),
      centre: taxpayer.centreImpots || null,
      status: 'Vérifié DGI',
    }

    return { success: true }
  },

  async associate_taxpayer_by_index({
    botUser,
    context,
    input,
  }: ActionContext): Promise<ActionResult> {
    const index = Number.parseInt(input) - 1
    const searchResults = context.search_results || []

    if (!searchResults[index]) {
      throw new Error(`Invalid selection: ${input}`)
    }

    context.selected_taxpayer = searchResults[index]
    return OnboardingActions.associate_taxpayer({
      botUser,
      context,
      input,
      session: null,
      sessionId: '',
    })
  },

  async save_manual_niu({ context, input }: ActionContext): Promise<ActionResult> {
    context.manual_niu = input.trim().toUpperCase()
    return { success: true }
  },

  async verify_niu({ context }: ActionContext): Promise<ActionResult> {
    try {
      const { default: DGIScraper } = await import('#bot/services/dgi_scraper_service')
      const dgiService = new DGIScraper()

      const verifyPromise = dgiService.verifierNIU(context.manual_niu)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 8000)
      )

      const result = (await Promise.race([verifyPromise, timeoutPromise])) as any

      if (!result.success) {
        return { nextStep: 'api_error' }
      }

      if (result.data) {
        context.manual_taxpayer = result.data
        return { nextStep: 'niu_found' }
      }

      return { nextStep: 'niu_not_found' }
    } catch (error) {
      return { nextStep: 'api_error' }
    }
  },

  async associate_manual_taxpayer({ botUser, context }: ActionContext): Promise<ActionResult> {
    const manualTaxpayer = context.manual_taxpayer

    let taxpayer = await Taxpayer.findByNIU(manualTaxpayer.niu)

    if (!taxpayer) {
      taxpayer = await Taxpayer.createFromDGI({
        niu: manualTaxpayer.niu,
        nom: manualTaxpayer.nom,
        prenom: manualTaxpayer.prenom,
        numeroDocument: manualTaxpayer.numeroDocument,
        activite: manualTaxpayer.activite,
        regime: manualTaxpayer.regime,
        centre: '',
        etat: manualTaxpayer.etat,
      })
    }

    await botUser.merge({ taxpayerId: taxpayer.id }).save()
    await botUser.markAsVerified()

    context.final_taxpayer = {
      niu: taxpayer.niu,
      nom: taxpayer.getNomComplet(),
      centre: taxpayer.centreImpots || null,
      status: 'Vérifié DGI',
    }

    return { success: true }
  },

  async create_profile_without_niu({ botUser }: ActionContext): Promise<ActionResult> {
    await botUser.markAsVerified()
    return { success: true }
  },
}
