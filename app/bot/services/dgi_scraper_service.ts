import puppeteer, { Browser, Page } from 'puppeteer'
import type { SearchResult, VerifyResult, ScraperResponse } from '#bot/types/bot_types'

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

    let page: Page | null = null

    try {
      page = await this._getPage()

      await page.goto(this.contribuableUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })

      await page.waitForSelector('#ddlSTATUT_ACTIVITE', { visible: true, timeout: 10000 })

      await page.select('#ddlSTATUT_ACTIVITE', '1')

      await page.waitForSelector('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', {
        visible: true,
        timeout: 8000,
      })

      await page.click('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', { clickCount: 3 })
      await page.type('#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE', nom.trim(), { delay: 50 })

      await page.click('#findIdemployeur_dirigeant_ibFindContribuable')

      await this._waitForSearchResponse(page)

      const result = await page.evaluate(() => {
        const lblNom = document.querySelector(
          '#findIdemployeur_dirigeant_lblNOMCONTRIBUABLE'
        ) as HTMLElement
        const lblText = lblNom ? lblNom.textContent?.trim() || '' : ''

        if (lblText.includes('Aucune correspondance')) {
          return {
            type: 'aucune',
            message: 'Aucune correspondance trouvée',
            data: [] as SearchResult[],
          }
        }

        const correspondanceMatch = lblText.match(/(\d+)\s+correspondance/)
        if (correspondanceMatch && Number.parseInt(correspondanceMatch[1]) > 1) {
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
                    nom: cells[2].textContent?.trim() || '',
                    prenom: cells[3].textContent?.trim() || '',
                    centre: cells[4].textContent?.trim() || '',
                  }
                }
                return null
              })
              .filter((r) => r !== null) as SearchResult[]

            return {
              type: 'multiple',
              message: `${results.length} correspondance(s) trouvée(s)`,
              data: results,
            }
          }
        }

        const niuInput = document.querySelector(
          '#findIdemployeur_dirigeant_txtNIUCONTRIBUABLE'
        ) as HTMLInputElement
        const niu = niuInput ? niuInput.value.trim() : ''

        if (niu && niu.length > 5 && !niu.includes(' ')) {
          return {
            type: 'unique',
            message: 'Une correspondance trouvée',
            data: [
              {
                niu: niu,
                nom: lblText,
                prenom: '',
                centre: '',
              },
            ] as SearchResult[],
          }
        }

        return {
          type: 'erreur',
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
      return {
        success: false,
        message: 'Erreur technique lors de la recherche',
        data: null,
      }
    } finally {
      if (page) await page.close()
    }
  }

  private async _waitForSearchResponse(page: Page): Promise<void> {
    try {
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
        {
          timeout: 15000,
          polling: 200,
        }
      )
    } catch (timeoutError) {
      await this._wait(2000)
    }
  }

  async rechercher(nom: string, dateNaissance: string): Promise<ScraperResponse<SearchResult[]>> {
    let page: Page | null = null

    try {
      page = await this._getPage()

      await page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })

      await page.waitForSelector('input[name="txtRAISON_SOCIALE3"]', {
        visible: true,
        timeout: 10000,
      })
      await page.waitForSelector('input[name="txtDATECREATION3$myText"]', {
        visible: true,
        timeout: 10000,
      })

      await page.click('input[name="txtRAISON_SOCIALE3"]', { clickCount: 3 })
      await page.type('input[name="txtRAISON_SOCIALE3"]', nom, { delay: 50 })

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

      await page.click('input[name="btnFIND"]')

      await this._waitForOldSearchResponse(page)

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
              nom: getText(cells[2] as HTMLElement),
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
      return {
        success: false,
        message: 'Erreur technique',
        data: null,
      }
    } finally {
      if (page) await page.close()
    }
  }

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
        {
          timeout: 15000,
          polling: 300,
        }
      )
    } catch (timeoutError) {
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

      await page.goto(this.loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })

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

      await this._waitForNIUResponse(page)

      const data = await page.evaluate(() => {
        const getValue = (selector: string) => {
          const el = document.querySelector(selector) as HTMLInputElement
          return el ? (el.value || el.textContent || '').trim() : ''
        }

        return {
          niu: getValue('#TabContainer1_TabPanelVerifyNIU_txtNIU2'),
          nom: getValue('#TabContainer1_TabPanelVerifyNIU_txtRAISON_SOCIALE'),
          prenom: getValue('#TabContainer1_TabPanelVerifyNIU_txtSIGLE'),
          numeroDocument: getValue('#TabContainer1_TabPanelVerifyNIU_txtNUMEROCNIRC'),
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
      return {
        success: false,
        message: 'Erreur technique',
        data: null,
      }
    } finally {
      if (page) await page.close()
    }
  }

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

          return (nom && nom.value.trim()) || (activite && activite.value.trim())
        },
        {
          timeout: 15000,
          polling: 300,
        }
      )
    } catch (timeoutError) {
      await this._wait(3000)
    }
  }

  private async _getPage(): Promise<Page> {
    if (!this.browser) {
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
        ],
      })
    }

    const page = await this.browser.newPage()

    await page.setDefaultNavigationTimeout(15000)
    await page.setDefaultTimeout(10000)

    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort()
      } else {
        req.continue()
      }
    })

    return page
  }

  private async _wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
