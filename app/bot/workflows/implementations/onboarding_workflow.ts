import { BaseWorkflow } from '../base_workflow.js'
import DGIScraperService from '#bot/services/dgi_scraper_service'
import Taxpayer from '#models/tax_payer'
import logger from '@adonisjs/core/services/logger'

export class OnboardingWorkflow extends BaseWorkflow {
  id = 'onboarding'
  initialStep = 'welcome_collect_name'
  menuTitleKey = 'workflows.onboarding.title'
  menuOrder = 0

  subflows = {
    registration: {
      id: 'registration',
      nameKey: 'workflows.onboarding.subflows.registration',
      steps: ['welcome_collect_name', 'search_dgi'],
      totalSteps: 2,
    },
    no_results_flow: {
      id: 'no_results_flow',
      nameKey: 'workflows.onboarding.subflows.no_results',
      steps: ['no_results'],
      totalSteps: 1,
    },
    single_result_flow: {
      id: 'single_result_flow',
      nameKey: 'workflows.onboarding.subflows.confirmation',
      steps: ['confirm_single'],
      totalSteps: 1,
    },
    multiple_results_flow: {
      id: 'multiple_results_flow',
      nameKey: 'workflows.onboarding.subflows.selection',
      steps: ['select_from_list'],
      totalSteps: 1,
    },
    manual_niu_flow: {
      id: 'manual_niu_flow',
      nameKey: 'workflows.onboarding.subflows.manual_niu',
      steps: ['manual_niu_entry', 'verify_niu', 'confirm_manual_taxpayer'],
      totalSteps: 3,
    },
    error_recovery_flow: {
      id: 'error_recovery_flow',
      nameKey: 'workflows.onboarding.subflows.error_recovery',
      steps: ['dgi_error'],
      totalSteps: 1,
    },
  }

  steps = {
    welcome_collect_name: {
      id: 'welcome_collect_name',
      type: 'input' as const,
      messageKey: 'workflows.onboarding.welcome_collect_name',
      footerKey: 'workflows.onboarding.footer.enter_name',
      subflowId: 'registration',
      validation: { type: 'name' as const, required: true, min: 2, max: 100 },
      transitions: { default: 'search_dgi' },
      action: 'save_user_name',
      allowSystemCommands: false,
    },

    search_dgi: {
      id: 'search_dgi',
      type: 'api' as const,
      messageKey: 'workflows.onboarding.searching_dgi',
      subflowId: 'registration',
      progressMode: 'none' as const,
      transitions: {
        found_none: 'no_results',
        found_one: 'confirm_single',
        found_multiple: 'select_from_list',
        api_error: 'dgi_error',
      },
      action: 'search_dgi',
      allowSystemCommands: false,
    },

    no_results: {
      id: 'no_results',
      type: 'menu' as const,
      messageKey: 'workflows.onboarding.no_results',
      footerKey: 'common.navigation.select_option',
      subflowId: 'no_results_flow',
      transitions: {
        '1': 'welcome_collect_name',
        '2': 'manual_niu_entry',
        '3': 'onboarding_complete',
      },
      allowSystemCommands: false,
    },

    confirm_single: {
      id: 'confirm_single',
      type: 'menu' as const,
      messageKey: 'workflows.onboarding.confirm_single',
      footerKey: 'common.navigation.select_option',
      subflowId: 'single_result_flow',
      transitions: {
        '1': 'onboarding_complete',
        '2': 'welcome_collect_name',
      },
      action: 'prepare_single_taxpayer',
      allowSystemCommands: false,
    },

    select_from_list: {
      id: 'select_from_list',
      type: 'menu' as const,
      messageKey: 'workflows.onboarding.select_from_list',
      footerKey: 'common.navigation.select_option',
      subflowId: 'multiple_results_flow',
      transitions: {
        '1': 'onboarding_complete',
        '2': 'onboarding_complete',
        '3': 'onboarding_complete',
        '4': 'onboarding_complete',
        '5': 'onboarding_complete',
        '0': 'welcome_collect_name',
      },
      action: 'prepare_multiple_taxpayers',
      allowSystemCommands: false,
    },

    dgi_error: {
      id: 'dgi_error',
      type: 'menu' as const,
      messageKey: 'workflows.onboarding.dgi_error',
      footerKey: 'common.navigation.select_option',
      subflowId: 'error_recovery_flow',
      transitions: {
        '1': 'welcome_collect_name',
        '2': 'manual_niu_entry',
        '3': 'onboarding_complete',
      },
      allowSystemCommands: false,
    },

    manual_niu_entry: {
      id: 'manual_niu_entry',
      type: 'input' as const,
      messageKey: 'workflows.onboarding.manual_niu_entry',
      footerKey: 'workflows.onboarding.footer.enter_niu',
      subflowId: 'manual_niu_flow',
      validation: { type: 'niu' as const, required: false },
      transitions: {
        valid_niu: 'verify_niu',
        empty_niu: 'onboarding_complete',
      },
      action: 'save_manual_niu',
      allowSystemCommands: false,
    },

    verify_niu: {
      id: 'verify_niu',
      type: 'api' as const,
      messageKey: 'workflows.onboarding.verify_niu',
      subflowId: 'manual_niu_flow',
      progressMode: 'none' as const,
      transitions: {
        niu_found: 'confirm_manual_taxpayer',
        niu_not_found: 'onboarding_complete',
        api_error: 'onboarding_complete',
      },
      action: 'verify_niu',
      allowSystemCommands: false,
    },

    confirm_manual_taxpayer: {
      id: 'confirm_manual_taxpayer',
      type: 'menu' as const,
      messageKey: 'workflows.onboarding.confirm_manual_taxpayer',
      footerKey: 'common.navigation.select_option',
      subflowId: 'manual_niu_flow',
      transitions: {
        '1': 'onboarding_complete',
        '2': 'onboarding_complete',
      },
      action: 'prepare_manual_taxpayer',
      allowSystemCommands: false,
    },

    onboarding_complete: {
      id: 'onboarding_complete',
      type: 'display' as const,
      messageKey: 'workflows.onboarding.complete',
      footerKey: 'workflows.onboarding.footer.complete',
      progressMode: 'none' as const,
      transitions: { default: 'END' },
      action: 'finalize_onboarding',
      allowSystemCommands: true,
    },
  }

