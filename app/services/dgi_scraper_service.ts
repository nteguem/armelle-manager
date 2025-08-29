import { chromium, Browser, Page, BrowserContext, Route } from 'playwright'
import type { TaxpayerData, ScraperResponse } from '#types/taxpayer_types'

// Type pour les résultats de recherche
type SearchResultType = 'aucune' | 'unique' | 'multiple' | 'erreur'

interface EvaluateResult {
  type: SearchResultType
  message: string
  data: TaxpayerData[]
}

interface PerformanceMetrics {
  avgResponseTime: number
  totalRequests: number
  lastRequestTime: number
}

export default class DGIScraperService {
  private baseUrl: string
  private loginUrl: string
  private contribuableUrl: string
  private browser: Browser | null
  private context: BrowserContext | null

  // Propriétés pour optimisation
  private pagePool: Page[] = []
  private readonly MAX_PAGES = 2
  private metrics: PerformanceMetrics
  private lastNIUSearch: string = ''

  constructor() {
    this.baseUrl = 'https://teledeclaration-dgi.cm/modules/Common/Account/eregistration.aspx?er=old'
    this.loginUrl = 'https://teledeclaration-dgi.cm/modules/Common/Account/Login.aspx'
    this.contribuableUrl =
      'https://teledeclaration-dgi.cm/modules/Common/Account/contribuable_pp.aspx?t=PPNP'
    this.browser = null
    this.context = null

    // Initialisation métriques
    this.metrics = {
      avgResponseTime: 0,
      totalRequests: 0,
      lastRequestTime: 0,
    }
  }

  /**
   * Track performance metrics
   */
  private trackPerformance(startTime: number): void {
    const duration = Date.now() - startTime
    this.metrics.totalRequests++
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + duration) /
      this.metrics.totalRequests
    this.metrics.lastRequestTime = duration

