// Script de test pour le flow d'authentification
// Utilisation: node test_auth_flow.js

const BASE_URL = 'http://localhost:3333/api/v1'

async function testAuthFlow() {
  console.log('🧪 Testing Authentication Flow...\n')

  try {
    // Phase 1: Login initial
    console.log('📝 Phase 1: Initial Login')
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        loginOption: 'username',
        usernameOrPhoneNumber: 'test@example.com',
        password: 'password123',
        deviceId: 'test-device-001',
      }),
    })

    const loginData = await loginResponse.json()
    console.log('Login Response:', JSON.stringify(loginData, null, 2))

    if (loginData.status !== 'success') {
      console.error('❌ Login failed')
      return
    }

    const loginReference = loginData.data.login_reference
    const step = loginData.data.step

    console.log(`\n✅ Login successful, next step: ${step}`)

    // Phase 2: Gérer selon le step
    if (step === 'mfa_setup') {
      console.log('\n📝 Phase 2a: MFA Setup')

      // Setup authenticator
      const setupResponse = await fetch(`${BASE_URL}/auth/setup-authenticator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginReference: loginReference,
          code: '1234',
        }),
      })

      const setupData = await setupResponse.json()
      console.log('MFA Setup Response:', JSON.stringify(setupData, null, 2))

      if (setupData.status === 'success') {
        console.log('\n📝 Phase 2b: MFA Verification')

        // Verify authenticator
        const verifyResponse = await fetch(`${BASE_URL}/auth/verify-authenticator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            loginReference: loginReference,
          }),
        })

        const verifyData = await verifyResponse.json()
        console.log('MFA Verify Response:', JSON.stringify(verifyData, null, 2))
      }
    }

    if (step === 'mfa_verification' || step === 'mfa_setup') {
      console.log('\n📝 Phase 3: MFA Confirmation')

      // Simulate MFA code (this would normally come from Google Authenticator)
      const confirmResponse = await fetch(`${BASE_URL}/auth/confirm-mfa-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginReference: loginReference,
          code: '123456', // Simulated 6-digit code
        }),
      })

      const confirmData = await confirmResponse.json()
      console.log('MFA Confirm Response:', JSON.stringify(confirmData, null, 2))

      if (confirmData.status === 'success') {
        console.log('\n🎉 Authentication Flow Completed Successfully!')
        console.log('Token:', confirmData.data.access_token.substring(0, 50) + '...')
        console.log('User:', confirmData.data.user.username)
        console.log('Can Access Panel:', confirmData.data.user.can_access_panel)
      }
    }
  } catch (error) {
    console.error('❌ Error testing auth flow:', error.message)
  }
}

// Fonction pour tester les endpoints individuels
async function testEndpoint(method, endpoint, payload = null) {
  console.log(`\n🔍 Testing ${method} ${endpoint}`)

  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (payload && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(payload)
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options)
    const data = await response.json()

    console.log(`Status: ${response.status}`)
    console.log('Response:', JSON.stringify(data, null, 2))

    return { status: response.status, data }
  } catch (error) {
    console.error(`❌ Error testing ${endpoint}:`, error.message)
    return null
  }
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0) {
  // Test complet du flow
  testAuthFlow()
} else {
  // Test d'un endpoint spécifique
  const [method, endpoint, ...payloadArgs] = args
  let payload = null

  if (payloadArgs.length > 0) {
    try {
      payload = JSON.parse(payloadArgs.join(' '))
    } catch (e) {
      console.error('❌ Invalid JSON payload')
      process.exit(1)
    }
  }

  testEndpoint(method.toUpperCase(), endpoint, payload)
}

// Examples:
// node test_auth_flow.js
// node test_auth_flow.js POST /auth/login '{"loginOption":"username","usernameOrPhoneNumber":"test","password":"password123"}'
// node test_auth_flow.js GET /
