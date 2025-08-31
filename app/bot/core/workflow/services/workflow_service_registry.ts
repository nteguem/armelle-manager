import logger from '@adonisjs/core/services/logger'

/**
 * Métadonnées service enregistré
 */
interface ServiceMetadata {
  instance: any
  registeredAt: Date
  description?: string
}

/**
 * Registre des services métier utilisables dans les workflows
 * Permet l'injection de dépendances et l'appel de services
 */
export class WorkflowServiceRegistry {
  private static instance: WorkflowServiceRegistry
  private services: Map<string, ServiceMetadata> = new Map()

  private constructor() {}

  public static getInstance(): WorkflowServiceRegistry {
    if (!WorkflowServiceRegistry.instance) {
      WorkflowServiceRegistry.instance = new WorkflowServiceRegistry()
    }
    return WorkflowServiceRegistry.instance
  }

  /**
   * Enregistre un service dans le registre
   */
  public register(name: string, serviceInstance: any, description?: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Service name is required and must be a string')
    }

    if (!serviceInstance) {
      throw new Error('Service instance is required')
    }

    this.services.set(name, {
      instance: serviceInstance,
      registeredAt: new Date(),
      description,
    })

    logger.info(`Service registered: ${name}`, {
      description,
      methods: this.getServiceMethods(serviceInstance),
    })
  }

  /**
   * Appelle une méthode d'un service enregistré
   */
  public async call(serviceName: string, methodName: string, params: any[] = []): Promise<any> {
    const serviceMetadata = this.services.get(serviceName)
    if (!serviceMetadata) {
      throw new Error(`Service '${serviceName}' not found in registry`)
    }

    const { instance } = serviceMetadata

    // Vérifier que la méthode existe
    if (typeof instance[methodName] !== 'function') {
      throw new Error(`Method '${methodName}' not found in service '${serviceName}'`)
    }

    logger.debug(`Calling service method: ${serviceName}.${methodName}`, {
      paramsCount: params.length,
    })

    try {
      // Appel de la méthode avec les paramètres
      const result = await instance[methodName](...params)

      logger.debug(`Service method completed: ${serviceName}.${methodName}`, {
        success: result?.success,
        hasData: !!result?.data,
      })

      return result
    } catch (error) {
      logger.error(`Service method failed: ${serviceName}.${methodName}`, {
        error: error.message,
        stack: error.stack,
      })
      throw new Error(`Service call failed: ${serviceName}.${methodName} - ${error.message}`)
    }
  }

  /**
   * Vérifie si un service est enregistré
   */
  public hasService(serviceName: string): boolean {
    return this.services.has(serviceName)
  }

  /**
   * Vérifie si une méthode existe sur un service
   */
  public hasMethod(serviceName: string, methodName: string): boolean {
    const serviceMetadata = this.services.get(serviceName)
    if (!serviceMetadata) {
      return false
    }

    return typeof serviceMetadata.instance[methodName] === 'function'
  }

  /**
   * Liste tous les services enregistrés
   */
  public listServices(): {
    name: string
    description?: string
    registeredAt: Date
    methods: string[]
  }[] {
    return Array.from(this.services.entries()).map(([name, metadata]) => ({
      name,
      description: metadata.description,
      registeredAt: metadata.registeredAt,
      methods: this.getServiceMethods(metadata.instance),
    }))
  }

  /**
   * Récupère l'instance d'un service (pour usage avancé)
   */
  public getService(serviceName: string): any {
    const serviceMetadata = this.services.get(serviceName)
    return serviceMetadata?.instance
  }

  /**
   * Désenregistre un service
   */
  public unregister(serviceName: string): boolean {
    const removed = this.services.delete(serviceName)
    if (removed) {
      logger.info(`Service unregistered: ${serviceName}`)
    }
    return removed
  }

  /**
   * Récupère les méthodes publiques d'un service
   */
  private getServiceMethods(serviceInstance: any): string[] {
    const methods: string[] = []

    // Méthodes de l'instance
    const instanceMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(serviceInstance)
    ).filter((method) => {
      return (
        method !== 'constructor' &&
        typeof serviceInstance[method] === 'function' &&
        !method.startsWith('_') // Exclure les méthodes privées
      )
    })

    methods.push(...instanceMethods)

    // Méthodes directes sur l'objet (si ce n'est pas une classe)
    const directMethods = Object.getOwnPropertyNames(serviceInstance).filter((prop) => {
      return typeof serviceInstance[prop] === 'function' && !prop.startsWith('_')
    })

    methods.push(...directMethods)

    // Retourner liste unique triée
    return [...new Set(methods)].sort()
  }

  /**
   * Valide qu'un appel de service est possible
   */
  public validateCall(serviceName: string, methodName: string): { valid: boolean; error?: string } {
    if (!this.hasService(serviceName)) {
      return { valid: false, error: `Service '${serviceName}' not registered` }
    }

    if (!this.hasMethod(serviceName, methodName)) {
      return { valid: false, error: `Method '${methodName}' not found in service '${serviceName}'` }
    }

    return { valid: true }
  }

  /**
   * Statistiques du registre
   */
  public getStats(): {
    totalServices: number
    totalMethods: number
    servicesByRegistrationDate: { name: string; registeredAt: Date }[]
  } {
    const services = Array.from(this.services.entries())

    const totalMethods = services.reduce((sum, [, metadata]) => {
      return sum + this.getServiceMethods(metadata.instance).length
    }, 0)

    const servicesByDate = services
      .map(([name, metadata]) => ({
        name,
        registeredAt: metadata.registeredAt,
      }))
      .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())

    return {
      totalServices: services.length,
      totalMethods,
      servicesByRegistrationDate: servicesByDate,
    }
  }
}
