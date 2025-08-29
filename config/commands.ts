export default {
  systemCommands: {
    language: {
      french: {
        synonyms: ['fr', 'francais', 'français', 'fran'],
        target: 'fr',
        priority: 1,
        alwaysAllowed: true,
      },
      english: {
        synonyms: ['en', 'english', 'anglais', 'eng'],
        target: 'en',
        priority: 1,
        alwaysAllowed: true,
      },
    },

    navigation: {
      help: {
        synonyms: ['aide', 'help', '?', 'assistance'],
        priority: 2,
        alwaysAllowed: true,
        contextual: true,
      },
      menu: {
        synonyms: ['menu', 'accueil', 'home', 'retour', 'start'],
        priority: 2,
        alwaysAllowed: false,
        blockedInWorkflows: ['onboarding'],
      },
      back: {
        synonyms: ['*', 'precedent', 'précédent', 'back', 'retour', 'prev'],
        priority: 2,
        alwaysAllowed: false,
        workflowOnly: true,
      },
    },

    workflow: {
      cancel: {
        synonyms: ['annuler', 'cancel', 'stop', 'quitter', 'arreter'],
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

  restrictions: {
    onboarding: {
      blocked: ['menu', 'cancel'],
      allowed: ['fr', 'en', 'aide'],
    },
    workflow: {
      blocked: [],
      allowed: 'all',
    },
    menu: {
      blocked: ['*', 'annuler'],
      allowed: 'all',
    },
  },

  detection: {
    caseSensitive: false,
    exactMatch: true,
    maxSynonyms: 5,
    timeoutMs: 100,
  },
}
