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
   * Using '*' to allow all origins
   */
  origin: '*',

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
   * NOTE: Avec origin: '*', credentials doit être false
   */
  credentials: false,

  /**
   * Number of seconds to cache preflight requests.
   */
  maxAge: 90,
})

export default corsConfig
