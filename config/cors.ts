import { defineConfig } from '@adonisjs/cors'

/**
 * Configuration options for the CORS middleware
 */
const corsConfig = defineConfig({
  /**
   * Enable/disable CORS
   */
  enabled: true,

  /**
   * List of origins allowed to make requests.
   * You can use patterns and functions for dynamic matching.
   */
  origin: (requestOrigin, ctx) => {
    // Liste des origines autorisées
    const allowedOrigins = [
      'http://localhost:3000', // Next.js dev
      'http://localhost:3001',
    ]

    // Vérifier si l'origine est dans la liste autorisée
    return allowedOrigins.includes(requestOrigin)
  },

  /**
   * List of methods allowed for CORS requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  /**
   * List of headers allowed for CORS requests.
   */
  headers: true, // Accepte tous les headers

  /**
   * List of headers to expose to the client.
   */
  exposeHeaders: [
    'cache-control',
    'content-language',
    'content-type',
    'expires',
    'last-modified',
    'pragma',
    'x-request-id',
  ],

  /**
   * Whether or not to send cookies and authorization headers.
   */
  credentials: true,

  /**
   * Number of seconds to cache preflight requests.
   */
  maxAge: 90,
})

export default corsConfig
