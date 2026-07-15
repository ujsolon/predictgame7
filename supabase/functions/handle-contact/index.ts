import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_SUBMISSION_AGE_MS = 1500
const MAX_SUBMISSION_AGE_MS = 1000 * 60 * 60 * 2

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const payload = await req.json()

    const name = normalizeText(payload?.name)
    const email = normalizeText(payload?.email).toLowerCase()
    const message = normalizeText(payload?.message)
    const website = normalizeText(payload?.website)
    const startedAt = normalizeText(payload?.startedAt)
    const captchaAnswer = normalizeText(payload?.captchaAnswer)
    const captchaChallenge = normalizeText(payload?.captchaChallenge)

    if (website !== '') {
      return jsonResponse({ error: 'Submission rejected.' }, 400)
    }

    if (startedAt) {
      const startedTimestamp = Date.parse(startedAt)
      if (Number.isNaN(startedTimestamp)) {
        return jsonResponse({ error: 'Verification failed. Please refresh the page and try again.' }, 400)
      }

      const submissionAgeMs = Date.now() - startedTimestamp
      if (submissionAgeMs < MIN_SUBMISSION_AGE_MS || submissionAgeMs > MAX_SUBMISSION_AGE_MS) {
        return jsonResponse({ error: 'Verification failed. Please try submitting the form again.' }, 400)
      }
    } else if (captchaAnswer || captchaChallenge) {
      const userAnswer = Number.parseInt(captchaAnswer, 10)
      const expectedAnswer = Number.parseInt(captchaChallenge, 10)

      if (Number.isNaN(userAnswer) || Number.isNaN(expectedAnswer) || userAnswer !== expectedAnswer) {
        return jsonResponse({ error: 'Verification failed. Please solve the math problem correctly.' }, 400)
      }
    } else {
      return jsonResponse({ error: 'Verification failed. Please refresh the page and try again.' }, 400)
    }

    if (name.length < 2 || name.length > 80) {
      return jsonResponse({ error: 'Please enter a valid name between 2 and 80 characters.' }, 400)
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 320) {
      return jsonResponse({ error: 'Please enter a valid email address.' }, 400)
    }

    if (message.length < 10 || message.length > 2000) {
      return jsonResponse({ error: 'Please enter a message between 10 and 2000 characters.' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabase
      .from('contact_submissions')
      .insert([{ name, email, message }])

    if (error) throw error

    console.log(`Contact submission from ${name} (${email}): ${message}`)

    return jsonResponse({ message: 'Success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return jsonResponse({ error: message }, 500)
  }
})
