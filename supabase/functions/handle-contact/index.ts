import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_SUBMISSION_AGE_MS = 1500
// Was 2h, which rejected a real visitor whose tab had simply been open a
// while. The ceiling never stopped a caller who knows the rule (they can send
// any timestamp), so it only ever hit humans; 24h keeps a sanity bound on
// absurd values without that failure mode.
const MAX_SUBMISSION_AGE_MS = 1000 * 60 * 60 * 24

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

    if (website !== '') {
      return jsonResponse({ error: 'Submission rejected.' }, 400)
    }

    // Mandatory, not opt-in: the whole check used to sit inside
    // `if (startedAt)`, so a caller that omitted the field was never timed.
    // A missing value also fails `Date.parse`, so empty and unparseable share
    // the one reject-and-refresh row.
    const startedTimestamp = Date.parse(startedAt)
    if (Number.isNaN(startedTimestamp)) {
      return jsonResponse({ error: 'Verification failed. Please refresh the page and try again.' }, 400)
    }

    const submissionAgeMs = Date.now() - startedTimestamp
    if (submissionAgeMs < MIN_SUBMISSION_AGE_MS || submissionAgeMs > MAX_SUBMISSION_AGE_MS) {
      return jsonResponse({ error: 'Verification failed. Please try submitting the form again.' }, 400)
    }

    if (name.length < 2 || name.length > 80) {
      return jsonResponse({ error: 'Please enter a valid name between 2 and 80 characters.' }, 400)
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 320) {
      return jsonResponse({ error: 'Please enter a valid email address.' }, 400)
    }

    if (message === '') {
      // The form's textarea is `required`, so only a non-browser caller could
      // reach the insert with an empty message — and it wrote a row.
      return jsonResponse({ error: 'Please enter a message.' }, 400)
    }

    if (message.length > 2000) {
      return jsonResponse({ error: 'Please keep your message within 2000 characters.' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabase
      .from('contact_submissions')
      .insert([{ name, email, message }])

    if (error) throw error

    // No name, email or message here: the row is already in the table, and
    // logging it duplicated submission PII into Supabase's log store.
    console.log('Contact submission stored')

    return jsonResponse({ message: 'Success' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return jsonResponse({ error: message }, 500)
  }
})
