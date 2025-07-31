import puppeteer, { Browser, Page } from 'puppeteer'
import type { SearchResult, VerifyResult, ScraperResponse } from '#bot/types/bot_types'

// Type pour les résultats de recherche
type SearchResultType = 'aucune' | 'unique' | 'multiple' | 'erreur'

interface EvaluateResult {
  type: SearchResultType
  message: string
  data: SearchResult[]
}

export default class DGIScraperService {
  private baseUrl: string
  private loginUrl: string
  private contribuableUrl: string
  private browser: Browser | null

  constructor() {
    this.baseUrl = 'https://teledeclaration-dgi.cm/modules/Common/Account/eregistration.aspx?er=old'
    this.loginUrl = 'https://teledeclaration-dgi.cm/modules/Common/Account/Login.aspx'
    this.contribuableUrl =
      'https://teledeclaration-dgi.cm/modules/Common/Account/contribuable_pp.aspx?t=PPNP'
    this.browser = null
  }

  async rechercherParNom(nom: string): Promise<ScraperResponse<SearchResult[]>> {
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
        return resultComplet
      }
    }

    // Stratégie 2: Recherche avec premier nom + filtrage local ultra-rapide
    if (motsNom.length >= 2) {
      const premierNom = motsNom[0]
      const deuxiemeNom = motsNom[1].toLowerCase() // Pré-calculer en minuscules

      const resultPremierNom = await this._effectuerRecherche(premierNom)

      if (resultPremierNom.success && resultPremierNom.data && resultPremierNom.data.length > 0) {
        // Filtrage local ultra-rapide avec pré-calcul
        const resultatsFiltrés = resultPremierNom.data.filter((result) => {
          // Concaténer et convertir en une seule opération
          const nomComplet = (result.nomRaisonSociale + ' ' + result.prenomSigle).toLowerCase()
          return nomComplet.includes(deuxiemeNom)
        })

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

      return resultPremierNom
    }

    // Fallback: nom unique
    return await this._effectuerRecherche(nomTrim)
  }

  /**
   * Effectue la recherche proprement dite (extraction de la logique commune)
   */
  private async _effectuerRecherche(terme: string): Promise<ScraperResponse<SearchResult[]>> {
    let page: Page | null = null

    try {
      page = await this._getPage()

      // Essayer plusieurs stratégies de navigation
      await this._navigateWithRetry(page, this.contribuableUrl)

      // Attendre que la page soit interactive
      await page.waitForSelector('#ddlSTATUT_ACTIVITE', { visible: true, timeout: 10000 })

      // Sélectionner "Salarié du secteur public" dans le dropdown
      await page.select('#ddlSTATUT_ACTIVITE', '1')

      // Attendre que le champ employeur/dirigeant apparaisse avec timeout optimisé
      await page.waitForSelector('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', {
        visible: true,
        timeout: 8000,
      })

      // Saisir le terme de recherche dans le champ
      await page.click('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', { clickCount: 3 })
      await page.type('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', terme, { delay: 50 })

      // Cliquer sur le bouton de recherche
      await page.click('#findIdemployeur_dirigeant_ibFindContribuable')

      // Attendre la réponse de manière intelligente
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
            data: [] as SearchResult[],
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
            const rows = Array.from(table.querySelectorAll('tr')).slice(1) // Ignorer l'en-tête
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
                    prenom: cells[3].textContent?.trim() || '',
                    centre: cells[4].textContent?.trim() || '',
                  }
                }
                return null
              })
              .filter((r) => r !== null) as SearchResult[]

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
          // Vérifier que c'est un NIU valide
          return {
            type: 'unique' as const,
            message: 'Une correspondance trouvée',
            data: [
              {
                niu: niu,
                nomRaisonSociale: lblText,
                prenomSigle: '',
                centreImpots: '',
              },
            ] as SearchResult[],
          }
        }

        // Cas par défaut
        return {
          type: 'erreur' as const,
          message: 'Réponse inattendue du serveur',
          data: [] as SearchResult[],
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
      if (page) await page.close()
    }
  }

  /**
   * Attendre intelligemment la réponse de recherche - COPIE EXACTE de la version JS
   */
  private async _waitForSearchResponse(page: Page): Promise<void> {
    try {
      // Attendre que la réponse arrive (le texte change)
      await page.waitForFunction(
        () => {
          const lblNom = document.querySelector('#findIdemployeur_dirigeant_lblNOMCONTRIBUABLE')
          const lblText = lblNom ? lblNom.textContent?.trim() || '' : ''

          // La réponse est prête si on a soit:
          // - "Aucune correspondance"
          // - Un nom de contribuable
          // - "X correspondance(s)"
          return (
            lblText &&
            (lblText.includes('Aucune correspondance') ||
              lblText.includes('correspondance') ||
              (lblText.length > 5 && !lblText.includes('NON_PRO')))
          )
        },
        {
          timeout: 15000,
          polling: 200, // Vérifier toutes les 200ms
        }
      )
    } catch (timeoutError) {
      // Si timeout, attendre 2 secondes comme fallback
      await this._wait(2000)
    }
  }

  async rechercher(nom: string, dateNaissance: string): Promise<ScraperResponse<SearchResult[]>> {
    let page: Page | null = null

    try {
      page = await this._getPage()

      // Navigation avec retry
      await this._navigateWithRetry(page, this.baseUrl)

      await page.waitForSelector('input[name="txtRAISON_SOCIALE3"]', {
        visible: true,
        timeout: 10000,
      })
      await page.waitForSelector('input[name="txtDATECREATION3$myText"]', {
        visible: true,
        timeout: 10000,
      })

      // Saisir le nom
      await page.click('input[name="txtRAISON_SOCIALE3"]', { clickCount: 3 })
      await page.type('input[name="txtRAISON_SOCIALE3"]', nom, { delay: 50 })

      // Saisir la date (contourne le masque de saisie) - EXACTEMENT comme dans la version JS
      await page.evaluate((date) => {
        const dateInput = document.querySelector(
          'input[name="txtDATECREATION3$myText"]'
        ) as HTMLInputElement
        if (dateInput) {
          dateInput.value = date
          dateInput.dispatchEvent(new Event('input', { bubbles: true }))
          dateInput.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, dateNaissance)

      await this._wait(500)

      // Lancer la recherche
      await page.click('input[name="btnFIND"]')

      // Attendre la réponse intelligemment
      await this._waitForOldSearchResponse(page)

      // Vérifier les messages d'erreur
      const errorMessage = await page.evaluate(() => {
        const errorEl = document.querySelector('#lblErrMsgNIULOGIN32')
        return errorEl ? errorEl.textContent?.trim() || '' : ''
      })

      if (errorMessage && errorMessage.includes('Aucune correspondance')) {
        return {
          success: true,
          message: 'Aucune correspondance trouvée',
          data: [],
        }
      }

      // Extraire les résultats - EXACTEMENT comme dans la version JS
      const results = await page.evaluate(() => {
        const table = document.querySelector('#gridVoisins') as HTMLTableElement
        if (!table) return []

        const rows = Array.from(table.querySelectorAll('tr')).slice(1)
        return rows
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
              prenom: getText(cells[3] as HTMLElement),
              lieuNaissance: getText(cells[4] as HTMLElement),
              numeroDocument: getText(cells[5] as HTMLElement),
              activite: getText(cells[6] as HTMLElement),
              regime: getText(cells[7] as HTMLElement),
              centre: getText(cells[8] as HTMLElement),
            }
          })
          .filter((r) => r !== null) as SearchResult[]
      })

      return {
        success: true,
        message: `${results.length} résultat(s) trouvé(s)`,
        data: results,
      }
    } catch (error) {
      console.error('Erreur recherche par nom et date:', error)
      return {
        success: false,
        message: 'Erreur technique',
        data: null,
      }
    } finally {
      if (page) await page.close()
    }
  }

  /**
   * Attendre intelligemment la réponse de l'ancienne recherche - COPIE EXACTE de la version JS
   */
  private async _waitForOldSearchResponse(page: Page): Promise<void> {
    try {
      // Attendre soit le message d'erreur soit le tableau de résultats
      await page.waitForFunction(
        () => {
          const errorEl = document.querySelector('#lblErrMsgNIULOGIN32')
          const table = document.querySelector('#gridVoisins')

          return (
            (errorEl && errorEl.textContent?.trim()) ||
            (table && table.querySelectorAll('tr').length > 1)
          )
        },
        {
          timeout: 15000,
          polling: 300,
        }
      )
    } catch (timeoutError) {
      // Fallback
      await this._wait(2000)
    }
  }

  async verifierNIU(niu: string): Promise<ScraperResponse<VerifyResult>> {
    if (!niu || !niu.trim()) {
      return {
        success: false,
        message: 'NIU invalide',
        data: null,
      }
    }

    let page: Page | null = null

    try {
      page = await this._getPage()

      // Navigation avec retry
      await this._navigateWithRetry(page, this.loginUrl)

      await page.waitForSelector('#__tab_TabContainer1_TabPanelVerifyNIU', {
        visible: true,
        timeout: 8000,
      })
      await page.click('#__tab_TabContainer1_TabPanelVerifyNIU')

      await page.waitForSelector('#TabContainer1_TabPanelVerifyNIU_txtNIU2', {
        visible: true,
        timeout: 8000,
      })

      await page.type('#TabContainer1_TabPanelVerifyNIU_txtNIU2', niu, { delay: 50 })

      await page.click('#TabContainer1_TabPanelVerifyNIU_ibFindContribuable')

      // Attendre que les données se chargent intelligemment
      await this._waitForNIUResponse(page)

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
          regime: getValue('#TabContainer1_TabPanelVerifyNIU_txtLIBELLEREGIMEFISCAL'),
          etat: getValue('#TabContainer1_TabPanelVerifyNIU_txtACTIF'),
        }
      })

      const hasData = Object.values(data).some((value) => value && value.trim())

      if (!hasData) {
        return {
          success: true,
          message: 'Aucun contribuable trouvé avec ce NIU',
          data: null,
        }
      }

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
      if (page) await page.close()
    }
  }

  /**
   * Attendre intelligemment la réponse NIU - COPIE EXACTE de la version JS
   */
  private async _waitForNIUResponse(page: Page): Promise<void> {
    try {
      // Attendre que au moins un champ soit rempli
      await page.waitForFunction(
        () => {
          const nom = document.querySelector(
            '#TabContainer1_TabPanelVerifyNIU_txtRAISON_SOCIALE'
          ) as HTMLInputElement
          const activite = document.querySelector(
            '#TabContainer1_TabPanelVerifyNIU_txtACTIVITEDECLAREE'
          ) as HTMLInputElement

          return (nom && nom.value.trim()) || (activite && activite.value.trim())
        },
        {
          timeout: 15000,
          polling: 300,
        }
      )
    } catch (timeoutError) {
      // Fallback
      await this._wait(3000)
    }
  }

  /**
   * Navigation avec retry et fallbacks
   */
  private async _navigateWithRetry(page: Page, url: string, maxRetries: number = 3): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Tentative ${attempt}/${maxRetries} de navigation vers ${url}`)

        // Essayer différentes stratégies selon la tentative
        if (attempt === 1) {
          // Première tentative : navigation standard
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          })
        } else if (attempt === 2) {
          // Deuxième tentative : attendre le réseau
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 25000,
          })
        } else {
          // Dernière tentative : attendre tout
          await page.goto(url, {
            waitUntil: 'load',
            timeout: 30000,
          })
        }

        // Si on arrive ici, la navigation a réussi
        console.log(`✅ Navigation réussie à la tentative ${attempt}`)
        return
      } catch (error) {
        lastError = error as Error
        console.log(`❌ Tentative ${attempt} échouée:`, error.message)

        if (attempt < maxRetries) {
          // Attendre avant de réessayer
          await this._wait(2000 * attempt) // 2s, 4s, 6s...
        }
      }
    }

    // Si toutes les tentatives ont échoué
    throw new Error(
      `Navigation échouée après ${maxRetries} tentatives. Dernière erreur: ${lastError?.message}`
    )
  }

  /**
   * Obtient une page Puppeteer configurée (version plus robuste)
   */
  private async _getPage(): Promise<Page> {
    if (!this.browser) {
      console.log('🚀 Lancement du navigateur...')
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-web-security', // Ajout pour éviter les problèmes CORS
          '--disable-features=VizDisplayCompositor', // Améliore la stabilité
        ],
      })
    }

    const page = await this.browser.newPage()

    // Configuration plus robuste
    await page.setDefaultNavigationTimeout(30000) // Augmenté
    await page.setDefaultTimeout(15000)

    // User agent pour éviter la détection de bot
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    )

    // Gestion des ressources avec logging
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort()
      } else {
        req.continue()
      }
    })

    // Logging des erreurs réseau
    page.on('requestfailed', (request) => {
      console.log(`❌ Requête échouée: ${request.url()} - ${request.failure()?.errorText}`)
    })

    return page
  }

  /**
   * Attendre un délai (réduit) - COPIE EXACTE de la version JS
   */
  private async _wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Test de connectivité avec le site DGI
   */
  async testConnectivity(): Promise<{ success: boolean; message: string }> {
    let page: Page | null = null

    try {
      page = await this._getPage()

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
      if (page) await page.close()
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
