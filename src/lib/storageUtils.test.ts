import { describe, it, expect } from 'vitest'
import { getTenantStorageQuotaBytes, PLAN_STORAGE_QUOTA_BYTES } from './storageUtils'

describe('getTenantStorageQuotaBytes', () => {
  it('usa storage_quota_bytes explícito quando é um número positivo, ignorando o plano', () => {
    expect(getTenantStorageQuotaBytes({ plan: 'starter', storage_quota_bytes: 12345 })).toBe(12345)
  })

  it('cai para a cota do plano quando storage_quota_bytes não está setado', () => {
    expect(getTenantStorageQuotaBytes({ plan: 'professional' })).toBe(PLAN_STORAGE_QUOTA_BYTES.professional)
  })

  it('cai para a cota do plano quando storage_quota_bytes é zero (override manual "sem valor")', () => {
    expect(getTenantStorageQuotaBytes({ plan: 'enterprise', storage_quota_bytes: 0 })).toBe(PLAN_STORAGE_QUOTA_BYTES.enterprise)
  })

  it('cai para a cota do plano quando storage_quota_bytes é negativo', () => {
    expect(getTenantStorageQuotaBytes({ plan: 'starter', storage_quota_bytes: -1 })).toBe(PLAN_STORAGE_QUOTA_BYTES.starter)
  })

  it('usa o default (tier starter) quando o plano não é reconhecido', () => {
    expect(getTenantStorageQuotaBytes({ plan: 'plano-inexistente' })).toBe(PLAN_STORAGE_QUOTA_BYTES.starter)
  })

  it('usa o default (tier starter) quando plan não está presente', () => {
    expect(getTenantStorageQuotaBytes({})).toBe(PLAN_STORAGE_QUOTA_BYTES.starter)
  })
})
