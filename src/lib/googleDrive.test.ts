import { describe, expect, it } from 'vitest'
import {
  isDriveFolder, isShortcut, effectiveMimeType, resolveTargetId, resolveFolderId,
  getDescendantFolderIds, extractPickerSelection, isPickerConfigured,
  type DriveItem,
} from './googleDrive'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

function folder(id: string, parents: string[] = []): DriveItem {
  return { id, name: id, mimeType: FOLDER_MIME, parents }
}

describe('isDriveFolder / effectiveMimeType / isShortcut', () => {
  it('reconhece pasta comum', () => {
    const item: DriveItem = { id: '1', name: 'Contratos', mimeType: FOLDER_MIME }
    expect(isDriveFolder(item)).toBe(true)
    expect(isShortcut(item)).toBe(false)
    expect(effectiveMimeType(item)).toBe(FOLDER_MIME)
  })

  it('reconhece arquivo comum', () => {
    const item: DriveItem = { id: '1', name: 'doc.pdf', mimeType: 'application/pdf' }
    expect(isDriveFolder(item)).toBe(false)
    expect(effectiveMimeType(item)).toBe('application/pdf')
  })

  it('atalho de pasta se comporta como pasta (mimetype efetivo = alvo)', () => {
    const item: DriveItem = {
      id: 'shortcut-1',
      name: 'Processos 2026',
      mimeType: SHORTCUT_MIME,
      shortcutDetails: { targetId: 'real-folder-1', targetMimeType: FOLDER_MIME },
    }
    expect(isShortcut(item)).toBe(true)
    expect(isDriveFolder(item)).toBe(true)
    expect(effectiveMimeType(item)).toBe(FOLDER_MIME)
  })

  it('atalho de arquivo não é tratado como pasta', () => {
    const item: DriveItem = {
      id: 'shortcut-2',
      name: 'Contrato.pdf',
      mimeType: SHORTCUT_MIME,
      shortcutDetails: { targetId: 'real-file-1', targetMimeType: 'application/pdf' },
    }
    expect(isDriveFolder(item)).toBe(false)
    expect(effectiveMimeType(item)).toBe('application/pdf')
  })
})

describe('resolveTargetId / resolveFolderId', () => {
  it('resolve id normal pro próprio item', () => {
    const item: DriveItem = { id: 'abc', name: 'x', mimeType: 'application/pdf' }
    expect(resolveTargetId(item)).toBe('abc')
  })

  it('resolve atalho pro id do alvo', () => {
    const item: DriveItem = { id: 'shortcut', name: 'x', mimeType: SHORTCUT_MIME, shortcutDetails: { targetId: 'target-id' } }
    expect(resolveTargetId(item)).toBe('target-id')
  })

  it('resolveFolderId cai no fallback quando não há pasta atual', () => {
    expect(resolveFolderId(null, 'root-id')).toBe('root-id')
  })

  it('resolveFolderId usa o alvo quando a pasta atual é um atalho', () => {
    const item: DriveItem = {
      id: 'shortcut', name: 'x', mimeType: SHORTCUT_MIME,
      shortcutDetails: { targetId: 'real-folder', targetMimeType: FOLDER_MIME },
    }
    expect(resolveFolderId(item, 'root-id')).toBe('real-folder')
  })
})

describe('getDescendantFolderIds', () => {
  it('encontra descendentes recursivamente e ignora ciclos', () => {
    const folders = [folder('a'), folder('b', ['a']), folder('c', ['b']), folder('d')]
    expect(getDescendantFolderIds(folders, 'a')).toEqual(new Set(['b', 'c']))
    expect(getDescendantFolderIds(folders, 'd')).toEqual(new Set())
  })
})

describe('extractPickerSelection', () => {
  it('extrai docs de uma resposta "picked"', () => {
    const data = {
      action: 'picked',
      docs: [
        { id: 'f1', name: 'Petição.docx', mimeType: 'application/vnd.google-apps.document' },
        { id: 'd1', name: 'Processos', mimeType: FOLDER_MIME },
      ],
    }
    expect(extractPickerSelection(data)).toEqual([
      { id: 'f1', name: 'Petição.docx', mimeType: 'application/vnd.google-apps.document' },
      { id: 'd1', name: 'Processos', mimeType: FOLDER_MIME },
    ])
  })

  it('retorna vazio quando a ação foi cancelada', () => {
    expect(extractPickerSelection({ action: 'cancel', docs: [] })).toEqual([])
  })

  it('retorna vazio para entrada nula/indefinida/malformada', () => {
    expect(extractPickerSelection(null)).toEqual([])
    expect(extractPickerSelection(undefined)).toEqual([])
    expect(extractPickerSelection({ action: 'picked' })).toEqual([])
  })

  it('descarta docs sem id/name/mimeType', () => {
    const data = { action: 'picked', docs: [{ id: 'ok', name: 'ok', mimeType: 'application/pdf' }, { id: 'sem-nome' }] }
    expect(extractPickerSelection(data)).toEqual([{ id: 'ok', name: 'ok', mimeType: 'application/pdf' }])
  })
})

describe('isPickerConfigured', () => {
  it('reflete a ausência das env vars VITE_GOOGLE_API_KEY/VITE_GOOGLE_APP_ID no ambiente de teste', () => {
    expect(isPickerConfigured()).toBe(false)
  })
})
