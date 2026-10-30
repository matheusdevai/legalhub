import { describe, expect, it } from 'vitest'
import { isAutoOfficeName, passwordUpdateErrorMessage, validateFirstAccess } from './firstAccess'

const ok = { name: 'Larissa Bronzeado', officeName: 'Bronzeado Advocacia', password: 'senhaForte1', confirm: 'senhaForte1' }

describe('validateFirstAccess', () => {
  it('aceita um formulário completo', () => {
    expect(validateFirstAccess(ok, { requireOffice: true })).toBeNull()
  })

  it('exige nome, escritório (para admin) e senha com letras e números', () => {
    expect(validateFirstAccess({ ...ok, name: 'Li' }, { requireOffice: true })).toMatch(/nome completo/)
    expect(validateFirstAccess({ ...ok, officeName: '' }, { requireOffice: true })).toMatch(/escritório/)
    expect(validateFirstAccess({ ...ok, officeName: '' }, { requireOffice: false })).toBeNull()
    expect(validateFirstAccess({ ...ok, password: 'abc1', confirm: 'abc1' }, { requireOffice: true })).toMatch(/8 caracteres/)
    expect(validateFirstAccess({ ...ok, password: 'somenteletras', confirm: 'somenteletras' }, { requireOffice: true })).toMatch(/letras e números/)
    expect(validateFirstAccess({ ...ok, confirm: 'outraSenha1' }, { requireOffice: true })).toMatch(/não conferem/)
  })
})

describe('isAutoOfficeName', () => {
  it('reconhece o nome gerado no cadastro a partir do e-mail', () => {
    expect(isAutoOfficeName('Escritório larissabronzeadoadv', 'larissabronzeadoadv@gmail.com')).toBe(true)
    expect(isAutoOfficeName('Bronzeado Advocacia', 'larissabronzeadoadv@gmail.com')).toBe(false)
    expect(isAutoOfficeName(null, 'x@y.com')).toBe(true)
  })
})

describe('passwordUpdateErrorMessage', () => {
  it('traduz senha igual à temporária e senha fraca', () => {
    expect(passwordUpdateErrorMessage('New password should be different from the old password.', 'same_password')).toMatch(/diferente/)
    expect(passwordUpdateErrorMessage('Password is too weak', 'weak_password')).toMatch(/fraca/)
    expect(passwordUpdateErrorMessage('boom')).toMatch(/Tente novamente/)
  })
})
