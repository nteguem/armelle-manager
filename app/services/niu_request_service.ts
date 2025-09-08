// app/services/niu_request_service.ts

import logger from '@adonisjs/core/services/logger'

export default class NIURequestService {
  /**
   * Redirige vers le workflow spécialisé selon le type de contribuable sélectionné
   */
  async redirectToSpecificWorkflow(params: any, context?: any): Promise<any> {
    try {
      const { selectedType, userId } = params

      const workflowNames = {
        physical_non_pro: 'Personne physique non professionnelle',
        physical_pro: 'Personne physique professionnelle',
        morale: 'Personne morale (Société)',
      }

      logger.info(
        {
          userId,
          selectedType,
        },
        'Redirecting to specific NIU workflow type'
      )

      return {
        success: true,
        nextWorkflowType: selectedType,
        workflowName: workflowNames[selectedType as keyof typeof workflowNames] || selectedType,
        message: `Redirection vers le formulaire : ${workflowNames[selectedType as keyof typeof workflowNames]}`,
      }
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          params,
        },
        'Error in NIU workflow type selection'
      )

      return {
        success: false,
        error: `Erreur de redirection: ${error.message}`,
      }
    }
  }

  /**
   * Service minimal pour tester la collecte d'informations des workflows spécialisés
   * Retourne juste les données collectées sans sauvegarder (pour les tests)
   */
  async saveNIURequest(params: any, context?: any): Promise<any> {
    try {
      logger.info(
        {
          requestType: params.requestType,
          dataKeys: Object.keys(params),
        },
        'NIU Request data collected (test mode)'
      )

      // Simulation de sauvegarde réussie pour tester le workflow
      return {
        success: true,
        requestId: `TEST_${Date.now()}`,
        message: 'Données collectées avec succès (mode test)',
        data: params,
      }
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          params,
        },
        'Error in NIU request test'
      )

      return {
        success: false,
        error: `Erreur test: ${error.message}`,
      }
    }
  }
}
