export default {
  /**
   * Commandes système par ordre de priorité
   */
  systemCommands: {
    /**
     * Priorité 1 - Commandes de langue (toujours autorisées)
     */
    language: {
      french: {
        synonyms: ['fr', 'francais', 'français'],
        target: 'fr',
        priority: 1,
        alwaysAllowed: true,
      },
      english: {
        synonyms: ['en', 'english', 'anglais'],
        target: 'en',
        priority: 1,
        alwaysAllowed: true,
      },
    },

    /**
     * Priorité 2 - Commandes de navigation
     */
    navigation: {
      help: {
        synonyms: ['aide', 'help', '?', 'assistance'],
        priority: 2,
        alwaysAllowed: true,
        contextual: true, // Aide adaptée au contexte
      },
      menu: {
        synonyms: ['menu', 'accueil', 'home', 'retour'],
        priority: 2,
        alwaysAllowed: false,
        blockedInWorkflows: ['onboarding'], // Bloqué pendant onboarding
      },
      back: {
        synonyms: ['*', 'precedent', 'précédent', 'back'],
        priority: 2,
        alwaysAllowed: false,
        workflowOnly: true, // Seulement dans les workflows
      },
    },

    /**
     * Priorité 3 - Commandes de workflow
     */
    workflow: {
      cancel: {
        synonyms: ['annuler', 'cancel', 'stop', 'quitter'],
        priority: 3,
        alwaysAllowed: false,
        workflowOnly: true,
      },
      restart: {
        synonyms: ['recommencer', 'restart', 'reset'],
        priority: 3,
        alwaysAllowed: false,
        workflowOnly: true,
        confirmationRequired: true,
      },
    },
  },

  /**
   * Contextes où certaines commandes sont bloquées
   */
  restrictions: {
    onboarding: {
      blocked: ['menu', 'cancel'], // Impossible de quitter l'onboarding
      allowed: ['fr', 'en', 'aide'], // Changement langue et aide autorisés
    },
    workflow: {
      blocked: [], // Pas de restrictions spéciales
      allowed: 'all',
    },
    menu: {
      blocked: ['*', 'annuler'], // Pas de navigation arrière au menu
      allowed: 'all',
    },
  },

  /**
   * Configuration de détection
   */
  detection: {
    caseSensitive: false,
    exactMatch: true, // Correspondance exacte requise
    maxSynonyms: 5, // Limite par commande
    timeoutMs: 100, // Timeout détection
  },
}
