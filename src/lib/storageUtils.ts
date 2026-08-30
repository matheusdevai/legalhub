// ─── Cota de armazenamento por plano ───────────────────────────────────────
// Valores placeholder (1GB/5GB/20GB) — confirmar/ajustar com o pricing real
// antes de depender destes números em produção. 5GB do 'professional' replica
// o valor de storage_quota_bytes já observado ao vivo para o único tenant
// existente (5120MB), setado manualmente no banco.
export const PLAN_STORAGE_QUOTA_BYTES: Record<string, number> = {
  starter: 1 * 1024 ** 3,
  professional: 5 * 1024 ** 3,
  enterprise: 20 * 1024 ** 3,
}

const DEFAULT_STORAGE_QUOTA_BYTES = PLAN_STORAGE_QUOTA_BYTES.starter

// Resolve a cota de armazenamento de um tenant: um valor explícito em
// storage_quota_bytes (override manual no banco) sempre vence; senão cai pro
// mapa de plano; senão usa o tier 'starter' como default seguro.
export function getTenantStorageQuotaBytes(tenant: { plan?: string; storage_quota_bytes?: number }): number {
  if (typeof tenant.storage_quota_bytes === 'number' && tenant.storage_quota_bytes > 0) {
    return tenant.storage_quota_bytes
  }
  if (tenant.plan && PLAN_STORAGE_QUOTA_BYTES[tenant.plan]) {
    return PLAN_STORAGE_QUOTA_BYTES[tenant.plan]
  }
  return DEFAULT_STORAGE_QUOTA_BYTES
}
