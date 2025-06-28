import logger from '@adonisjs/core/services/logger'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SupportedLanguage } from '#bot/types/bot_types'

/**
 * Gestionnaire des traductions multilingues
 */
export default class I18nManager {
  private static instance: I18nManager
  private readonly translations = new Map<string, any>()
  private readonly fallbackLanguage: SupportedLanguage = 'fr'

  private constructor() {
    // Singleton
  }

  /**
   * Instance singleton
   */
  public static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager()
    }
    return I18nManager.instance
  }

  /**
   * Initialise le gestionnaire avec chargement des traductions
   */
  public async initialize(): Promise<void> {
    await this.loadAllTranslations()
  }

  /**
   * Charge toutes les traductions depuis les fichiers JSON
   * Détecte automatiquement tous les fichiers .json dans chaque dossier de langue
   */
  private async loadAllTranslations(): Promise<void> {
    const languages: SupportedLanguage[] = ['fr', 'en']

    for (const language of languages) {
      try {
        // Utilise votre structure: resources/locales au lieu de resources/lang
        const languageDir = join(process.cwd(), 'resources', 'locales', language)
        const files = await this.scanJsonFiles(languageDir)

        for (const file of files) {
          try {
            const filePath = join(languageDir, `${file}.json`)
            const fileContent = await readFile(filePath, 'utf-8')
            const translations = JSON.parse(fileContent)

            this.translations.set(`${language}.${file}`, translations)
            logger.info({ language, file }, 'Translation file loaded')
          } catch (error) {
            logger.warn({ language, file, error: error.message }, 'Failed to load translation file')
          }
        }
      } catch (error) {
        logger.warn({ language, error: error.message }, 'Language directory not found')
      }
    }

    const totalFiles = this.translations.size
    logger.info({ totalFiles }, 'I18nManager initialized successfully')
  }

  /**
   * Scan automatique des fichiers JSON dans un dossier
   */
  private async scanJsonFiles(directory: string): Promise<string[]> {
    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir(directory)

      const jsonFiles = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''))
        .sort() // Tri alphabétique pour un ordre prévisible

      logger.debug(
        { directory, totalFiles: files.length, jsonFiles: jsonFiles.length },
        'Scanned directory for JSON files'
      )

      return jsonFiles
    } catch (error) {
      logger.debug({ directory, error: error.message }, 'Cannot scan directory')
      return []
    }
  }

  /**
   * Traduit une clé avec paramètres optionnels
   */
  public t(
    key: string,
    params: Record<string, any> = {},
    language: SupportedLanguage = 'fr'
  ): string {
    const translation = this.getTranslation(key, language)

    if (translation === null) {
      // Fallback vers langue par défaut
      const fallbackTranslation = this.getTranslation(key, this.fallbackLanguage)
      if (fallbackTranslation === null) {
        return `[MISSING: ${key}]`
      }
      return this.interpolate(fallbackTranslation, params)
    }

    return this.interpolate(translation, params)
  }

  /**
   * Récupère une traduction brute
   */
  private getTranslation(key: string, language: SupportedLanguage): string | string[] | null {
    const [file, ...keyParts] = key.split('.')
    const fullKey = `${language}.${file}`
    const translations = this.translations.get(fullKey)

    if (!translations) {
      return null
    }

    const value = this.getNestedValue(translations, keyParts)

    if (value === undefined || value === null) {
      return null
    }

    return value
  }

  /**
   * Récupère une valeur imbriquée dans un objet
   */
  private getNestedValue(obj: any, keys: string[]): any {
    return keys.reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined
    }, obj)
  }

  /**
   * Interpole les paramètres dans le texte
   */
  private interpolate(text: string | string[], params: Record<string, any>): string {
    let finalText: string

    if (Array.isArray(text)) {
      finalText = text.join('\n')
    } else {
      finalText = text
    }

    // Remplace les paramètres {param}
    return finalText.replace(/\{(\w+)\}/g, (match, param) => {
      if (params.hasOwnProperty(param)) {
        return String(params[param])
      }
      return match // Garde le placeholder si paramètre manquant
    })
  }

  /**
   * Récupère les synonymes d'une commande
   */
  public getCommandSynonyms(command: string, language: SupportedLanguage = 'fr'): string[] {
    const key = `commands.${command}_commands`
    const synonyms = this.getTranslation(key, language)

    if (Array.isArray(synonyms)) {
      return synonyms
    }

    return []
  }

  /**
   * Vérifie si une clé de traduction existe
   */
  public hasTranslation(key: string, language: SupportedLanguage = 'fr'): boolean {
    return this.getTranslation(key, language) !== null
  }

  /**
   * Récupère toutes les clés disponibles pour une langue
   */
  public getAvailableKeys(language: SupportedLanguage = 'fr'): string[] {
    const keys: string[] = []

    for (const [mapKey, translations] of this.translations.entries()) {
      if (mapKey.startsWith(`${language}.`)) {
        const file = mapKey.split('.')[1]
        keys.push(...this.extractKeysFromObject(translations, file))
      }
    }

    return keys
  }

  /**
   * Extrait toutes les clés d'un objet de traductions
   */
  private extractKeysFromObject(obj: any, prefix: string): string[] {
    const keys: string[] = []

    const traverse = (current: any, path: string) => {
      if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
        for (const [key, value] of Object.entries(current)) {
          const newPath = path ? `${path}.${key}` : key
          traverse(value, newPath)
        }
      } else {
        keys.push(path)
      }
    }

    traverse(obj, prefix)
    return keys
  }

  /**
   * Recharge les traductions (utile en développement)
   */
  public async reload(): Promise<void> {
    logger.info('Reloading I18nManager translations')
    this.translations.clear()
    await this.loadAllTranslations()
  }

  /**
   * Récupère les statistiques des traductions
   */
  public getStats(): {
    totalKeys: number
    languageStats: Record<SupportedLanguage, number>
    missingTranslations: string[]
  } {
    const stats = {
      totalKeys: 0,
      languageStats: {} as Record<SupportedLanguage, number>,
      missingTranslations: [] as string[],
    }

    const languages: SupportedLanguage[] = ['fr', 'en']

    // Compter les clés par langue
    for (const language of languages) {
      const keys = this.getAvailableKeys(language)
      stats.languageStats[language] = keys.length
      stats.totalKeys = Math.max(stats.totalKeys, keys.length)
    }

    // Trouver les traductions manquantes
    const frenchKeys = this.getAvailableKeys('fr')
    const englishKeys = this.getAvailableKeys('en')

    for (const key of frenchKeys) {
      if (!englishKeys.includes(key)) {
        stats.missingTranslations.push(`en.${key}`)
      }
    }

    for (const key of englishKeys) {
      if (!frenchKeys.includes(key)) {
        stats.missingTranslations.push(`fr.${key}`)
      }
    }

    return stats
  }

  /**
   * Méthode de debug pour vérifier les chemins et fichiers détectés
   */
  public async debugPaths(): Promise<void> {
    const basePath = join(process.cwd(), 'resources', 'locales')
    logger.info({ basePath }, 'I18nManager debug paths')

    const languages: SupportedLanguage[] = ['fr', 'en']

    for (const language of languages) {
      const languageDir = join(basePath, language)
      const files = await this.scanJsonFiles(languageDir)

      if (files.length === 0) {
        logger.warn({ language, languageDir }, 'No JSON files found in language directory')
      } else {
        logger.info(
          { language, files, count: files.length },
          'JSON files detected in language directory'
        )

        for (const file of files) {
          const filePath = join(languageDir, `${file}.json`)
          try {
            await readFile(filePath, 'utf-8')
            logger.debug({ language, file }, 'File is readable')
          } catch {
            logger.warn({ language, file, filePath }, 'File is not readable')
          }
        }
      }
    }
  }
}
