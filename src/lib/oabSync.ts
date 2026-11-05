// O núcleo da sincronização OAB mora em supabase/functions/_shared/oabSync/
// para que as Edge Functions e os testes usem exatamente o mesmo código.
export * from '../../supabase/functions/_shared/oabSync/core.ts'
