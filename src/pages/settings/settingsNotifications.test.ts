import { describe, it, expect } from 'vitest'

// ─── Réplica do NotificationPrefs de SettingsPage/types ───────────────────────
interface NotificationPrefs {
  new_tasks: boolean
  task_due: boolean
  new_processes: boolean
  new_publications: boolean
  financial_due: boolean
  new_clients: boolean
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  new_tasks: true, task_due: true, new_processes: false,
  new_publications: true, financial_due: true, new_clients: false,
}

// ─── Réplica exata do toggle de SettingsPage.toggleNotification() ────────────
function toggle(prefs: NotificationPrefs, key: keyof NotificationPrefs): NotificationPrefs {
  return { ...prefs, [key]: !prefs[key] }
}

// ─── Réplica da resolução de prefs ao carregar o profile ──────────────────────
function resolvePrefs(profileNotificationPrefs: NotificationPrefs | null | undefined): NotificationPrefs {
  return profileNotificationPrefs || DEFAULT_NOTIFICATION_PREFS
}

describe('SettingsPage — valores padrão de notificação', () => {
  it('perfil sem notification_prefs usa o default', () => {
    expect(resolvePrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })
  it('perfil com notification_prefs usa os valores salvos', () => {
    const saved: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, new_processes: true }
    expect(resolvePrefs(saved)).toEqual(saved)
  })
})

describe('SettingsPage — toggle de notificação', () => {
  it('inverte apenas a chave alterada', () => {
    const next = toggle(DEFAULT_NOTIFICATION_PREFS, 'new_tasks')
    expect(next.new_tasks).toBe(false)
    expect(next.task_due).toBe(DEFAULT_NOTIFICATION_PREFS.task_due)
  })

  it('liga uma preferência que estava desligada', () => {
    const next = toggle(DEFAULT_NOTIFICATION_PREFS, 'new_processes')
    expect(next.new_processes).toBe(true)
  })

  it('não muta o objeto original', () => {
    const next = toggle(DEFAULT_NOTIFICATION_PREFS, 'financial_due')
    expect(next).not.toBe(DEFAULT_NOTIFICATION_PREFS)
    expect(DEFAULT_NOTIFICATION_PREFS.financial_due).toBe(true)
  })

  it('dois toggles seguidos na mesma chave voltam ao valor original', () => {
    const once = toggle(DEFAULT_NOTIFICATION_PREFS, 'new_clients')
    const twice = toggle(once, 'new_clients')
    expect(twice.new_clients).toBe(DEFAULT_NOTIFICATION_PREFS.new_clients)
  })
})
