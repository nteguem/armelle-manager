import env from '#start/env'
import PaymentTransaction from '#models/rest-api/payment_transaction'

interface EjaraAuthResponse {
  message: string
  data: {
    accessToken: string
    expiresIn: number
  }
}

interface EjaraInitiateResponse {
  message: string
  data: {
    providerChannel: string
    paymentProvider: string
    providerStatus: string
    internalPaymentId: string
    providerMessage: string
  }
}

interface EjaraStatusResponse {
  message: string
  data: {
    status: string
    fees?: string
    feePolicy?: string
    feeValue?: string
    amount?: string
    rawAmount?: string
    validatedAt?: string
    providerCurrency?: string
    transactionCurrency?: string
    providerAmount?: string
    specialOfferAmount?: number
    baseCurrencyPaidAmount?: string
    internalReference?: string
    operatorReference?: string
    providerReference?: string
    externalTransactionReference?: string
  }
}

interface PaymentInitiationData {
  phoneNumber: string
  amount: number
  fullName: string
  emailAddress: string
  paymentMode: 'MOMO' | 'OM'
  externalReference: string
}

export default class EjaraPayService {
  private baseUrl: string
  private clientSecret: string
  private clientKey: string
  private accessToken: string | null = null
  private tokenExpiresAt: number | null = null

  constructor() {
    const baseUrl = env.get('EJARA_PAY_BASE_URL')
    const clientSecret = env.get('EJARA_PAY_CLIENT_SECRET')
    const clientKey = env.get('EJARA_PAY_CLIENT_KEY')

    if (!baseUrl || !clientSecret || !clientKey) {
      throw new Error('Ejara Pay configuration is incomplete')
    }

    this.clientSecret = clientSecret
    this.clientKey = clientKey
    this.baseUrl = baseUrl
  }

