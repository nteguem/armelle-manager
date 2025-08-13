import { ApplicationService } from '@adonisjs/core/types'
import NellysCoinService from '#services/nellys_coin_service'

export default class NellysCoinProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(NellysCoinService, () => {
      return new NellysCoinService()
    })
  }

  async boot() {
    // A faire au démarrage de l'application
  }

  async shutdown() {
    // A faire à l'arrêt de l'application
  }
}