    console.log(`⚡ Requête: ${duration}ms | Moyenne: ${this.metrics.avgResponseTime.toFixed(0)}ms`)
  }

  /**
   * Obtient une page depuis le pool ou en crée une nouvelle
   */
  private async getPooledPage(): Promise<Page> {
    // Essayer de récupérer une page du pool
    if (this.pagePool.length > 0) {
      const page = this.pagePool.pop()!
      console.log(`♻️ Réutilisation page du pool (${this.pagePool.length} restantes)`)

      // Nettoyer la page
      await page.goto('about:blank')
      return page
    }

    // Sinon créer une nouvelle page
    return await this._createNewPage()
  }

  /**
   * Libère une page dans le pool ou la ferme
   */
  private async releasePooledPage(page: Page): Promise<void> {
    try {
      if (this.pagePool.length < this.MAX_PAGES) {
        // Nettoyer et remettre dans le pool
        await page.goto('about:blank')
        this.pagePool.push(page)
        console.log(`♻️ Page remise dans le pool (${this.pagePool.length} disponibles)`)
      } else {
        // Pool plein, fermer la page
        await page.close()
      }
    } catch (error) {
      // En cas d'erreur, fermer la page
      try {
        await page.close()
      } catch {}
    }
  }

  /**
   * Crée une nouvelle page optimisée avec Playwright
   */
  private async _createNewPage(): Promise<Page> {
    if (!this.browser) {
      console.log('🚀 Lancement du navigateur Playwright optimisé...')
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=VizDisplayCompositor',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--memory-pressure-off',
        ],
      })

      // Créer un contexte persistant pour partager les cookies/session
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true,
        // Optimisations Playwright
        bypassCSP: true,
        javaScriptEnabled: true,
      })
    }

    const page = await this.context!.newPage()

    // Bloquer les ressources inutiles pour gagner en vitesse
    await page.route('**/*', (route: Route) => {
      const resourceType = route.request().resourceType()
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
        route.abort()
      } else {
        route.continue()
      }
    })

    // Timeout par défaut
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(20000)

    return page
  }

  async rechercherParNom(nom: string): Promise<ScraperResponse<TaxpayerData[]>> {
    const startTime = Date.now()
    console.log('nomm', nom)
    if (!nom || !nom.trim()) {
      return {
        success: false,
        message: 'Nom obligatoire',
        data: null,
      }
    }

    const nomTrim = nom.trim()
    const nomSansEspaces = nomTrim.replace(/\s+/g, '')
    const motsNom = nomTrim.split(/\s+/)

    // Stratégie 1: Essayer le nom complet si ≤ 14 caractères (sans espaces)
    if (nomSansEspaces.length <= 14) {
      const resultComplet = await this._effectuerRecherche(nomTrim)

      if (resultComplet.success && resultComplet.data && resultComplet.data.length > 0) {
        this.trackPerformance(startTime)
        return resultComplet
      }
    }

    // Stratégie 2: Recherche avec premier nom + filtrage local ultra-rapide
    if (motsNom.length >= 2) {
      const premierNom = motsNom[0]
      const deuxiemeNom = motsNom[1].toLowerCase()

      const resultPremierNom = await this._effectuerRecherche(premierNom)

      if (resultPremierNom.success && resultPremierNom.data && resultPremierNom.data.length > 0) {
        // Filtrage local ultra-rapide avec pré-calcul
        const resultatsFiltrés = resultPremierNom.data.filter((result) => {
          const nomComplet = (result.nomRaisonSociale + ' ' + result.prenomSigle).toLowerCase()
          return nomComplet.includes(deuxiemeNom)
        })

        this.trackPerformance(startTime)
        return {
          success: true,
          message:
            resultatsFiltrés.length > 0
              ? `${resultatsFiltrés.length} résultat(s) trouvé(s) après filtrage`
              : 'Aucun résultat après filtrage local',
          data: resultatsFiltrés,
          type:
            resultatsFiltrés.length === 0
              ? 'aucune'
              : resultatsFiltrés.length === 1
                ? 'unique'
                : 'multiple',
        }
      }
      console.log('DGI search result:', resultPremierNom)

      this.trackPerformance(startTime)
      return resultPremierNom
    }

    // Fallback: nom unique
    const result = await this._effectuerRecherche(nomTrim)
    this.trackPerformance(startTime)
    return result
  }

  /**
   * Effectue la recherche proprement dite avec Playwright
   */
  private async _effectuerRecherche(terme: string): Promise<ScraperResponse<TaxpayerData[]>> {
    let page: Page | null = null

    try {
      page = await this.getPooledPage()

      // Navigation avec Playwright (plus robuste)
      await this._navigateWithRetry(page, this.contribuableUrl, 2)

      // Playwright attend automatiquement que les éléments soient disponibles
      // Sélectionner "Salarié du secteur public" dans le dropdown
      await page.selectOption('#ddlSTATUT_ACTIVITE', '1', { timeout: 10000 })

      // Attendre que le formulaire se mette à jour après la sélection
      await page.waitForTimeout(500)

      // Nettoyer et remplir le champ de recherche
      // Playwright gère mieux les champs dynamiques
      await page.fill('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', '')
      await page.fill('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', terme)

      // Cliquer sur le bouton de recherche
      await page.click('#findIdemployeur_dirigeant_ibFindContribuable')

      // Attendre la réponse avec Playwright
      await this._waitForSearchResponse(page)

      // Analyser les résultats
      const result = await page.evaluate((): EvaluateResult => {
        // Vérifier le span de résultat
        const lblNom = document.querySelector(
          '#findIdemployeur_dirigeant_lblNOMCONTRIBUABLE'
        ) as HTMLElement
        const lblText = lblNom ? lblNom.textContent?.trim() || '' : ''

        // Cas 1: Aucune correspondance
        if (lblText.includes('Aucune correspondance')) {
          return {
            type: 'aucune' as const,
            message: 'Aucune correspondance trouvée',
            data: [] as TaxpayerData[],
          }
        }

        // Vérifier s'il y a plusieurs correspondances
        const correspondanceMatch = lblText.match(/(\d+)\s+correspondance/)
        if (correspondanceMatch && Number.parseInt(correspondanceMatch[1]) > 1) {
          // Cas 3: Plusieurs correspondances - extraire du tableau
          const table = document.querySelector(
            '#findIdemployeur_dirigeant_DataGrid1'
          ) as HTMLTableElement
          if (table) {
            const rows = Array.from(table.querySelectorAll('tr')).slice(1)
            const results = rows
              .map((row) => {
                const cells = Array.from(row.querySelectorAll('td'))
                if (cells.length >= 5) {
                  const niuLink = cells[1].querySelector('a') as HTMLAnchorElement
                  return {
                    niu: niuLink
                      ? niuLink.textContent?.trim() || ''
                      : cells[1].textContent?.trim() || '',
                    nomRaisonSociale: cells[2].textContent?.trim() || '',
                    prenomSigle: cells[3].textContent?.trim() || '',
                    centre: cells[4].textContent?.trim() || '',
                  }
                }
                return null
              })
              .filter((r) => r !== null) as TaxpayerData[]

            return {
              type: 'multiple' as const,
              message: `${results.length} correspondance(s) trouvée(s)`,
              data: results,
            }
          }
        }

        // Cas 2: Une seule correspondance
        const niuInput = document.querySelector(
          '#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE'
        ) as HTMLInputElement
        const niu = niuInput ? niuInput.value.trim() : ''

        if (niu && niu.length > 5 && !niu.includes(' ')) {
          return {
            type: 'unique' as const,
            message: 'Une correspondance trouvée',
            data: [
              {
                niu: niu,
                nomRaisonSociale: lblText,
                prenomSigle: '',
                centre: '',
              },
            ] as TaxpayerData[],
          }
        }

        // Cas par défaut
        return {
          type: 'erreur' as const,
          message: 'Réponse inattendue du serveur',
          data: [] as TaxpayerData[],
        }
      })

      return {
        success: true,
        message: result.message,
        data: result.data,
        type: result.type,
      }
    } catch (error) {
      console.error('Erreur recherche:', error)
      return {
        success: false,
        message: 'Erreur technique lors de la recherche',
        data: null,
      }
    } finally {
      if (page) await this.releasePooledPage(page)
    }
  }

  /**
   * Attendre intelligemment la réponse de recherche avec Playwright
   */
  private async _waitForSearchResponse(page: Page): Promise<void> {
    try {
      // Playwright a une meilleure gestion de l'attente
      await page.waitForFunction(
        () => {
          const lblNom = document.querySelector('#findIdemployeur_dirigeant_lblNOMCONTRIBUABLE')
          const lblText = lblNom ? lblNom.textContent?.trim() || '' : ''

          return (
            lblText &&
            (lblText.includes('Aucune correspondance') ||
              lblText.includes('correspondance') ||
              (lblText.length > 5 && !lblText.includes('NON_PRO')))
          )
        },
        { timeout: 15000 }
      )
    } catch (timeoutError) {
      // Fallback avec waitForTimeout de Playwright
      await page.waitForTimeout(2000)
    }
  }

  async rechercher(nom: string, dateNaissance: string): Promise<ScraperResponse<TaxpayerData[]>> {
    const startTime = Date.now()
    let page: Page | null = null

    try {
      page = await this.getPooledPage()

      // Navigation avec retry
      await this._navigateWithRetry(page, this.baseUrl, 2)

      // Attendre les champs du formulaire
      await page.waitForSelector('input[name="txtRAISON_SOCIALE3"]', {
        state: 'visible',
        timeout: 10000,
      })
      await page.waitForSelector('input[name="txtDATECREATION3$myText"]', {
        state: 'visible',
        timeout: 10000,
      })

      // Remplir le nom avec Playwright (gère mieux les champs)
      await page.fill('input[name="txtRAISON_SOCIALE3"]', nom)

      // Remplir la date (contourne le masque de saisie)
      await page.evaluate((date: string) => {
        const dateInput = document.querySelector(
          'input[name="txtDATECREATION3$myText"]'
        ) as HTMLInputElement
        if (dateInput) {
          dateInput.value = date
          dateInput.dispatchEvent(new Event('input', { bubbles: true }))
          dateInput.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, dateNaissance)

      await page.waitForTimeout(500)

      // Lancer la recherche
      await page.click('input[name="btnFIND"]')

      // Attendre la réponse
      await this._waitForOldSearchResponse(page)

      // Analyser tout en une fois
      const analysisResult = await page.evaluate(() => {
        const errorEl = document.querySelector('#lblErrMsgNIULOGIN32')
        const errorMsg = errorEl ? errorEl.textContent?.trim() || '' : ''

        if (errorMsg && errorMsg.includes('Aucune correspondance')) {
          return { hasError: true, errorMessage: errorMsg, results: [] }
        }

        const table = document.querySelector('#gridVoisins') as HTMLTableElement
        if (!table) return { hasError: false, errorMessage: '', results: [] }

        const rows = Array.from(table.querySelectorAll('tr')).slice(1)
        const results = rows
          .map((row) => {
            const cells = Array.from(row.querySelectorAll('td'))
            if (cells.length < 9) return null

            const getText = (cell: HTMLElement) => {
              const link = cell.querySelector('a') as HTMLAnchorElement
              return link ? link.textContent?.trim() || '' : cell.textContent?.trim() || ''
            }

            return {
              niu: getText(cells[1] as HTMLElement),
              nomRaisonSociale: getText(cells[2] as HTMLElement),
              prenomSigle: getText(cells[3] as HTMLElement),
              lieuNaissance: getText(cells[4] as HTMLElement),
              numeroCniRc: getText(cells[5] as HTMLElement),
              activite: getText(cells[6] as HTMLElement),
              regime: getText(cells[7] as HTMLElement),
              centre: getText(cells[8] as HTMLElement),
            }
          })
          .filter((r) => r !== null) as TaxpayerData[]

        return { hasError: false, errorMessage: '', results }
      })

      if (analysisResult.hasError) {
        this.trackPerformance(startTime)
        return {
          success: true,
          message: 'Aucune correspondance trouvée',
          data: [],
        }
      }

      this.trackPerformance(startTime)
      return {
        success: true,
        message: `${analysisResult.results.length} résultat(s) trouvé(s)`,
        data: analysisResult.results,
      }
    } catch (error) {
      console.error('Erreur recherche par nom et date:', error)
      return {
        success: false,
        message: 'Erreur technique',
        data: null,
      }
    } finally {
      if (page) await this.releasePooledPage(page)
    }
  }

  /**
   * Attendre intelligemment la réponse de l'ancienne recherche avec Playwright
   */
  private async _waitForOldSearchResponse(page: Page): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const errorEl = document.querySelector('#lblErrMsgNIULOGIN32')
          const table = document.querySelector('#gridVoisins')

          return (
            (errorEl && errorEl.textContent?.trim()) ||
            (table && table.querySelectorAll('tr').length > 1)
          )
        },
        { timeout: 15000 }
      )
    } catch (timeoutError) {
      await page.waitForTimeout(2000)
    }
  }

  async verifierNIU(niu: string): Promise<ScraperResponse<TaxpayerData>> {
    const startTime = Date.now()

    if (!niu || !niu.trim()) {
      return {
        success: false,
        message: 'NIU invalide',
        data: null,
      }
    }

    // Vérifier si c'est le même NIU que la dernière recherche
    const isNewSearch = this.lastNIUSearch !== niu
    this.lastNIUSearch = niu

    let page: Page | null = null

    try {
      page = await this.getPooledPage()

      // Navigation avec retry - Forcer le reload si nouvelle recherche
      if (isNewSearch) {
        await this._navigateWithRetry(page, this.loginUrl, 2)
      } else {
        await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      }

      // Attendre et cliquer sur l'onglet de vérification NIU
      await page.click('#__tab_TabContainer1_TabPanelVerifyNIU')

      // Attendre que le champ NIU soit visible
      await page.waitForSelector('#TabContainer1_TabPanelVerifyNIU_txtNIU2', {
        state: 'visible',
        timeout: 8000,
      })

      // IMPORTANT: Nettoyer tous les champs avant nouvelle recherche
      await page.evaluate(() => {
        // Reset complet du formulaire
        const fieldsToReset = [
          '#TabContainer1_TabPanelVerifyNIU_txtNIU2',
          '#TabContainer1_TabPanelVerifyNIU_txtRAISON_SOCIALE',
          '#TabContainer1_TabPanelVerifyNIU_txtSIGLE',
          '#TabContainer1_TabPanelVerifyNIU_txtNUMEROCNIRC',
          '#TabContainer1_TabPanelVerifyNIU_txtACTIVITEDECLAREE',
          '#TabContainer1_TabPanelVerifyNIU_txtLIBELLEUNITEGESTION',
          '#TabContainer1_TabPanelVerifyNIU_txtLIBELLEREGIMEFISCAL',
          '#TabContainer1_TabPanelVerifyNIU_txtACTIF',
        ]

        fieldsToReset.forEach((selector) => {
          const element = document.querySelector(selector) as HTMLInputElement
          if (element) {
            element.value = ''
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }
        })
      })

      // Attendre un peu pour que le reset soit effectif
      await page.waitForTimeout(300)

      // Remplir le champ NIU avec Playwright
      await page.fill('#TabContainer1_TabPanelVerifyNIU_txtNIU2', '')
      await page.fill('#TabContainer1_TabPanelVerifyNIU_txtNIU2', niu)

      // Cliquer sur le bouton de recherche
      await page.click('#TabContainer1_TabPanelVerifyNIU_ibFindContribuable')

      // Attendre que les données se chargent
      await this._waitForNIUResponse(page)

      // Extraire toutes les données en une seule évaluation
      const data = await page.evaluate(() => {
        const getValue = (selector: string) => {
          const el = document.querySelector(selector) as HTMLInputElement
          return el ? (el.value || el.textContent || '').trim() : ''
        }

        return {
          niu: getValue('#TabContainer1_TabPanelVerifyNIU_txtNIU2'),
          nomRaisonSociale: getValue('#TabContainer1_TabPanelVerifyNIU_txtRAISON_SOCIALE'),
          prenomSigle: getValue('#TabContainer1_TabPanelVerifyNIU_txtSIGLE'),
          numeroCniRc: getValue('#TabContainer1_TabPanelVerifyNIU_txtNUMEROCNIRC'),
          activite: getValue('#TabContainer1_TabPanelVerifyNIU_txtACTIVITEDECLAREE'),
          centre: getValue('#TabContainer1_TabPanelVerifyNIU_txtLIBELLEUNITEGESTION'),
          regime: getValue('#TabContainer1_TabPanelVerifyNIU_txtLIBELLEREGIMEFISCAL'),
          etat: getValue('#TabContainer1_TabPanelVerifyNIU_txtACTIF'),
        }
      })

      // Vérifier si on a vraiment des données pour CE NIU spécifique
      const hasValidData =
        data.nomRaisonSociale &&
        data.nomRaisonSociale.trim() &&
        !data.nomRaisonSociale.includes('Aucune') &&
        data.niu === niu

      if (!hasValidData) {
        this.trackPerformance(startTime)
        return {
          success: true,
          message: 'Aucun contribuable trouvé avec ce NIU',
          data: null,
        }
      }

      this.trackPerformance(startTime)
      return {
        success: true,
        message: 'Contribuable trouvé',
        data: data,
      }
    } catch (error) {
      console.error('Erreur vérification NIU:', error)
      return {
        success: false,
        message: 'Erreur technique',
        data: null,
      }
    } finally {
      if (page) await this.releasePooledPage(page)
    }
  }

  /**
   * Attendre intelligemment la réponse NIU avec Playwright
   */
  private async _waitForNIUResponse(page: Page): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const nom = document.querySelector(
            '#TabContainer1_TabPanelVerifyNIU_txtRAISON_SOCIALE'
          ) as HTMLInputElement
          const activite = document.querySelector(
            '#TabContainer1_TabPanelVerifyNIU_txtACTIVITEDECLAREE'
          ) as HTMLInputElement

          const hasContent = (nom && nom.value.trim()) || (activite && activite.value.trim())

          return hasContent || (nom && nom.value === '')
        },
        { timeout: 15000 }
      )

      // Petit délai supplémentaire
      await page.waitForTimeout(500)
    } catch (timeoutError) {
      // Fallback
      await page.waitForTimeout(2000)
    }
  }

  /**
   * Navigation avec retry et fallbacks - Version Playwright
   */
  private async _navigateWithRetry(page: Page, url: string, maxRetries: number = 2): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Navigation vers ${url} (tentative ${attempt}/${maxRetries})`)

        if (attempt === 1) {
          // Première tentative : navigation rapide
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          })
        } else {
          // Tentatives suivantes : plus conservatrices
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 20000,
          })
        }

        // Vérifier que la page est bien chargée avec Playwright
        await page.waitForLoadState('domcontentloaded')

        console.log(`✅ Navigation réussie`)
        return
      } catch (error) {
        lastError = error as Error
        console.log(`❌ Tentative ${attempt} échouée:`, error.message)

        if (attempt < maxRetries) {
          await page.waitForTimeout(1000 * attempt)
        }
      }
    }

    throw new Error(
      `Navigation échouée après ${maxRetries} tentatives. Dernière erreur: ${lastError?.message}`
    )
  }

  /**
   * Attendre un délai - Utilise waitForTimeout de Playwright
   */
  private async _wait(ms: number): Promise<void> {
    // Note: avec Playwright on utilise page.waitForTimeout() directement dans les pages
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Test de connectivité avec le site DGI
   */
  async testConnectivity(): Promise<{ success: boolean; message: string }> {
    let page: Page | null = null

    try {
      page = await this.getPooledPage()

      console.log('🔍 Test de connectivité DGI...')
      await page.goto('https://teledeclaration-dgi.cm/', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      })

      const title = await page.title()
      console.log(`✅ Site DGI accessible - Titre: ${title}`)

      return {
        success: true,
        message: `Site accessible - ${title}`,
      }
    } catch (error) {
      console.log('❌ Site DGI inaccessible:', error.message)
      return {
        success: false,
        message: `Site inaccessible: ${error.message}`,
      }
    } finally {
      if (page) await this.releasePooledPage(page)
    }
  }

  /**
   * Obtenir les métriques de performance
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Fermer proprement le service
   */
  async close(): Promise<void> {
    console.log('🔒 Fermeture du scraper...')

    // Fermer toutes les pages du pool
    for (const page of this.pagePool) {
      try {
        await page.close()
      } catch {}
    }
    this.pagePool = []

    // Fermer le contexte
    if (this.context) {
      await this.context.close()
      this.context = null
    }

    // Fermer le navigateur
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }

    console.log('✅ Scraper fermé')
  }
}