  private async authenticate(): Promise<string> {
    // Vérifier si le token est encore valide
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/accounts/authenticate`, {
        method: 'POST',
        headers: {
          'client-secret': this.clientSecret,
          'client-key': this.clientKey,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Authentication faileddd: ${errorData.message || response.statusText}`)
      }

      const data: EjaraAuthResponse = await response.json()

      this.accessToken = data.data.accessToken
      this.tokenExpiresAt = Date.now() + data.data.expiresIn * 1000 - 60000 // 1 minute de marge

      console.log('✅ Ejara Pay authentication successful')
      return this.accessToken
    } catch (error) {
      console.error('❌ Ejara Pay authentication failed:', error)
      throw new Error(`Failed to authenticate with Ejara Pay: ${error.message}`)
    }
  }

  private async makeAuthenticatedRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const token = await this.authenticate()

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'client-secret': this.clientSecret,
        'client-key': this.clientKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API request failed: ${errorData.message || response.statusText}`)
    }

    return await response.json()
  }

  async initiatePayment(data: PaymentInitiationData): Promise<{
    success: boolean
    message: string
    internalPaymentId?: string
    providerMessage?: string
    error?: string
  }> {
    try {
      const payload = {
        phoneNumber: data.phoneNumber,
        transactionType: 'payin',
        amount: data.amount.toString(),
        fullName: data.fullName,
        emailAddress: data.emailAddress,
        currencyCode: 'XAF',
        countryCode: 'CM',
        paymentMode: data.paymentMode,
        externalReference: data.externalReference,
        featureCode: 'PRO',
      }

      console.log('🚀 Initiating payment with Ejara Pay:', {
        ...payload,
        phoneNumber: `***${payload.phoneNumber.slice(-4)}`, // Masquer le numéro pour les logs
      })

      const response: EjaraInitiateResponse = await this.makeAuthenticatedRequest(
        '/api/v1/transactions/initiate-momo-payment',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      )

      console.log('✅ Payment initiated successfully:', response.data.internalPaymentId)

      return {
        success: true,
        message: response.message,
        internalPaymentId: response.data.internalPaymentId,
        providerMessage: response.data.providerMessage,
      }
    } catch (error) {
      console.error('❌ Payment initiation failed:', error)
      return {
        success: false,
        message: 'Payment initiation failed',
        error: error.message,
      }
    }
  }

  async checkTransactionStatus(internalPaymentId: string): Promise<{
    success: boolean
    message: string
    data?: any
    error?: string
  }> {
    try {
      console.log('🔍 Checking transaction status:', internalPaymentId)

      const response: EjaraStatusResponse = await this.makeAuthenticatedRequest(
        `/api/v1/transactions/${internalPaymentId}`,
        {
          method: 'GET',
        }
      )

      console.log('✅ Transaction status retrieved:', response.data.status)

      return {
        success: true,
        message: response.message,
        data: response.data,
      }
    } catch (error) {
      console.error('❌ Transaction status check failed:', error)
      return {
        success: false,
        message: 'Failed to check transaction status',
        error: error.message,
      }
    }
  }

  async processTransactionUpdate(
    transaction: PaymentTransaction,
    statusData: any
  ): Promise<PaymentTransaction> {
    const { status, fees, amount, rawAmount } = statusData

    console.log(`📝 Processing transaction update: ${transaction.externalReference} -> ${status}`)

    switch (status) {
      case 'confirmed':
        const feesAmount = fees ? Number.parseFloat(fees) : 0
        const totalAmount = amount ? Number.parseFloat(amount) : transaction.amount

        transaction.markAsConfirmed(feesAmount, totalAmount, statusData)
        await transaction.save()

        // Mettre à jour la demande d'immatriculation
        await this.updateRegistrationRequestStatus(transaction)
        break

      case 'rejected':
        transaction.markAsRejected(statusData)
        await transaction.save()
        break

      case 'failed':
        transaction.markAsFailed(statusData)
        await transaction.save()
        break

      default:
        // Pour les statuts intermédiaires, juste mettre à jour la réponse
        transaction.updateProviderResponse(statusData)
        await transaction.save()
        break
    }

    return transaction
  }

  private async updateRegistrationRequestStatus(transaction: PaymentTransaction): Promise<void> {
    try {
      await transaction.load('taxRegistrationRequest')
      const request = transaction.taxRegistrationRequest

      if (request && request.isAwaitingPayment()) {
        request.markAsReadyForReview()
        await request.save()

        console.log(`✅ Registration request ${request.id} marked as ready for review`)
      }
    } catch (error) {
      console.error('❌ Failed to update registration request status:', error)
    }
  }

  async createAndInitiatePayment(
    taxRegistrationRequestId: number,
    amount: number,
    phoneNumber: string,
    paymentMode: 'MOMO' | 'OM',
    fullName: string,
    emailAddress: string
  ): Promise<{
    success: boolean
    message: string
    transaction?: PaymentTransaction
    providerMessage?: string
    error?: string
  }> {
    try {
      // Générer une référence externe unique
      const externalReference = `REG-${taxRegistrationRequestId}-${Date.now()}`

      // Créer la transaction en base
      const transaction = await PaymentTransaction.createTransaction(
        taxRegistrationRequestId,
        amount,
        phoneNumber,
        paymentMode,
        externalReference
      )

      // Initier le paiement avec Ejara
      const initiationResult = await this.initiatePayment({
        phoneNumber,
        amount,
        fullName,
        emailAddress,
        paymentMode,
        externalReference,
      })

      if (!initiationResult.success) {
        // Marquer la transaction comme failed
        transaction.markAsFailed({ error: initiationResult.error })
        await transaction.save()

        return {
          success: false,
          message: initiationResult.message,
          error: initiationResult.error,
        }
      }

      // Mettre à jour la transaction avec les données d'initiation
      transaction.markAsInitiated(initiationResult.internalPaymentId!, {
        providerMessage: initiationResult.providerMessage,
        initiatedAt: new Date().toISOString(),
      })
      await transaction.save()

      return {
        success: true,
        message: 'Payment initiated successfully',
        transaction,
        providerMessage: initiationResult.providerMessage,
      }
    } catch (error) {
      console.error('❌ Create and initiate payment failed:', error)
      return {
        success: false,
        message: 'Failed to create and initiate payment',
        error: error.message,
      }
    }
  }

  async pollTransactionStatus(internalPaymentId: string, maxAttempts: number = 60): Promise<void> {
    let attempts = 0
    const pollInterval = 30000 // 30 secondes

    const poll = async () => {
      if (attempts >= maxAttempts) {
        console.log(`⏰ Polling stopped for ${internalPaymentId} after ${maxAttempts} attempts`)
        return
      }

      attempts++
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts} for ${internalPaymentId}`)

      try {
        const transaction = await PaymentTransaction.findByInternalPaymentId(internalPaymentId)
        if (!transaction) {
          console.error(`❌ Transaction not found: ${internalPaymentId}`)
          return
        }

        if (transaction.isFinal()) {
          console.log(`✅ Transaction ${internalPaymentId} is already final: ${transaction.status}`)
          return
        }

        const statusResult = await this.checkTransactionStatus(internalPaymentId)
        if (statusResult.success && statusResult.data) {
          await this.processTransactionUpdate(transaction, statusResult.data)

          // Si la transaction est maintenant finale, arrêter le polling
          if (transaction.isFinal()) {
            console.log(`✅ Transaction ${internalPaymentId} finalized: ${transaction.status}`)
            return
          }
        }

        // Programmer la prochaine vérification
        setTimeout(poll, pollInterval)
      } catch (error) {
        console.error(`❌ Polling error for ${internalPaymentId}:`, error)
        setTimeout(poll, pollInterval) // Continuer malgré l'erreur
      }
    }

    // Démarrer le polling
    setTimeout(poll, pollInterval)
  }
}
