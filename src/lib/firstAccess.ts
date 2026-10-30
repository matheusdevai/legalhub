// Regras da tela de primeiro acesso (FirstAccessScreen): troca da senha
// temporária e cadastro do nome / nome do escritório.

export const MIN_PASSWORD_LENGTH = 8

export interface FirstAccessForm {
  name: string
  officeName: string
  password: string
  confirm: string
}

/** Mensagem de erro (pt-BR) ou null se o formulário está ok. */
export function validateFirstAccess(f: FirstAccessForm, { requireOffice }: { requireOffice: boolean }): string | null {
  if (f.name.trim().length < 3) return 'Informe seu nome completo.'
  if (requireOffice && f.officeName.trim().length < 3) return 'Informe o nome do seu escritório.'
  if (f.officeName.trim().length > 120) return 'O nome do escritório pode ter no máximo 120 caracteres.'
  if (f.password.length < MIN_PASSWORD_LENGTH) return `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return 'A nova senha precisa ter letras e números.'
  if (f.password !== f.confirm) return 'As senhas não conferem.'
  return null
}

/**
 * Nome de escritório gerado automaticamente no cadastro (handle_new_user():
 * "Escritório <parte do e-mail antes do @>") — nesse caso a tela começa com o
 * campo vazio para a pessoa digitar o nome real.
 */
export function isAutoOfficeName(officeName: string | null | undefined, email: string | null | undefined): boolean {
  if (!officeName) return true
  const local = (email || '').split('@')[0]
  return officeName.trim() === `Escritório ${local}`
}

/** Traduz os erros do Supabase Auth ao trocar a senha. */
export function passwordUpdateErrorMessage(message: string | undefined, code?: string): string {
  const m = `${code || ''} ${message || ''}`.toLowerCase()
  if (m.includes('same_password') || m.includes('different from the old')) return 'A nova senha precisa ser diferente da senha temporária.'
  if (m.includes('weak_password') || m.includes('weak')) return 'Senha muito fraca. Use pelo menos 8 caracteres, com letras e números.'
  if (m.includes('reauthentication')) return 'Por segurança, saia e entre de novo com a senha temporária antes de trocá-la.'
  return 'Não foi possível salvar a nova senha. Tente novamente.'
}
