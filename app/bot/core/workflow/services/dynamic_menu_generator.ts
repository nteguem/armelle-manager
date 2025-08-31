import type { MenuOption } from '../engine/workflow_context.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Générateur de menus dynamiques depuis données
 */
export class DynamicMenuGenerator {
  private static instance: DynamicMenuGenerator

  private constructor() {}

  public static getInstance(): DynamicMenuGenerator {
    if (!DynamicMenuGenerator.instance) {
      DynamicMenuGenerator.instance = new DynamicMenuGenerator()
    }
    return DynamicMenuGenerator.instance
  }

  /**
   * Génère options menu depuis tableau de données
   */
  public generateFromArray(
    data: any[],
    config: {
      labelTemplate?: string
      maxOptions?: number
      addNoneOption?: boolean
      noneOptionLabel?: string
    } = {}
  ): MenuOption[] {
    if (!Array.isArray(data) || data.length === 0) {
      logger.warn('DynamicMenuGenerator: No data provided or empty array')
      return []
    }

    // Limiter nombre d'options si spécifié
    const limitedData = config.maxOptions ? data.slice(0, config.maxOptions) : data

    // Générer options principales
    const options: MenuOption[] = limitedData.map((item, index) => ({
      id: String(index + 1),
      label: this.formatLabel(item, config.labelTemplate),
      value: item,
    }))

    // Ajouter option "Aucun" si demandée
    if (config.addNoneOption) {
      options.push({
        id: '0',
        label: config.noneOptionLabel || 'Aucun de ces choix',
        value: null,
      })
    }

    logger.debug(`Generated ${options.length} menu options from ${data.length} items`)
    return options
  }

  /**
   * Génère menu paginé pour grandes listes
   */
  public generatePaginated(
    data: any[],
    pageSize: number = 5,
    currentPage: number = 1,
    config: {
      labelTemplate?: string
      addNoneOption?: boolean
      addNavigationOptions?: boolean
    } = {}
  ): {
    options: MenuOption[]
    hasMore: boolean
    totalPages: number
    currentPage: number
  } {
    const totalPages = Math.ceil(data.length / pageSize)
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    const pageData = data.slice(startIndex, endIndex)

    // Générer options pour cette page
    const options: MenuOption[] = pageData.map((item, index) => ({
      id: String(startIndex + index + 1),
      label: this.formatLabel(item, config.labelTemplate),
      value: item,
    }))

    // Ajouter options de navigation si demandées
    if (config.addNavigationOptions && totalPages > 1) {
      if (currentPage < totalPages) {
        options.push({
          id: 'next',
          label: `Suivant (${currentPage + 1}/${totalPages})`,
          value: { action: 'next_page', page: currentPage + 1 },
        })
      }

      if (currentPage > 1) {
        options.push({
          id: 'prev',
          label: `Précédent (${currentPage - 1}/${totalPages})`,
          value: { action: 'prev_page', page: currentPage - 1 },
        })
      }
    }

    // Ajouter option "Aucun"
    if (config.addNoneOption) {
      options.push({
        id: '0',
        label: 'Aucun de ces choix',
        value: null,
      })
    }

    return {
      options,
      hasMore: currentPage < totalPages,
      totalPages,
      currentPage,
    }
  }

  /**
   * Formate label selon template ou format par défaut
   */
  private formatLabel(item: any, template?: string): string {
    if (!template) {
      // Format par défaut pour contribuables
      if (item.nomRaisonSociale) {
        const prenom = item.prenomSigle ? ` ${item.prenomSigle}` : ''
        const centre = item.centre ? ` - ${item.centre}` : ''
        return `${item.nomRaisonSociale}${prenom}${centre}`
      }

      // Format générique
      return item.name || item.label || item.title || String(item)
    }

    // Interpoler template avec propriétés item
    return template.replace(/\{\{(\w+)\}\}/g, (match, prop) => {
      return item[prop] !== undefined ? String(item[prop]) : match
    })
  }

  /**
   * Valide données pour génération menu
   */
  public validateData(data: any): { valid: boolean; error?: string } {
    if (!Array.isArray(data)) {
      return { valid: false, error: 'Data must be an array' }
    }

    if (data.length === 0) {
      return { valid: false, error: 'Data array is empty' }
    }

    return { valid: true }
  }
}
