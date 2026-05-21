import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, message, captchaAnswer, captchaChallenge } = await req.json()

    // Validate simple math captcha - more robustly
    const userAnswer = parseInt(String(captchaAnswer).trim())
    const expectedAnswer = parseInt(String(captchaChallenge))

    if (isNaN(userAnswer) || userAnswer !== expectedAnswer) {
      return new Response(
        JSON.stringify({ error: 'Verification failed. Please solve the math problem correctly.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabase
      .from('contact_submissions')
      .insert([{ name, email, message }])

    if (error) throw error

    // In a real scenario, you'd use a mail service here (SendGrid, Resend, etc.)
    // For now, we store in DB and return success.
    console.log(`Contact submission from ${name} (${email}): ${message}`)

    return new Response(
      JSON.stringify({ message: 'Success' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