  constructor(private dgiService: DGIScraperService) {
    super()
  }

  protected setupActions(): void {
    this.actions.save_user_name = async (session, input) => {
      session.currentContext.userName = input!.content.trim()
      return { success: true }
    }

    this.actions.search_dgi = async (session) => {
      const name = session.currentContext.userName
      const result = await this.dgiService.rechercherParNom(name)

      if (!result.success) return { success: true, transition: 'api_error' }
      if (result.data!.length === 0) return { success: true, transition: 'found_none' }
      if (result.data!.length === 1) {
        return {
          success: true,
          transition: 'found_one',
          data: { taxpayer: result.data![0] },
        }
      }
      return {
        success: true,
        transition: 'found_multiple',
        data: { taxpayers: result.data!.slice(0, 5) },
      }
    }

    this.actions.save_manual_niu = async (session, input) => {
      const niu = input!.content.trim()
      if (!niu) return { success: true, transition: 'empty_niu' }

      session.currentContext.manualNiu = niu
      return { success: true, transition: 'valid_niu' }
    }

    this.actions.verify_niu = async (session) => {
      const niu = session.currentContext.manualNiu
      const result = await this.dgiService.verifierNIU(niu)

      if (!result.success) return { success: true, transition: 'api_error' }
      if (!result.data) return { success: true, transition: 'niu_not_found' }

      return {
        success: true,
        transition: 'niu_found',
        data: { verifiedTaxpayer: result.data },
      }
    }

    this.actions.finalize_onboarding = async (session) => {
      session.botUser.isVerified = true
      session.botUser.fullName = session.currentContext.userName
      await session.botUser.save()

      // Créer/lier contribuable si disponible
      if (session.currentContext.selectedTaxpayer) {
        const taxpayerData = session.currentContext.selectedTaxpayer
        const taxpayer = await Taxpayer.createFromDGI(taxpayerData)
        await session.botUser.linkTaxpayer(taxpayer.id)
      }

      logger.info({ userId: session.botUserId }, 'Onboarding completed')
      return { success: true }
    }
  }

  get requiresVerification(): boolean {
    return false // Onboarding accessible à tous
  }
}
